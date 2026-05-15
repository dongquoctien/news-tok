import { describe, expect, it } from 'vitest'
import { isAbsolute, resolve } from 'node:path'
import {
  DATA_DIR,
  isRelativeDataPath,
  posixifyPath,
  resolveDataPath,
  toRelativeDataPath,
} from './paths.js'

// We can't pin the test results to a specific filesystem root (CI runs
// in Linux, dev runs in Windows), so the assertions are derived from
// DATA_DIR itself. That keeps the tests OS-agnostic while still
// exercising the slash-normalisation + case-insensitive prefix match.

describe('toRelativeDataPath', () => {
  it('strips the data/ prefix and returns a relative POSIX path', () => {
    const abs = resolve(DATA_DIR, 'cache', 'images', 'abc.jpg')
    expect(toRelativeDataPath(abs)).toBe('cache/images/abc.jpg')
  })

  it('leaves an already-relative path untouched', () => {
    expect(toRelativeDataPath('cache/images/abc.jpg')).toBe(
      'cache/images/abc.jpg'
    )
  })

  it('returns the input untouched when the absolute path is outside data/', () => {
    // /etc/passwd or D:\\elsewhere\\foo.jpg — we don't try to be clever,
    // we just leave it alone so the caller can decide whether to copy
    // or reject.
    const foreign =
      process.platform === 'win32'
        ? 'D:\\elsewhere\\foo.jpg'
        : '/elsewhere/foo.jpg'
    expect(toRelativeDataPath(foreign)).toBe(foreign)
  })

  it('handles empty / falsy input safely', () => {
    expect(toRelativeDataPath('')).toBe('')
  })

  it('is case-insensitive for the data/ prefix (Windows quirk)', () => {
    // Windows paths can come in mixed case (D:\Github vs d:\github)
    // depending on what API surfaced them. The relativiser must match
    // either way so we don't end up with mostly-relative paths plus a
    // few stragglers that still hold absolute form.
    if (process.platform !== 'win32') return // mac/linux are case-sensitive
    const abs = DATA_DIR.replace(/^[A-Z]:/, (m) => m.toLowerCase()) + '\\cache\\x.jpg'
    expect(toRelativeDataPath(abs)).toBe('cache/x.jpg')
  })
})

describe('resolveDataPath', () => {
  it('joins a relative path onto DATA_DIR', () => {
    const abs = resolveDataPath('cache/images/abc.jpg')
    expect(isAbsolute(abs)).toBe(true)
    expect(abs).toContain('cache')
  })

  it('returns an absolute path untouched (legacy storyboards)', () => {
    const legacy = resolve(DATA_DIR, 'cache', 'tts', 'voice.mp3')
    expect(resolveDataPath(legacy)).toBe(legacy)
  })

  it('handles empty / falsy input safely', () => {
    expect(resolveDataPath('')).toBe('')
  })
})

describe('isRelativeDataPath', () => {
  it('returns true for plain relative paths', () => {
    expect(isRelativeDataPath('cache/images/x.jpg')).toBe(true)
  })

  it('returns false for absolute paths', () => {
    const abs = resolve(DATA_DIR, 'x.jpg')
    expect(isRelativeDataPath(abs)).toBe(false)
  })

  it('returns false for URLs', () => {
    expect(isRelativeDataPath('https://example.com/x.jpg')).toBe(false)
  })

  it('returns false for empty input', () => {
    expect(isRelativeDataPath('')).toBe(false)
  })
})

describe('posixifyPath', () => {
  it('converts backslashes to forward slashes', () => {
    if (process.platform !== 'win32') return // only meaningful on Windows
    expect(posixifyPath('cache\\images\\abc.jpg')).toBe('cache/images/abc.jpg')
  })

  it('returns POSIX paths untouched', () => {
    expect(posixifyPath('cache/images/abc.jpg')).toBe('cache/images/abc.jpg')
  })
})
