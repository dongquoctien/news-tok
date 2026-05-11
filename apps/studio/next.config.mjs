const NATIVE_OR_HEAVY_PACKAGES = [
  'ffmpeg-static',
  '@remotion/bundler',
  '@remotion/renderer',
  '@rspack/binding',
  'msedge-tts',
  'jsdom',
  '@mozilla/readability',
  'webpack',
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
          if (request && NATIVE_OR_HEAVY_PACKAGES.includes(request)) {
            return callback(null, `commonjs ${request}`)
          }
          callback()
        },
      ]
    }
    return config
  },
}

export default nextConfig
