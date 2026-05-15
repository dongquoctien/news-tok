import { describe, expect, it } from 'vitest'
import { validateEnv } from './env.js'

describe('validateEnv', () => {
  it('parses an empty env and reports every optional key as missing', () => {
    const { parsed, missing, errors } = validateEnv({})
    expect(parsed).toEqual({})
    expect(errors).toEqual([])
    expect(missing).toEqual([
      'PEXELS_API_KEY',
      'PIXABAY_API_KEY',
      'UNSPLASH_ACCESS_KEY',
    ])
  })

  it('returns no missing entries when every provider key is set', () => {
    const { missing, errors } = validateEnv({
      PEXELS_API_KEY: 'x',
      PIXABAY_API_KEY: 'y',
      UNSPLASH_ACCESS_KEY: 'z',
    })
    expect(missing).toEqual([])
    expect(errors).toEqual([])
  })

  it('strips unknown keys from `parsed` but still validates the rest', () => {
    const { parsed } = validateEnv({
      PEXELS_API_KEY: 'k',
      SOMETHING_ELSE: 'ignored',
    })
    expect(parsed.PEXELS_API_KEY).toBe('k')
    // Unknown keys aren't surfaced — caller can still hit process.env directly.
    expect((parsed as Record<string, unknown>).SOMETHING_ELSE).toBeUndefined()
  })

  it('only reports media-provider keys as missing (CLAUDE_CLI_PATH is optional)', () => {
    const { missing } = validateEnv({
      PEXELS_API_KEY: 'a',
      PIXABAY_API_KEY: 'b',
      UNSPLASH_ACCESS_KEY: 'c',
    })
    expect(missing).not.toContain('CLAUDE_CLI_PATH')
    expect(missing).not.toContain('ANTHROPIC_API_KEY')
  })
})
