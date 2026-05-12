# SFX bank

Short text-transition sound effects bundled with `@news-tok/shared`.
Each file must be:

- `.mp3`, mono, 24 kbps, peak-normalised to -1 dBFS.
- Under 1 second long (typical: 100–700 ms).
- Filename = SFX `id` from `packages/shared/src/sfx.ts` (e.g. `pop.mp3`).

Total bank target: under 200 KB combined. Files are committed to the
repo so renders are deterministic and offline.

Each entry in `sfx.ts` records the upstream source URL and licence
(`mixkit` / `pixabay-cc0` / `archive-pd` / `freesound-cc0`), so anyone
can re-fetch and re-trim a clip with `ffmpeg`:

```bash
ffmpeg -i <download.mp3> -ac 1 -ar 44100 -b:a 24k \
       -af "loudnorm=I=-16:TP=-1.0:LRA=11" \
       -t 1.0 packages/shared/sfx/<id>.mp3
```

The renderer treats a missing file as silence (it logs a warning rather
than failing), so the bank can be filled in incrementally.
