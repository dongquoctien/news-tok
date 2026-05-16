import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STRATEGY_BY_PLATFORM,
  filterBannedHashtags,
  sanitizeCaption,
} from './caption-sanitize.js'

// ---------------------------------------------------------------------------
// sanitizeCaption — dot strategy
// ---------------------------------------------------------------------------

describe('sanitizeCaption (dot, vi)', () => {
  it('rewrites a single Vietnamese hard-ban word', () => {
    const r = sanitizeCaption('Anh ấy đã chết.', 'vi', 'dot')
    expect(r.text).toBe('Anh ấy đã c.h.ế.t.')
    expect(r.replacements).toHaveLength(1)
    expect(r.replacements[0]!.from).toBe('chết')
    expect(r.replacements[0]!.to).toBe('c.h.ế.t')
    expect(r.replacements[0]!.index).toBe(10) // position in the ORIGINAL string
  })

  it('rewrites multiple distinct words in one pass', () => {
    const r = sanitizeCaption('Vụ giết người và tự tử trong nhà.', 'vi', 'dot')
    expect(r.text).toContain('g.i.ế.t')
    expect(r.text).toContain('t.ự t.ử')
    expect(r.replacements.map((x) => x.from)).toEqual(['giết', 'tự tử'])
  })

  it('preserves word position in original even after earlier rewrites', () => {
    // First word "chết" at index 0; second "giết" at index 9 in original
    // ("chết rồi giết"). After rewriting "chết" → "c.h.ế.t" the working
    // string is longer, but we report the ORIGINAL index for "giết".
    const r = sanitizeCaption('chết rồi giết', 'vi', 'dot')
    const giet = r.replacements.find((x) => x.from === 'giết')
    expect(giet?.index).toBe(9)
  })

  it('leaves non-matching text untouched', () => {
    const r = sanitizeCaption('Một ngày bình thường', 'vi', 'dot')
    expect(r.text).toBe('Một ngày bình thường')
    expect(r.replacements).toEqual([])
  })

  it('does not match inside larger words (defensive boundary check)', () => {
    // 'chếtinh' is nonsense but proves the Unicode boundary works —
    // \b alone would match between "ế" and "t" because \b is locale-naive.
    const r = sanitizeCaption('chếtinh', 'vi', 'dot')
    expect(r.text).toBe('chếtinh')
    expect(r.replacements).toEqual([])
  })

  it('is case-insensitive', () => {
    const r = sanitizeCaption('CHẾT là điều ai cũng phải gặp', 'vi', 'dot')
    expect(r.text).toContain('c.h.ế.t')
    expect(r.replacements[0]!.from).toBe('CHẾT')
  })
})

describe('sanitizeCaption (dot, en)', () => {
  it('rewrites English hard-ban words', () => {
    const r = sanitizeCaption('He was killed in a shooting.', 'en', 'dot')
    expect(r.text).toBe('He was k.i.l.l.e.d in a s.h.o.o.t.i.n.g.')
    expect(r.replacements.map((x) => x.from)).toEqual(['killed', 'shooting'])
  })

  it('prefers longer pattern over shorter (killed not kill)', () => {
    // "killed" must match the 'killed' entry, not 'kill' + 'ed'. The
    // word list is ordered so 'killed' / 'killing' come before 'kill'.
    const r = sanitizeCaption('killed', 'en', 'dot')
    expect(r.text).toBe('k.i.l.l.e.d')
    expect(r.replacements).toHaveLength(1)
    expect(r.replacements[0]!.from).toBe('killed')
  })

  it('handles self-harm hyphen variant', () => {
    // 'self-harm' AND 'self harm' should both match.
    expect(sanitizeCaption('self-harm awareness', 'en', 'dot').replacements).toHaveLength(1)
    expect(sanitizeCaption('self harm awareness', 'en', 'dot').replacements).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// sanitizeCaption — euphemism strategy
// ---------------------------------------------------------------------------

describe('sanitizeCaption (euphemism)', () => {
  it('rewrites VI to the natural-language form', () => {
    const r = sanitizeCaption('Anh ấy đã chết', 'vi', 'euphemism')
    expect(r.text).toBe('Anh ấy đã không còn')
  })

  it('rewrites EN to widely-understood algospeak', () => {
    const r = sanitizeCaption('She was killed', 'en', 'euphemism')
    expect(r.text).toBe('She was unalived')
  })

  it('handles overlapping replacements (multiple words in one sentence)', () => {
    const r = sanitizeCaption('Vụ giết người và buôn ma túy', 'vi', 'euphemism')
    expect(r.text).toBe('Vụ triệt hạ người và buôn chất cấm')
  })
})

// ---------------------------------------------------------------------------
// sanitizeCaption — off strategy
// ---------------------------------------------------------------------------

describe('sanitizeCaption (off)', () => {
  it('returns input unchanged with empty replacements', () => {
    const r = sanitizeCaption('Vụ giết người chết người', 'vi', 'off')
    expect(r.text).toBe('Vụ giết người chết người')
    expect(r.replacements).toEqual([])
  })

  it('handles empty input safely on every strategy', () => {
    for (const strat of ['off', 'dot', 'euphemism'] as const) {
      expect(sanitizeCaption('', 'vi', strat).text).toBe('')
      expect(sanitizeCaption('', 'en', strat).replacements).toEqual([])
    }
  })
})

// ---------------------------------------------------------------------------
// filterBannedHashtags
// ---------------------------------------------------------------------------

describe('filterBannedHashtags', () => {
  it('drops banned tags while preserving the rest in order', () => {
    const input = ['#tintuc', '#alone', '#xuhuong', '#suicide', '#bongda']
    const r = filterBannedHashtags(input)
    expect(r.hashtags).toEqual(['#tintuc', '#xuhuong', '#bongda'])
    expect(r.dropped).toEqual(['#alone', '#suicide'])
  })

  it('is case-insensitive', () => {
    const r = filterBannedHashtags(['#KillingIt', '#WTF', '#Sport'])
    expect(r.hashtags).toEqual(['#Sport'])
    expect(r.dropped).toHaveLength(2)
  })

  it('tolerates input without leading # (defensive)', () => {
    const r = filterBannedHashtags(['alone', 'tintuc'])
    expect(r.dropped).toEqual(['alone'])
  })

  it('returns empty input safely', () => {
    expect(filterBannedHashtags([])).toEqual({ hashtags: [], dropped: [] })
  })
})

// ---------------------------------------------------------------------------
// DEFAULT_STRATEGY_BY_PLATFORM
// ---------------------------------------------------------------------------

describe('DEFAULT_STRATEGY_BY_PLATFORM', () => {
  it('aligns with the research-backed per-platform recommendation', () => {
    // TikTok / Instagram (Reels) / YouTube use dot; Facebook uses
    // euphemism because reading flow matters more on long-form FB.
    expect(DEFAULT_STRATEGY_BY_PLATFORM.tiktok).toBe('dot')
    expect(DEFAULT_STRATEGY_BY_PLATFORM.instagram).toBe('dot')
    expect(DEFAULT_STRATEGY_BY_PLATFORM.youtube).toBe('dot')
    expect(DEFAULT_STRATEGY_BY_PLATFORM.facebook).toBe('euphemism')
  })

  it('covers exactly the four supported platforms', () => {
    expect(Object.keys(DEFAULT_STRATEGY_BY_PLATFORM).sort()).toEqual([
      'facebook',
      'instagram',
      'tiktok',
      'youtube',
    ])
  })
})
