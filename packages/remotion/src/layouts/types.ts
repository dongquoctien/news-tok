import type { ComponentType } from 'react'
import type {
  AssetRef,
  ColorOverride,
  Project,
  Segment,
  TextStyle,
} from '@news-tok/shared/schema'

/**
 * The contract every layout component (built-in or user) must accept.
 * Scenes resolve the layout via `resolveLayout(segment.layoutId)` and
 * pass this payload — content goes into `text` / `eyebrow` / `chips` /
 * `fileId`, the resolved text-style chain goes into the four style
 * fields, and the full segment + project are forwarded so layouts can
 * read niche state (e.g. `wordBoundaries` for karaoke, or
 * `project.aspect` for adaptive sizing).
 *
 * Layouts must:
 *   - Render `text` via <TextBlock mode="slot" .../> so user-picked
 *     text style + font override + colour override + motion all apply
 *     to the headline.
 *   - Hard-style the eyebrow / chips / fileId slots — these aren't
 *     subject to user TextStyle in v1.
 *   - Be safe to fall back from: if the layout component throws, the
 *     scene wrapper renders FullBleed instead. Don't rely on side
 *     effects.
 */
export type LayoutProps = {
  /** Headline text. Always present — corresponds to `segment.text`. */
  text: string
  /** Optional uppercase pill above the headline (e.g. "CASE FILE"). */
  eyebrow?: string
  /** Optional pill tags (e.g. ["FDA APPROVED", "2027"]). */
  chips?: string[]
  /** Optional small dossier-style file id (e.g. "FILE 02"). */
  fileId?: string
  /** Background asset — populated from `segment.visuals.background`. */
  media?: AssetRef

  /** Resolved text-style from the variant → segment → fallback chain. */
  textStyle: TextStyle
  /** Resolved font override (variant > segment > undefined). */
  fontOverride?: string
  /** Resolved colour override (variant + segment merged). */
  colorOverride?: ColorOverride

  /** Full segment for niche reads — wordBoundaries, narration, sfx. */
  segment: Segment
  /** Full project for niche reads — aspect, showSceneBadges, title. */
  project: Project
  /**
   * URL the renderer / Studio resolved for the NEWSTOKVN brand logo
   * PNG, e.g. `/newstokvn-logo.png` (Studio Next public) or
   * `/public/newstokvn-logo.png` (Remotion renderer's publicDir).
   * Outro layouts read this directly via `<Img src={brandLogoUrl}>`
   * so the same JSX renders correctly in both environments without
   * hardcoding a path that only works in one.
   *
   * Optional — non-outro layouts ignore it. When undefined the
   * layout falls back to a placeholder or skips the logo entirely.
   */
  brandLogoUrl?: string
}

export type LayoutComponent = ComponentType<LayoutProps>
