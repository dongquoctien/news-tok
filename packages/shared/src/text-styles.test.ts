import { describe, expect, it } from 'vitest'
import {
  ALLOWED_FONT_IDS,
  BUILT_IN_TEXT_STYLES,
  DEFAULT_TEXT_STYLE_ID,
  DEFAULT_VARIANTS,
  findTextStyle,
} from './text-styles.js'
import { TextStyleSchema, type TextStyle } from './schema.js'

const VALID_SCENE_KINDS = new Set(['title', 'keypoint', 'quote', 'outro'])

describe('BUILT_IN_TEXT_STYLES', () => {
  it('every entry parses against TextStyleSchema', () => {
    // Schema parse catches drift between the schema and the literal data
    // (eg. a new required field added to TextStyleSchema but not to the
    // 36 presets). Without this test the failure surfaces at render
    // time, often as a silent fallback to the default style.
    for (const style of BUILT_IN_TEXT_STYLES) {
      expect(() => TextStyleSchema.parse(style)).not.toThrow()
    }
  })

  it('has unique ids', () => {
    const ids = BUILT_IN_TEXT_STYLES.map((s) => s.id)
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i)
    expect(dupes).toEqual([])
  })

  it('every scope entry references a known scene kind', () => {
    // Custom (PascalCase) scene names ARE allowed in segment.scene at
    // render time, but the built-in pool should only target the four
    // canonical kinds — otherwise the orchestrator can't reason about
    // which preset fits which segment.
    for (const style of BUILT_IN_TEXT_STYLES) {
      for (const kind of style.scope) {
        expect(VALID_SCENE_KINDS, `style ${style.id} scope ${kind}`).toContain(
          String(kind)
        )
      }
    }
  })

  it('every fontFamily is in ALLOWED_FONT_IDS (so the renderer can guarantee it)', () => {
    const allowed = new Set<string>(ALLOWED_FONT_IDS)
    for (const style of BUILT_IN_TEXT_STYLES) {
      expect(allowed, `style ${style.id} font ${style.fontFamily}`).toContain(
        style.fontFamily
      )
    }
  })

  it('karaoke styles declare an accent color (otherwise the active word is invisible)', () => {
    // Renderer falls back to style.color when accent is missing, which
    // means the karaoke effect renders as a no-op. Catch that here.
    for (const style of BUILT_IN_TEXT_STYLES) {
      if (style.enter !== 'karaoke') continue
      expect(
        style.karaokeAccentColor,
        `karaoke style ${style.id} missing karaokeAccentColor`
      ).toBeDefined()
    }
  })
})

describe('DEFAULT_TEXT_STYLE_ID', () => {
  it('resolves to a real built-in style', () => {
    expect(findTextStyle(DEFAULT_TEXT_STYLE_ID)).not.toBeNull()
  })
})

describe('DEFAULT_VARIANTS', () => {
  it('every textStyleBySceneKind reference exists in BUILT_IN_TEXT_STYLES', () => {
    // This is the highest-value invariant in the file. The default A/B/C
    // trio is what every new project ships with. A typo here means the
    // very first render the user sees falls back to `classic` for every
    // scene — visually defeats the purpose of having three variants.
    for (const variant of DEFAULT_VARIANTS) {
      for (const [sceneKind, styleId] of Object.entries(
        variant.textStyleBySceneKind
      )) {
        const resolved = findTextStyle(styleId)
        expect(
          resolved,
          `variant ${variant.id} scene ${sceneKind} → unknown style ${styleId}`
        ).not.toBeNull()
      }
    }
  })

  it('covers all four canonical scene kinds in every variant', () => {
    for (const variant of DEFAULT_VARIANTS) {
      const keys = new Set(Object.keys(variant.textStyleBySceneKind))
      for (const kind of VALID_SCENE_KINDS) {
        expect(keys, `variant ${variant.id} missing ${kind}`).toContain(kind)
      }
    }
  })

  it('has unique variant ids', () => {
    const ids = DEFAULT_VARIANTS.map((v) => v.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('findTextStyle', () => {
  it('returns null for undefined id', () => {
    expect(findTextStyle(undefined)).toBeNull()
  })

  it('returns null for unknown id', () => {
    expect(findTextStyle('definitely-not-a-style-id')).toBeNull()
  })

  it('returns the built-in style by id', () => {
    const s = findTextStyle('classic')
    expect(s?.id).toBe('classic')
    expect(s?.source).toBe('builtin')
  })

  it('user style wins over built-in on id collision', () => {
    // Studio/data-user-styles flow lets users override built-ins by
    // reusing the id. If this priority flips, every saved override
    // silently regresses to the original.
    const userOverride: TextStyle = {
      id: 'classic',
      name: 'My override',
      family: 'news',
      fontFamily: 'inter',
      fontSize: 80,
      fontWeight: 700,
      letterSpacing: 0,
      lineHeight: 1.15,
      color: '#ff0000',
      background: { kind: 'none' },
      align: 'center',
      anchor: 'bottom',
      marginPct: 8,
      enter: 'fade',
      exit: 'fade',
      enterDurationSec: 0.4,
      exitDurationSec: 0.4,
      source: 'user',
      scope: [],
    }
    const resolved = findTextStyle('classic', [userOverride])
    expect(resolved?.color).toBe('#ff0000')
    expect(resolved?.source).toBe('user')
  })
})
