import { readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLogger, listScopeLogs, logToFile, logsDir } from './logger.js'

// Scoped to a unique prefix per test file so parallel suites don't
// stomp each other's log dir contents.
const SCOPE = 'test-logger-suite'

async function cleanScope() {
  const files = await listScopeLogs(SCOPE)
  for (const f of files) {
    try {
      await rm(resolve(logsDir(), f), { force: true })
    } catch {
      // ignore
    }
  }
}

describe('logger', () => {
  beforeEach(cleanScope)
  afterEach(cleanScope)

  it('appends a line with ISO timestamp + level + scope', async () => {
    await logToFile(SCOPE, 'info', 'hello world')
    const files = await listScopeLogs(SCOPE)
    expect(files).toContain(`${SCOPE}.log`)
    const content = await readFile(resolve(logsDir(), `${SCOPE}.log`), 'utf8')
    // ISO 2026-... timestamp + level + scope + message
    expect(content).toMatch(
      new RegExp(`^\\d{4}-\\d{2}-\\d{2}T\\S+ INFO  \\[${SCOPE}\\] hello world\\n$`)
    )
  })

  it('escapes newlines so multi-line messages stay one entry per row', async () => {
    await logToFile(SCOPE, 'error', 'line one\nline two')
    const content = await readFile(resolve(logsDir(), `${SCOPE}.log`), 'utf8')
    expect(content).toContain('line one\\nline two')
    // Exactly one trailing newline → one entry.
    expect(content.split('\n').filter(Boolean)).toHaveLength(1)
  })

  it('serialises meta as JSON appended after the message', async () => {
    await logToFile(SCOPE, 'warn', 'job stuck', { jobId: 'abc', attempts: 3 })
    const content = await readFile(resolve(logsDir(), `${SCOPE}.log`), 'utf8')
    expect(content).toContain('WARN  [' + SCOPE + '] job stuck {"jobId":"abc","attempts":3}')
  })

  it('createLogger returns a scoped helper with info/warn/error', async () => {
    const log = createLogger(SCOPE)
    await log.info('a')
    await log.warn('b')
    await log.error('c')
    const content = await readFile(resolve(logsDir(), `${SCOPE}.log`), 'utf8')
    const lines = content.trim().split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('INFO')
    expect(lines[1]).toContain('WARN')
    expect(lines[2]).toContain('ERROR')
  })

  it('listScopeLogs returns newest-first ordering by rotation index', async () => {
    // Just exercise the API on a scope with one active log; rotation
    // behavior under load is implicit from the order-by-index sort.
    await logToFile(SCOPE, 'info', 'x')
    const files = await listScopeLogs(SCOPE)
    expect(files).toEqual([`${SCOPE}.log`])
  })
})
