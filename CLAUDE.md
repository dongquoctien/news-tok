# news-tok — project context for Claude

You are working inside the `news-tok` repo. The goal of this project is to turn
articles, raw text, or URLs into short videos (TikTok/Reels/Shorts style),
running 100% on the user's local machine.

This file is loaded by the Claude Code CLI whenever a user runs `claude` inside
this repo. Treat it as the authoritative description of how to work here.

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
  CLAUDE.md                       (this file)
  .mcp.json                       (registers the local MCP server)
  prompts/                        (example prompts users can copy)
  apps/studio/                    (Next.js Web Studio — do not modify unless asked)
  packages/
    shared/                       (zod schemas, UI tokens, sanitize helpers)
    media/                        (Pexels, Pixabay, Edge TTS, Readability, ffmpeg)
    remotion/                     (built-in compositions + scene library)
    render/                       (programmatic Remotion render)
    mcp-server/                   (the MCP server that exposes media + render tools)
  data/
    projects/<id>/
      storyboard.json             (source of truth for one project)
      scenes/                     (your custom scene TSX, per project)
      segments/<segmentId>.mp4    (per-segment render output)
      output.mp4                  (final concatenated video)
    cache/                        (hash-based asset cache)
```

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
- `extractArticle({ url })` — fetches a URL and returns clean article text.
- `searchImage({ query, orientation?, provider? })` — returns a local cached
  image path. `provider` is one of `pexels` (default, reliable), `unsplash`
  (fallback when Pexels has no match), or `pixabay` (often rate-limited by
  Cloudflare; avoid unless explicitly requested).
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
3. **Confirm story structure with the user** before drafting segments. Use
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
   `audio.narration` with the returned paths.
7. Call `searchMusic({ mood, durationSec })` for the project background
   music and set `bgMusic`. **Pick `mood` from the article's tone**, not a
   hard-coded default — e.g. `'tense'` / `'dramatic'` for crime, fraud,
   conflict; `'uplifting'` / `'inspiring'` for product launches and
   features; `'calm'` for explainers; `'cinematic'` for big-picture
   reporting; `'news'` for hard-news bulletins. Pass `durationSec` =
   project total — the Remotion composition loops the track when it is
   shorter and fades out the last ~1.2s when it is longer, so an exact
   match is not required.
8. Call `renderProject({ projectId })`.
9. Report the absolute path to `output.mp4` so the user can open it.

## Common task: edit an existing segment

- **Parameter change** (text, voice ID, duration, swap image): Read
  `storyboard.json`, Edit the relevant segment, then call
  `renderSegment({ projectId, segmentId })`.
- **New visual effect or custom layout**: see "Custom scene" below.

## Custom scene

When the user requests a visual effect not covered by the built-in library:

1. Glob `packages/remotion/scenes/*.tsx` to see the available scenes.
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
  when Pexels has no good match. Avoid `pixabay` unless the user asks for
  it — Cloudflare often blocks Node requests.
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

This repo has **two separate render pipelines**, each with its own CSS rule:

- **Web Studio** (`apps/studio/**`) — uses **Tailwind CSS v4 + shadcn/ui**.
  Class-based styling, design tokens in `apps/studio/app/globals.css`.
- **Remotion scenes** (`packages/remotion/scenes/**`, `data/projects/<id>/scenes/**`)
  — uses **inline `style={{...}}`** with constants imported from
  `packages/shared/src/ui-tokens.ts` (`COLOR`, `SPACE`, `RADIUS`, `ICON`, `FONT`).
  **Do NOT use Tailwind classes in scene TSX** — the Remotion bundler runs its
  own webpack pipeline that does not include Tailwind PostCSS, so classes will
  silently render as text or be ignored.

When forking a scene into `data/projects/<id>/scenes/`, keep using inline styles
sourced from `@news-tok/shared/ui-tokens`. The shared `ui-tokens.ts` file is the
single source of truth for design values across both pipelines.

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
