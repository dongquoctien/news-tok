// IMPORTANT: only re-export modules that are SAFE to import in browser
// bundles. paths/logger/env all touch `node:fs` / `node:url` and cause
// webpack to error with "Reading from 'node:fs/promises' is not handled"
// when a client component (eg. SfxPicker) does `import { ... } from
// '@news-tok/shared'`. Server consumers must import those via the
// dedicated subpath exports (`@news-tok/shared/paths`, etc.).
export * from './schema.js'
export * from './ui-tokens.js'
export * from './text-styles.js'
export * from './sfx.js'
export * from './social.js'
export * from './caption-sanitize.js'
// sanitize.ts transitively imports paths.ts → server-only too. Client
// callers should reach into specific helpers via the subpath
// `@news-tok/shared/sanitize` and bear the responsibility of not
// pulling in functions whose implementations need the filesystem.
export * from './sanitize.js'
