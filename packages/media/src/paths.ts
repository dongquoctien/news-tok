import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// packages/media/src/paths.ts -> repo root is 3 levels up.
const here = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(here, '..', '..', '..')

export const cacheRoot = () => resolve(REPO_ROOT, 'data', 'cache')
export const cacheNamespaceRoot = (namespace: string) => resolve(cacheRoot(), namespace)
