export function assetUrl(absPath: string | undefined | null): string | null {
  if (!absPath) return null
  return `/api/asset?path=${encodeURIComponent(absPath)}`
}
