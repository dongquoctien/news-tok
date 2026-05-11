import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  // Bundle our workspace packages so `node dist/index.js` works without
  // resolving TypeScript sources via subpath exports. Everything in
  // node_modules stays external (resolved at runtime).
  // NOTE: @news-tok/remotion is intentionally excluded — bundling it pulls
  // in the full Remotion + rspack toolchain. We only call `@news-tok/render`
  // which dynamically references the Remotion package at render-time.
  noExternal: [
    '@news-tok/shared',
    '@news-tok/media',
    '@news-tok/render',
  ],
  // Keep heavy native/binding-bearing libs as runtime externals.
  external: [
    '@remotion/bundler',
    '@remotion/renderer',
    '@rspack/binding',
    'webpack',
    'msedge-tts',
    'jsdom',
    '@mozilla/readability',
    'ffmpeg-static',
  ],
})
