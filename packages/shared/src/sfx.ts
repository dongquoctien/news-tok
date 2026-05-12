/**
 * Curated text-transition SFX bank. Each entry is < 1 s, mono mp3, peak
 * normalised to -1 dBFS. Source URLs are recorded so a one-shot script
 * can re-fetch and re-trim them; the files themselves live under
 * `packages/shared/sfx/<id>.mp3` and are committed to the repo (they are
 * tiny and need to be deterministic for offline renders).
 *
 * License summary per entry:
 *   - mixkit       — free, commercial OK, no attribution required.
 *   - pixabay-cc0  — public domain dedication (CC0).
 *   - archive-pd   — public domain audio collection on the Internet Archive.
 *   - freesound-cc0 — CC0 on freesound.org.
 *
 * When new bank entries are added, also append them here so the renderer
 * (which validates ids at render time) and the Studio picker (which lists
 * them) see the change at once.
 */
export type SfxEntry = {
  id: string
  label: string
  /** Approximate duration in seconds — informational only; the actual mp3 wins. */
  durationSec: number
  /** Gain to bake-in on top of the user's volume slider (0..1). */
  defaultGain: number
  source: 'mixkit' | 'pixabay-cc0' | 'archive-pd' | 'freesound-cc0'
  /** Origin URL for provenance. Not fetched at render time. */
  sourceUrl: string
}

export const BUILT_IN_SFX: SfxEntry[] = [
  {
    id: 'whoosh-short',
    label: 'Whoosh (short)',
    durationSec: 0.4,
    defaultGain: 1.0,
    source: 'mixkit',
    sourceUrl: 'https://mixkit.co/free-sound-effects/whoosh/',
  },
  {
    id: 'whoosh-long',
    label: 'Whoosh (long)',
    durationSec: 0.9,
    defaultGain: 1.0,
    source: 'mixkit',
    sourceUrl: 'https://mixkit.co/free-sound-effects/whoosh/',
  },
  {
    id: 'pop',
    label: 'Pop',
    durationSec: 0.2,
    defaultGain: 1.0,
    source: 'pixabay-cc0',
    sourceUrl: 'https://pixabay.com/sound-effects/search/pop/',
  },
  {
    id: 'pop-bright',
    label: 'Pop (bright)',
    durationSec: 0.25,
    defaultGain: 1.0,
    source: 'pixabay-cc0',
    sourceUrl: 'https://pixabay.com/sound-effects/search/pop/',
  },
  {
    id: 'ding',
    label: 'Ding (UI)',
    durationSec: 0.3,
    defaultGain: 1.0,
    source: 'pixabay-cc0',
    sourceUrl: 'https://pixabay.com/sound-effects/search/ding/',
  },
  {
    id: 'click',
    label: 'Click',
    durationSec: 0.1,
    defaultGain: 1.0,
    source: 'pixabay-cc0',
    sourceUrl: 'https://pixabay.com/sound-effects/search/click/',
  },
  {
    id: 'boing',
    label: 'Boing (cartoon)',
    durationSec: 0.5,
    defaultGain: 1.0,
    source: 'archive-pd',
    sourceUrl: 'https://archive.org/details/HannaBarberaCartoonSoundFX',
  },
  {
    id: 'cartoon-whoosh',
    label: 'Cartoon whoosh',
    durationSec: 0.6,
    defaultGain: 1.0,
    source: 'archive-pd',
    sourceUrl: 'https://archive.org/details/cartoonwhooshsounds',
  },
  {
    id: 'sparkle',
    label: 'Sparkle',
    durationSec: 0.7,
    defaultGain: 1.0,
    source: 'mixkit',
    sourceUrl: 'https://mixkit.co/free-sound-effects/',
  },
  {
    id: 'glitch',
    label: 'Glitch',
    durationSec: 0.4,
    defaultGain: 1.0,
    source: 'freesound-cc0',
    sourceUrl: 'https://freesound.org/browse/tags/cc0/',
  },
  {
    id: 'arcade-coin',
    label: 'Arcade coin',
    durationSec: 0.45,
    defaultGain: 1.0,
    source: 'freesound-cc0',
    sourceUrl: 'https://freesound.org/browse/tags/cc0/',
  },
  {
    id: 'typewriter-key',
    label: 'Typewriter key',
    durationSec: 0.12,
    defaultGain: 1.0,
    source: 'freesound-cc0',
    sourceUrl: 'https://freesound.org/browse/tags/cc0/',
  },
]

const BY_ID: Record<string, SfxEntry> = Object.fromEntries(
  BUILT_IN_SFX.map((s) => [s.id, s])
)

export function findSfx(id: string | undefined): SfxEntry | null {
  if (!id) return null
  return BY_ID[id] ?? null
}

/**
 * Resolve an SFX id to its on-disk file path. The renderer uses this to
 * compose URLs into the Remotion publicDir. Files are expected at
 * `packages/shared/sfx/<id>.mp3`; the bank is committed so renders are
 * deterministic.
 */
export function sfxFileName(id: string): string {
  return `${id}.mp3`
}
