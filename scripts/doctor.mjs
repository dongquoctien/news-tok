#!/usr/bin/env node
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const GREEN = '\x1b[32m'
const RESET = '\x1b[0m'
const DIM = '\x1b[2m'

let warnings = 0
let errors = 0

function ok(msg) {
  console.log(`${GREEN}[OK]${RESET} ${msg}`)
}
function warn(msg) {
  console.log(`${YELLOW}[WARN]${RESET} ${msg}`)
  warnings++
}
function err(msg) {
  console.log(`${RED}[ERR]${RESET} ${msg}`)
  errors++
}

function tryCmd(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return null
  }
}

console.log(`${DIM}news-tok doctor — checking environment${RESET}\n`)

const nodeVersion = process.versions.node
const major = Number.parseInt(nodeVersion.split('.')[0], 10)
if (major >= 20) ok(`Node ${nodeVersion}`)
else err(`Node ${nodeVersion} — need >= 20`)

const pnpmVersion = tryCmd('pnpm --version')
if (pnpmVersion) ok(`pnpm ${pnpmVersion}`)
else err('pnpm not found — install: npm i -g pnpm')

const claudeVersion = tryCmd('claude --version')
if (claudeVersion) ok(`Claude CLI: ${claudeVersion}`)
else err('Claude CLI not found — install: npm i -g @anthropic-ai/claude-code, then `claude login`')

if (process.env.ANTHROPIC_API_KEY) {
  warn(
    'ANTHROPIC_API_KEY is set in environment.\n' +
      '       This will make Claude CLI bill per-token via API instead of using your Pro/Max subscription.\n' +
      '       Unset it before running Claude: `Remove-Item Env:ANTHROPIC_API_KEY` (PowerShell) or `unset ANTHROPIC_API_KEY` (bash).'
  )
} else {
  ok('ANTHROPIC_API_KEY not set (will use Claude subscription)')
}

const envFile = join(process.cwd(), '.env')
if (existsSync(envFile)) {
  ok('.env present')
} else {
  warn('.env missing — copy .env.example and fill PEXELS_API_KEY, PIXABAY_API_KEY')
}

const mcpConfig = join(process.cwd(), '.mcp.json')
if (existsSync(mcpConfig)) ok('.mcp.json present')
else warn('.mcp.json missing')

const claudeMd = join(process.cwd(), 'CLAUDE.md')
if (existsSync(claudeMd)) ok('CLAUDE.md present')
else warn('CLAUDE.md missing')

console.log()
if (errors > 0) {
  console.log(`${RED}${errors} error(s), ${warnings} warning(s)${RESET}`)
  process.exit(1)
} else if (warnings > 0) {
  console.log(`${YELLOW}${warnings} warning(s)${RESET}`)
  process.exit(0)
} else {
  console.log(`${GREEN}All checks passed${RESET}`)
  process.exit(0)
}
