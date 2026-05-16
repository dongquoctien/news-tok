import { defineConfig } from 'vitest/config'

/**
 * Vitest config for the @news-tok/media package. Mirrors the
 * @news-tok/shared setup so tests live next to their source files.
 *
 * Only pure helpers are unit-tested here (peaks binning, cache key
 * derivation, etc.) — anything that spawns ffmpeg or hits a real
 * provider belongs in scripts/smoke-media-network.ts.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
    },
  },
})
