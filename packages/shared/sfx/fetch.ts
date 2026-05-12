/**
 * One-shot script that populates packages/shared/sfx/<id>.mp3 from the
 * `manifest.json` next to this file. Run with:
 *
 *   pnpm tsx packages/shared/sfx/fetch.ts
 *
 * Each entry downloads its `url`, then ffmpeg-trims to `trimToSec`
 * seconds, mono, mp3 24 kbps, peak-normalised to -1 dBFS. Failed
 * downloads are logged and skipped — the renderer treats missing
 * files as silence, so the bank can be filled incrementally.
 *
 * You can re-point any entry to your own URL by editing manifest.json
 * before re-running.
 */
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolve ffmpeg-static from the repo root (it's a dependency of
// @news-tok/media, not @news-tok/shared, but the binary lives in the
// hoisted node_modules so we can grab it through createRequire).
const req = createRequire(import.meta.url)
const ffmpegPath = req('ffmpeg-static') as string | null

type ManifestEntry = {
  id: string
  url: string
  trimToSec: number
}

type Manifest = {
  downloads: ManifestEntry[]
}

const HERE = dirname(fileURLToPath(import.meta.url))
const MANIFEST_PATH = resolve(HERE, 'manifest.json')

function bin(): string {
  if (!ffmpegPath) {
    throw new Error('ffmpeg-static did not provide a binary for this platform')
  }
  return ffmpegPath
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolveRun, rejectRun) => {
    const proc = spawn(bin(), args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    proc.on('error', rejectRun)
    proc.on('close', (code) => {
      if (code === 0) resolveRun()
      else {
        const tail = stderr.split(/\r?\n/).slice(-8).join('\n')
        rejectRun(new Error(`ffmpeg exited ${code}\n${tail}`))
      }
    })
  })
}

async function downloadAndTrim(entry: ManifestEntry, outDir: string): Promise<void> {
  const tmpPath = resolve(outDir, `.${entry.id}.tmp`)
  const finalPath = resolve(outDir, `${entry.id}.mp3`)

  // Step 1 — download.
  const res = await fetch(entry.url, {
    headers: {
      'User-Agent':
        'news-tok-sfx-fetcher/0.1 (+https://github.com/itdongquoctien/news-tok)',
      Accept: '*/*',
    },
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 1024) {
    throw new Error(`downloaded body is suspiciously small (${buf.length} B)`)
  }
  await writeFile(tmpPath, buf)

  // Step 2 — ffmpeg trim + normalise.
  await runFfmpeg([
    '-y',
    '-i',
    tmpPath,
    '-ac',
    '1',
    '-ar',
    '44100',
    '-b:a',
    '24k',
    '-af',
    'loudnorm=I=-16:TP=-1.0:LRA=11',
    '-t',
    String(entry.trimToSec),
    finalPath,
  ])

  await rm(tmpPath, { force: true })
}

async function main(): Promise<void> {
  const raw = await readFile(MANIFEST_PATH, 'utf8')
  const manifest = JSON.parse(raw) as Manifest
  await mkdir(HERE, { recursive: true })

  let ok = 0
  let skipped = 0
  for (const entry of manifest.downloads) {
    process.stdout.write(`  ${entry.id.padEnd(20)} `)
    try {
      await downloadAndTrim(entry, HERE)
      process.stdout.write('ok\n')
      ok++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      process.stdout.write(`SKIP — ${msg.split('\n')[0]}\n`)
      skipped++
    }
  }

  console.log(`\nDone. ${ok} ok, ${skipped} skipped.`)
  if (skipped > 0) {
    console.log(
      'Skipped entries are left as silence. To fill them, edit manifest.json with a working URL\n' +
        'or drop a hand-trimmed .mp3 directly into packages/shared/sfx/.'
    )
  }
}

main().catch((err) => {
  console.error('fetch.ts failed:', err)
  process.exitCode = 1
})
