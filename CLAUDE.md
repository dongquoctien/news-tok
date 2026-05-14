# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`news-tok` turns articles, raw text, or URLs into short videos
(TikTok/Reels/Shorts style), running 100% on the user's local machine. Two
clearly separated halves share one source of truth (`storyboard.json`):

- **Claude CLI (you)** — the AI orchestrator: extract article → plan
  segments → fetch images/music/TTS → render via MCP tools.
- **Web Studio** (`apps/studio`, Next.js) — visual editor the user opens
  separately. You do not interact with Studio; you only mutate the
  storyboard.

This file is loaded by the Claude Code CLI whenever a user runs `claude` inside
this repo. Treat it as the authoritative description of how to work here.

## Commands

Package manager is **pnpm** (workspace monorepo, Node ≥ 20).

```bash
pnpm install                  # one-time
pnpm build                    # build every workspace package (recursive)
pnpm typecheck                # tsc --noEmit across every package
pnpm lint                     # lint every workspace package (currently only Studio defines it)
pnpm studio                   # run the Web Studio dev server (http://localhost:3000)
pnpm mcp:build                # rebuild the MCP server (required after editing packages/mcp-server)
pnpm doctor                   # verify ffmpeg, env vars, MCP wiring (scripts/doctor.mjs)
```

Smoke tests live under `scripts/` and run with `tsx`. Use them for fast
end-to-end checks instead of writing ad-hoc test code:

```bash
pnpm smoke:render             # programmatic Remotion render of a tiny project
pnpm smoke:media              # offline media-adapter checks (cache, ffmpeg, TTS)
pnpm smoke:media:network      # same, but hits real Pexels / Unsplash / Internet Archive
pnpm smoke:mcp                # spawns the MCP server and lists tools
pnpm smoke:m6                 # Studio M6 smoke: storyboard round-trip + render API
```

There is **no Jest/Vitest suite**. To run a single check, invoke the
appropriate smoke script directly with `tsx scripts/<name>.ts`, or run the
package-scoped typecheck with `pnpm --filter @news-tok/<package> typecheck`.

After editing `packages/mcp-server/`, you must `pnpm mcp:build` before the
Claude CLI picks up the change — the MCP server is consumed as a built
artifact via `.mcp.json`, not from source.

## Your role

You are the **AI orchestrator**. Most user requests will ask you to:

1. Create a new video project from a URL, text, or file
2. Edit an existing project (change text, swap an image, fork a custom scene)
3. Re-render after edits

You do this by calling MCP tools provided by this repo and by using your
built-in tools (Read, Edit, Write, Glob, Grep, Bash) to read and modify project
files directly.

A separate Web Studio (Next.js, at `apps/studio`) exists for the user to
visually preview and tweak projects. **You do not interact with the Studio.**
You and the Studio share state through `data/projects/<id>/storyboard.json`.

## Project layout

```
news-tok/
  CLAUDE.md                              (this file)
  .mcp.json                              (registers the local MCP server)
  prompts/                               (example prompts users can copy)
  apps/studio/                           (Next.js Web Studio — do not modify unless asked)
  packages/
    shared/src/                          (zod schemas, UI tokens, sanitize, social, sfx, text-styles)
      schema.ts                          ← ProjectSchema lives here
      ui-tokens.ts                       ← COLOR / SPACE / RADIUS / ICON / FONT
    media/src/                           (Pexels, Unsplash, Pixabay, Openverse, Internet Archive,
                                          Edge TTS, Readability, ffmpeg, Playwright crawler fallbacks)
    remotion/src/
      compositions/NewsTokComposition.tsx  ← root composition
      scenes/                            ← built-in scenes (TitleCard, KeyPoint, Quote, Outro, MissingScene)
      effects/                           ← KenBurns, Typewriter, Fade, Subtitles
    render/src/                          (programmatic Remotion render: bundle, jobs, storyboard)
    mcp-server/src/                      (the MCP server that exposes media + render tools)
      index.ts                           ← tool wiring (build emits dist/index.js)
      projects.ts                        ← create / update / delete project helpers
      research.ts                        ← researchProjectAesthetic
  scripts/                               (doctor + smoke harnesses run via tsx)
  data/                                  (gitignored — shared state)
    projects/<id>/
      storyboard.json                    (source of truth for one project)
      scenes/                            (forked custom scene TSX, per project)
      segments/<segmentId>.mp4           (per-segment render output)
      output.mp4                         (final concatenated video)
    cache/                               (hash-based asset cache for images / music / tts)
```

### Architecture — the big picture

Dependency direction (no cycles):

- `shared` is leaf — used by everything; the **only** source of truth for
  schemas, design tokens, and sanitisation rules.
- `media` is used by `mcp-server`, `render`, and **Studio directly**.
  Studio bypasses MCP for media calls because both live in one Node process.
- `remotion` is used by `render` and by Studio's in-browser `<Player>`.
- `render` is used by `mcp-server` and Studio API routes.
- `mcp-server` is a standalone stdio process spawned by the Claude CLI
  (registered in `.mcp.json`). It is the **only** way you (Claude) call
  into Node code in this repo.

There are **two CSS pipelines**, and mixing them silently breaks rendering:

| Where | What | Why |
|---|---|---|
| `apps/studio/**` | Tailwind v4 + shadcn/ui | Studio's PostCSS pipeline runs Tailwind |
| `packages/remotion/src/scenes/**`, `data/projects/<id>/scenes/**` | Inline `style={{...}}` sourced from `@news-tok/shared/ui-tokens` | The Remotion bundler has its own webpack and does NOT run Tailwind PostCSS — classes would silently render as text or be dropped |

Single source of design values for both pipelines:
`packages/shared/src/ui-tokens.ts`.

## Source of truth

`data/projects/<id>/storyboard.json` is the source of truth for everything about
a project. Its schema lives at `packages/shared/src/schema.ts` (`ProjectSchema`).
Validate against that schema before saving.

When in doubt about field shapes, Read the schema file.

## MCP tools available

All MCP tools are exposed under the `mcp__news-tok__*` namespace:

- `createProject({ source, language, aspect })` — creates `data/projects/<id>/`
  with an empty storyboard. Returns `{ projectId, path }`.
- `listProjects()` — returns existing projects.
- `getStoryboard({ projectId })` — returns the parsed storyboard for one
  project. Use this before `updateStoryboard` so you mutate a copy of the
  current shape, not a stale draft.
- `updateStoryboard({ projectId, project })` — write a fully-formed
  project JSON to disk. The tool validates against `ProjectSchema`,
  strips emoji from `title` + every `segment.text`, and stretches each
  `segment.durationSec` to fit narration + 0.4s buffer. Prefer this
  over raw `Write` / `Edit` on `storyboard.json` so the file never
  lands in an invalid state. Returns the persisted project plus the
  list of duration adjustments the helper applied.
- `deleteProject({ projectId, confirm: true })` — irreversibly removes
  `data/projects/<id>/` (storyboard, scenes, segment mp4s, rendered
  output). The `confirm: true` literal is required so a stray call
  cannot wipe out a real project. Use only for test or abandoned
  projects.
- `generateSocialCaption({ projectId, topic? })` — draft three
  ready-to-paste captions (TikTok / Facebook / Instagram) plus a
  topic-aware hashtag block from the project storyboard. Topic is
  auto-classified by the same keyword rule as
  `researchProjectAesthetic`; pass `topic` to pin it. Pure local
  function, no LLM call. Use right after a successful render when the
  user is about to post the video.
- `extractArticle({ url })` — fetches a URL and returns clean article text.
- `searchImage({ query, orientation?, provider? })` — returns a local cached
  image path. `provider` is one of `pexels` (default, reliable), `unsplash`
  (fallback when Pexels has no match), `openverse` (federated CC-licensed
  search across Wikimedia / Flickr / Smithsonian / museums — best for
  niche or historical topics, anonymous OK), `wikimedia` (direct
  Wikimedia Commons API — best for named people / places / events /
  logos / maps / historical photos, since Pexels and Unsplash only
  carry generic stock for proper nouns), or `pixabay` (often
  rate-limited by Cloudflare; avoid unless explicitly requested).
- `searchMusic({ mood, durationSec, provider? })` — returns a local cached
  audio path. Always use `provider: 'archive'` (default). Pixabay's music
  API has been deprecated (404) — do not pass `provider: 'pixabay'`.
- `synthesizeVoice({ text, voiceId, speed? })` — returns an mp3 path plus
  per-word timing info.
- `listVoices({ language })` — returns Edge TTS voice IDs for `vi-VN` or
  `en-US`.
- `renderSegment({ projectId, segmentId })` — renders one segment to mp4.
- `renderProject({ projectId })` — renders all segments and concats into
  `output.mp4`.

These tools cache aggressively. Calling `searchImage` with the same query twice
returns the same cached file; never re-download manually.

## Choosing the narration language

`createProject` requires a `language` (`'vi'` or `'en'`); there is no
hard default. Pick it in this order, and **ask** when the signals
disagree:

1. **User stated it explicitly** — e.g. "make it English", "tiếng Việt
   nhé" → use that.
2. **Prompt language matches article language** (after `extractArticle`
   returns) → use that single language; do not ask.
3. **Prompt language differs from article language** — e.g. the user
   wrote the request in Vietnamese but the URL is an English article.
   Use `AskUserQuestion` to confirm which side should win. Default
   suggestion: the **prompt language** (audience), with the article
   language as the second option.
4. **Unknown / unclear** (short prompt, no URL, article extraction
   failed) → ask explicitly.

When you pick a language that differs from the article's, **translate**
each segment's `text` (and the project `title`) into the target language
before calling `synthesizeVoice` — the narration must match the chosen
TTS voice.

The Edge TTS voices are picked from `DEFAULT_VOICES`
(`packages/shared/src/schema.ts`):
- `vi` → `vi-VN-HoaiMyNeural`
- `en` → `en-US-AriaNeural`

## Choosing the narration voice

After locking the language, **ask the user which voice to use** before
you call `synthesizeVoice` for the segments. Show 3–4 contrasting
options sourced from `listVoices({ language })`, including the default
plus one other gender and one regional variant. Examples:

- For `vi`: `vi-VN-HoaiMyNeural` (female, default), `vi-VN-NamMinhNeural`
  (male), and any further variants `listVoices` returns.
- For `en`: `en-US-AriaNeural` (female US, default), `en-US-GuyNeural`
  (male US), `en-GB-SoniaNeural` (female UK).

Recommend the default first. Once the user picks a voice, use that
`voiceId` for **every segment** unless the user later asks to vary it
per segment.

## Common task: create video from a URL

1. Call `createProject({ source: { type: 'url', value: <url> }, language, aspect })`.
2. Call `extractArticle({ url })` to get the body text.
3. **Research the project aesthetic.** First call
   `researchProjectAesthetic({ articleTitle, articleText, language })`
   to classify the topic (crime / finance / tech / health / sports /
   entertainment / lifestyle / travel / food / nature / politics /
   education / generic) and surface a strong three-variant set plus a
   music mood. Then **ask the user** how to proceed via
   `AskUserQuestion` (default-first):

   - **Use the recommended preset trio (recommended when `confidence ≥
     0.67`)** — write the returned `variantPicks` straight into
     `project.variants`. Fastest, deterministic, deterministic across
     re-runs.
   - **Research and mint a tailored style for this project** — call
     `researchProjectAesthetic` again with `proposeNewStyles: true`,
     append the returned `newUserStyles` to `project.userTextStyles`,
     and rewire one variant (or all three) to reference the new ids.
     This is the slow path when the built-in 28 presets are not a tight
     fit; mention the topic palette in the question so the user knows
     what they will get.
   - **Skip — let me edit variants manually in Studio** — write an
     empty `variants: []` and stop here; Studio will surface the style
     picker.

   When the research tool reports `confidence < 0.34` (no keyword hits)
   the default recommendation flips: prefer the "Research and mint
   tailored style" option, since the built-in pool clearly does not
   know this kind of article.

   Always show the rationale string from the tool in the question
   description so the user understands why the topic was picked.
4. **Confirm story structure with the user** before drafting segments. Use
   `AskUserQuestion` and recommend the full three-part structure:
   - **Mở bài (title, 1 segment, ~5s)** — headline / hook
   - **Thân bài (keypoint, 2–5 segments, 5–8s mỗi đoạn)** — the article's
     main beats
   - **Kết bài (outro, 1 segment, ~4–6s)** — closing line. Recommended.
   The recommended option should be "Full intro–body–outro". Honor whatever
   the user picks (e.g. they may want intro + body only for a teaser clip).
4. Plan the segments accordingly. Each segment is 5–10 seconds.
   - **The outro is NOT a body keypoint.** It must wrap the story — a
     forward-looking takeaway, a call-to-action, or a source credit (e.g.
     "Theo dõi để cập nhật tin công nghệ mới nhất.", "Đọc đầy đủ tại
     VnExpress."). Do not just paste the last sentence of the article as the
     outro; that always reads as a half-finished body beat.
5. Use Write/Edit to update `data/projects/<id>/storyboard.json`. Make sure
   the final JSON validates against `ProjectSchema`.
6. For each segment, in parallel: call `searchImage({ query })` and
   `synthesizeVoice({ text, voiceId })`. Update the segment's `visuals` and
   `audio.narration` with the returned paths. **Always set
   `segment.durationSec = recommendedSegmentDurationSec`** from the
   `synthesizeVoice` response — Edge TTS read length is content-driven
   (Vietnamese sentences with polysyllabic words frequently run 7–8s when
   estimated 5–6s) and the renderer will otherwise cut the audio when the
   slot is shorter than the clip. If `recommendedSegmentDurationSec` is
   missing (older MCP servers), compute it as `Math.max(plannedSec,
   narrationDurationSec + 0.4)` yourself.
7. Call `searchMusic({ mood, durationSec })` for the project background
   music and set `bgMusic`. **Use the `musicMood` returned by
   `researchProjectAesthetic` in step 3**. If that mood produces no
   results, fall back to the entries in `musicMoodFallbacks`. Pass
   `durationSec` = project total — the Remotion composition loops the
   track when it is shorter and fades out the last ~1.2s when it is
   longer, so an exact match is not required.
8. **Ask how many variants to render** before calling `renderProject`. Use
   `AskUserQuestion` with these options (default-first):
   - **1 video (recommended)** — render only variant `A` (Classic).
     Fastest, smallest disk footprint, easiest to compare against any
     follow-up edit. This should be the default suggestion.
   - **3 videos (Classic / Bold news / Cinematic)** — render every variant
     declared on the project so the user can pick the look they like.
   - **Skip render** — leave it for the user to trigger from Studio.
   When the user picks 1 video, call `renderProject({ projectId, variants:
   ['A'] })` (or omit `variants` for the legacy single output). When the
   user picks all 3, call `renderProject({ projectId, variants: 'all' })`.
9. Report the absolute path(s) to the output file(s) so the user can open
   them — for multi-variant renders, list every output explicitly.
10. **Generate + rewrite social captions** (REQUIRED — do not skip).
    Call `generateSocialCaption({ projectId })` to pull the template
    baseline. The template glues every keypoint into the caption body
    so it reads like a transcript — DO NOT paste it verbatim. Rewrite
    each platform variant following the "prep video for social upload"
    section below (TikTok 120–250 chars, FB 400–800, IG 250–500), then
    show all three rewritten captions plus char counts so the user can
    copy whichever platform they're posting to. The render step is
    not "done" until the user has the captions in their hands — most
    users want to post immediately after `output.mp4` lands.

## Common task: edit an existing segment

Prefer MCP tools over raw `Read+Edit+Write` on `storyboard.json` — the
file is validated against `ProjectSchema` on the way through, so a
typo or missing field can't land on disk and break the renderer mid-way.

- **Parameter change** (text, voice ID, duration, swap image): call
  `getStoryboard({ projectId })`, mutate the returned project object in
  memory (only the field you need), then call
  `updateStoryboard({ projectId, project })`. Finally re-render with
  `renderSegment({ projectId, segmentId })` or
  `renderProject({ projectId })`. The update tool sanitises (strip
  emoji, fit narration durations) before writing, so you don't need to
  apply those manually.
- **New visual effect or custom layout**: see "Custom scene" below.

## Common task: prep video for social upload

After `renderProject` succeeds, the user usually wants to post the mp4
on TikTok / Facebook / Instagram. Each platform expects a different
caption shape — and the template-based `generateSocialCaption` output
is intentionally a **starting point**, not the final copy. Your job
as the orchestrator is to take that baseline and rewrite it into
punchier, audience-tuned captions before showing them to the user.

### Step 1 — Pull the baseline

Call `generateSocialCaption({ projectId })`. It auto-classifies the
topic and returns three platform variants plus a topic-aware hashtag
block. Override `topic` if the article straddles two categories (e.g.
"tech" article about a politician should be `politics`).

### Step 2 — Rewrite each variant (REQUIRED)

The baseline already compresses each keypoint to its lead clause and
roughly hits the platform sweet-spot length — but it can't pick the
hook, can't write in the user's voice, and can't read between the
lines of the article. Your job is to rewrite each variant so it reads
like a human who watched the video, not a script reader.

Rewrite the three variants per platform target length:

| Platform | Target length | Style |
|---|---|---|
| TikTok | **120–250 chars** | Hook ngắn + 1 câu drama + CTA + ≤6 hashtag |
| Facebook | 400–800 chars | Storytelling 2–3 đoạn, kết bằng câu hỏi mở để bình luận |
| Instagram | 250–500 chars | Hook emoji + 2–3 dòng arrow `→` + hashtag dense ở dưới |

Vietnamese audiences respond best to:
- TikTok: viết tắt khẩu ngữ ("ai mà ngờ", "cú twist", "đỉnh nóc"),
  câu ngắn, không dấu chấm ở cuối hook
- Facebook: kể như một status cá nhân, không liệt kê
- Instagram: emoji đầu dòng, ngắt dòng đẹp, hashtag thành 1 block ở
  cuối tách bằng dòng trống

Keep the hashtag list intact (or trim to top 8 for TikTok) — the tool
already picked topic-aware tags. Add niche tags from the article only
if they obviously beat the generic pool.

### Step 3 — Present all three variants

Show the rewritten captions plus character counts. Don't hide the
baseline if the user asks for it — they may want to compare. Default
to recommending **TikTok** first if the project is 9:16, **Facebook**
if 16:9.

### Why the baseline isn't enough

The tool is template-based on purpose (no LLM call, 100% local,
deterministic). It lists every keypoint verbatim because it can't
judge which one is the hook. You can. Use your VN/EN language ability
to compress 5 keypoints into 2 sentences that hook in the first 50
chars, then keep the topic-aware hashtags from the tool.

## Custom scene

When the user requests a visual effect not covered by the built-in library:

1. Glob `packages/remotion/src/scenes/*.tsx` to see the available scenes.
2. Read the scene that is closest to what the user wants.
3. Write a forked, modified version to
   `data/projects/<id>/scenes/<PascalCaseName>.tsx`. Use the same prop interface
   as the source scene (so the dynamic scene resolver can pick it up).
4. Edit the corresponding segment in `storyboard.json` to set
   `scene: "<PascalCaseName>"`.
5. Call `renderSegment` to re-render.

## Conventions

- **Default voice (Vietnamese)**: `vi-VN-HoaiMyNeural`
- **Default voice (English)**: `en-US-AriaNeural`
- **Default aspect**: `9:16`, 30 fps, 1080×1920
- **Prefer Pexels** for images (most reliable); use `unsplash` as fallback
  when Pexels has no good match, `wikimedia` when the query is a
  proper noun (person, place, event, logo, map, historical photo —
  Pexels/Unsplash only carry generic stock for those), and `openverse`
  when the topic is niche / historical / museum-flavored (it federates
  Wikimedia, Flickr CC, Smithsonian, museums.victoria, etc.). Avoid
  `pixabay` unless the user asks for it — Cloudflare often blocks
  Node requests.
- **Prefer Internet Archive** for music (default in `searchMusic`); it is
  filtered to commercial-friendly CC0/CC-BY licenses and needs no key.
- Always validate `storyboard.json` against `ProjectSchema` before saving.
- Asset paths in `storyboard.json` are absolute on the user's machine. Never
  hand-write them; only use the paths that tools return.

## UI rules (STRICT)

- **NEVER use emoji** anywhere. Not in scene TSX, not in `storyboard.json` text
  fields, not in console output, not in commit messages, not in this kind of
  documentation. If the article body contains emoji, the `extractArticle` tool
  strips them — keep them stripped.
- For any iconography use `lucide-react` (e.g. `<Play />`, `<Mic />`, `<Image />`).
- Vietnamese text in video should use Be Vietnam Pro. English text in video
  should use Inter. Both come from `@remotion/google-fonts`.

### Where each CSS approach applies

The two CSS pipelines are described under "Architecture — the big picture"
above. When forking a scene into `data/projects/<id>/scenes/`, keep using
inline styles sourced from `@news-tok/shared/ui-tokens` — Tailwind classes
will silently fail there.

## What you should not do

- Do not call the Anthropic API directly, and do not assume an
  `ANTHROPIC_API_KEY` is set. This project intentionally uses the user's Claude
  Pro/Max subscription.
- Do not edit files in `apps/studio` or `packages/` unless the user explicitly
  asks you to extend the tool itself (versus working on a project under
  `data/projects/`).
- Do not bypass the MCP tools to call Pexels/Pixabay/Edge TTS directly. The
  tools handle caching and rate limits.
- Do not invent asset paths or claim a render succeeded without actually
  calling `renderSegment` / `renderProject`.

## Output

Always end your turn by reporting the absolute path of the most recent
`output.mp4` (or the per-segment mp4 if the user only asked for one segment),
so they can open it in Studio or a media player.
