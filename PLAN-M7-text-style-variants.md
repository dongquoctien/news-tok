# Phase M7 — Text-style library + multi-variant render

## Goals

1. **One project → 3 video variants** (`output-A.mp4` / `-B.mp4` / `-C.mp4`).
   Same storyboard text + audio + images; only the **text style** differs.
2. **Text-style library**: 10–15 built-in presets covering font / color / size /
   weight / position / motion. Stored as JSON, so the renderer can read them
   without recompiling the bundle.
3. **User-authored presets**: drop additional JSON into
   `data/user-styles/*.json`. Auto-picked up by Studio's style picker and by
   the AI orchestrator.
4. **Apply mechanics**: per-segment style assignment, plus an **Apply to all**
   button and an **Apply to scene kind** option (e.g. all `keypoint` segments).

Out of scope for M7: scene-level layout / icon changes / animated stickers /
audio variants / re-translation per variant.

---

## User-facing flow

```
Create project           (unchanged)
  → fetch article, plan segments, fetch assets, synthesize voices
  → AI proposes a Variant Set (3 textStyle picks per scene kind)
  → user can:
       - accept proposed set, OR
       - swap any of the three with another preset, OR
       - hand-author a 4th by saving a new JSON to data/user-styles/
  → renderProject(projectId, { variants: 3 })
       → 3 mp4 files, each ~30s longer than today's single render
```

Studio additions:
- **Style picker dialog** per segment: thumbnail preview of every preset, click to apply.
- **Apply to all** / **Apply to all `<scene>` segments** buttons inside the picker.
- **Variants tab** in the project page (sibling to the existing player pane):
  three thumbnails / mini-players, each pinned to a variant; "Render variant"
  / "Render all" buttons.

---

## Data model deltas (`packages/shared/src/schema.ts`)

### `TextStyle` (new)

```ts
TextStyleSchema = z.object({
  id: z.string(),                    // 'classic', 'bold-yellow', 'modern-typewriter', ...
  name: z.string(),                  // human label
  // Typography
  fontFamily: z.string(),            // any @remotion/google-fonts member or 'system'
  fontSize: z.number().int().positive(), // logical px @1080 width; scaled by useResponsive
  fontWeight: z.number().int().default(700),
  letterSpacing: z.number().default(0),
  lineHeight: z.number().default(1.15),
  color: z.string(),                 // hex / rgb / oklch
  // Background plate / stroke
  background: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('none') }),
    z.object({ kind: z.literal('solid'), color: z.string(), paddingPct: z.number().default(2) }),
    z.object({ kind: z.literal('gradient'), from: z.string(), to: z.string(), angleDeg: z.number().default(180) }),
  ]).default({ kind: 'none' }),
  textStroke: z.object({ widthPx: z.number(), color: z.string() }).optional(),
  textShadow: z.object({ blur: z.number(), color: z.string(), offsetY: z.number().default(0) }).optional(),
  // Position (anchored on a 9:16 canvas; renderer maps to 16:9 / 1:1)
  align: z.enum(['left', 'center', 'right']).default('center'),
  anchor: z.enum(['top', 'middle', 'bottom']).default('bottom'),
  marginPct: z.number().min(0).max(40).default(8),
  // Motion (read by the existing effects pipeline)
  enter: z.enum(['fade', 'slideUp', 'slideDown', 'typewriter', 'wordPop', 'none']).default('fade'),
  exit: z.enum(['fade', 'slideDown', 'none']).default('fade'),
  enterDurationSec: z.number().default(0.4),
  exitDurationSec: z.number().default(0.4),
  // Provenance
  source: z.enum(['builtin', 'user']),
  scope: z.array(SceneKindSchema).default([]),  // empty = applies to any scene
})
```

### `SegmentSchema` add

```ts
textStyleId: z.string().optional()   // resolved against the style registry
```

### `ProjectSchema` add

```ts
variants: z.array(z.object({
  id: z.string(),                   // 'A' | 'B' | 'C' | <free-form>
  label: z.string(),                // 'Classic', 'Bold news', 'Cinematic'
  // Default style per scene kind; segment.textStyleId still wins if set.
  textStyleBySceneKind: z.record(z.string()),  // { title: 'bold-yellow', keypoint: 'classic', ... }
})).default([])
```

Migration: existing storyboards (no `variants`) render as a single `output.mp4`
using `textStyle = 'classic'`. Zero schema-break.

---

## New / changed files

### packages/shared (single source of truth for the registry)

- `src/text-styles.ts` — `BUILT_IN_TEXT_STYLES: TextStyle[]` (10–15 entries).
- Export `findTextStyle(id, project)` that merges built-in + user styles from
  the storyboard's preloaded list.

### packages/remotion

- `src/scenes/text/TextBlock.tsx` — generic component every scene now uses
  for headline / body text. Honors `TextStyle` (color, fontFamily, alignment,
  enter/exit motion, decorators). Dispatches to one of nine motion primitives
  by reading `textStyle.enter`.
- `src/scenes/{TitleCard,KeyPoint,Quote,Outro}.tsx` — refactor to render the
  text via `<TextBlock textStyle={...} text={segment.text} />`. Background
  / icon / layout untouched.
- `src/effects/text/` — new directory of self-contained motion primitives.
  No new npm dependency; each primitive is ~30 lines, built on
  `useCurrentFrame` + `interpolate` + `spring` (everything already used in
  `effects/timing.ts`).

  | Primitive | Concept | Source pattern |
  |---|---|---|
  | `FadeInText.tsx` | opacity 0→1 over `enterDurationSec` | `interpolate` |
  | `SlideUpText.tsx` | translateY(60→0) + fade | `spring` (damping ~14) |
  | `SlideDownText.tsx` | translateY(-60→0) + fade | `spring` |
  | `ScaleInText.tsx` | scale 1.5→1 + fade | `spring` |
  | `TypewriterText.tsx` | reuse existing `effects/Typewriter.tsx` | already in repo |
  | `WordPopText.tsx` | per-word stagger, scale 0.5→1.05→1 (TikTok-caption look) | split on whitespace, per-word delay |
  | `WordHighlight.tsx` | active word gets a chip background, synced to `segment.wordBoundaries` | pick word where `t ∈ [start,end]` |
  | `GradientWipeText.tsx` | gradient mask wipes left→right over the headline | `background-clip:text` + animated `background-position` |
  | `SlotMachineText.tsx` | each word cycles random strings ~0.8s, settles on the real word | random pool of 6 candidates, fade-out on settle |

  Plus two decorator helpers (applied **on top of** any primitive):

  - `TextStrokeWrapper.tsx` — adds `WebkitTextStroke` per `TextStyle.textStroke`.
  - `TextPlate.tsx` — renders the `background.kind` plate (solid / gradient)
    behind the text with the configured padding.

  Source pattern is consistent across primitives — see PLAN-M7 §research
  for the reference `WordPopText` skeleton. Each one stays under ~30 lines
  so we own them outright and can fork without risk.

**Why custom primitives instead of `remotion-animated` / `remotion-bits`**:
those libraries are copy-paste templates rather than maintained packages;
the existing scenes already use `inline style + ui-tokens` (not Tailwind),
so the templates would not drop in cleanly; bundle size and lock-in stay
flat by writing our own.

### packages/render

- `src/text-styles.ts` — load user JSON from `data/user-styles/*.json`,
  validate against `TextStyleSchema`, expose `listAllTextStyles(project)`.
- `src/render.ts` — `renderProjectMedia(projectId, opts)` gains
  `{ variants: VariantId[] | 'all' }`. When set, the function:
  1. resolves each variant's text styles,
  2. emits one bundle pass (reused), renders N times,
  3. writes `data/projects/<id>/output-<variantId>.mp4`.
- `src/bundle.ts` — cache key now also hashes the **resolved style set**
  (variants × scene kinds) so a Studio style swap busts the cache only
  for the specific variant.

### packages/mcp-server

- `renderProject` MCP tool: accept `variants?: string[]` argument. Default
  to the project's `variants` list; fall back to single render if empty.
- New tool `listTextStyles({ projectId? })` so Claude can pick styles.
- New tool `setSegmentStyle({ projectId, segmentId, styleId })` so Claude
  can apply styles via `Edit` shortcut.

### apps/studio

- `components/studio/style-picker.tsx` — dialog modeled after
  `image-picker`. Grid of style cards (each shows a small canvas mock:
  the segment text rendered with that style). Buttons: "Apply to this
  segment", "Apply to all", "Apply to all keypoint / title / outro".
- `components/studio/variants-panel.tsx` — sibling panel under the
  Player; three rows, each with: variant label, per-scene-kind style
  summary, Render button, mini progress bar, preview link.
- `app/api/projects/[id]/render/route.ts` — accept `?variant=A|B|C|all`.
- `app/api/text-styles/route.ts` — return merged built-in + user styles.
- `app/projects/[id]/editor.tsx` — replace the single "Render full"
  button with a dropdown: Render variant A / B / C / All.
- `lib/user-styles.ts` — wraps the API for user-defined JSON drops.

### data / docs

- `data/user-styles/.gitkeep` + `data/user-styles/README.md` explaining
  the JSON shape and how to drop a file in.
- `CLAUDE.md` — new "Choosing text styles per variant" section: after
  selecting voice + music, propose 3 variants (Classic / Bold / Cinematic
  by default, tuned to the article tone), confirm via `AskUserQuestion`.
- `README.md` — mirror the convention and document `data/user-styles/`.

---

## Implementation order (5 atomic commits)

1. **schema + registry** — `TextStyleSchema`, `ProjectSchema.variants`,
   `segment.textStyleId`, `BUILT_IN_TEXT_STYLES` with ~12 presets. Backwards
   compatible. *No render change yet.*

2. **scene refactor** — introduce `<TextBlock>`, port the four built-in
   scenes to consume it. Existing single-style renders still produce
   visually-equivalent output (default style = `classic`).

3. **multi-variant render** — `renderProjectMedia({ variants })`,
   per-variant cache keys, MCP tool argument. Smoke-render the macOS
   project: three mp4s with different titles only.

4. **Studio style + variants UI** — style picker dialog, variants panel,
   render dropdown, user-styles loader API route.

5. **AI orchestrator policy** — CLAUDE.md and prompts update; orchestrator
   proposes a variant set when creating a new project; README mirrors.

Each commit is independently revertible: 1–2 are no-op visually, 3 enables
the new behavior, 4 surfaces it, 5 makes it the default.

---

## Built-in text style preset shortlist (research-driven)

Research sources used to scope the families:
- [25 CSS Glow Text Effects](https://freefrontend.com/css-glow-text-effects/),
  [25+ open-source glow examples](https://devsnap.me/css-glow-text-effects),
  [CSS-Tricks: neon text](https://css-tricks.com/how-to-create-neon-text-with-css/)
  — neon, chrome, retro-arcade.
- [Cyberpunk glitch CSS tutorial](https://ahmodmusa.com/create-cyberpunk-glitch-effect-css-tutorial/)
  — scanlines, clip-path slicing, RGB-split.
- Remotion ecosystem references: [typography template](https://remotiontemplates.dev/typography),
  [Remotion Bits — animated text](https://remotion-bits.dev/docs/reference/animated-text/),
  [remotion-animate-text](https://github.com/pskd73/remotion-animate-text),
  [Motion.dev splitText](https://motion.dev/docs/split-text).

Each preset is plain JSON. The "look" column shows what makes the family
distinctive so the AI orchestrator can match the article tone.

### Family A — News & explainer (clean, legible, default-safe)

| id | name | font | color | bg / decorator | motion | scene |
|---|---|---|---|---|---|---|
| `classic` | Classic news | Be Vietnam Pro / Inter | #f4f4f6 | none | fade | any (default) |
| `bold-news` | Bold news | Inter Black | #ffffff + stroke 4px #000 | none | slideUp | title |
| `breaking-red` | Breaking | Inter Black | #fff | solid red 90% plate | slideDown | title |
| `news-ticker` | News ticker | Inter Bold | #fff | solid charcoal plate | slideUp | keypoint |

### Family B — TikTok / social (punchy, per-word)

| id | name | font | color | bg / decorator | motion | scene |
|---|---|---|---|---|---|---|
| `tiktok-caption` | TikTok caption | Inter Black | #fff stroke 6px #000 | none | wordPop | keypoint |
| `bold-yellow` | Bold yellow | Inter Black | #fde047 stroke #000 | none | wordPop | keypoint |
| `wordhighlight-mint` | Word highlight (mint) | Inter Bold | #fff with #34d399 chip on active word | none | wordHighlight | keypoint |
| `gradient-pop` | Gradient pop | Inter Black | gradient text fill (#a5b4fc → #f472b6) | none | wordPop | title |

### Family C — Cinematic / elegant (soft, slow, premium)

| id | name | font | color | bg / decorator | motion | scene |
|---|---|---|---|---|---|---|
| `cinematic` | Cinematic | Inter Light | #fff | gradient bottom plate | fade | outro |
| `quote-soft` | Quote soft | Playfair Display | #e5e5e5 | none | fade | quote |
| `outro-glow` | Outro glow | Inter Bold | #a5b4fc + textShadow blur 24 | none | fade | outro |
| `gradient-wipe` | Gradient wipe | Inter Black | gradient text wiped left→right | none | gradientWipe | title, outro |

### Family D — Retro / arcade / cyberpunk (high-contrast, glow, slot)

| id | name | font | color | bg / decorator | motion | scene |
|---|---|---|---|---|---|---|
| `neon-pink` | Neon pink | Inter Black | #f472b6 + textShadow 4 layers | none | scaleIn | title |
| `neon-cyan` | Neon cyan | JetBrains Mono | #67e8f9 + textShadow 4 layers | none | scaleIn | title |
| `arcade-chrome` | Arcade chrome | Inter Black | gradient #f3f4f6 → #94a3b8 + stroke #1e293b | none | slotMachine | title |
| `cyberpunk-glitch` | Cyberpunk glitch | Inter Black | #fff with RGB-split text-shadow (#f0f, #0ff offset) | none | wordPop | title |

### Family E — Playful / fun (bouncy, oversized, ngộ nghĩnh)

| id | name | font | color | bg / decorator | motion | scene |
|---|---|---|---|---|---|---|
| `playful-bubble` | Playful bubble | Inter Black | #fef3c7 + stroke #f97316 | none | scaleIn (overshoot 1.25) | any |
| `slot-reveal` | Slot reveal | Inter Black | #fff | gradient pink-yellow plate | slotMachine | keypoint, title |
| `typewriter-mono` | Typewriter | JetBrains Mono | #fff | none | typewriter | quote |
| `minimal-mono` | Minimal mono | JetBrains Mono | #cfd6df | none | fade | any |

Total: **20 presets across 5 families**. Each family has at least 3
entries so the orchestrator can swap one preset for another within the
same tone (e.g. retain "playful" feel while changing the headline font).

### Default `variants`

The orchestrator proposes three sets matched to the article tone, and
the user can override per segment via Studio. The default suggestions:

- **A — Classic** (neutral): `{ title: 'classic', keypoint: 'classic', outro: 'cinematic' }`
- **B — Bold news** (high-impact): `{ title: 'bold-news', keypoint: 'bold-yellow', outro: 'outro-glow' }`
- **C — Cinematic** (premium): `{ title: 'gradient-pop', keypoint: 'tiktok-caption', outro: 'cinematic' }`

For a playful article (Family E feel) the orchestrator may swap C for
`{ title: 'playful-bubble', keypoint: 'slot-reveal', outro: 'outro-glow' }`.
For a tech/cyber article, swap to Family D presets.

---

## Text-transition sound effects (SFX)

Punchy social-style videos rely heavily on per-word / per-segment audio
cues (whoosh, pop, ding, boing). Add a small SFX layer that fires in
sync with the text motion.

### Schema additions

```ts
TextStyle.sfx = z.object({
  enterSoundId: z.string().optional(),   // 'whoosh-short' / 'pop' / 'ding' / 'boing' / 'click' / 'glitch' / 'sparkle' / 'arcade-coin'
  enterVolume: z.number().min(0).max(1).default(0.6),
  // Per-word triggers (only meaningful for wordPop / wordHighlight motion).
  perWordSoundId: z.string().optional(),
  perWordVolume: z.number().min(0).max(1).default(0.4),
}).optional()
```

`Project.sfxVolume: z.number().min(0).max(1).default(0.7)` — master scaler
applied on top, so the user can mute or dim all SFX at once.

### Sound bank (curated, all commercial-friendly)

We bundle ~12 short clips (each < 1 s) under `packages/shared/sfx/`,
each picked from one of three sources we already trust:

| id | concept | source | license |
|---|---|---|---|
| `whoosh-short` | quick swoosh, 0.4 s | [Mixkit free SFX](https://mixkit.co/free-sound-effects/whoosh/) | Mixkit (commercial OK, no attribution) |
| `whoosh-long` | slower whoosh, 0.9 s | Mixkit | Mixkit |
| `pop` | bubble pop, 0.2 s | [Pixabay CC0](https://pixabay.com/sound-effects/search/cc0/) | CC0 |
| `pop-bright` | bright synthy pop | Pixabay CC0 | CC0 |
| `ding` | UI ding, 0.3 s | Pixabay CC0 | CC0 |
| `click` | crisp click, 0.1 s | Pixabay CC0 | CC0 |
| `boing` | cartoon boing | [Internet Archive Hanna-Barbera SFX](https://archive.org/details/HannaBarberaCartoonSoundFX) | public domain |
| `cartoon-whoosh` | cartoon swoop | [Internet Archive cartoon-whoosh-sounds](https://archive.org/details/cartoonwhooshsounds) | public domain |
| `sparkle` | tiny sparkle for "outro-glow" | Mixkit | Mixkit |
| `glitch` | digital tear for "cyberpunk-glitch" | [Freesound CC0](https://freesound.org/browse/tags/cc0/) | CC0 |
| `arcade-coin` | retro coin pickup for "arcade-chrome" | Freesound CC0 | CC0 |
| `typewriter-key` | mechanical click per char (for typewriter motion) | Freesound CC0 | CC0 |

All files are pre-trimmed to < 1 s, dithered to -1 dBFS, mono mp3
24 kbps. Total bank size target: **< 200 KB**. The bank lives in the
repo (gitignored cache is overkill for assets this small), so renders
are deterministic and offline.

Each file lives at `packages/shared/sfx/<id>.mp3`. A registry
`packages/shared/src/sfx.ts` exports `{ id, durationSec, defaultGain }`
for each entry; the Remotion composition reads it via a synchronous
import (no async lookup at render time).

### Preset → SFX pairing

We pre-assign sensible defaults so a user picking a preset gets an
appropriate sound out of the box — they can always override or null.

| preset | enterSoundId | perWordSoundId | reason |
|---|---|---|---|
| classic / news-ticker / minimal-mono | `null` | `null` | quiet news look |
| bold-news | `whoosh-short` | `null` | matches the slideUp punch |
| breaking-red | `ding` | `null` | grabs attention without overdoing it |
| tiktok-caption / bold-yellow | `pop` | `pop` (lower volume) | classic short-form cadence |
| wordhighlight-mint | `null` | `click` | each highlighted word ticks |
| gradient-pop | `whoosh-short` | `null` | |
| cinematic / quote-soft | `null` | `null` | leave bg music breathing |
| outro-glow | `sparkle` | `null` | |
| gradient-wipe | `whoosh-long` | `null` | matches the slow wipe |
| neon-pink / neon-cyan | `whoosh-short` | `null` | |
| arcade-chrome | `arcade-coin` | `null` | retro pairing |
| cyberpunk-glitch | `glitch` | `null` | |
| slot-reveal | `arcade-coin` | `null` | |
| playful-bubble | `boing` | `pop` | over-the-top by design |
| typewriter-mono | `null` | `typewriter-key` | per-char tick handled in `TypewriterText.tsx` |

### Composition wiring

In `NewsTokComposition.tsx` we already have one `<Audio>` for `bgMusic`.
Add per-segment SFX layers:

```tsx
// Inside the per-segment <Sequence>
{textStyle.sfx?.enterSoundId ? (
  <Audio
    src={sfxUrl(textStyle.sfx.enterSoundId)}
    volume={(textStyle.sfx.enterVolume ?? 0.6) * (project.sfxVolume ?? 0.7)}
    startFrom={0}
  />
) : null}
{textStyle.sfx?.perWordSoundId && segment.wordBoundaries ? (
  segment.wordBoundaries.map((w, i) => (
    <Sequence key={i} from={Math.round(w.offsetSec * fps)} durationInFrames={Math.round(w.durationSec * fps)}>
      <Audio
        src={sfxUrl(textStyle.sfx!.perWordSoundId!)}
        volume={(textStyle.sfx!.perWordVolume ?? 0.4) * (project.sfxVolume ?? 0.7)}
      />
    </Sequence>
  ))
) : null}
```

The SFX is duck-friendly: master `sfxVolume` lets the user balance
against `bgMusicVolume`. Render pipeline reuses the same `/public/sfx/`
URL convention as music (already covered by the path rewrite in
`render.ts`).

### Studio control

Inspector gains an **SFX** row beside Voice / Speed:

- Dropdown: `Enter sound` (none / list of registry ids).
- Dropdown: `Per-word sound` (none / list).
- Slider: `Volume` (per-segment override of `textStyle.sfx.enterVolume`).
- Project header gains a master **SFX** volume slider next to the
  existing Music control.

Preview button in the style picker now plays the assigned SFX once,
overlaid on the silent style mock, so the user can audition before
applying.

### MCP & orchestrator policy

CLAUDE.md gains: "After picking text styles per variant, if the variant
falls in Family B (TikTok) or Family E (Playful), do NOT mute the SFX.
For Family A / C (clean / cinematic) keep `enterSoundId` null unless
the user explicitly asks for stings."

New MCP tool: `listSoundEffects()` returns the registry so Claude can
reference ids when proposing a variant.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Render time triples | Reuse one bundle for all variants; render in parallel where Chromium concurrency allows; show per-variant progress so the user is not staring at a single bar. |
| `data/user-styles` JSON malformed | Validate via `TextStyleSchema.safeParse`; surface failures both in MCP and Studio API with the file name. |
| Existing projects break | `variants` defaults to `[]`; absence keeps the single-render code path. Segments without `textStyleId` resolve to `classic`. |
| Bundle cache thrashing | Hash key already includes asset list (PR #4) and now includes resolved style set; only the changed variant rebundles. |
| Studio dirty-save indicator misses style edits | The signature in `editor.tsx` already JSON-stringifies the project; style changes flow through `updateSegment`/`updateProject`, so dirty detection works for free. |

---

## What this plan does NOT include (deferred)

- Layout variants (icon placement, motion graphics behind text).
- Audio-style variants (different voice per output).
- Headline rewrites per variant.
- Frame-by-frame motion editor (would deserve its own milestone).
- Server-side concurrency tuning beyond Remotion's default.
