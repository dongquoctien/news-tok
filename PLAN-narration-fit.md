# Plan — fix narration overflow into next segment

## The bug

`packages/remotion/src/compositions/NewsTokComposition.tsx` builds each
segment's `<Sequence>` from `segment.durationSec` only:

```ts
const durationInFrames = Math.max(1, Math.round(segment.durationSec * fps))
```

It never inspects `segment.audio.narration.durationSec`. So a segment
planned at 5 s with a TTS clip that turned out to be 6.5 s gets sliced
at frame 150 / 180. The next segment cuts in while the narrator is
still mid-sentence — the user reported exactly this.

Edge TTS read length is **content-driven** and unknowable at storyboard
time. The orchestrator estimates ~6 s for a body keypoint, but a
sentence with many polysyllabic words ("doanh nghiệp công nghệ y
tế…") routinely runs 7–8 s. The same Edge voice can also vary ±10 %
between renders.

## Why simple "max" fixes the artefact but isn't enough

Three things have to stay aligned, not just two:

| Thing | Where it lives |
|---|---|
| Segment timeline slot | `segment.durationSec` (storyboard) |
| Narration audio | `segment.audio.narration.durationSec` (TTS output) |
| Bg-music fade-out window | composition uses total video duration; per-segment SFX uses `segment.wordBoundaries` |

If we silently render with `max(planned, narration)`, the bg-music
fade-out window also shifts (because the total length grows) but the
storyboard the user sees in Studio still reads "5 s" — the in-browser
preview shows 5 s, the rendered mp4 plays 6.5 s, confusion follows.
The fix has to make the storyboard truthful, not paper over it.

## Goals

1. **Audio never gets cut** — the rendered mp4 plays the full TTS
   clip of every segment.
2. **Storyboard is the source of truth** — `segment.durationSec`
   always equals the slot the renderer uses. No silent multipliers.
3. **The orchestrator and the Studio user share one signal**: if a
   narration overflows the planned slot, the slot grows, both
   surfaces show the new number, and the user can shrink it back
   by editing text or speed.

## Non-goals

- Editing TTS pitch / cadence to fit a fixed slot — out of scope; not
  what Edge TTS exposes anyway.
- Time-stretching the audio mp3 (ffmpeg `atempo`) — degrades quality
  and the orchestrator/user already gets to choose between "shorten
  text" and "lengthen segment".
- Per-segment SFX retiming — perWordSoundId reads `wordBoundaries`
  which are already aligned to the new audio.

---

## Tasks (atomic commits)

### F1 — Add `fitSegmentDurations()` helper

`packages/shared/src/sanitize.ts` (existing module) grows a helper
that walks a project and returns a copy with `segment.durationSec`
adjusted to honour the narration plus a small breathing buffer.

```ts
export type FitOptions = {
  /** Buffer added to narration duration so the audio doesn't bump the cut. */
  trailingPaddingSec?: number        // default 0.4
  /** Don't shrink a segment below its planned duration. */
  preserveMinPlannedSec?: boolean    // default true
}

export function fitSegmentDurations(p: Project, opts?: FitOptions): {
  project: Project
  adjustments: Array<{
    segmentId: string
    plannedSec: number
    narrationSec: number
    finalSec: number
  }>
}
```

Rules:

- If `audio.narration.durationSec` is set, `finalSec = max(planned,
  narrationSec + trailingPaddingSec)`.
- If narration is missing, leave the segment untouched.
- Round to one decimal so the storyboard stays human-readable.
- Return a list of `adjustments` so callers can surface a "5 → 6.9 s"
  diff in their own UI.

No render-pipeline change yet — this commit is pure logic, fully
unit-test friendly (we can ship a tiny vitest spec alongside if you
want, but I'll defer unless asked).

### F2 — Studio: call `fitSegmentDurations` after every save / Re-synth

In `apps/studio/app/projects/[id]/editor.tsx`:

- After Re-synth narration writes a new `audio.narration`, run the
  helper on the in-memory project and `setProject(next.project)`.
  Show a small toast: `"Stretched s3: 5.0s → 6.9s to fit narration."`
- The same call happens implicitly during Save → the API route also
  runs the helper server-side as a defence-in-depth.

In `apps/studio/app/api/projects/[id]/route.ts` PATCH handler:

```ts
const incoming = ProjectSchema.parse(await req.json())
const { project: fitted, adjustments } = fitSegmentDurations(incoming)
await writeStoryboard(params.id, fitted)
return NextResponse.json(fitted)
```

Adjustments aren't surfaced to the API caller — the client already
sees the new durations in the response project.

### F3 — Inspector duration field warns about clipping

Inspector "Duration (s)" `<input type="number">` gains:

- A read-only secondary line showing `narration: 6.9s` when narration
  exists.
- Red border + tooltip when `segment.durationSec < narrationSec +
  0.2`, i.e. the user shrank the slot below what the audio needs.
- An "Auto-fit" button that calls `applySegment({ durationSec:
  Math.max(plannedSec, narrationSec + 0.4) })` — same logic the
  helper applies project-wide.

Cosmetic only — the underlying storyboard is already fitted by F2.

### F4 — Composition guards against negative drift

Even after F1/F2, a project edited outside Studio (raw JSON, Claude
CLI mid-session) could still have `narrationSec > durationSec`. The
renderer should not silently cut the audio.

In `packages/remotion/src/compositions/NewsTokComposition.tsx`:

```ts
const plannedFrames = Math.max(1, Math.round(segment.durationSec * fps))
const narrationFrames = segment.audio?.narration?.durationSec
  ? Math.ceil(segment.audio.narration.durationSec * fps)
  : 0
// 0.2 s safety; bg-music fade-out adjusts to the new total automatically.
const safetyFrames = Math.round(0.2 * fps)
const durationInFrames = Math.max(plannedFrames, narrationFrames + safetyFrames)
```

This is the last-resort net — F2 will normally make it a no-op
because the storyboard is already long enough. When it does kick in,
the `videoDurationSec` reducer above uses `segment.durationSec` so
the bg-music fade window stays slightly short — fine, the fade just
finishes a touch earlier. Subtitle alignment isn't affected because
the audio still plays in real time, and `wordBoundaries` are relative
to the audio.

### F5 — Orchestrator policy in CLAUDE.md

After `synthesizeVoice` returns `durationSec`, the orchestrator
should:

1. **Always** update `segment.durationSec` with
   `Math.max(plannedSec, narrationSec + 0.4)` before writing
   storyboard.json.
2. Then re-fetch bg-music with the (possibly larger) total duration.
3. Mention any segment that got stretched in the final summary so
   the user knows what changed.

This is doc-only; the helper from F1 does the actual math whether or
not the orchestrator remembers.

### F6 — MCP tool `synthesizeVoice` returns a hint

In `packages/mcp-server/src/index.ts` `synthesizeVoice` handler,
when `result.durationSec > 0`, add a `recommendedSegmentDurationSec`
field to the response:

```ts
return ok({
  ...result,
  recommendedSegmentDurationSec: Math.round((result.durationSec + 0.4) * 10) / 10,
})
```

Pure additive — old callers ignore it; the orchestrator picks it up.

---

## Risk

Low across the board.

- F1 is a pure function on the schema; F4 is bounded by the existing
  `max` semantics. Worst case: an mp4 plays a fraction of a second
  longer than the storyboard claims (F4 net), or a project that
  used to silently clip now plays in full but with a different total
  duration (F2). Neither breaks anything downstream.
- F2's server-side normalisation might surprise external API callers
  that PATCH a storyboard with a deliberately short segment. We can
  expose a `?fit=skip` query flag if that ever matters, but no
  caller exists today.
- Bg-music timing already adapts to total duration; no change needed
  there.

## Implementation order

1. **F1** — helper + types. Single file, no consumer change yet.
2. **F4** — composition net. Renders behave correctly even before
   anybody calls F1.
3. **F2** — API route + Studio editor. The visible part of the fix.
4. **F3** — inspector cosmetics. Optional polish.
5. **F6 + F5** — MCP hint + CLAUDE.md update. Helps the orchestrator
   land the right number first time.

Each commits cleanly on its own; F2 depends on F1.

## Verification

- New project with a planned 5 s outro and a Vietnamese line that
  reads in 6.7 s.
- Before fix: rendered mp4 cuts at 5 s, last word lost. Studio shows
  5 s.
- After fix:
  - F2 runs at save time → storyboard shows 7.1 s automatically
    (6.7 + 0.4 buffer).
  - Rendered mp4 plays the full audio + a beat of silence, then cuts
    cleanly.
  - Bg-music fade-out shifts to match.
  - F3 shows the new number; the "Auto-fit" button is a no-op.
