import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * Vitest config for the @news-tok/studio app. Tests sit under `lib/`
 * next to the helpers they exercise — pure functions, no DOM, no
 * Next.js runtime. Components that touch the DOM (waveform-trimmer,
 * etc.) belong in smoke / manual QA, not here.
 *
 * We mirror the `@/...` path alias from tsconfig so test imports look
 * the same as production imports.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': here,
    },
  },
  test: {
    include: ['lib/**/*.test.ts', 'components/**/*.test.ts'],
    environment: 'node',
  },
})
