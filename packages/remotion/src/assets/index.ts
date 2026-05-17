/**
 * Versioned brand assets live in this directory and ship alongside the
 * renderer source. Two consumers reference them:
 *
 *   1. Studio's `<Player>` — the same PNGs are also copied to
 *      `apps/studio/public/`, served by Next at `/<file>.png`.
 *   2. The Remotion renderer — `stageBrandAssets()` (in
 *      `packages/render/src/brand-staging.ts`) copies the PNGs into
 *      the renderer's publicDir (= `data/`) before bundling, where
 *      the dev server resolves them at `/public/<file>.png`.
 *
 * The two URLs are different, so layouts must NOT hardcode either.
 * Instead the URL is passed via `inputProps.brandLogoUrl` and
 * forwarded into `LayoutProps.brandLogoUrl`. See
 * `packages/render/src/render.ts` (renderer side) and
 * `apps/studio/components/studio/player-pane.tsx` (Studio side) for
 * where the env-specific URL is plugged in.
 *
 * This module is intentionally code-free — keeping the asset
 * directory in `tsconfig.include` requires at least one .ts file,
 * and this file is the documentation entry point. Don't add a
 * constant URL here; layouts that import one would silently use
 * the wrong URL in one of the two environments.
 */
export {}
