# news-tok

Turn **articles / plain text / website links** into **short videos** (TikTok/Reels/Shorts) — runs 100% **locally**.

> **Two clearly separated halves:**
> - **Claude CLI in the terminal** = the AI that creates a project (extract, plan, fetch assets, render full)
> - **Local Web Studio** = the editor used to preview and fine-tune the result after Claude is done

There is no "AI orchestrator" inside the Node app. The Claude Code CLI itself **is** the orchestrator, living in the terminal. The Web Studio is just the editor shell.

---

## Features

- **Flexible input**: paste text, an article URL, or a file
- **Claude CLI orchestrates everything**: extract → summarize → pick images/music → TTS → render → output.mp4
- **Claude writes and edits scene TSX** whenever the user requests a custom effect
- **Free AI voices** (VI + EN) — Edge neural voices
- **AI-picked music + images** from Pexels / Unsplash / Internet Archive (free for commercial use)
- **Formats**: 9:16 (TikTok), 16:9, 1:1
- **Web Studio**: timeline, segment editor, real-time preview, swap images/music/voice, export
- **100% local**: assets are cached on the machine. Outbound traffic only goes to Claude (Pro/Max sub) + Pexels/Pixabay
- **Subscription-based**, no API key
- **Unified UI**: a single icon set — **Lucide React** — is shared by Studio and Remotion compositions. **No emoji anywhere** (Studio, scene TSX, CLAUDE.md, docs).

---

## Two surfaces

### 1) Claude CLI (terminal) — the AI side

```bash
cd D:/Github/news-tok
claude
> Create a 30s video from https://vnexpress.net/... — Vietnamese, 9:16
```

Claude will:
1. Call the MCP tool `extractArticle` to read the article
2. Build a storyboard and write it to `data/projects/<id>/storyboard.json`
3. Call `searchImage`, `searchMusic`, `synthesizeVoice` in parallel
4. Call `renderProject` → output.mp4
5. Report the file path so you can open it in Studio

Later, if you say "give segment 2 a glitch effect like Cyberpunk", Claude will `Read` the storyboard, fork a scene into `data/projects/<id>/scenes/CyberpunkGlitch.tsx`, edit the storyboard to reference the new scene, and call `renderSegment` to re-render.

### 2) Web Studio (`pnpm studio`) — the editor side

```bash
pnpm studio   # opens http://localhost:3000
```

- **Project list**: see every project Claude has created under `data/projects/`
- **Timeline editor**: drag-and-drop segments, edit text/voice/duration
- **Asset picker**: swap images/music through the UI (search Pexels/Pixabay)
- **Real-time preview**: Remotion `<Player>` driven by storyboard.json
- **Re-render**: a single segment or the full project
- **Export**: download output.mp4

Studio **does not spawn Claude**. If you want AI assistance for an edit, go back to the terminal and talk to Claude.

---

## Why split it like this?

| Activity | Who does it better |
|---|---|
| Read an article, distill the main points | **Claude** (an LLM beats rules) |
| Pick keywords that find the right image | **Claude** |
| Write TSX code for an effect | **Claude** |
| Drag-and-drop segments, reorder | **Studio** (UI beats typing) |
| Tweak a single word in a subtitle | **Studio** (filling a form is faster than asking Claude) |
| Audition voice samples before choosing | **Studio** (UI player) |
| Crop/resize an image | **Studio** (visual) |

Both sides share the same **storyboard.json** — nobody owns the state exclusively.

---

## Architecture

```
news-tok/
├── CLAUDE.md                # instructions Claude reads when entering this project
├── .mcp.json                # registers the MCP server with the Claude CLI
├── prompts/
│   ├── generate.md          # prompt template for "create a video"
│   └── edit.md              # prompt template for "edit a video"
├── apps/
│   └── studio/              # Next.js — the Web Studio editor
│       ├── app/
│       │   ├── projects/    # list + editor pages
│       │   └── api/         # read/write storyboard, trigger render, call media
│       └── components/      # Player, Timeline, AssetPicker, ...
├── packages/
│   ├── shared/              # zod schemas
│   ├── media/               # Pexels, Pixabay, Edge TTS, Readability, ffmpeg
│   ├── remotion/            # default composition + scene library
│   ├── render/              # programmatic Remotion render
│   └── mcp-server/          # local stdio MCP server — used only by the Claude CLI
└── data/                    # gitignored — shared state
    ├── projects/<id>/
    │   ├── storyboard.json  # source of truth
    │   ├── scenes/          # Claude forks TSX into this folder
    │   ├── segments/<segId>.mp4
    │   └── output.mp4
    └── cache/               # images/, music/, tts/
```

### Dependency direction (no cycles)

- `shared` ← used by everything
- `media` ← used by `mcp-server`, `render`, `studio` (**studio imports it directly**, not through MCP)
- `remotion` ← used by `render`, `studio` (Player)
- `render` ← used by `mcp-server`, `studio`
- `mcp-server` ← standalone process spawned by the Claude CLI via `.mcp.json`
- `studio` ← the Web entry point

### Why doesn't Studio go through MCP?

Studio and `packages/media` live in the same monorepo and the same Node process — direct imports avoid the cost of spawning a subprocess and the JSON-RPC overhead. The MCP server **exists only for the Claude CLI**, because that's the only way Claude can call into our Node code.

Both sides use the **same `packages/media`** → Claude and Studio always stay consistent.

---

## Data model

```ts
type Project = {
  id: string
  title: string
  source: { type: 'text' | 'url' | 'file'; value: string }
  language: 'vi' | 'en'
  aspect: '9:16' | '16:9' | '1:1'
  segments: Segment[]
  bgMusic?: AssetRef
  createdAt: string; updatedAt: string
}

type Segment = {
  id: string
  durationSec: number
  scene: 'title' | 'keypoint' | 'quote' | 'outro' | string  // string = custom
  text: string
  voice: { provider: 'edge-tts'; voiceId: string; speed: number }
  visuals: { background?: AssetRef; foreground?: AssetRef[] }
  effects: EffectSpec[]
  audio?: { sfx?: AssetRef[] }
  style?: Record<string, string | number>
}
```

---

## MCP tools (only the Claude CLI uses them)

| Tool | Description |
|---|---|
| `extractArticle({ url })` | Fetch + Readability → `{ title, text, byline }` |
| `searchImage({ query, orientation, provider? })` | Pexels (default) / Unsplash / Pixabay → local cache path |
| `searchMusic({ mood, durationSec, provider? })` | Internet Archive (default, no key) / Pixabay → local cache path |
| `synthesizeVoice({ text, voiceId, speed })` | Edge TTS → mp3 + word boundaries |
| `listVoices({ language })` | List Edge TTS voices |
| `renderSegment({ projectId, segmentId })` | Remotion render of one segment |
| `renderProject({ projectId })` | Full render + ffmpeg concat |
| `createProject({ source, language, aspect })` | Create `data/projects/<id>/` + an empty storyboard |
| `listProjects()` | List `data/projects/` |

**Built-in tools Claude also uses**: `Read`, `Edit`, `Write`, `Glob`, `Grep`, `Bash(node *, pnpm *)`.

---

## Stack

| Layer | Lib | Why |
|---|---|---|
| Runtime | Node 20+ / TypeScript 5 | |
| UI | Next.js 14 | RSC + API routes |
| Video render | **Remotion 4** + `@remotion/renderer` + `@remotion/player` | Programmatic + Player preview |
| AI | **Claude Code CLI** (terminal) | Pro/Max subscription, no API key |
| MCP | `@modelcontextprotocol/sdk` | Official TS SDK |
| TTS | `msedge-tts` | Free, VI+EN |
| Article extract | `@mozilla/readability` + `jsdom` | |
| ffmpeg | `ffmpeg-static` + `execa` | Reliable on Windows |
| Media APIs | Pexels + Unsplash (images), Internet Archive (music); Pixabay optional fallback | Free for commercial use. Pixabay sits behind Cloudflare and is often blocked from Node fetch. |
| **Icons** | **`lucide-react`** | The single icon set for Studio + Remotion. Tree-shakeable, ~1500 icons, line-style. No emoji. |
| **Studio CSS** | **Tailwind CSS v4 + shadcn/ui** | Utility-first, CSS-first design tokens via `@theme`. shadcn copy-paste components on top of Radix primitives. **Applies to Studio only, not to Remotion scenes.** |
| **Scenes CSS** | **Inline styles + ui-tokens** | The Remotion bundle has its own webpack pipeline that doesn't include Tailwind PostCSS. Scenes use `style={{...}}` with constants from `packages/shared/src/ui-tokens.ts`. |
| Validation | `zod` | |
| Mono-repo | `pnpm` workspaces | |

### Notes

- **Remotion**: free for teams of ≤ 3. For teams of 4+: Company License $25/dev/month. [remotion.dev/license](https://www.remotion.dev/license)
- **Edge TTS**: reverse-engineered Microsoft API. Adapter pattern so it can be swapped easily
- **Claude auth**: `claude login` with a Pro/Max subscription. **Do NOT set `ANTHROPIC_API_KEY`** — it would switch to per-token API billing

---

## UI conventions (MANDATORY)

Applies to **Studio UI**, **Remotion scenes**, **CLAUDE.md**, and every doc in this repo:

### Styling — two separate pipelines

| Location | CSS approach | Why |
|---|---|---|
| `apps/studio/**` | **Tailwind v4 + shadcn/ui** | A component-rich UI needs utility classes + a design system |
| `packages/remotion/scenes/**` | **Inline `style={{...}}`** | The Remotion bundler has its own webpack and does not run Tailwind PostCSS — classes would be silently ignored |
| `data/projects/<id>/scenes/**` | **Inline `style={{...}}`** | Same reason as above |

**Single source of design values**: `packages/shared/src/ui-tokens.ts` (`COLOR`, `SPACE`, `RADIUS`, `ICON`, `FONT`). Studio maps these to Tailwind theme vars via `app/globals.css`; scenes import them directly.

### Icon system
- **Use only `lucide-react`**. Do not mix in other icon sets (Heroicons, Tabler, Material, Font Awesome, ...).
- In Studio: use named imports, never barrel imports:
  ```tsx
  import { Play, Pause, Trash2 } from 'lucide-react'   // OK
  import * as Icons from 'lucide-react'                // NOT OK
  ```
- In Remotion scenes: same package — render with `size`, `color`, `strokeWidth` via props.
- Centralize size & stroke in `packages/shared/src/ui-tokens.ts`:
  ```ts
  export const ICON = {
    sm: 16, md: 20, lg: 24, xl: 32,
    strokeWidth: 1.75,
  } as const
  ```

### No emoji
- **Do not use emoji** anywhere: Studio UI, scene TSX, button labels, toast messages, log output, README/PLAN/CLAUDE.md, prompt examples, commit messages.
- Reasons:
  1. Rendering emoji in Remotion is inconsistent across operating systems (Windows vs macOS emoji glyphs differ → the rendered video looks different on different machines)
  2. The tool's visual identity is built on Lucide line-style icons — color emoji break the rhythm
  3. CLAUDE.md has no emoji → Claude will not pick up an emoji style when it writes scene TSX
- Replacement: use a Lucide icon component. Instead of a "tick emoji" prefix on an `OK`/`Done` button, use `<Check size={ICON.sm} />` next to the text.
- Lint rule (M4): add an ESLint rule `no-emoji` (custom or `eslint-plugin-no-emoji`) for `apps/studio/**` and `packages/remotion/**`.

### Typography (to be finalized in M1)
- Studio UI font: Inter (`next/font`)
- Video Vietnamese font: Be Vietnam Pro (`@remotion/google-fonts/BeVietnamPro`)
- Video English font: Inter (`@remotion/google-fonts/Inter`)

---

## Roadmap

### M0 — Setup (1 day)
- [ ] pnpm workspace, TypeScript config
- [ ] `.env.example` (PEXELS_API_KEY, PIXABAY_API_KEY — no ANTHROPIC_API_KEY)
- [ ] Verify `claude --version` + `claude login` (Pro/Max sub)
- [ ] zod schemas in `packages/shared`
- [ ] `packages/shared/src/ui-tokens.ts` (ICON constants)
- [ ] `CLAUDE.md` placeholder (with the "NEVER use emoji" line in it)

### M1 — Remotion render core (3-5 days)
- [ ] 9:16 composition with 3 sample scenes (TitleCard / KeyPoint / Outro)
- [ ] Effects: Ken Burns, typewriter, fade
- [ ] Dynamic scene loading (built-in + per-project custom)
- [ ] `renderSegment` / `renderFull` through `@remotion/renderer`
- [ ] Be Vietnam Pro font test with diacritic-heavy text

### M2 — Media adapters (2-3 days)
- [ ] Pexels + Pixabay (image search)
- [ ] Pixabay Music (music search)
- [ ] Edge TTS (synthesize VI/EN, list voices)
- [ ] Readability (extract URL) + strip emoji from output
- [ ] ffmpeg concat + mix
- [ ] Hash-based cache
- [ ] `packages/shared/src/sanitize.ts` — `stripEmoji()` via `emoji-regex`

### M3 — MCP server for Claude (2-3 days)  ← **do this early to de-risk**
- [ ] `packages/mcp-server` using `@modelcontextprotocol/sdk`
- [ ] Wrap each media adapter + render as an MCP tool
- [ ] Build with tsup into `dist/index.js`
- [ ] `.mcp.json` at the repo root
- [ ] Detailed `CLAUDE.md`
- [ ] `prompts/generate.md`, `prompts/edit.md`
- [ ] Test: `claude` in the terminal → "create a video from a URL" → produces output.mp4

### M4 — Web Studio core (4-6 days)
- [ ] Next.js skeleton, `/projects`, `/projects/[id]`
- [ ] Install `lucide-react`, use it for every icon in Studio (Play, Trash2, Pencil, Settings, ...)
- [ ] ESLint + `eslint-plugin-no-emoji` over `apps/studio/**`, `packages/remotion/**`, `**/*.md`
- [ ] lint-staged + husky pre-commit hook
- [ ] Remotion `<Player>` preview
- [ ] Timeline listing segments, click → edit panel
- [ ] Edit text/voice/duration → write storyboard.json (sanitize emoji) → Player reload
- [ ] Trigger re-render (segment / full) via `packages/render`
- [ ] Project list/delete/duplicate
- [ ] Download output.mp4

### M5 — Studio asset pickers (2-3 days)
- [ ] Image picker UI (search Pexels/Pixabay, preview, pick)
- [ ] Music picker UI (mood-based, audio preview)
- [ ] Voice picker UI (list voices, sample preview)
- [ ] Drag-reorder segments

### M6 — Polish
- [ ] Subtitle burn-in from Edge TTS word boundaries
- [ ] Aspect 16:9 / 1:1
- [ ] Export presets (TikTok 60fps, YouTube Shorts, Reels)
- [ ] Project template / duplicate
- [ ] Batch render

---

## Quick setup (once M0 is done)

```bash
# 1. Install the Claude Code CLI and log in
npm i -g @anthropic-ai/claude-code
claude login

# 2. Install deps + build the MCP server
pnpm install
pnpm --filter @news-tok/mcp-server build

# 3. Configure env
cp .env.example .env
# fill in PEXELS_API_KEY, PIXABAY_API_KEY

# 4. Verify Claude can find the MCP tools
claude mcp list   # should show "news-tok"

# 5a. Create a video using Claude (terminal)
claude
> Create a 30s video from https://vnexpress.net/... — VI, 9:16

# 5b. Open Studio to tweak it
pnpm studio   # http://localhost:3000
```

---

## License

TBD — must be compatible with the Remotion license model.
