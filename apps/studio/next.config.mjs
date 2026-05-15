// `@next/env` is shipped as CommonJS — named exports don't survive
// the ESM bridge, so we have to take the default and destructure.
import nextEnv from '@next/env'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
const { loadEnvConfig } = nextEnv

// Load monorepo-root .env BEFORE Next's own env loader runs, so
// values defined at /news-tok/.env propagate into apps/studio's
// runtime alongside any local apps/studio/.env. Next normally
// only reads env files from its own working directory, so without
// this step our root .env (shared by mcp-server + scripts + the
// Studio API routes) wouldn't reach process.env.
//
// loadEnvConfig is idempotent — passing `false` for `dev` matches
// how Next itself invokes it. Vars already set on process.env
// (e.g. user-passed VAR=x npm run studio) take precedence.
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..')
loadEnvConfig(repoRoot)

const NATIVE_OR_HEAVY_PACKAGES = [
  'ffmpeg-static',
  '@remotion/bundler',
  '@remotion/renderer',
  '@rspack/binding',
  'msedge-tts',
  'jsdom',
  '@mozilla/readability',
  'webpack',
  'playwright',
  'playwright-core',
  'chromium-bidi',
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@news-tok/shared',
    '@news-tok/media',
    '@news-tok/remotion',
    '@news-tok/render',
  ],
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000'] },
    serverComponentsExternalPackages: NATIVE_OR_HEAVY_PACKAGES,
    // Required by Next 14 to invoke `instrumentation.ts → register()`
    // at server boot. We use that for one-shot env auditing.
    instrumentationHook: true,
  },
  webpack: (config, { isServer }) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    }
    if (isServer) {
      // Mark native + heavy deps as runtime externals on the server so
      // webpack doesn't try to parse them. The Node runtime resolves
      // them via the standard module mechanism.
      const existing = Array.isArray(config.externals)
        ? config.externals
        : config.externals
          ? [config.externals]
          : []
      config.externals = [
        ...existing,
        ({ request }, callback) => {
          if (!request) return callback()
          // Exact match or subpath of a heavy/native package
          // (e.g. "chromium-bidi/lib/cjs/...", "playwright-core/lib/...").
          const matched = NATIVE_OR_HEAVY_PACKAGES.some(
            (pkg) => request === pkg || request.startsWith(pkg + '/')
          )
          if (matched) return callback(null, `commonjs ${request}`)
          callback()
        },
      ]
    }
    return config
  },
}

export default nextConfig
