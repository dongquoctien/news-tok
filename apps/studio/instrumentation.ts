/**
 * Next.js instrumentation hook — runs once when the server starts.
 * We use it to emit a one-shot env audit so missing optional keys
 * (PEXELS_API_KEY, UNSPLASH_ACCESS_KEY, …) surface in the terminal
 * instead of being discovered when the first searchImage call fails
 * 30 seconds into a render.
 *
 * Keep this file tiny — `register()` runs on every server boot so any
 * heavy work here delays first-request latency.
 */
export async function register() {
  // Only run in the Node.js runtime — Next also runs instrumentation
  // in Edge for middleware, where Node's process.env shape differs.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { reportEnvStatus } = await import('@news-tok/shared/env')
  reportEnvStatus()
}
