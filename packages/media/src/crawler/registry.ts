import { readFile, readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ProviderConfigSchema, type ProviderConfig } from './providers/types.js'

const here = dirname(fileURLToPath(import.meta.url))
const PROVIDERS_DIR = resolve(here, 'providers')

const cache = new Map<string, ProviderConfig>()

export async function loadProvider(name: string): Promise<ProviderConfig> {
  const cached = cache.get(name)
  if (cached) return cached
  const path = resolve(PROVIDERS_DIR, `${name}.json`)
  const raw = await readFile(path, 'utf8')
  const parsed = ProviderConfigSchema.parse(JSON.parse(raw))
  cache.set(name, parsed)
  return parsed
}

export async function listProviders(): Promise<ProviderConfig[]> {
  const files = await readdir(PROVIDERS_DIR)
  const configs: ProviderConfig[] = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    const name = file.replace(/\.json$/, '')
    try {
      configs.push(await loadProvider(name))
    } catch {
      // Skip malformed configs rather than failing the whole listing.
    }
  }
  return configs
}
