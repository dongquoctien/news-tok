import { AbsoluteFill, Audio, Sequence, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import type {
  BgMusicEdits,
  ColorOverride,
  Project,
  SceneKind,
  Segment,
  TextStyle,
  Variant,
} from '@news-tok/shared/schema'
import { BUILT_IN_TEXT_STYLES, findTextStyle, DEFAULT_TEXT_STYLE_ID } from '@news-tok/shared/text-styles'
import { resolveScene } from '../scenes/registry.js'
import { MissingScene } from '../scenes/MissingScene.js'
import { Subtitles } from '../effects/Subtitles.js'
import { LogoMarker } from '../effects/LogoMarker.js'
import { buildDuckTimeline, volumeAtFrame, type DuckTimeline } from '../effects/ducking.js'
import { fontFor } from '../scenes/fonts.js'

export type NewsTokCompositionProps = {
  storyboard: Project
  /** Id of the variant to render. Falls back to the first variant, or none. */
  variantId?: string
  /**
   * Map of sfx id → URL the renderer has rewritten to live under publicDir
   * (`/public/sfx/<id>.mp3`). Keys missing from the map are silently
   * dropped — they are treated as silence.
   */
  sfxUrlMap?: Record<string, string>
  /**
   * URL for the image watermark, rewritten by the renderer to live under
   * publicDir or, in Studio's <Player>, a /api/projects/<id>/logo endpoint.
   * Ignored when `storyboard.logo.kind !== 'image'`.
   */
  logoUrl?: string
  /**
   * URL for the NEWSTOKVN brand logo PNG, resolved by the caller for
   * the environment it runs in:
   *   - Studio <Player>: `/newstokvn-logo.png` (Next public folder).
   *   - Renderer: `/public/newstokvn-logo.png` (Remotion's publicDir
   *     is `data/`; `stageBrandAssets()` copies the source PNG into
   *     it before bundling).
   *
   * Forwarded to layouts via `LayoutProps.brandLogoUrl` so outro
   * layouts can render the logo without knowing which environment
   * they're running in.
   */
  brandLogoUrl?: string
}

/**
 * Background music with non-destructive trim + fade applied at render
 * time. Layered logic:
 *
 *   1. `startFrom` / `endAt` carve out the audible window inside the
 *      source file — the underlying mp3 in `data/cache/music/` stays
 *      untouched so the same cache entry serves multiple projects
 *      that trim it differently.
 *   2. `loop` kicks in when the selected window is shorter than the
 *      video; Remotion loops from `startFrom` (not 0), so the user's
 *      trimmed selection is what repeats.
 *   3. `fadeIn` + `fadeOut` envelopes are computed frame-by-frame
 *      against the video timeline (NOT the audio timeline) — fade-out
 *      always lands on the video tail regardless of how the track loops.
 *
 * Default `edits` shape (legacy projects) = `{ trimStartSec:0,
 * fadeInSec:0, fadeOutSec:1.2, ducking:{ enabled:false, ... } }`, which
 * keeps the visible behaviour identical to the pre-edit hardcoded
 * version: no trim, no fade-in, 1.2s tail fade.
 */
function BgMusic({
  src,
  volume,
  trackDurationSec,
  videoDurationSec,
  edits,
  duckTimeline,
}: {
  src: string
  volume: number
  trackDurationSec: number | undefined
  videoDurationSec: number
  edits: BgMusicEdits
  /**
   * Precomputed sidechain timeline. `null` when ducking is disabled or
   * no segment has wordBoundaries. Computed once in the parent and
   * passed down so the binary search doesn't re-run inside <Audio>'s
   * volume function (Remotion calls volume(frame) per frame).
   */
  duckTimeline: DuckTimeline | null
}) {
  const { fps } = useVideoConfig()
  const frame = useCurrentFrame()
  const totalFrames = Math.max(1, Math.round(videoDurationSec * fps))

  // Fade-out — anchored to the END of the video. Cap at 1/3 of the
  // total duration so a 3-second video doesn't get a 1.2s fade-out
  // gobbling the whole thing.
  const fadeOutFrames = Math.min(
    Math.round(edits.fadeOutSec * fps),
    Math.floor(totalFrames / 3)
  )
  const fadeOutStart = Math.max(0, totalFrames - fadeOutFrames)
  const fadeOut =
    fadeOutFrames > 0
      ? interpolate(frame, [fadeOutStart, totalFrames], [1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 1

  // Fade-in — anchored to the START. Same 1/3 cap for symmetry.
  const fadeInFrames = Math.min(
    Math.round(edits.fadeInSec * fps),
    Math.floor(totalFrames / 3)
  )
  const fadeIn =
    fadeInFrames > 0
      ? interpolate(frame, [0, fadeInFrames], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 1

  // Trim — startFrom and endAt are measured in frames AT THE SOURCE
  // file's timeline (not the video timeline). `endAt` is the absolute
  // offset where playback stops; clamp against the file duration when
  // we know it so a stale storyboard with trimEndSec=999 doesn't
  // confuse Remotion.
  const startFromFrames = Math.max(0, Math.round(edits.trimStartSec * fps))
  let endAtFrames: number | undefined
  if (typeof edits.trimEndSec === 'number') {
    const requested = Math.round(edits.trimEndSec * fps)
    if (trackDurationSec != null) {
      endAtFrames = Math.min(requested, Math.round(trackDurationSec * fps))
    } else {
      endAtFrames = requested
    }
  }

  // Loop when the selected window is shorter than the video.
  const selectedSec =
    (typeof edits.trimEndSec === 'number'
      ? edits.trimEndSec
      : (trackDurationSec ?? videoDurationSec)) - edits.trimStartSec
  const shouldLoop = selectedSec > 0 && selectedSec < videoDurationSec

  // Ducking multiplier — 1 when disabled, smoothed 0..1 curve otherwise.
  // Defensive: even with edits.ducking.enabled=true, the parent passes
  // `null` for projects whose segments have no wordBoundaries yet, so
  // a user can flip the toggle in Studio before TTS has run without
  // crashing the render.
  const duckMul = duckTimeline ? volumeAtFrame(duckTimeline, frame) : 1

  return (
    <Audio
      src={src}
      volume={volume * fadeIn * fadeOut * duckMul}
      loop={shouldLoop}
      startFrom={startFromFrames > 0 ? startFromFrames : undefined}
      endAt={endAtFrames}
    />
  )
}

const FALLBACK_STYLE: TextStyle =
  findTextStyle(DEFAULT_TEXT_STYLE_ID, []) ?? BUILT_IN_TEXT_STYLES[0]!

/**
 * Resolve which text style applies to a segment under the active variant.
 * Priority (most specific wins):
 *   1. variant.textStyleBySegmentId[segment.id] — per-variant per-segment override
 *   2. segment.textStyleId — project-wide segment override
 *   3. variant.textStyleBySceneKind[scene] — variant default for this scene kind
 *   4. DEFAULT_TEXT_STYLE_ID
 */
function resolveStyle(
  segment: Segment,
  variant: Variant | undefined,
  userStyles: TextStyle[]
): TextStyle {
  if (variant) {
    const perSegmentId = variant.textStyleBySegmentId?.[segment.id]
    const perSegment = findTextStyle(perSegmentId, userStyles)
    if (perSegment) return perSegment
  }
  const direct = findTextStyle(segment.textStyleId, userStyles)
  if (direct) return direct
  if (variant) {
    const sceneKey = (segment.scene as SceneKind) as string
    const styleId = variant.textStyleBySceneKind[sceneKey]
    const fromVariant = findTextStyle(styleId, userStyles)
    if (fromVariant) return fromVariant
  }
  return FALLBACK_STYLE
}

/**
 * Resolve the font id override for a segment under the active variant.
 * Priority (most specific wins):
 *   1. variant.fontOverrideBySegmentId[segment.id]
 *   2. segment.fontOverride
 *   3. undefined — primitives fall back to style.fontFamily on their own.
 */
function resolveFontOverride(
  segment: Segment,
  variant: Variant | undefined
): string | undefined {
  if (variant) {
    const perSegment = variant.fontOverrideBySegmentId?.[segment.id]
    if (perSegment) return perSegment
  }
  if (segment.fontOverride) return segment.fontOverride
  return undefined
}

/**
 * Resolve color overrides for a segment under the active variant. Same
 * priority idea as the font / style resolvers but with merging: a
 * variant override only replaces the fields it specifies, so a user can
 * set just `accent` on one variant and leave `primary` / `stroke` from
 * the segment-level override intact.
 */
function resolveColorOverride(
  segment: Segment,
  variant: Variant | undefined
): ColorOverride | undefined {
  const variantOv = variant?.colorOverrideBySegmentId?.[segment.id]
  const segOv = segment.colorOverride
  if (!variantOv && !segOv) return undefined
  return { ...(segOv ?? {}), ...(variantOv ?? {}) }
}

/**
 * Emit short SFX cues for a single segment. Priority:
 *   segment.sfxOverride > textStyle.sfx
 * The override is treated as a full replacement — an empty enterSoundId
 * silences the cue without falling back to the style's value.
 */
function SegmentSfx({
  segment,
  style,
  sfxUrlMap,
  masterVolume,
}: {
  segment: Segment
  style: TextStyle
  sfxUrlMap: Record<string, string>
  masterVolume: number
}) {
  const { fps } = useVideoConfig()
  const sfx = segment.sfxOverride ?? style.sfx
  if (!sfx) return null
  const cues: React.ReactNode[] = []
  const enterUrl = sfx.enterSoundId ? sfxUrlMap[sfx.enterSoundId] : undefined
  if (enterUrl) {
    cues.push(
      <Audio
        key="enter"
        src={enterUrl}
        volume={(sfx.enterVolume ?? 0.6) * masterVolume}
      />
    )
  }
  const perWordUrl = sfx.perWordSoundId ? sfxUrlMap[sfx.perWordSoundId] : undefined
  if (perWordUrl && segment.wordBoundaries && segment.wordBoundaries.length > 0) {
    segment.wordBoundaries.forEach((w, i) => {
      const from = Math.round(w.offsetSec * fps)
      const dur = Math.max(1, Math.round(w.durationSec * fps))
      cues.push(
        <Sequence key={`w-${i}`} from={from} durationInFrames={dur} layout="none">
          <Audio
            src={perWordUrl}
            volume={(sfx.perWordVolume ?? 0.4) * masterVolume}
          />
        </Sequence>
      )
    })
  }
  return <>{cues}</>
}

export const NewsTokComposition = ({
  storyboard,
  variantId,
  sfxUrlMap = {},
  logoUrl,
  brandLogoUrl,
}: NewsTokCompositionProps) => {
  const { fps } = useVideoConfig()
  const subtitlesEnabled = storyboard.subtitles?.enabled
  const bottomPct = storyboard.subtitles?.bottomPct ?? 0.18
  const subtitleFont = fontFor(storyboard.language)
  let cursor = 0

  const bgMusic = storyboard.bgMusic
  const bgMusicVolume = storyboard.bgMusicVolume ?? 0.2
  // BgMusicEditsSchema.parse({}) defaults align with the pre-edit
  // hardcoded behaviour (1.2s tail fade, no trim, no fade-in, no duck),
  // so storyboards saved before this field existed render identically.
  const bgMusicEdits = storyboard.bgMusicEdits ?? {
    trimStartSec: 0,
    fadeInSec: 0,
    fadeOutSec: 1.2,
    ducking: { enabled: false, ratio: 0.3, smoothMs: 200 },
  }
  const masterSfxVolume = storyboard.sfxVolume ?? 0.7
  // Project-wide SFX kill-switch. Legacy storyboards lack the field,
  // and Zod's default makes ProjectSchema.parse() return true for them
  // — but the composition is also rendered directly without re-parsing
  // in some tests, so default to true here too.
  const sfxEnabled = storyboard.sfxEnabled ?? true
  const userStyles = storyboard.userTextStyles ?? []
  const variants = storyboard.variants ?? []
  const activeVariant =
    variants.find((v) => v.id === variantId) ?? variants[0] ?? undefined

  // Compute each segment's effective duration first, so the bg-music fade
  // window uses the same number the renderer actually plays — including any
  // stretch the guard applies to keep narration audible.
  const SAFETY_FRAMES = Math.round(0.2 * fps)
  const segmentFrames = storyboard.segments.map((segment) => {
    const plannedFrames = Math.max(1, Math.round(segment.durationSec * fps))
    const narrationSec = segment.audio?.narration?.durationSec ?? 0
    const narrationFrames = narrationSec > 0 ? Math.ceil(narrationSec * fps) : 0
    return Math.max(plannedFrames, narrationFrames + SAFETY_FRAMES)
  })
  const videoDurationSec = segmentFrames.reduce((s, f) => s + f, 0) / fps

  // Precompute segment offsets in frames so the duck timeline can align
  // each segment's wordBoundaries with the project-wide music timeline.
  const segmentOffsets: number[] = []
  {
    let offset = 0
    for (const f of segmentFrames) {
      segmentOffsets.push(offset)
      offset += f
    }
  }
  // Build the duck timeline only when ducking is enabled. The helper
  // returns a `frame 0 → target 1` anchor for the no-narration case;
  // we suppress it entirely to avoid the per-frame binary search when
  // ducking is off.
  const duckTimeline: DuckTimeline | null = bgMusicEdits.ducking.enabled
    ? buildDuckTimeline(storyboard.segments, {
        fps,
        segmentOffsets,
        ratio: bgMusicEdits.ducking.ratio,
        smoothMs: bgMusicEdits.ducking.smoothMs,
      })
    : null

  return (
    <AbsoluteFill style={{ backgroundColor: '#0b0b0f' }}>
      {bgMusic ? (
        <BgMusic
          src={bgMusic.path}
          volume={bgMusicVolume}
          trackDurationSec={bgMusic.durationSec}
          videoDurationSec={videoDurationSec}
          edits={bgMusicEdits}
          duckTimeline={duckTimeline}
        />
      ) : null}
      {storyboard.segments.map((segment, i) => {
        const durationInFrames = segmentFrames[i]!
        const Scene = resolveScene(segment.scene)
        const from = cursor
        cursor += durationInFrames
        // Narration + video clip audio are mixed by default: when the
        // user un-mutes the background video, both tracks play in
        // parallel. The user controls the balance via the clip volume
        // slider (segment.videoVolume) — narration stays at its
        // declared loudness.
        const hasSubs =
          subtitlesEnabled && segment.wordBoundaries && segment.wordBoundaries.length > 0
        const style = resolveStyle(segment, activeVariant, userStyles)
        const fontOverride = resolveFontOverride(segment, activeVariant)
        const colorOverride = resolveColorOverride(segment, activeVariant)
        // Watermark gating: skip body segments when the spec says
        // intro-outro-only. `kind === 'none'` is handled inside
        // <LogoMarker /> so the check stays in one place.
        const showLogo =
          storyboard.logo &&
          storyboard.logo.kind !== 'none' &&
          (storyboard.logo.appliesTo === 'all' ||
            segment.scene === 'title' ||
            segment.scene === 'outro')
        return (
          <Sequence key={segment.id} from={from} durationInFrames={durationInFrames} name={segment.id}>
            {Scene ? (
              <Scene
                segment={segment}
                project={storyboard}
                textStyle={style}
                fontOverride={fontOverride}
                colorOverride={colorOverride}
                brandLogoUrl={brandLogoUrl}
              />
            ) : (
              <MissingScene segment={segment} project={storyboard} />
            )}
            {hasSubs ? (
              <Subtitles
                wordBoundaries={segment.wordBoundaries!}
                bottomPct={bottomPct}
                fontFamily={subtitleFont}
              />
            ) : null}
            {sfxEnabled ? (
              <SegmentSfx
                segment={segment}
                style={style}
                sfxUrlMap={sfxUrlMap}
                masterVolume={masterSfxVolume}
              />
            ) : null}
            {showLogo ? (
              <LogoMarker
                spec={storyboard.logo}
                imageUrl={logoUrl}
                language={storyboard.language}
              />
            ) : null}
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
