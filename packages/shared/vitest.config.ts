import { defineConfig } from 'vitest/config'

/**
 * Vitest config for the @news-tok/shared package. We test pure
 * functions only — sanitisers, schema-derived helpers, deterministic
 * topic/style picks. No DOM, no network, no fixtures on disk.
 *
 * `include` pulls in any `*.test.ts` next to the source it tests so
 * imports stay short (`./sanitize.js`) and the test file moves with
 * its subject if it gets relocated.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // node environment — these are pure functions, no jsdom needed
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
    },
  },
})
