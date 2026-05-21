import { describe, expect, it } from 'vitest'
import {
  ASPECT_PRESETS,
  BgMusicEditsSchema,
  CustomSfxEntrySchema,
  DEFAULT_VOICES,
  EXPORT_PRESET_OVERRIDES,
  LogoMarkerSchema,
  ProjectSchema,
  SegmentSchema,
  SocialCaptionsCacheSchema,
  TextStyleSchema,
  resolveRenderPreset,
  type Project,
} from './schema.js'

// ---------------------------------------------------------------------------
// Fixtures — minimum shape that passes ProjectSchema. Tests vary one field
// at a time so a failure points clearly at the offending field.
// ---------------------------------------------------------------------------

function minimalProject(overrides: Partial<Project> = {}): Project {
  return ProjectSchema.parse({
    id: 'p1',
    title: 'Test',
    source: { type: 'text', value: 'body' },
    language: 'vi',
    aspect: '9:16',
    segments: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as Project
}

// ---------------------------------------------------------------------------
// ProjectSchema — round-trip + defaults
// ---------------------------------------------------------------------------

describe('ProjectSchema', () => {
  it('parses a minimal valid project and applies every documented default', () => {
    const p = minimalProject()
    // These defaults are load-bearing — Studio + renderer assume they exist
    // and fall back unsafely (NaN multiplications, undefined.kind reads)
    // when missing. Assert each one explicitly.
    expect(p.bgMusicVolume).toBe(0.2)
    expect(p.sfxVolume).toBe(0.7)
    // sfxEnabled defaults to true so legacy storyboards (saved before this
    // flag existed) render identically. MCP createProject overrides this
    // to false for newly-generated videos, but the schema default must
    // not change the playback of stored projects.
    expect(p.sfxEnabled).toBe(true)
    expect(p.subtitles).toEqual({ enabled: true, bottomPct: 0.18 })
    expect(p.showSceneBadges).toBe(false)
    expect(p.exportPreset).toBe('standard')
    expect(p.variants).toEqual([])
    expect(p.userTextStyles).toEqual([])
    expect(p.customSfx).toEqual([])
    expect(p.logo).toEqual({ kind: 'none' })
    expect(p.library).toEqual([])
    // socialCaptions is optional — absent on freshly-created projects
    // until Claude CLI runs the captions phase, and on legacy projects
    // saved before this field existed. Studio's caption dialog falls
    // back to the local template when this is undefined.
    expect(p.socialCaptions).toBeUndefined()
    // bgMusicEdits defaults preserve pre-edit render behavior: no trim,
    // no fade-in, 1.2s fade-out (matches the legacy hardcoded value),
    // no ducking. A stale storyboard parsed today must render identically.
    expect(p.bgMusicEdits).toEqual({
      trimStartSec: 0,
      fadeInSec: 0,
      fadeOutSec: 1.2,
      ducking: { enabled: false, ratio: 0.3, smoothMs: 200 },
    })
  })

  it('round-trips through JSON without losing fields', () => {
    const p = minimalProject({
      segments: [
        {
          id: 's1',
          durationSec: 5,
          scene: 'title',
          text: 'Hi',
          voice: { provider: 'edge-tts', voiceId: 'vi-VN-HoaiMyNeural', speed: 1 },
          visuals: {},
          effects: [],
        },
      ],
    })
    const restored = ProjectSchema.parse(JSON.parse(JSON.stringify(p)))
    expect(restored).toEqual(p)
  })

  it('rejects an invalid language', () => {
    expect(() =>
      ProjectSchema.parse({ ...minimalProject(), language: 'fr' })
    ).toThrow()
  })

  it('rejects an invalid aspect', () => {
    expect(() =>
      ProjectSchema.parse({ ...minimalProject(), aspect: '4:3' })
    ).toThrow()
  })

  it('accepts 1:1 and round-trips through ProjectSchema', () => {
    const p = ProjectSchema.parse({
      ...minimalProject(),
      aspect: '1:1',
    })
    expect(p.aspect).toBe('1:1')
    // Round-trip — JSON.stringify ↔ parse — survives because no
    // aspect-dependent field gets dropped or mutated by the schema.
    const round = ProjectSchema.parse(JSON.parse(JSON.stringify(p)))
    expect(round.aspect).toBe('1:1')
  })

  it('accepts 16:9 as well', () => {
    const p = ProjectSchema.parse({ ...minimalProject(), aspect: '16:9' })
    expect(p.aspect).toBe('16:9')
  })

  it('rejects datetimes that are not ISO 8601', () => {
    expect(() =>
      ProjectSchema.parse({
        ...minimalProject(),
        createdAt: 'yesterday',
      })
    ).toThrow()
  })

  it('clamps bgMusicVolume / sfxVolume into 0..1', () => {
    expect(() =>
      ProjectSchema.parse({ ...minimalProject(), bgMusicVolume: 1.5 })
    ).toThrow()
    expect(() =>
      ProjectSchema.parse({ ...minimalProject(), sfxVolume: -0.1 })
    ).toThrow()
  })
})

// ---------------------------------------------------------------------------
// BgMusicEditsSchema — non-destructive trim/fade/duck applied at render time
// ---------------------------------------------------------------------------

describe('BgMusicEditsSchema', () => {
  it('parses {} into the documented defaults (legacy behavior preserved)', () => {
    expect(BgMusicEditsSchema.parse({})).toEqual({
      trimStartSec: 0,
      fadeInSec: 0,
      fadeOutSec: 1.2,
      ducking: { enabled: false, ratio: 0.3, smoothMs: 200 },
    })
  })

  it('accepts undefined trimEndSec (play to end of track)', () => {
    const e = BgMusicEditsSchema.parse({ trimStartSec: 5 })
    expect(e.trimEndSec).toBeUndefined()
  })

  it('rejects negative trimStartSec', () => {
    expect(() => BgMusicEditsSchema.parse({ trimStartSec: -1 })).toThrow()
  })

  it('clamps fade lengths to 0..10s', () => {
    expect(() => BgMusicEditsSchema.parse({ fadeInSec: -0.1 })).toThrow()
    expect(() => BgMusicEditsSchema.parse({ fadeOutSec: 11 })).toThrow()
  })

  it('clamps ducking ratio to 0..1', () => {
    expect(() =>
      BgMusicEditsSchema.parse({ ducking: { enabled: true, ratio: 1.1 } })
    ).toThrow()
    expect(() =>
      BgMusicEditsSchema.parse({ ducking: { enabled: true, ratio: -0.1 } })
    ).toThrow()
  })

  it('clamps ducking smoothMs to 50..2000', () => {
    // < 50ms produces audible pumping; > 2000ms makes the first words of
    // every segment muddy because the music has not dropped yet.
    expect(() =>
      BgMusicEditsSchema.parse({ ducking: { enabled: true, smoothMs: 40 } })
    ).toThrow()
    expect(() =>
      BgMusicEditsSchema.parse({ ducking: { enabled: true, smoothMs: 3000 } })
    ).toThrow()
  })

  it('round-trips through JSON without losing fields', () => {
    const edits = BgMusicEditsSchema.parse({
      trimStartSec: 10.5,
      trimEndSec: 40,
      fadeInSec: 0.8,
      fadeOutSec: 2.0,
      ducking: { enabled: true, ratio: 0.25, smoothMs: 300 },
    })
    const restored = BgMusicEditsSchema.parse(JSON.parse(JSON.stringify(edits)))
    expect(restored).toEqual(edits)
  })

  it('survives a partial ducking object by filling sibling defaults', () => {
    // Studio UI may send just `{ enabled: true }` when the user flips
    // the toggle on but hasn't moved the ratio/smooth sliders yet.
    const e = BgMusicEditsSchema.parse({ ducking: { enabled: true } })
    expect(e.ducking).toEqual({ enabled: true, ratio: 0.3, smoothMs: 200 })
  })
})

// ---------------------------------------------------------------------------
// SegmentSchema — the hot field that gets edited per render
// ---------------------------------------------------------------------------

describe('SegmentSchema', () => {
  const baseSeg = {
    id: 's1',
    durationSec: 5,
    scene: 'keypoint',
    text: 'Body',
    voice: { provider: 'edge-tts', voiceId: 'vi-VN-HoaiMyNeural', speed: 1 },
    visuals: {},
    effects: [],
  }

  it('accepts a custom PascalCase scene name (forked scene file)', () => {
    // Key project convention: lowercase = built-in, PascalCase = custom
    // file under data/projects/<id>/scenes/. Schema must allow both.
    expect(() =>
      SegmentSchema.parse({ ...baseSeg, scene: 'CustomDossier' })
    ).not.toThrow()
  })

  it('rejects an empty scene string', () => {
    expect(() => SegmentSchema.parse({ ...baseSeg, scene: '' })).toThrow()
  })

  it('rejects voice speed outside 0.5..2', () => {
    expect(() =>
      SegmentSchema.parse({
        ...baseSeg,
        voice: { provider: 'edge-tts', voiceId: 'x', speed: 3 },
      })
    ).toThrow()
  })

  it('caps chips at 5 entries / 30 chars each', () => {
    expect(() =>
      SegmentSchema.parse({ ...baseSeg, chips: ['a', 'b', 'c', 'd', 'e', 'f'] })
    ).toThrow()
    expect(() =>
      SegmentSchema.parse({ ...baseSeg, chips: ['x'.repeat(31)] })
    ).toThrow()
  })

  it('caps eyebrow at 40 chars', () => {
    expect(() =>
      SegmentSchema.parse({ ...baseSeg, eyebrow: 'x'.repeat(41) })
    ).toThrow()
  })

  it('accepts backgroundEdits with crop in 0..100 percents', () => {
    const seg = SegmentSchema.parse({
      ...baseSeg,
      backgroundEdits: {
        crop: { xPct: 10, yPct: 20, widthPct: 50, heightPct: 60 },
        rotateDeg: 0,
        flipH: false,
        flipV: false,
        vignette: 0,
      },
    })
    expect(seg.backgroundEdits?.crop?.widthPct).toBe(50)
  })

  it('rejects backgroundEdits.rotateDeg outside -180..180', () => {
    expect(() =>
      SegmentSchema.parse({
        ...baseSeg,
        backgroundEdits: { rotateDeg: 200, flipH: false, flipV: false, vignette: 0 },
      })
    ).toThrow()
  })

  it('accepts a video background with videoTrim window', () => {
    // Mirrors what Studio writes when the user drops an mp4 into the
    // Library and gates the start of the clip — `endSec` is intentionally
    // optional so "trim from 0.5s to end of clip" stays terse.
    const seg = SegmentSchema.parse({
      ...baseSeg,
      visuals: {
        background: {
          kind: 'video',
          path: 'projects/p1/library/abc.mp4',
          source: { provider: 'local', id: 'clip.mp4' },
          durationSec: 4,
          width: 1080,
          height: 1920,
        },
      },
      videoTrim: { startSec: 0.5 },
    })
    expect(seg.visuals.background?.kind).toBe('video')
    expect(seg.visuals.background?.durationSec).toBe(4)
    expect(seg.videoTrim?.startSec).toBe(0.5)
    expect(seg.videoTrim?.endSec).toBeUndefined()
  })

  it('rejects videoTrim.startSec below 0', () => {
    expect(() =>
      SegmentSchema.parse({ ...baseSeg, videoTrim: { startSec: -1 } })
    ).toThrow()
  })

  it('defaults videoTrim.startSec to 0 when only endSec is provided', () => {
    const seg = SegmentSchema.parse({ ...baseSeg, videoTrim: { endSec: 3 } })
    expect(seg.videoTrim?.startSec).toBe(0)
    expect(seg.videoTrim?.endSec).toBe(3)
  })

  it('leaves the six video control fields undefined when absent (renderer applies defaults)', () => {
    // Schema stores video knobs as optional so a fresh segment literal
    // still parses without naming every flag. The renderer (KenBurns +
    // NewsTokComposition) applies the documented defaults at point of
    // use — loop=true, muted=true, volume=1, rate=1, fit=cover,
    // align=center — so phase-1 video output stays byte-identical.
    const seg = SegmentSchema.parse(baseSeg)
    expect(seg.videoLoop).toBeUndefined()
    expect(seg.videoMuted).toBeUndefined()
    expect(seg.videoVolume).toBeUndefined()
    expect(seg.videoPlaybackRate).toBeUndefined()
    expect(seg.videoFit).toBeUndefined()
    expect(seg.videoAlign).toBeUndefined()
  })

  it('round-trips explicit video control values', () => {
    const seg = SegmentSchema.parse({
      ...baseSeg,
      videoLoop: false,
      videoMuted: false,
      videoVolume: 0.8,
      videoPlaybackRate: 1.5,
      videoFit: 'contain',
      videoAlign: 'top-center',
    })
    expect(seg.videoLoop).toBe(false)
    expect(seg.videoMuted).toBe(false)
    expect(seg.videoVolume).toBe(0.8)
    expect(seg.videoPlaybackRate).toBe(1.5)
    expect(seg.videoFit).toBe('contain')
    expect(seg.videoAlign).toBe('top-center')
  })

  it('rejects videoVolume outside 0..1', () => {
    expect(() =>
      SegmentSchema.parse({ ...baseSeg, videoVolume: 1.5 })
    ).toThrow()
    expect(() =>
      SegmentSchema.parse({ ...baseSeg, videoVolume: -0.1 })
    ).toThrow()
  })

  it('rejects videoPlaybackRate outside 0.25..2', () => {
    // 0.25x is the slowest Remotion <OffthreadVideo> handles cleanly
    // without audio-pitch tearing; 2x is the fastest before the codec
    // pipeline starts dropping frames.
    expect(() =>
      SegmentSchema.parse({ ...baseSeg, videoPlaybackRate: 3 })
    ).toThrow()
    expect(() =>
      SegmentSchema.parse({ ...baseSeg, videoPlaybackRate: 0.1 })
    ).toThrow()
  })

  it('rejects unknown videoFit / videoAlign values', () => {
    expect(() =>
      SegmentSchema.parse({ ...baseSeg, videoFit: 'stretch' })
    ).toThrow()
    expect(() =>
      SegmentSchema.parse({ ...baseSeg, videoAlign: 'middle' })
    ).toThrow()
  })

  it('accepts fadeInSec / fadeOutSec within 0..2s', () => {
    const seg = SegmentSchema.parse({
      ...baseSeg,
      fadeInSec: 0.3,
      fadeOutSec: 0.5,
    })
    expect(seg.fadeInSec).toBe(0.3)
    expect(seg.fadeOutSec).toBe(0.5)
  })

  it('leaves fade fields undefined when absent (legacy renders unchanged)', () => {
    const seg = SegmentSchema.parse(baseSeg)
    expect(seg.fadeInSec).toBeUndefined()
    expect(seg.fadeOutSec).toBeUndefined()
  })

  it('rejects fade values above 2 seconds', () => {
    // Cap at 2s so a 5s segment can't be dominated by fades that eat
    // the entire content window.
    expect(() => SegmentSchema.parse({ ...baseSeg, fadeInSec: 2.5 })).toThrow()
    expect(() => SegmentSchema.parse({ ...baseSeg, fadeOutSec: 3 })).toThrow()
  })

  it('rejects negative fade values', () => {
    expect(() => SegmentSchema.parse({ ...baseSeg, fadeInSec: -0.1 })).toThrow()
    expect(() => SegmentSchema.parse({ ...baseSeg, fadeOutSec: -0.5 })).toThrow()
  })

  it('accepts videoAudioFadeInSec / videoAudioFadeOutSec within 0..3s', () => {
    const seg = SegmentSchema.parse({
      ...baseSeg,
      videoAudioFadeInSec: 0.5,
      videoAudioFadeOutSec: 1.5,
    })
    expect(seg.videoAudioFadeInSec).toBe(0.5)
    expect(seg.videoAudioFadeOutSec).toBe(1.5)
  })

  it('leaves audio fade fields undefined when absent', () => {
    const seg = SegmentSchema.parse(baseSeg)
    expect(seg.videoAudioFadeInSec).toBeUndefined()
    expect(seg.videoAudioFadeOutSec).toBeUndefined()
  })

  it('rejects audio fade values above 3 seconds', () => {
    // Cap at 3s so a typical 5-10s segment isn't dominated by ramps.
    expect(() =>
      SegmentSchema.parse({ ...baseSeg, videoAudioFadeInSec: 3.5 })
    ).toThrow()
    expect(() =>
      SegmentSchema.parse({ ...baseSeg, videoAudioFadeOutSec: 5 })
    ).toThrow()
  })
})

// ---------------------------------------------------------------------------
// LogoMarker — discriminated union, easy to mis-author
// ---------------------------------------------------------------------------

describe('LogoMarkerSchema', () => {
  it('accepts kind: none with no other fields', () => {
    expect(LogoMarkerSchema.parse({ kind: 'none' })).toEqual({ kind: 'none' })
  })

  it('requires path when kind is image', () => {
    expect(() => LogoMarkerSchema.parse({ kind: 'image' })).toThrow()
  })

  it('requires non-empty text when kind is text', () => {
    expect(() => LogoMarkerSchema.parse({ kind: 'text', text: '' })).toThrow()
  })

  it('caps text watermark at 40 chars', () => {
    expect(() =>
      LogoMarkerSchema.parse({ kind: 'text', text: 'x'.repeat(41) })
    ).toThrow()
  })

  it('clamps sizePct on image variant to 5..25', () => {
    expect(() =>
      LogoMarkerSchema.parse({ kind: 'image', path: '/logo.png', sizePct: 30 })
    ).toThrow()
  })
})

// ---------------------------------------------------------------------------
// CustomSfxEntry — id format is enforced by regex; easy to break
// ---------------------------------------------------------------------------

describe('CustomSfxEntrySchema', () => {
  const base = {
    id: 'user-bell',
    label: 'Bell',
    durationSec: 0.4,
    path: '/sfx/bell.mp3',
    defaultGain: 1,
    uploadedAt: '2026-01-01T00:00:00.000Z',
  }

  it('accepts a valid user- prefixed id', () => {
    expect(() => CustomSfxEntrySchema.parse(base)).not.toThrow()
  })

  it('rejects an id without the user- prefix', () => {
    // Critical: built-in SFX bank uses bare ids ("ding", "whoosh-short").
    // If users could land bare ids, render-time staging would silently
    // collide and overwrite built-in cues for that project.
    expect(() =>
      CustomSfxEntrySchema.parse({ ...base, id: 'bell' })
    ).toThrow()
  })

  it('caps durationSec at 5s (defensive — long SFX should be a music asset)', () => {
    expect(() =>
      CustomSfxEntrySchema.parse({ ...base, durationSec: 6 })
    ).toThrow()
  })
})

// ---------------------------------------------------------------------------
// TextStyleSchema — defaults are heavily relied upon at render time
// ---------------------------------------------------------------------------

describe('TextStyleSchema', () => {
  const base = {
    id: 's1',
    name: 'X',
    family: 'news' as const,
    fontFamily: 'inter',
    fontSize: 80,
    color: '#fff',
  }

  it('applies the documented motion + decorator defaults', () => {
    const s = TextStyleSchema.parse(base)
    expect(s.fontWeight).toBe(700)
    expect(s.enter).toBe('fade')
    expect(s.exit).toBe('fade')
    expect(s.align).toBe('center')
    expect(s.anchor).toBe('bottom')
    expect(s.background).toEqual({ kind: 'none' })
    expect(s.source).toBe('builtin')
    expect(s.scope).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Render presets — small but very load-bearing
// ---------------------------------------------------------------------------

describe('resolveRenderPreset', () => {
  it('returns 1080x1920 @ 30fps for 9:16 standard', () => {
    expect(resolveRenderPreset('9:16', 'standard')).toMatchObject({
      width: 1080,
      height: 1920,
      fps: 30,
    })
  })

  it('overrides fps to 60 for tiktok preset', () => {
    expect(resolveRenderPreset('9:16', 'tiktok').fps).toBe(60)
  })

  it('keeps aspect-derived width/height when overriding fps', () => {
    const tt = resolveRenderPreset('16:9', 'tiktok')
    expect(tt.width).toBe(1920)
    expect(tt.height).toBe(1080)
    expect(tt.fps).toBe(60)
  })

  it('uses h264 + yuv420p for every aspect', () => {
    for (const aspect of Object.keys(ASPECT_PRESETS) as Array<keyof typeof ASPECT_PRESETS>) {
      const p = resolveRenderPreset(aspect)
      expect(p.codec).toBe('h264')
      expect(p.pixelFormat).toBe('yuv420p')
    }
  })

  it('every export preset overrides at most fps (sanity guard)', () => {
    // If someone adds bitrate / codec overrides without updating
    // resolveRenderPreset's spread order, this catches the regression.
    for (const o of Object.values(EXPORT_PRESET_OVERRIDES)) {
      const allowedKeys = new Set(['fps'])
      for (const k of Object.keys(o)) {
        expect(allowedKeys, `unexpected override key ${k}`).toContain(k)
      }
    }
  })
})

describe('DEFAULT_VOICES', () => {
  it('maps every supported language to an Edge TTS voice id', () => {
    expect(DEFAULT_VOICES.vi).toMatch(/^vi-VN-/)
    expect(DEFAULT_VOICES.en).toMatch(/^en-US-/)
  })
})

// ---------------------------------------------------------------------------
// SocialCaptionsCacheSchema — written by Claude CLI after updateStoryboard.
// ---------------------------------------------------------------------------

describe('SocialCaptionsCacheSchema', () => {
  const valid = {
    generatedAt: '2026-05-17T12:00:00.000Z',
    topic: 'sports',
    source: 'llm-rewrite' as const,
    hashtags: ['#U17vietnam', '#vietnamfootball', '#shorts'],
    captions: [
      { platform: 'tiktok' as const, text: 'Hook text', charCount: 9 },
      { platform: 'facebook' as const, text: 'Story body', charCount: 10 },
      { platform: 'instagram' as const, text: 'Emoji + body', charCount: 12 },
      { platform: 'youtube' as const, text: 'SEO title + paragraphs', charCount: 22 },
    ],
  }

  it('parses a full cache payload', () => {
    expect(() => SocialCaptionsCacheSchema.parse(valid)).not.toThrow()
  })

  it('rejects unknown source value', () => {
    expect(() =>
      SocialCaptionsCacheSchema.parse({ ...valid, source: 'human' })
    ).toThrow()
  })

  it('rejects unknown platform on a caption entry', () => {
    expect(() =>
      SocialCaptionsCacheSchema.parse({
        ...valid,
        captions: [{ platform: 'reddit', text: 'x', charCount: 1 }],
      })
    ).toThrow()
  })

  it('rejects negative charCount', () => {
    expect(() =>
      SocialCaptionsCacheSchema.parse({
        ...valid,
        captions: [{ platform: 'tiktok', text: 'x', charCount: -1 }],
      })
    ).toThrow()
  })

  it('ProjectSchema accepts an attached socialCaptions cache', () => {
    expect(() =>
      ProjectSchema.parse({
        id: 'p1',
        title: 't',
        source: { type: 'text', value: 'x' },
        language: 'vi',
        aspect: '9:16',
        segments: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        socialCaptions: valid,
      })
    ).not.toThrow()
  })
})
