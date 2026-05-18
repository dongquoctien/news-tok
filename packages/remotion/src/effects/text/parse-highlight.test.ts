import { describe, expect, it } from 'vitest'
import { parseHighlightMarkers } from './parse-highlight.js'

describe('parseHighlightMarkers', () => {
  it('plain text → single non-highlighted run, all-false mask', () => {
    const r = parseHighlightMarkers('Hello world')
    expect(r.hasHighlight).toBe(false)
    expect(r.runs).toEqual([{ text: 'Hello world', highlighted: false }])
    expect(r.strippedText).toBe('Hello world')
    expect(r.wordMask).toEqual([false, false])
  })

  it('one **word** highlight flags exactly that token', () => {
    const r = parseHighlightMarkers('Sự kiện **lớn** hôm nay')
    expect(r.hasHighlight).toBe(true)
    expect(r.strippedText).toBe('Sự kiện lớn hôm nay')
    expect(r.wordMask).toEqual([false, false, true, false, false])
  })

  it('multi-word highlight flags every token inside the pair', () => {
    const r = parseHighlightMarkers('Bão **đổ bộ đột ngột** sáng nay')
    expect(r.hasHighlight).toBe(true)
    expect(r.strippedText).toBe('Bão đổ bộ đột ngột sáng nay')
    expect(r.wordMask).toEqual([false, true, true, true, true, false, false])
  })

  it('two separate highlight pairs', () => {
    const r = parseHighlightMarkers('**A** giữa **B**')
    expect(r.strippedText).toBe('A giữa B')
    expect(r.wordMask).toEqual([true, false, true])
  })

  it('odd number of markers → treated as plain text (no half-strip)', () => {
    const r = parseHighlightMarkers('Có ** một bên')
    expect(r.hasHighlight).toBe(false)
    expect(r.strippedText).toBe('Có ** một bên')
  })

  it('empty string', () => {
    const r = parseHighlightMarkers('')
    expect(r.hasHighlight).toBe(false)
    expect(r.runs).toEqual([{ text: '', highlighted: false }])
    expect(r.wordMask).toEqual([])
  })

  it('highlight at the very start and very end of the headline', () => {
    const r = parseHighlightMarkers('**Đầu** giữa **cuối**')
    expect(r.strippedText).toBe('Đầu giữa cuối')
    expect(r.wordMask).toEqual([true, false, true])
  })
})
