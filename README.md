# news-tok

Biến **bài báo / văn bản / link website** thành **video ngắn** (TikTok/Reels/Shorts) — chạy 100% **local**.

> **Hai nửa rõ rệt:**
> - **Claude CLI ở terminal** = AI tạo project (extract, plan, fetch assets, render full)
> - **Web Studio local** = editor để xem trước & tinh chỉnh nội dung sau khi Claude xong

Không có "AI orchestrator" trong Node app. Claude Code CLI tự nó **là** orchestrator, ngồi ở terminal. Web Studio là vỏ editor.

---

## Tính năng

- **Input đa dạng**: dán text, URL bài báo, file
- **Claude CLI tự điều phối**: extract → tóm tắt → chọn ảnh/nhạc → TTS → render → output.mp4
- **Claude tự viết & sửa scene TSX** khi user yêu cầu hiệu ứng custom
- **Giọng đọc AI** miễn phí (VI + EN) — Edge neural voices
- **Nhạc + ảnh** AI tự chọn từ Pexels / Unsplash / Internet Archive (free commercial)
- **Định dạng**: 9:16 (TikTok), 16:9, 1:1
- **Web Studio**: timeline, segment editor, preview real-time, swap ảnh/nhạc/voice, export
- **100% local**: assets cache trên máy. Outbound chỉ tới Claude (sub Pro/Max) + Pexels/Pixabay
- **Subscription**, không API key
- **UI thống nhất**: bộ icon **Lucide React** dùng chung cho Studio và Remotion compositions. **Không dùng emoji** ở bất kỳ đâu (Studio, scene TSX, CLAUDE.md, doc).

---

## Hai mặt giao diện

### 1) Claude CLI (terminal) — AI side

```bash
cd D:/Github/news-tok
claude
> Tạo video 30s từ https://vnexpress.net/... — tiếng Việt, 9:16
```

Claude sẽ:
1. Gọi MCP tool `extractArticle` đọc bài
2. Lập storyboard, ghi `data/projects/<id>/storyboard.json`
3. Gọi `searchImage`, `searchMusic`, `synthesizeVoice` song song
4. Gọi `renderProject` → output.mp4
5. Báo path file để mở trong Studio

Nếu sau này user gõ "đoạn 2 cho hiệu ứng glitch như Cyberpunk", Claude `Read` storyboard, fork scene vào `data/projects/<id>/scenes/CyberpunkGlitch.tsx`, edit storyboard tham chiếu scene mới, gọi `renderSegment` re-render.

### 2) Web Studio (`pnpm studio`) — Editor side

```bash
pnpm studio   # mở http://localhost:3000
```

- **Project list**: thấy mọi project Claude đã tạo trong `data/projects/`
- **Timeline editor**: kéo thả segment, edit text/voice/duration
- **Asset picker**: đổi ảnh/nhạc qua UI (search Pexels/Pixabay)
- **Preview real-time**: `<Player>` Remotion từ storyboard.json
- **Re-render**: 1 segment hoặc full
- **Export**: download output.mp4

Studio **không spawn Claude**. Nếu user muốn AI sửa giúp → quay lại terminal nói với Claude.

---

## Vì sao tách bạch?

| Hoạt động | Ai làm tốt hơn |
|---|---|
| Đọc bài báo, tóm ý chính | **Claude** (LLM mạnh hơn rule) |
| Chọn từ khoá tìm ảnh phù hợp | **Claude** |
| Viết code TSX cho hiệu ứng | **Claude** |
| Kéo thả segment, đổi thứ tự | **Studio** (UI tốt hơn typing) |
| Đổi 1 từ trong subtitle | **Studio** (sửa form nhanh hơn gõ với Claude) |
| Nghe preview voice mẫu trước khi chọn | **Studio** (UI player) |
| Crop/resize ảnh | **Studio** (visual) |

Hai bên dùng chung **storyboard.json** — không ai sở hữu state.

---

## Kiến trúc

```
news-tok/
├── CLAUDE.md                # hướng dẫn Claude khi vào project này
├── .mcp.json                # đăng ký MCP server với Claude CLI
├── prompts/
│   ├── generate.md          # template prompt cho "tạo video"
│   └── edit.md              # template prompt cho "chỉnh sửa"
├── apps/
│   └── studio/              # Next.js — Web Studio editor
│       ├── app/
│       │   ├── projects/    # list + editor pages
│       │   └── api/         # đọc/ghi storyboard, trigger render, gọi media
│       └── components/      # Player, Timeline, AssetPicker, ...
├── packages/
│   ├── shared/              # zod schemas
│   ├── media/               # Pexels, Pixabay, Edge TTS, Readability, ffmpeg
│   ├── remotion/            # composition default + library scenes
│   ├── render/              # programmatic Remotion render
│   └── mcp-server/          # local stdio MCP server — chỉ Claude CLI dùng
└── data/                    # gitignored — shared state
    ├── projects/<id>/
    │   ├── storyboard.json  # source of truth
    │   ├── scenes/          # Claude fork TSX vào đây
    │   ├── segments/<segId>.mp4
    │   └── output.mp4
    └── cache/               # images/, music/, tts/
```

### Dependency direction (no cycles)

- `shared` ← used by all
- `media` ← used by `mcp-server`, `render`, `studio` (**studio import trực tiếp**, không qua MCP)
- `remotion` ← used by `render`, `studio` (Player)
- `render` ← used by `mcp-server`, `studio`
- `mcp-server` ← standalone process spawned by Claude CLI qua `.mcp.json`
- `studio` ← entry point Web

### Tại sao Studio không qua MCP?

Studio và `packages/media` cùng monorepo, cùng Node process — import trực tiếp đỡ phải spawn subprocess, đỡ JSON-RPC overhead. MCP server **chỉ tồn tại cho Claude CLI**, vì đó là cách duy nhất Claude gọi được code Node của ta.

Cả hai dùng **cùng một `packages/media`** → đảm bảo Claude và Studio luôn nhất quán.

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

## MCP tools (chỉ Claude CLI dùng)

| Tool | Mô tả |
|---|---|
| `extractArticle({ url })` | Fetch + Readability → `{ title, text, byline }` |
| `searchImage({ query, orientation, provider? })` | Pexels (default) / Unsplash / Pixabay → local cache path |
| `searchMusic({ mood, durationSec, provider? })` | Internet Archive (default, no key) / Pixabay → local cache path |
| `synthesizeVoice({ text, voiceId, speed })` | Edge TTS → mp3 + word boundaries |
| `listVoices({ language })` | List voices Edge TTS |
| `renderSegment({ projectId, segmentId })` | Remotion render 1 segment |
| `renderProject({ projectId })` | Full render + ffmpeg concat |
| `createProject({ source, language, aspect })` | Tạo folder `data/projects/<id>/` + storyboard rỗng |
| `listProjects()` | List `data/projects/` |

**Built-in tools Claude cũng dùng**: `Read`, `Edit`, `Write`, `Glob`, `Grep`, `Bash(node *, pnpm *)`.

---

## Stack

| Layer | Lib | Lý do |
|---|---|---|
| Runtime | Node 20+ / TypeScript 5 | |
| UI | Next.js 14 | RSC + API routes |
| Video render | **Remotion 4** + `@remotion/renderer` + `@remotion/player` | Programmatic + Player preview |
| AI | **Claude Code CLI** (terminal) | Sub Pro/Max, không API key |
| MCP | `@modelcontextprotocol/sdk` | Official TS SDK |
| TTS | `msedge-tts` | Free, VI+EN |
| Article extract | `@mozilla/readability` + `jsdom` | |
| ffmpeg | `ffmpeg-static` + `execa` | Reliable trên Windows |
| Media APIs | Pexels + Unsplash (images), Internet Archive (music); Pixabay optional fallback | Free commercial. Pixabay sits behind Cloudflare and is often blocked from Node fetch. |
| **Icons** | **`lucide-react`** | Bộ icon duy nhất cho Studio + Remotion. Tree-shakeable, ~1500 icons, line-style. Không dùng emoji. |
| **Studio CSS** | **Tailwind CSS v4 + shadcn/ui** | Utility-first, design tokens CSS-first qua `@theme`. shadcn copy-paste components, dùng Radix primitives. **Chỉ áp dụng cho Studio, không áp dụng cho Remotion scenes.** |
| **Scenes CSS** | **Inline styles + ui-tokens** | Remotion bundle có webpack riêng, không qua Tailwind PostCSS. Scenes dùng `style={{...}}` với constants từ `packages/shared/src/ui-tokens.ts`. |
| Validation | `zod` | |
| Mono-repo | `pnpm` workspaces | |

### Lưu ý

- **Remotion**: free ≤ 3 người. Team 4+: Company License $25/dev/tháng. [remotion.dev/license](https://www.remotion.dev/license)
- **Edge TTS**: reverse-engineered Microsoft API. Adapter pattern để dễ swap
- **Claude auth**: `claude login` với sub Pro/Max. **KHÔNG set `ANTHROPIC_API_KEY`** — sẽ chuyển sang billing API per-token

---

## UI conventions (BẮT BUỘC)

Áp dụng cho **Studio UI**, **Remotion scenes**, **CLAUDE.md**, và mọi doc trong repo:

### Styling — hai pipeline tách bạch

| Vị trí | CSS approach | Lý do |
|---|---|---|
| `apps/studio/**` | **Tailwind v4 + shadcn/ui** | Component-rich UI cần utility classes + design system |
| `packages/remotion/scenes/**` | **Inline `style={{...}}`** | Remotion bundler có webpack riêng, không chạy Tailwind PostCSS — class sẽ bị ignore |
| `data/projects/<id>/scenes/**` | **Inline `style={{...}}`** | Cùng lý do trên |

**Single source of design values**: `packages/shared/src/ui-tokens.ts` (`COLOR`, `SPACE`, `RADIUS`, `ICON`, `FONT`). Studio map sang Tailwind theme vars qua `app/globals.css`; scenes import trực tiếp.

### Icon system
- **Chỉ dùng `lucide-react`**. Không trộn bộ icon khác (Heroicons, Tabler, Material, Font Awesome...).
- Trong Studio: import named, không import barrel:
  ```tsx
  import { Play, Pause, Trash2 } from 'lucide-react'   // OK
  import * as Icons from 'lucide-react'                // KHÔNG
  ```
- Trong Remotion scenes: import cùng package — render với `size`, `color`, `strokeWidth` qua props.
- Centralize size & stroke trong `packages/shared/src/ui-tokens.ts`:
  ```ts
  export const ICON = {
    sm: 16, md: 20, lg: 24, xl: 32,
    strokeWidth: 1.75,
  } as const
  ```

### Cấm emoji
- **Không dùng emoji** ở bất kỳ đâu: UI Studio, scene TSX, button labels, toast messages, log output, README/PLAN/CLAUDE.md, prompt examples, commit messages.
- Lý do:
  1. Render text trong Remotion với emoji không nhất quán cross-OS (Windows vs macOS emoji glyphs khác nhau → video render khác máy)
  2. Visual identity của tool dựa trên Lucide line-style — emoji color phá nhịp
  3. CLAUDE.md không có emoji → Claude không học theo style emoji khi tự viết scene TSX
- Thay thế: dùng Lucide icon component. Ví dụ thay `OK`/`Done` button không phải prefix bằng tick emoji, mà `<Check size={ICON.sm} />` bên cạnh text.
- Lint rule (M4): thêm ESLint rule `no-emoji` (custom hoặc plugin `eslint-plugin-no-emoji`) cho `apps/studio/**` và `packages/remotion/**`.

### Typography (sẽ chốt ở M1)
- Font UI Studio: Inter (`next/font`)
- Font video Vietnamese: Be Vietnam Pro (`@remotion/google-fonts/BeVietnamPro`)
- Font video English: Inter (`@remotion/google-fonts/Inter`)

---

## Roadmap

### M0 — Setup (1 ngày)
- [ ] pnpm workspace, TypeScript config
- [ ] `.env.example` (PEXELS_API_KEY, PIXABAY_API_KEY — không ANTHROPIC_API_KEY)
- [ ] Verify `claude --version` + `claude login` (sub Pro/Max)
- [ ] zod schemas trong `packages/shared`
- [ ] `packages/shared/src/ui-tokens.ts` (ICON constants)
- [ ] `CLAUDE.md` placeholder (có sẵn dòng "NEVER use emoji")

### M1 — Remotion render core (3-5 ngày)
- [ ] Composition 9:16 với 3 scenes mẫu (TitleCard / KeyPoint / Outro)
- [ ] Effects: Ken Burns, typewriter, fade
- [ ] Dynamic scene loading (built-in + per-project custom)
- [ ] `renderSegment` / `renderFull` qua `@remotion/renderer`
- [ ] Font Be Vietnam Pro test với text có dấu

### M2 — Media adapters (2-3 ngày)
- [ ] Pexels + Pixabay (search image)
- [ ] Pixabay Music (search music)
- [ ] Edge TTS (synthesize VI/EN, list voices)
- [ ] Readability (extract URL) + strip emoji output
- [ ] ffmpeg concat + mix
- [ ] Hash-based cache
- [ ] `packages/shared/src/sanitize.ts` — `stripEmoji()` qua `emoji-regex`

### M3 — MCP server cho Claude (2-3 ngày)  ← **làm sớm để test risk**
- [ ] `packages/mcp-server` với `@modelcontextprotocol/sdk`
- [ ] Wrap mỗi media adapter + render thành MCP tool
- [ ] Build qua tsup ra `dist/index.js`
- [ ] `.mcp.json` ở root
- [ ] `CLAUDE.md` chi tiết
- [ ] `prompts/generate.md`, `prompts/edit.md`
- [ ] Test: `claude` ở terminal → "tạo video từ URL" → ra output.mp4

### M4 — Web Studio core (4-6 ngày)
- [ ] Next.js skeleton, `/projects`, `/projects/[id]`
- [ ] Cài `lucide-react`, dùng cho mọi icon trong Studio (Play, Trash2, Pencil, Settings, ...)
- [ ] ESLint + `eslint-plugin-no-emoji` áp `apps/studio/**`, `packages/remotion/**`, `**/*.md`
- [ ] lint-staged + husky pre-commit hook
- [ ] `<Player>` Remotion preview
- [ ] Timeline list segments, click → edit panel
- [ ] Edit text/voice/duration → ghi storyboard.json (sanitize emoji) → Player reload
- [ ] Trigger re-render (segment / full) qua `packages/render`
- [ ] Project list/delete/duplicate
- [ ] Download output.mp4

### M5 — Studio asset pickers (2-3 ngày)
- [ ] Image picker UI (search Pexels/Pixabay, preview, chọn)
- [ ] Music picker UI (mood-based, preview audio)
- [ ] Voice picker UI (list voices, preview sample)
- [ ] Drag-reorder segments

### M6 — Polish
- [ ] Subtitle burn-in từ Edge TTS word boundaries
- [ ] Aspect 16:9 / 1:1
- [ ] Export preset (TikTok 60fps, YouTube Shorts, Reels)
- [ ] Project template / duplicate
- [ ] Batch render

---

## Setup nhanh (sau khi M0 xong)

```bash
# 1. Cài Claude Code CLI và login
npm i -g @anthropic-ai/claude-code
claude login

# 2. Cài deps + build MCP server
pnpm install
pnpm --filter @news-tok/mcp-server build

# 3. Config env
cp .env.example .env
# điền PEXELS_API_KEY, PIXABAY_API_KEY

# 4. Verify Claude tìm thấy MCP tools
claude mcp list   # phải thấy "news-tok"

# 5a. Tạo video bằng Claude (terminal)
claude
> Tạo video 30s từ https://vnexpress.net/... — VI, 9:16

# 5b. Mở Studio để chỉnh
pnpm studio   # http://localhost:3000
```

---

## License

TBD — phải tương thích với Remotion license model.
