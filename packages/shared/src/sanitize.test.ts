import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AssetRef, Project, Segment } from './schema.js'
import { DATA_DIR } from './paths.js'
import {
  fitSegmentDurations,
  hasEmoji,
  normalizeAssetPaths,
  normalizeSceneNames,
  recommendSegmentDurationSec,
  reconcileLibrary,
  stripEmoji,
} from './sanitize.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Build a minimum-viable Project. Tests override only the fields they
 * care about — every other field gets a stable, ProjectSchema-valid
 * default so a careless tweak to schema defaults doesn't break unrelated
 * tests. We deliberately avoid `ProjectSchema.parse` here to keep tests
 * focused on sanitiser behaviour rather than schema validation.
 */
function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    title: 'Test project',
    source: { type: 'text', value: 'body' },
    language: 'vi',
    aspect: '9:16',
    segments: [],
    bgMusicVolume: 0.2,
    sfxVolume: 0.7,
    subtitles: { enabled: true, bottomPct: 0.18 },
    showSceneBadges: false,
    exportPreset: 'standard',
    variants: [],
    userTextStyles: [],
    customSfx: [],
    logo: { kind: 'none' },
    library: [],
    bgMusicEdits: {
      trimStartSec: 0,
      fadeInSec: 0,
      fadeOutSec: 1.2,
      ducking: { enabled: false, ratio: 0.3, smoothMs: 200 },
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeSegment(overrides: Partial<Segment> = {}): Segment {
  return {
    id: 's1',
    durationSec: 5,
    scene: 'keypoint',
    text: 'Hello world',
    voice: { provider: 'edge-tts', voiceId: 'vi-VN-HoaiMyNeural', speed: 1 },
    visuals: {},
    effects: [],
    ...overrides,
  }
}

function makeAsset(overrides: Partial<AssetRef> = {}): AssetRef {
  return {
    kind: 'image',
    path: '/abs/cache/images/abc.jpg',
    source: { provider: 'pexels', id: '123' },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// stripEmoji / hasEmoji
// ---------------------------------------------------------------------------

describe('stripEmoji', () => {
  it('removes emoji from text and collapses whitespace', () => {
    expect(stripEmoji('Hello 🎉 world')).toBe('Hello world')
  })

  it('returns the input untouched when there is no emoji', () => {
    expect(stripEmoji('plain text')).toBe('plain text')
  })

  it('handles multi-codepoint emoji (e.g. flags, ZWJ sequences)', () => {
    // 🇻🇳 is two regional indicator codepoints; 👨‍👩‍👧 is a ZWJ family.
    expect(stripEmoji('Cờ 🇻🇳 và gia đình 👨‍👩‍👧 ở đây')).toBe(
      'Cờ và gia đình ở đây'
    )
  })

  it('trims surrounding whitespace after stripping', () => {
    expect(stripEmoji('🎬 leading')).toBe('leading')
    expect(stripEmoji('trailing 🎬')).toBe('trailing')
  })
})

describe('hasEmoji', () => {
  it('returns true when at least one emoji is present', () => {
    expect(hasEmoji('Hi 👋')).toBe(true)
  })

  it('returns false for plain text', () => {
    expect(hasEmoji('no emoji here')).toBe(false)
  })

  it('resets state between calls (regex lastIndex bug guard)', () => {
    // emoji-regex returns a stateful /g regex. If hasEmoji forgets to
    // reset lastIndex, the second call on a fresh string can wrongly
    // return false. This test would have caught that bug.
    expect(hasEmoji('🎉 first')).toBe(true)
    expect(hasEmoji('🎉 second')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// recommendSegmentDurationSec
// ---------------------------------------------------------------------------

describe('recommendSegmentDurationSec', () => {
  it('adds 0.4s padding by default', () => {
    expect(recommendSegmentDurationSec(5)).toBe(5.4)
  })

  it('preserves the planned duration when narration is shorter (default preserveMin)', () => {
    // Narration 3s → needs 3.4s, but planned 6s → keep 6s
    expect(recommendSegmentDurationSec(3, 6)).toBe(6)
  })

  it('stretches past the planned duration when narration is longer', () => {
    // Narration 7s + 0.4 padding = 7.4s, planned 5s → 7.4s wins
    expect(recommendSegmentDurationSec(7, 5)).toBe(7.4)
  })

  it('rounds to one decimal place', () => {
    expect(recommendSegmentDurationSec(5.12345)).toBe(5.5)
  })

  it('honours custom trailingPaddingSec', () => {
    expect(recommendSegmentDurationSec(5, undefined, { trailingPaddingSec: 1 })).toBe(6)
  })

  it('shrinks below planned when preserveMin is false', () => {
    // Narration 3s + 0.4 = 3.4s, planned 10s, preserveMin=false → 3.4s
    expect(
      recommendSegmentDurationSec(3, 10, { preserveMinPlannedSec: false })
    ).toBe(3.4)
  })
})

// ---------------------------------------------------------------------------
// fitSegmentDurations
// ---------------------------------------------------------------------------

describe('fitSegmentDurations', () => {
  it('returns the input untouched when no segments have narration', () => {
    const p = makeProject({ segments: [makeSegment({ durationSec: 5 })] })
    const result = fitSegmentDurations(p)
    expect(result.project).toBe(p) // identity — no copy when nothing to fix
    expect(result.adjustments).toEqual([])
  })

  it('stretches a segment whose narration is longer than its slot', () => {
    const seg = makeSegment({
      id: 'short-slot',
      durationSec: 4,
      audio: {
        narration: {
          kind: 'audio',
          path: '/x.mp3',
          source: { provider: 'edge-tts', id: 'v' },
          durationSec: 6, // 6 + 0.4 padding = 6.4s needed
        },
      },
    })
    const p = makeProject({ segments: [seg] })
    const { project, adjustments } = fitSegmentDurations(p)
    expect(project.segments[0]!.durationSec).toBe(6.4)
    expect(adjustments).toEqual([
      { segmentId: 'short-slot', plannedSec: 4, narrationSec: 6, finalSec: 6.4 },
    ])
  })

  it('leaves a segment alone when its slot already fits narration + padding', () => {
    const seg = makeSegment({
      id: 'roomy',
      durationSec: 10,
      audio: {
        narration: {
          kind: 'audio',
          path: '/x.mp3',
          source: { provider: 'edge-tts', id: 'v' },
          durationSec: 6,
        },
      },
    })
    const p = makeProject({ segments: [seg] })
    const { project, adjustments } = fitSegmentDurations(p)
    expect(project.segments[0]!.durationSec).toBe(10)
    expect(adjustments).toEqual([])
  })

  it('falls back to wordBoundaries when narration.durationSec is absent', () => {
    const seg = makeSegment({
      durationSec: 3,
      wordBoundaries: [
        { offsetSec: 0, durationSec: 1, text: 'hi' },
        { offsetSec: 1, durationSec: 4, text: 'world' }, // ends at 5s
      ],
    })
    const p = makeProject({ segments: [seg] })
    const { project } = fitSegmentDurations(p)
    expect(project.segments[0]!.durationSec).toBe(5.4)
  })

  it('does not mutate the input project', () => {
    const seg = makeSegment({
      durationSec: 2,
      audio: {
        narration: {
          kind: 'audio',
          path: '/x.mp3',
          source: { provider: 'edge-tts', id: 'v' },
          durationSec: 5,
        },
      },
    })
    const p = makeProject({ segments: [seg] })
    fitSegmentDurations(p)
    expect(p.segments[0]!.durationSec).toBe(2) // untouched
  })
})

// ---------------------------------------------------------------------------
// normalizeSceneNames
// ---------------------------------------------------------------------------

describe('normalizeSceneNames', () => {
  it('lowercases and maps the four common PascalCase typos', () => {
    const p = makeProject({
      segments: [
        makeSegment({ id: 's1', scene: 'TitleCard' }),
        makeSegment({ id: 's2', scene: 'KeyPoint' }),
        makeSegment({ id: 's3', scene: 'Quote' }),
        makeSegment({ id: 's4', scene: 'Outro' }),
      ],
    })
    const { project, adjustments } = normalizeSceneNames(p)
    expect(project.segments.map((s) => s.scene)).toEqual([
      'title',
      'keypoint',
      'quote',
      'outro',
    ])
    expect(adjustments.map((a) => `${a.before}→${a.after}`)).toEqual([
      'TitleCard→title',
      'KeyPoint→keypoint',
      'Quote→quote',
      'Outro→outro',
    ])
  })

  it('maps MissingScene to title (graceful fallback)', () => {
    const p = makeProject({
      segments: [makeSegment({ scene: 'MissingScene' })],
    })
    expect(normalizeSceneNames(p).project.segments[0]!.scene).toBe('title')
  })

  it('leaves already-canonical lowercase names untouched (no copy)', () => {
    const p = makeProject({
      segments: [makeSegment({ scene: 'title' }), makeSegment({ scene: 'keypoint' })],
    })
    const result = normalizeSceneNames(p)
    expect(result.adjustments).toEqual([])
    expect(result.project).toBe(p) // identity — no allocation
  })

  it('lowercases unknown names but keeps them (possibly a custom scene)', () => {
    const p = makeProject({
      segments: [makeSegment({ scene: 'CustomDossier' })],
    })
    const { project, adjustments } = normalizeSceneNames(p)
    expect(project.segments[0]!.scene).toBe('customdossier')
    expect(adjustments[0]).toEqual({
      segmentId: 's1',
      before: 'CustomDossier',
      after: 'customdossier',
    })
  })

  it('does not mutate the input project', () => {
    const p = makeProject({ segments: [makeSegment({ scene: 'TitleCard' })] })
    normalizeSceneNames(p)
    expect(p.segments[0]!.scene).toBe('TitleCard')
  })
})

// ---------------------------------------------------------------------------
// reconcileLibrary
// ---------------------------------------------------------------------------

describe('reconcileLibrary', () => {
  it('mirrors a segment background into the library', () => {
    const bg = makeAsset({ path: '/cache/images/abc.jpg' })
    const p = makeProject({
      segments: [makeSegment({ visuals: { background: bg } })],
      library: [],
    })
    const { project, added, deduped } = reconcileLibrary(p)
    expect(project.library).toHaveLength(1)
    expect(project.library[0]!.path).toBe('/cache/images/abc.jpg')
    expect(added).toBe(1)
    expect(deduped).toBe(0)
  })

  it('dedupes existing library entries by path', () => {
    const a1 = makeAsset({ path: '/dup.jpg', source: { provider: 'pexels', id: '1' } })
    const a2 = makeAsset({ path: '/dup.jpg', source: { provider: 'pexels', id: '2' } })
    const p = makeProject({ library: [a1, a2] })
    const { project, deduped } = reconcileLibrary(p)
    expect(project.library).toHaveLength(1)
    expect(project.library[0]!.source.id).toBe('1') // first wins
    expect(deduped).toBe(1)
  })

  it('preserves library entries that no segment uses', () => {
    // Article-seeded image the user hasn't applied yet should stay.
    const articleImg = makeAsset({ path: '/article/photo.jpg' })
    const segBg = makeAsset({ path: '/cache/segment.jpg' })
    const p = makeProject({
      segments: [makeSegment({ visuals: { background: segBg } })],
      library: [articleImg],
    })
    const { project } = reconcileLibrary(p)
    expect(project.library.map((a) => a.path)).toEqual([
      '/article/photo.jpg', // seeded entry comes first (preserved order)
      '/cache/segment.jpg', // mirrored from segment
    ])
  })

  it('returns identity when nothing changes (idempotency)', () => {
    const bg = makeAsset({ path: '/x.jpg' })
    const p = makeProject({
      segments: [makeSegment({ visuals: { background: bg } })],
      library: [bg],
    })
    const result = reconcileLibrary(p)
    expect(result.project).toBe(p) // identity — no copy
    expect(result.added).toBe(0)
    expect(result.deduped).toBe(0)
  })

  it('ignores non-image assets (audio segments do not pollute library)', () => {
    const audioRef = makeAsset({
      kind: 'audio',
      path: '/audio.mp3',
      source: { provider: 'edge-tts', id: 'v' },
    })
    const p = makeProject({
      segments: [makeSegment({ visuals: { background: audioRef } })],
    })
    expect(reconcileLibrary(p).project.library).toEqual([])
  })

  it('collects foreground assets too', () => {
    const fg = makeAsset({ path: '/overlay.png' })
    const p = makeProject({
      segments: [makeSegment({ visuals: { foreground: [fg] } })],
    })
    expect(reconcileLibrary(p).project.library.map((a) => a.path)).toEqual([
      '/overlay.png',
    ])
  })
})

// ---------------------------------------------------------------------------
// normalizeAssetPaths
// ---------------------------------------------------------------------------

describe('normalizeAssetPaths', () => {
  it('rewrites every absolute path under data/ into the relative form', () => {
    const absBg = resolve(DATA_DIR, 'cache', 'images', 'bg.jpg')
    const absNarration = resolve(DATA_DIR, 'cache', 'tts', 'v1.mp3')
    const absMusic = resolve(DATA_DIR, 'cache', 'music', 'm.mp3')
    const absLib = resolve(DATA_DIR, 'projects', 'p1', 'library', 'x.jpg')
    const p = makeProject({
      segments: [
        makeSegment({
          visuals: { background: makeAsset({ path: absBg }) },
          audio: {
            narration: {
              kind: 'audio',
              path: absNarration,
              source: { provider: 'edge-tts', id: 'v' },
            },
          },
        }),
      ],
      bgMusic: {
        kind: 'audio',
        path: absMusic,
        source: { provider: 'archive', id: 'm' },
      },
      library: [makeAsset({ path: absLib })],
    })

    const { project, converted } = normalizeAssetPaths(p, DATA_DIR)
    expect(converted).toBe(4)
    expect(project.segments[0]!.visuals.background!.path).toBe('cache/images/bg.jpg')
    expect(project.segments[0]!.audio!.narration!.path).toBe('cache/tts/v1.mp3')
    expect(project.bgMusic!.path).toBe('cache/music/m.mp3')
    expect(project.library[0]!.path).toBe('projects/p1/library/x.jpg')
  })

  it('returns identity when every path is already relative (idempotency)', () => {
    const p = makeProject({
      segments: [
        makeSegment({
          visuals: {
            background: makeAsset({ path: 'cache/images/bg.jpg' }),
          },
        }),
      ],
    })
    const result = normalizeAssetPaths(p, DATA_DIR)
    expect(result.project).toBe(p) // identity — no allocation
    expect(result.converted).toBe(0)
  })

  it('leaves absolute paths NOT under data/ alone (foreign uploads)', () => {
    const foreign =
      process.platform === 'win32'
        ? 'D:\\elsewhere\\foo.jpg'
        : '/elsewhere/foo.jpg'
    const p = makeProject({
      segments: [makeSegment({ visuals: { background: makeAsset({ path: foreign }) } })],
    })
    const result = normalizeAssetPaths(p, DATA_DIR)
    expect(result.converted).toBe(0)
    expect(result.project.segments[0]!.visuals.background!.path).toBe(foreign)
  })

  it('walks foreground arrays + segment.audio.sfx', () => {
    const fgAbs = resolve(DATA_DIR, 'cache', 'images', 'fg.png')
    const sfxAbs = resolve(DATA_DIR, 'sfx', 'click.mp3')
    const p = makeProject({
      segments: [
        makeSegment({
          visuals: { foreground: [makeAsset({ path: fgAbs })] },
          audio: {
            sfx: [
              {
                kind: 'audio',
                path: sfxAbs,
                source: { provider: 'local', id: 'click' },
              },
            ],
          },
        }),
      ],
    })
    const { project, converted } = normalizeAssetPaths(p, DATA_DIR)
    expect(converted).toBe(2)
    expect(project.segments[0]!.visuals.foreground![0]!.path).toBe(
      'cache/images/fg.png'
    )
    expect(project.segments[0]!.audio!.sfx![0]!.path).toBe('sfx/click.mp3')
  })

  it('rewrites customSfx string paths', () => {
    const sfxAbs = resolve(DATA_DIR, 'projects', 'p1', 'sfx', 'user-bell.mp3')
    const p = makeProject({
      customSfx: [
        {
          id: 'user-bell',
          label: 'Bell',
          durationSec: 0.4,
          path: sfxAbs,
          defaultGain: 1,
          uploadedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    const { project, converted } = normalizeAssetPaths(p, DATA_DIR)
    expect(converted).toBe(1)
    expect(project.customSfx[0]!.path).toBe('projects/p1/sfx/user-bell.mp3')
  })

  it('rewrites logo.path when kind is image', () => {
    const logoAbs = resolve(DATA_DIR, 'logo', 'brand.png')
    const p = makeProject({
      logo: {
        kind: 'image',
        path: logoAbs,
        sizePct: 13,
        position: 'top-right',
        marginPct: 5,
        opacity: 0.85,
        appliesTo: 'all',
      },
    })
    const { project, converted } = normalizeAssetPaths(p, DATA_DIR)
    expect(converted).toBe(1)
    expect((project.logo as { path: string }).path).toBe('logo/brand.png')
  })

  it('does not mutate the input project', () => {
    const abs = resolve(DATA_DIR, 'cache', 'images', 'x.jpg')
    const p = makeProject({
      segments: [makeSegment({ visuals: { background: makeAsset({ path: abs }) } })],
    })
    normalizeAssetPaths(p, DATA_DIR)
    expect(p.segments[0]!.visuals.background!.path).toBe(abs)
  })
})
