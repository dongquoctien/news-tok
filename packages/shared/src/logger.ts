import { existsSync, statSync } from 'node:fs'
import { appendFile, mkdir, rename, readdir, unlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { DATA_DIR } from './paths.js'

/**
 * Minimal append-only file logger with size-based rotation.
 *
 * Goal: when an orchestrate or render job fails, the user can open
 * `data/logs/<scope>.log` and see the chronological sequence of
 * events leading up to it. We deliberately do NOT pull in Winston /
 * Pino — the logger's job is small and the dep budget for `shared`
 * stays at zero runtime imports.
 *
 * Rotation: when the active log exceeds `maxBytes` (default 5 MB),
 * rename `<scope>.log` → `<scope>.1.log`, shift `.1` → `.2`, etc.,
 * up to `maxFiles` (default 4). Older files are unlinked. Each
 * append re-checks size so the rotation runs lazily without a
 * timer; cost is one stat() per write which is negligible.
 *
 * The logger is not used inside the renderer's hot loop — it logs
 * coarse events (start, phase change, success, failure) rather than
 * per-frame progress.
 */

export type LogLevel = 'info' | 'warn' | 'error'

const LOGS_DIR = resolve(DATA_DIR, 'logs')
const MAX_BYTES = 5 * 1024 * 1024
const MAX_FILES = 4

function logPath(scope: string, n: number = 0): string {
  return n === 0
    ? resolve(LOGS_DIR, `${scope}.log`)
    : resolve(LOGS_DIR, `${scope}.${n}.log`)
}

async function rotate(scope: string): Promise<void> {
  // Walk backwards so .3 → .4 happens before .2 → .3.
  for (let n = MAX_FILES; n >= 1; n--) {
    const src = logPath(scope, n - 1)
    const dst = logPath(scope, n)
    if (!existsSync(src)) continue
    if (n === MAX_FILES) {
      // Hit the cap — drop the oldest instead of shifting it off the end.
      try {
        await unlink(src)
      } catch {
        // already gone — fine
      }
      continue
    }
    try {
      // rename with overwrite: rm dst first if it exists, then move src
      if (existsSync(dst)) await unlink(dst)
      await rename(src, dst)
    } catch {
      // best-effort — if rotation fails the next write will retry
    }
  }
}

async function maybeRotate(scope: string): Promise<void> {
  const path = logPath(scope, 0)
  if (!existsSync(path)) return
  try {
    const st = statSync(path)
    if (st.size >= MAX_BYTES) {
      await rotate(scope)
    }
  } catch {
    // stat failed — leave the file alone
  }
}

function fmtLine(level: LogLevel, scope: string, msg: string, meta?: Record<string, unknown>): string {
  const ts = new Date().toISOString()
  const metaStr = meta && Object.keys(meta).length > 0 ? ' ' + JSON.stringify(meta) : ''
  // Single line — multi-line messages get \n-escaped so `tail` shows
  // one entry per row.
  const safeMsg = msg.replace(/\r?\n/g, '\\n')
  return `${ts} ${level.toUpperCase().padEnd(5)} [${scope}] ${safeMsg}${metaStr}\n`
}

/**
 * Append one log line. Creates the logs directory on first use,
 * rotates lazily, and silently swallows errors — logging is supposed
 * to be best-effort and must never crash the caller.
 */
export async function logToFile(
  scope: string,
  level: LogLevel,
  msg: string,
  meta?: Record<string, unknown>
): Promise<void> {
  try {
    await maybeRotate(scope)
    const path = logPath(scope, 0)
    await mkdir(dirname(path), { recursive: true })
    await appendFile(path, fmtLine(level, scope, msg, meta), 'utf8')
  } catch {
    // best-effort — if disk is full or read-only we just lose the line
  }
}

/** Convenience scoped logger. Captures the scope once and returns
 *  three thin wrappers for `info` / `warn` / `error`. */
export function createLogger(scope: string) {
  return {
    info: (msg: string, meta?: Record<string, unknown>) => logToFile(scope, 'info', msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) => logToFile(scope, 'warn', msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) => logToFile(scope, 'error', msg, meta),
  }
}

/** Where active logs live on disk. Exposed for the GC script + `--tail` UX. */
export function logsDir(): string {
  return LOGS_DIR
}

/** List every log file (active + rotated) for a scope. Newest first. */
export async function listScopeLogs(scope: string): Promise<string[]> {
  if (!existsSync(LOGS_DIR)) return []
  const all = await readdir(LOGS_DIR)
  const re = new RegExp(`^${scope.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}(\\.\\d+)?\\.log$`)
  return all.filter((f) => re.test(f)).sort((a, b) => {
    const an = Number(a.match(/\.(\d+)\.log$/)?.[1] ?? 0)
    const bn = Number(b.match(/\.(\d+)\.log$/)?.[1] ?? 0)
    return an - bn
  })
}
