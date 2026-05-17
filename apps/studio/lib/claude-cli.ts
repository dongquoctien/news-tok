/**
 * Generic Claude CLI subprocess runner. Spawns `claude -p <prompt>` with
 * `--output-format=stream-json`, parses MCP tool_use / tool_result events
 * off stdout, and surfaces them through callbacks so caller routes
 * (`/api/orchestrate`, `/api/projects/[id]/social-caption/regenerate`)
 * can update their own job-state stores without re-implementing the
 * spawn + parse plumbing.
 *
 * The Windows .exe-vs-.cmd quirk and the stdin=ignore safeguard come
 * straight from `apps/studio/app/api/orchestrate/route.ts` (where this
 * code originally lived). See the inline comments below for the why.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from '@news-tok/render'

/**
 * Resolve the path to the news-tok MCP config so Claude CLI can spawn
 * the workspace MCP server (which exposes `mcp__news-tok__*` tools).
 *
 * Order:
 *   1. `.mcp.json` at the repo root — the canonical, gitignored copy a
 *      user creates from `.mcp.json.example`.
 *   2. `.mcp.json.example` — committed fallback that points at
 *      `packages/mcp-server/dist/index.js`. Same shape as a real
 *      `.mcp.json` so we can pass it directly. Means a fresh checkout
 *      that hasn't run `cp .mcp.json.example .mcp.json` still gets the
 *      MCP tools attached to subprocess Claude runs.
 *
 * Returns `null` when neither file exists — caller decides whether to
 * fail loudly or run without MCP.
 */
export function resolveMcpConfig(): string | null {
  const candidates = [
    resolve(REPO_ROOT, '.mcp.json'),
    resolve(REPO_ROOT, '.mcp.json.example'),
  ]
  for (const path of candidates) {
    if (existsSync(path)) return path
  }
  return null
}

/**
 * Resolve the Claude CLI binary path. Honors `CLAUDE_CLI_PATH` env var
 * for custom installs, then falls back to:
 *   - `claude` on macOS / Linux (PATH lookup)
 *   - The native .exe on Windows when present (avoids the EINVAL +
 *     argv-mangling issue of spawning .cmd shims)
 */
export function resolveClaudeCli(): string {
  if (process.env.CLAUDE_CLI_PATH) return process.env.CLAUDE_CLI_PATH
  if (process.platform !== 'win32') return 'claude'
  const candidates = [
    resolve(process.env.LOCALAPPDATA ?? '', 'AnthropicClaude', 'claude.exe'),
    resolve(process.env.USERPROFILE ?? '', '.local', 'bin', 'claude.exe'),
  ]
  for (const c of candidates) if (existsSync(c)) return c
  return 'claude.exe'
}

export type StreamJsonToolUse = {
  /** Tool name with mcp prefix stripped (e.g. `createProject`). */
  name: string
  /** Full original name (e.g. `mcp__news-tok__createProject`). */
  rawName: string
}

export type StreamJsonToolResult = {
  /** Concatenated text content from every text block in the result. */
  text: string
}

export type RunClaudeCliOptions = {
  /** The prompt to send via `-p`. Multiline supported. */
  prompt: string
  /** Comma-joined allowed tool names — passed as `--allowedTools`. */
  allowedTools: string
  /**
   * Fires for every `tool_use` block parsed off stdout. Use this to
   * advance a job-state machine in the caller (e.g. update phase +
   * step label). The callback is awaited so writes can be serialized.
   */
  onToolUse?: (event: StreamJsonToolUse) => Promise<void> | void
  /**
   * Fires for every `tool_result` block parsed off stdout. The text is
   * already flattened (concatenated `content[].text`).
   */
  onToolResult?: (event: StreamJsonToolResult) => Promise<void> | void
  /** Called once the subprocess pid is known (for cancel-by-pid). */
  onPid?: (pid: number | undefined) => void
  /**
   * Polling check that lets the caller cancel the run mid-stream by
   * returning true. Called before each line of stdout is parsed; the
   * subprocess is killed (best-effort) when it returns true.
   */
  isCancelled?: () => Promise<boolean> | boolean
  /**
   * Optional working directory override. Defaults to `REPO_ROOT` so
   * Claude CLI can read CLAUDE.md + load the workspace MCP server.
   */
  cwd?: string
  /**
   * Hard timeout in milliseconds. If the subprocess doesn't exit in
   * time, it gets killed and the promise rejects with a timeout
   * error. Default is unset (no timeout) for the orchestrate flow —
   * caller routes that have a known upper bound (caption regenerate
   * ~60s) should pass a value so a stuck Claude doesn't keep the
   * route hanging indefinitely.
   */
  timeoutMs?: number
}

export type RunClaudeCliResult = {
  /** Concatenated stderr text — useful in error messages. */
  stderr: string
  /** Process exit code (number) when the child exited cleanly. */
  exitCode: number | null
}

/**
 * Spawn Claude CLI, stream-parse stdout, fire callbacks per tool use /
 * result. Resolves when the subprocess exits with code 0; rejects with
 * a tail of stderr otherwise.
 *
 * The function is intentionally pure of any job-state coupling — every
 * write-side effect is the caller's responsibility via callbacks.
 */
export async function runClaudeCli(opts: RunClaudeCliOptions): Promise<RunClaudeCliResult> {
  const cliPath = resolveClaudeCli()
  const mcpConfig = resolveMcpConfig()
  const args = [
    '-p',
    opts.prompt,
    '--output-format=stream-json',
    '--verbose',
    '--permission-mode=acceptEdits',
    '--allowedTools',
    opts.allowedTools,
    '--add-dir',
    REPO_ROOT,
  ]
  // Without --mcp-config Claude CLI inherits whatever MCP servers the
  // user has set up in their global Claude config (or none). Force-pin
  // the workspace `news-tok` MCP server so the subprocess can call
  // mcp__news-tok__* tools regardless of how the user's machine is
  // configured. Falls through to the user's global config when neither
  // .mcp.json nor .mcp.json.example exists in the repo.
  if (mcpConfig) {
    args.push('--mcp-config', mcpConfig)
  }

  // shell:false + native .exe (on Windows) gives a single faithful argv
  // handoff. stdio[0]='ignore' explicitly closes claude's stdin so it
  // doesn't sit waiting 3s for input that will never arrive.
  const child: ChildProcess = spawn(cliPath, args, {
    cwd: opts.cwd ?? REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  opts.onPid?.(child.pid)

  let buffer = ''
  let cancelled = false

  const checkCancel = async (): Promise<boolean> => {
    if (cancelled) return true
    if (!opts.isCancelled) return false
    const next = await opts.isCancelled()
    if (next) {
      cancelled = true
      // Best-effort kill — pid may be gone already.
      if (child.pid) {
        try {
          process.kill(child.pid)
        } catch {
          // already exited
        }
      }
    }
    return cancelled
  }

  const handleLine = async (line: string): Promise<void> => {
    if (await checkCancel()) return
    let evt: {
      type?: string
      message?: {
        content?: Array<{
          type?: string
          name?: string
          text?: string
          content?: Array<{ type?: string; text?: string }>
        }>
      }
    }
    try {
      evt = JSON.parse(line)
    } catch {
      return
    }
    const content = evt?.message?.content
    if (!Array.isArray(content)) return
    for (const block of content) {
      if (block?.type === 'tool_use' && block.name) {
        const rawName = block.name
        const short = rawName.replace(/^mcp__news-tok__/, '')
        if (opts.onToolUse) {
          await opts.onToolUse({ name: short, rawName })
        }
      }
      if (block?.type === 'tool_result') {
        const inner = Array.isArray(block.content) ? block.content : []
        const text = inner
          .map((c) => (typeof c?.text === 'string' ? c.text : ''))
          .join('')
        if (opts.onToolResult) {
          await opts.onToolResult({ text })
        }
      }
    }
  }

  child.stdout?.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8')
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line) continue
      void handleLine(line)
    }
  })

  let stderr = ''
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8')
  })

  // Hard-kill the subprocess if it overshoots the caller's timeout.
  // Without this, a Claude run that hangs on a tool call (network
  // wedge, MCP server crash, etc.) keeps the Node process busy until
  // someone manually cancels the job.
  let timedOut = false
  let timer: ReturnType<typeof setTimeout> | null = null
  if (opts.timeoutMs && opts.timeoutMs > 0) {
    timer = setTimeout(() => {
      timedOut = true
      if (child.pid) {
        try {
          process.kill(child.pid)
        } catch {
          // already gone
        }
      }
    }, opts.timeoutMs)
  }

  const exitCode = await new Promise<number | null>((resolveExit, rejectExit) => {
    child.on('error', rejectExit)
    child.on('exit', (code) => resolveExit(code))
  })

  if (timer) clearTimeout(timer)

  if (timedOut) {
    throw new Error(
      `Claude CLI timed out after ${opts.timeoutMs}ms. stderr tail: ${stderr.slice(-300)}`
    )
  }

  if (exitCode !== 0 && !cancelled) {
    throw new Error(`claude exited ${exitCode}: ${stderr.slice(-500)}`)
  }
  return { stderr, exitCode }
}

/**
 * Helper for callers that need to detect a `projectId` field in a tool
 * result. Returns the first match in either raw JSON form or
 * JSON-escaped form (Claude wraps tool results as a JSON string inside
 * a stream-json content block, so the colon-escape pattern shows up).
 */
export function extractProjectId(line: string): string | undefined {
  const m =
    line.match(/"projectId"\s*:\s*"([^"]+)"/) ??
    line.match(/\\"projectId\\"\s*:\s*\\"([^\\"]+)\\"/)
  return m?.[1]
}
