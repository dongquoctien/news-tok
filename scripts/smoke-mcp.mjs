#!/usr/bin/env node
/**
 * M3 smoke: spawn the MCP server over stdio, send tools/list, assert we get
 * the 9 expected tools back. Then call listVoices with language=vi and check
 * we get at least 2 voices.
 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..')
const MCP_ENTRY = resolve(REPO_ROOT, 'packages', 'mcp-server', 'dist', 'index.js')

const EXPECTED_TOOLS = [
  'createProject',
  'listProjects',
  'getStoryboard',
  'extractArticle',
  'searchImage',
  'searchMusic',
  'synthesizeVoice',
  'listVoices',
  'renderSegment',
  'renderProject',
]

class StdioClient {
  constructor(proc) {
    this.proc = proc
    this.nextId = 1
    this.pending = new Map()
    this.buffer = ''
    proc.stdout.setEncoding('utf8')
    proc.stdout.on('data', (chunk) => this.onData(chunk))
    proc.stderr.on('data', (chunk) => process.stderr.write(`[mcp stderr] ${chunk}`))
    proc.on('exit', (code) => {
      if (this.pending.size > 0) {
        for (const { reject } of this.pending.values()) {
          reject(new Error(`MCP server exited (code=${code}) with ${this.pending.size} pending`))
        }
        this.pending.clear()
      }
    })
  }

  onData(chunk) {
    this.buffer += chunk
    let nl
    while ((nl = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, nl).trim()
      this.buffer = this.buffer.slice(nl + 1)
      if (!line) continue
      let msg
      try {
        msg = JSON.parse(line)
      } catch {
        continue
      }
      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve: r, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(`RPC error: ${msg.error.message ?? JSON.stringify(msg.error)}`))
        else r(msg.result)
      }
    }
  }

  request(method, params) {
    const id = this.nextId++
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.proc.stdin.write(payload, (err) => {
        if (err) {
          this.pending.delete(id)
          reject(err)
        }
      })
    })
  }

  notify(method, params) {
    this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
  }
}

async function main() {
  const proc = spawn(process.execPath, [MCP_ENTRY], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ANTHROPIC_API_KEY: undefined },
  })
  const client = new StdioClient(proc)

  try {
    const init = await client.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'smoke-mcp', version: '0.0.0' },
    })
    console.log('[mcp] initialize ok — server:', init.serverInfo?.name, init.serverInfo?.version)

    client.notify('notifications/initialized', {})

    const tools = await client.request('tools/list', {})
    const got = (tools.tools ?? []).map((t) => t.name).sort()
    console.log(`[mcp] tools/list: ${got.length} tools — ${got.join(', ')}`)
    const missing = EXPECTED_TOOLS.filter((n) => !got.includes(n))
    const extra = got.filter((n) => !EXPECTED_TOOLS.includes(n))
    if (missing.length > 0) throw new Error(`missing tools: ${missing.join(', ')}`)
    if (extra.length > 0) console.warn(`[mcp] warn: unexpected tools: ${extra.join(', ')}`)

    const listResult = await client.request('tools/call', {
      name: 'listVoices',
      arguments: { language: 'vi' },
    })
    const textBlock = listResult.content?.find((c) => c.type === 'text')
    if (!textBlock) throw new Error('listVoices: no text content in result')
    const parsed = JSON.parse(textBlock.text)
    if (!parsed.count || parsed.count < 2) {
      throw new Error(`listVoices(vi) returned ${parsed.count} voices, expected >= 2`)
    }
    const names = parsed.voices.map((v) => v.ShortName).join(', ')
    console.log(`[mcp] tools/call listVoices(vi): ${parsed.count} — ${names}`)

    console.log('[mcp] all smoke checks passed')
  } finally {
    proc.kill()
  }
}

main().catch((err) => {
  console.error('[mcp] failed:', err)
  process.exit(1)
})
