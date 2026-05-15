import { z } from 'zod'

/**
 * Best-effort environment validation. The schema is intentionally
 * permissive: every key is optional because news-tok runs locally
 * with the user's Claude subscription, and the media providers have
 * graceful fallback chains (Pexels → Unsplash → Wikimedia → cached
 * stub). Validation here just produces a structured report so the
 * Studio doctor / startup banner can warn when an optional key is
 * missing AND its provider is the one being asked for.
 *
 * If a future feature requires a key, mark it `required` here and
 * the validator will switch from `warning` to `error` for that key.
 */
const envSchema = z.object({
  PEXELS_API_KEY: z.string().optional(),
  PIXABAY_API_KEY: z.string().optional(),
  UNSPLASH_ACCESS_KEY: z.string().optional(),
  CLAUDE_CLI_PATH: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
})

export type EnvShape = z.infer<typeof envSchema>

/**
 * Run-once env audit. Returns:
 *   - parsed: the validated env (with unknown keys stripped from the
 *     shape, but still readable via process.env)
 *   - missing: which optional keys are absent; callers map this to
 *     a user-facing notice depending on whether that provider is
 *     actually being used
 *   - errors: shape errors from zod (currently empty unless we mark
 *     something required)
 */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): {
  parsed: EnvShape
  missing: string[]
  errors: string[]
} {
  const result = envSchema.safeParse(env)
  if (!result.success) {
    return {
      parsed: {},
      missing: [],
      errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    }
  }
  const missing: string[] = []
  for (const key of [
    'PEXELS_API_KEY',
    'PIXABAY_API_KEY',
    'UNSPLASH_ACCESS_KEY',
  ] as const) {
    if (!result.data[key]) missing.push(key)
  }
  return { parsed: result.data, missing, errors: [] }
}

/**
 * Pretty one-shot startup banner. Writes a single warning line per
 * missing optional key to stderr; no-op when nothing is missing.
 * Designed to be called once from Studio's instrumentation hook or
 * the doctor script.
 */
export function reportEnvStatus(): void {
  const { missing, errors } = validateEnv()
  for (const e of errors) {
    process.stderr.write(`[env] ERROR ${e}\n`)
  }
  for (const m of missing) {
    process.stderr.write(
      `[env] warning: ${m} is not set — that provider will fall back to alternates or be skipped\n`
    )
  }
}
