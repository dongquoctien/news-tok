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
