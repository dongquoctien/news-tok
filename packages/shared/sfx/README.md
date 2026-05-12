# SFX bank

Short text-transition sound effects bundled with `@news-tok/shared`.
Each file must be:

- `.mp3`, mono, 24 kbps, peak-normalised to -1 dBFS.
- Under 1 second long (typical: 100–700 ms).
- Filename = SFX `id` from `packages/shared/src/sfx.ts` (e.g. `pop.mp3`).

Total bank target: under 200 KB combined. Files are committed to the
repo so renders are deterministic and offline.

## Filling the bank

Run the bundled fetch script from the repo root:

```bash
pnpm tsx packages/shared/sfx/fetch.ts
```

It reads `manifest.json` next to this file, downloads each entry's
URL, then `ffmpeg`-trims to the listed duration, mono, mp3 24 kbps,
with `loudnorm=I=-16:TP=-1.0:LRA=11`. Files that 404 are skipped —
the renderer treats missing entries as silence, so the bank can be
filled incrementally.

## Replacing or adding a clip

1. Edit `manifest.json` and point the entry to your URL, **or**
2. Drop a hand-trimmed `.mp3` into this directory using the exact id
   from `sfx.ts` as the filename (e.g. `boing.mp3`).

The renderer only cares that the filename matches the SFX id; it does
not re-read the manifest at runtime.

## Source URLs

Each entry in `sfx.ts` records the upstream source URL and licence
(`mixkit` / `pixabay-cc0` / `archive-pd` / `freesound-cc0`).
`manifest.json` contains best-effort direct-download links for each
clip. Mixkit asset URLs are stable; Internet Archive direct URLs are
stable; Pixabay and Freesound require accounts so we suggest you
download those manually and drop them in.
