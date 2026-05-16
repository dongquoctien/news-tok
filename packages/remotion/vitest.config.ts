import { defineConfig } from 'vitest/config'

/**
 * Vitest config for @news-tok/remotion. Only the pure effect math
 * (`effects/ducking.ts` etc.) is unit-tested here — visual composition
 * + scene rendering is exercised by scripts/smoke-render.ts which
 * actually runs Remotion's bundler.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
