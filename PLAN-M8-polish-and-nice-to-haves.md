# Phase M8 — Polish + nice-to-have features

After M7 landed (PRs #6 + #7), four nice-to-have items remained on the
roadmap, and a Studio walk-through surfaced four UX bugs. This plan
combines them into one milestone so the same render-flow polish
covers both threads.

## Goals

1. **Make every variant clickable + previewable** without leaving Studio.
2. **Bring the SFX bank online** so transition cues actually play.
3. **Open the door for audio-level variants** (different voice per
   variant) without breaking the existing single-voice flow.
4. **Let the subtitle layer follow the same TextStyle system** the
   headlines already use.
5. **Iron out 4 Studio UX issues** the user just flagged.

Non-goals: drag-to-reorder segments, batch render across projects, a
second AI-driven asset finder. Those stay parked.

---

## Backlog overview (7 tasks, atomic commits)

| ID | Title | Effort | Risk | Depends on |
|---|---|---|---|---|
| M8-1 | Fill SFX bank (12 .mp3) | 1.5 h | Low | — |
| M8-2 | Project list shows variant count + thumbnails | 1.5 h | Low | — |
| M8-3 | Variants panel — fix alignment + open mp4 inline | 1 h | Low | — |
| M8-4 | Custom scrollbar styling | 0.5 h | Low | — |
| M8-5 | Per-variant voice override | 2.5 h | Medium | M7 schema |
| M8-6 | Subtitle styling via TextStyle | 2 h | Medium | M7 TextBlock |
| M8-7 | Docs + orchestrator policy update | 0.5 h | Low | all of the above |

**Total**: ~10 h work, ~7 atomic commits. Can split into two PRs:
**PR A** (M8-1 → M8-4) — UX polish, no schema change.
**PR B** (M8-5 → M8-7) — schema + voice / subtitle features.

---

## M8-1 — Fill SFX bank

### Why

`packages/shared/sfx/` is empty. Every preset with `enterSoundId` or
`perWordSoundId` renders silence today. The text styles already advertise
their cue ids; we just need the 12 mp3 files on disk.

### What to ship

12 mono mp3 clips, mp3 24 kbps, peak-normalised to -1 dBFS, each
< 1 second. Total bank size target < 200 KB. Names listed in
`packages/shared/src/sfx.ts`:

```
whoosh-short.mp3   pop.mp3        pop-bright.mp3   ding.mp3
click.mp3          boing.mp3      cartoon-whoosh.mp3
sparkle.mp3        glitch.mp3     arcade-coin.mp3
typewriter-key.mp3 whoosh-long.mp3
```

### How

A one-shot **download script** under `packages/shared/sfx/fetch.ts`
(tsx-runnable) that:

1. Reads `BUILT_IN_SFX` from `sfx.ts`.
2. For each entry, hits its `sourceUrl` and a small list of curated
   asset URLs (hardcoded inside the script — Mixkit page URLs return
   the mp3 link via meta tags; Pixabay CC0 + Internet Archive direct
   URLs; Freesound CC0 needs a token, fall back to a smaller curated
   alternative for the three Freesound entries).
3. ffmpeg-trims to 1 s max, mono, mp3 24 kbps, with
   `loudnorm=I=-16:TP=-1.0:LRA=11`.
4. Writes to `packages/shared/sfx/<id>.mp3`.

The script uses `node-fetch` (already a transitive dep) and the
existing `ffmpeg-static` binary in `node_modules`. If a download fails
we log it and skip — the renderer treats missing files as silence, so
the bank can land incrementally.

### Verification

- `pnpm tsx packages/shared/sfx/fetch.ts` exits 0.
- `ls packages/shared/sfx/*.mp3 | wc -l` returns 12.
- Re-render the macOS or Bitcoin project — confirm popping / whooshing
  audible in Variant B (Hormozi-style) and silence in Variant A
  (classic / news-ticker).

### Risk

Low. New files in a directory that is loaded lazily; missing files
have always degraded to silence. The fetch script is a one-shot tool,
not part of the runtime path.

---

## M8-2 — Project list shows variant count + thumbnails

### Why

The user opened the project list and could not tell which project had
rendered 1, 2, or 3 mp4 files. With multi-variant render landed, the
list is now lying.

### What to ship

Each `ProjectSummary` carries:

```ts
{
  projectId, title, language, aspect, segmentCount,
  hasOutput: boolean,                                  // legacy
  outputVariantIds: string[],   // ['A','B'] etc. — empty for none
  variantCount: number,         // declared variants on the storyboard
  /** Optional first frame jpeg for the most recent output. */
  thumbnailPath?: string,
  createdAt, updatedAt,
}
```

`apps/studio/app/projects/page.tsx` renders a strip of variant badges
on each card:

```
[A · 6.5 MB] [B · 6.9 MB] [C · 6.7 MB]   3/3 rendered
```

Click a badge → opens the mp4 in a new tab (using `/api/asset?path=...`).

### How

1. **packages/render `summarize()`** scans the project dir for
   `output*.mp4` (`glob` already a transitive dep via Remotion) and
   builds the `outputVariantIds` list. `hasOutput` becomes
   `outputVariantIds.length > 0`.
2. **Thumbnail** is generated lazily in a small endpoint
   `/api/projects/[id]/thumb?variant=A`: ffmpeg `-ss 1 -vframes 1 -vf
   scale=320:-1` from the variant mp4, cached under
   `data/projects/<id>/.thumbs/<variantId>.jpg`. Only rendered when
   the card mounts in the list; falls back to no-thumb if the mp4 is
   missing.
3. **Project card** renders one badge per `outputVariantIds[i]` plus
   a "declared" indicator if some variants are not yet rendered.

### Verification

- `/projects` after the Bitcoin project's `Render all`: card shows
  three badges A/B/C with thumbnails.
- After deleting `output-B.mp4` manually: card shows A and C badges,
  plus "1 variant unrendered".

### Risk

Low. Read-only filesystem changes; thumbnails generate on demand;
schema unchanged.

---

## M8-3 — Variants panel: alignment fix + open mp4 inline

### Why

The variants-panel rows have inconsistent column alignment: when a
variant has an mp4 the row gains a `<Film/>` badge, when it does not
the badge slot vanishes, and the Render button shifts left. Visually
this reads as the buttons being misaligned across rows.

The user also asked "where do I see the rendered variants?" — the
panel acknowledges the mp4 exists (via the badge) but provides no
clickable path to it.

### What to ship

Variants-panel changes:

1. **Fixed-width preview column** with three states for the slot to
   the right of the "Preview / styleSummary" body — `unrendered`
   (muted dot), `rendering` (spinner), `rendered` (clickable thumb +
   "Open" link). The slot is always the same width, so the Render
   button column never drifts.
2. **Open inline**: clicking the thumb (or "Open" link beside it)
   pops the mp4 into a lightweight modal (reusing the existing
   `<Dialog>` primitive) with an `<video controls>` element. Modal
   close on Esc / click outside.
3. **Render button**: pinned to the right; uses the same `min-w` as
   the preview slot so a row without an mp4 still has its Render
   button at the same x as the row with one.

### Risk

Low. Pure layout work in one component plus a thin modal wrapper.

---

## M8-4 — Custom scrollbar styling

### Why

User feedback: "các thanh scroll mặc định của window trong rất thô"
(the OS-default scrollbars look crude). The dark Studio UI clashes
with chunky bright Windows scrollbars.

### What to ship

Global CSS in `apps/studio/app/globals.css`:

```css
@layer base {
  * { scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
  *::-webkit-scrollbar { width: 8px; height: 8px; }
  *::-webkit-scrollbar-track { background: transparent; }
  *::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 8px;
  }
  *::-webkit-scrollbar-thumb:hover { background: var(--muted-foreground); }
}
```

Apply only to Studio, not Remotion scenes (the bundler has its own
CSS pipeline and scenes don't scroll).

### Risk

Low. Pure cosmetic CSS; no JS / accessibility regression risk.

---

## M8-5 — Per-variant voice override

### Why

Today every variant in a project shares one voiceId. Some users want
Variant B to use a male voice while Variant A stays female. This is
the most-asked extension we've heard since M7 landed.

### What to ship

Schema additions in `packages/shared/src/schema.ts`:

```ts
VariantSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  textStyleBySceneKind: z.record(z.string()),
  /**
   * Optional voice override. If set, every segment narration in this
   * variant is re-synthesized with this voiceId before the variant
   * renders, and the resulting mp3 is cached separately so other
   * variants are not affected.
   */
  voiceOverride: z.object({
    voiceId: z.string(),
    speed: z.number().min(0.5).max(2).default(1),
  }).optional(),
})
```

Renderer:

1. `render.ts` `renderProjectMedia({ variants })` — before each variant
   pass, if the variant has `voiceOverride`, synthesize a per-segment
   narration with that voiceId and patch `segment.audio.narration` in
   the in-memory storyboard *only for that pass*. The disk storyboard
   stays the source of truth.
2. The TTS cache key already includes (text, voiceId, speed), so each
   variant gets its own mp3 — no key collision.

Studio:

1. Variants-panel card gets a small voice chip (default = inherited).
2. New row in the panel: dropdown to pick voiceOverride.
3. Project state updates store the override on the variant.

MCP:

1. `renderProject` accepts the override implicitly because it reads
   from the storyboard. No tool change.
2. The orchestrator can write `voiceOverride` after the user picks
   "different voice per variant" in the existing AskUserQuestion
   flow (CLAUDE.md gets a one-line note).

### Verification

- Bitcoin project — set Variant B voiceOverride to
  `vi-VN-NamMinhNeural`. `Render all`. Open output-A.mp4 (HoaiMy) and
  output-B.mp4 (NamMinh) — confirm different voice.
- Variant A unchanged (no override).
- The `synthesizeVoice` call count on a render shows roughly
  `numSegments × variantsWithOverride + numSegments` (the base render).

### Risk

Medium. Render time grows linearly with the number of override
variants — for 3 segments × 2 overrides that is six extra TTS calls,
roughly +20–30 s on a 30 s project. We cap TTS at a sensible bound
(refuse override when `numSegments × overrides > 30`) and warn in
the panel.

---

## M8-6 — Subtitle styling via TextStyle

### Why

The subtitle layer is currently hard-coded: white text on a 78%-opaque
dark plate, font from `fontFor(language)`. With 28 text styles
available, users want subtitles in the same look as the variant.

### What to ship

1. `Project.subtitles` gains an optional `textStyleId`:
   ```ts
   SubtitleConfigSchema = z.object({
     enabled: z.boolean().default(false),
     bottomPct: z.number().min(0).max(1).default(0.18),
     textStyleId: z.string().optional(),
   })
   ```
2. `packages/remotion/src/effects/Subtitles.tsx` uses `<TextBlock>`
   (when `textStyleId` resolves) for the active chunk, falling back to
   today's hard-coded look.
3. Studio inspector / header subtitle toggle gains a small style chip:
   "Subs · classic ▼" — clicking it opens the existing style picker
   with the picked style scoped to subtitles.

### Verification

- Bitcoin project, subtitles enabled, subtitle style set to
  `tiktok-caption`. Render — confirm each spoken chunk pops with the
  TikTok caption style instead of the dark plate.
- Subtitle styleId cleared — confirm legacy look returns.

### Risk

Medium. Subtitle layer overlays the headline TextBlock; bad picks
(e.g. `cinematic` 60px fade) will read poorly on top of an animated
title. Documented in the inspector hint; orchestrator picks a
"caption-friendly" preset (`classic`, `tiktok-caption`,
`wordhighlight-mint`) when seeding from the article.

---

## M8-7 — Docs + orchestrator policy update

After M8-1 through M8-6 land, update:

1. **CLAUDE.md** —
   - After voice picking, ask user whether to set
     `voiceOverride` per variant.
   - When suggesting subtitle styling, restrict to caption-friendly
     presets.
   - SFX bank is now populated — orchestrator can mention which cues
     will play.
2. **README.md** —
   - New section: "How variants work in Studio" with the screenshot
     flow.
   - Update Roadmap "Shipped" list to include M8 items.
3. **PLAN-M8 file** — mark each task as ✓ when completed; keep the
   plan in the repo as a record of the milestone.

### Risk

Low. Documentation only.

---

## Implementation order recommendation

Split into two PRs to keep review surfaces small:

**PR A — UX polish (no schema change)**:
- M8-3 (variants panel alignment + open inline)
- M8-4 (scrollbar)
- M8-2 (project list)
- M8-1 (SFX bank)

**PR B — schema + features**:
- M8-5 (voice override)
- M8-6 (subtitle styling)
- M8-7 (docs)

Both PRs target `main`. PR A merges first, PR B rebases onto it.

---

## Risks pulled together

| Risk | Mitigation |
|---|---|
| SFX download fails (Pixabay rate limit, Mixkit page reshuffle) | Fetch script logs and skips; renderer treats missing files as silence; users can drop replacements by hand into `packages/shared/sfx/` |
| Voice override triples TTS load | Cap `numSegments × overrideVariants ≤ 30`; surface warning; mp3 cache means second render is cheap |
| Subtitle clashes with headline | Restrict picker to caption-friendly family; document; user can always disable subtitles |
| Custom scrollbar regressions on Firefox/Safari | `scrollbar-width`/`scrollbar-color` is the standard fallback alongside `::-webkit-scrollbar`; both ship in this PR |
| Thumbnail generation slow | Lazy — only run when the project card mounts; cached under `data/projects/<id>/.thumbs/` |

---

## Out of scope for M8 (parked)

- Drag-to-reorder segments.
- Per-segment SFX override (today SFX is bound to TextStyle).
- Batch render across multiple projects.
- Project templates / duplicate-from-template.
- Crawler image fallback enrichment.
