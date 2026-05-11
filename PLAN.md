# news-tok — Implementation Plan

README mô tả "cái gì"; tài liệu này mô tả "làm thế nào, theo thứ tự nào, rủi ro gì".

---

## 0. Triết lý kiến trúc (đã chốt)

**Hai nửa, không trộn:**

1. **Claude Code CLI ở terminal** — AI orchestrator. Tạo project, plan storyboard, fetch assets, render. Tự viết/sửa scene TSX khi cần.
2. **Web Studio local (Next.js)** — Editor thuần. Đọc/ghi storyboard, preview, swap assets, re-render. **Không spawn Claude.**

**Shared state**: `data/projects/<id>/storyboard.json` + filesystem.

**Hệ quả thiết kế:**
- Không có `packages/agent` (spawn Claude) — bỏ
- Không có chat UI trong Studio — bỏ
- Không có SSE streaming Claude events tới browser — bỏ
- Không có permission flags phức tạp khi spawn Claude — bỏ (Claude chạy ở terminal user-controlled)
- `packages/media` import trực tiếp trong Studio, không qua MCP
- MCP server **chỉ cho Claude CLI**

Kiến trúc đơn giản hơn plan trước rất nhiều.

---

## 1. Quyết định đã chốt

| Quyết định | Lựa chọn |
|---|---|
| Runtime | Node 20 + TypeScript 5 |
| Video render | Remotion 4 |
| Aspect | 9:16 chính, 16:9, 1:1 |
| TTS | Edge TTS (`msedge-tts`) |
| Image | Pexels + Pixabay |
| Music | Pixabay Music (chính); FMA là option M6 |
| **Icons** | **`lucide-react`** — dùng chung Studio + Remotion. **Cấm emoji.** |
| **AI** | **Claude CLI ở terminal** (không spawn từ app) |
| **AI role** | Mức 2 — Claude viết & sửa TSX |
| **TSX strategy** | Share library + per-project override |
| **Studio** | Editor thuần, không spawn Claude |
| **Studio gọi tools** | Import trực tiếp `packages/media` |
| **Project creation** | Chỉ từ Claude CLI |
| Mono-repo | pnpm workspaces |

---

## 2. Flow tổng thể

### Flow A: Tạo project mới (Claude CLI)

```
[User ở terminal]
$ cd D:/Github/news-tok
$ claude
> Tạo video 30s từ https://vnexpress.net/... — VI, 9:16

[Claude CLI]
  1. MCP: createProject({ source, language, aspect })
     → tạo data/projects/<id>/storyboard.json (rỗng)
  2. MCP: extractArticle({ url })
     → { title, text, byline }
  3. Suy nghĩ, lên storyboard JSON (4-8 segments)
  4. Edit: data/projects/<id>/storyboard.json (built-in Edit tool)
  5. Loop song song mỗi segment:
       MCP: searchImage({ query }) → asset path
       MCP: synthesizeVoice({ text, voiceId }) → mp3 path
     Edit storyboard cập nhật AssetRef
  6. MCP: searchMusic({ mood, durationSec }) → bgMusic
  7. Edit storyboard set bgMusic
  8. MCP: renderProject({ projectId })
     → data/projects/<id>/output.mp4
  9. Báo path cho user

[User]
$ pnpm studio    # mở Studio xem & chỉnh
```

### Flow B: Tinh chỉnh (Studio)

```
[Studio http://localhost:3000]
  - List projects (đọc data/projects/)
  - Mở project → <Player> preview từ storyboard.json
  - User click segment 2 → edit panel
  - User đổi text, đổi voice từ picker, đổi ảnh từ picker
  - Studio ghi storyboard.json
  - User click "Re-render segment"
  - Studio gọi packages/render → render segment mới
  - Player tự reload
  - User click "Export full" → render full + concat → download mp4
```

### Flow C: Hiệu ứng custom (quay lại Claude CLI)

```
[Studio]
  User muốn segment 2 có hiệu ứng glitch.
  → Studio không làm được (không spawn AI).
  → User mở terminal, gõ:

[Claude CLI]
> Trong project abc123, segment 2, thêm hiệu ứng glitch như Cyberpunk

  1. Read: data/projects/abc123/storyboard.json
  2. Glob: packages/remotion/scenes/*.tsx — xem scene hiện tại
  3. Read: packages/remotion/scenes/KeyPoint.tsx (scene segment 2 đang dùng)
  4. Write: data/projects/abc123/scenes/CyberpunkGlitch.tsx
       (fork từ KeyPoint, thêm chromatic aberration + RGB split)
  5. Edit: storyboard.json segment 2: scene = "CyberpunkGlitch"
  6. MCP: renderSegment({ projectId, segmentId: 2 })

[Studio] (file watcher) → reload Player → user thấy hiệu ứng mới
```

---

## 3. Mono-repo layout

```
news-tok/
├── pnpm-workspace.yaml
├── package.json                # root scripts: dev, build, studio, mcp-build
├── tsconfig.base.json
├── .env.example
├── .gitignore
├── CLAUDE.md                   # CRITICAL — hướng dẫn Claude
├── .mcp.json                   # đăng ký MCP server
├── prompts/
│   ├── generate.md             # template ghi chú cho user (không phải system prompt)
│   └── edit.md
├── apps/
│   └── studio/                 # Next.js 14
└── packages/
    ├── shared/                 # zod schemas, types
    ├── media/                  # pexels, pixabay, edge-tts, readability, ffmpeg
    ├── remotion/               # composition + library scenes
    ├── render/                 # programmatic Remotion render
    └── mcp-server/             # stdio MCP server cho Claude CLI
```

**Ghi chú**: `prompts/` ở đây không phải "system prompt được inject vào Claude" — vì Claude CLI ở terminal user-controlled, không có system prompt nào ta inject được. `prompts/` là **example prompts** user copy/paste, và content sẽ được tham chiếu từ `CLAUDE.md`.

---

## 3b. UI conventions (BẮT BUỘC)

Áp dụng cho **Studio UI**, **Remotion scenes**, **CLAUDE.md**, doc, và prompt examples.

### Icon system
- **Chỉ dùng `lucide-react`**. Không Heroicons, Tabler, Material, Font Awesome...
- `packages/shared/src/ui-tokens.ts` định nghĩa:
  ```ts
  export const ICON = { sm: 16, md: 20, lg: 24, xl: 32, strokeWidth: 1.75 } as const
  ```
- Studio import named: `import { Play } from 'lucide-react'`
- Remotion scenes import cùng package — render trong TSX với `<Play size={ICON.xl} strokeWidth={ICON.strokeWidth} />`

### Cấm emoji
- **Không emoji** ở: Studio UI, scene TSX, button label, toast, log, README, PLAN, CLAUDE.md, prompts, commit messages.
- Lý do:
  1. Emoji glyph khác nhau giữa OS → video render khác máy không nhất quán
  2. Identity dựa trên Lucide line-style — emoji color phá nhịp
  3. CLAUDE.md không emoji → Claude không học style emoji khi tự viết scene TSX
- Thay thế: Lucide icon component.

### Enforcement
- M4 thêm ESLint rule `no-emoji` (plugin `eslint-plugin-no-emoji` hoặc custom) áp vào `apps/studio/**` + `packages/remotion/**` + `**/*.md`
- M4 thêm pre-commit hook (lint-staged + husky) chạy lint trước commit
- CLAUDE.md có dòng "NEVER use emoji in any code, UI, or documentation."

### Typography
- UI Studio: Inter (`next/font`)
- Video VI: Be Vietnam Pro (`@remotion/google-fonts/BeVietnamPro`)
- Video EN: Inter (`@remotion/google-fonts/Inter`)

---

## 4. CLAUDE.md — file quan trọng nhất

Vì ta KHÔNG spawn Claude (Claude chạy interactive ở terminal), `CLAUDE.md` là cách duy nhất ta "lập trình" hành vi của Claude. Mọi convention, data model, workflow đều phải nằm đây.

Khái quát nội dung:

```markdown
# news-tok project context

You are inside the news-tok repo. Your job is to help users create short videos
from articles/text/URLs. Most actions go through MCP tools `mcp__news-tok__*`.

## Project structure
- Each project lives in `data/projects/<id>/`
- `storyboard.json` is source of truth (schema: packages/shared/src/schema.ts)
- Segments render independently then concat

## Common tasks

### Create video from URL
1. Call `createProject` with source/language/aspect
2. Call `extractArticle` to get text
3. Plan 4-8 segments (5-10s each), each with: scene type, text, voice, durationSec
4. Use Edit tool to write storyboard.json
5. For each segment, fetch image + voice in parallel
6. Pick bgMusic via `searchMusic`
7. Call `renderProject`
8. Report final path

### Edit existing segment
- Param change (text, voice, duration, swap image): Edit storyboard.json,
  then `renderSegment`
- New visual effect: see "Custom scene" below

### Custom scene
When user asks for a visual effect not in the library:
1. Glob `packages/remotion/scenes/*.tsx` to see available scenes
2. Read the closest matching one
3. Write a forked version to `data/projects/<id>/scenes/<Name>.tsx`
4. Edit storyboard segment.scene = "<Name>"
5. `renderSegment`

## Conventions
- Default voice VI: vi-VN-HoaiMyNeural
- Default voice EN: en-US-AriaNeural
- Default aspect: 9:16, 30fps, 1080x1920
- Always validate storyboard against zod schema before render
- Prefer Pixabay for music (no attribution); Pexels for images
- Cache via `searchImage` / `searchMusic` returns local path

## UI rules (STRICT)
- NEVER use emoji anywhere — not in scene TSX, not in storyboard text fields,
  not in console output, not in commit messages.
- For any iconography in scenes, use `lucide-react` components (e.g. <Play />,
  <Mic />, <Image />). Sizes from `packages/shared/src/ui-tokens.ts`.
- Be Vietnam Pro for Vietnamese text; Inter for English text.

## Output
Always end your turn by reporting the absolute path to output.mp4
```

File này sẽ được fine-tune liên tục trong M3. **Một dòng sai → Claude làm sai.**

---

## 5. Milestone breakdown

### M0 — Workspace setup (~1 ngày)

1. `pnpm init`, `pnpm-workspace.yaml` (`apps/*`, `packages/*`)
2. `tsconfig.base.json` (`strict: true`, path aliases `@news-tok/*`)
3. Skeleton mỗi package + `apps/studio`
4. `.env.example`:
   ```
   PEXELS_API_KEY=
   PIXABAY_API_KEY=
   # KHÔNG set ANTHROPIC_API_KEY — sẽ làm Claude CLI chuyển sang API billing
   ```
5. `.gitignore`: `data/`, `node_modules/`, `.env`, `*.mp4`, `dist/`, `.next/`
6. `packages/shared/src/schema.ts` — zod (Project, Segment, AssetRef, EffectSpec)
6b. `packages/shared/src/ui-tokens.ts` — `ICON` constants (sm/md/lg/xl + strokeWidth)
7. Verify Claude CLI:
   ```bash
   claude --version
   claude -p "hello"   # confirm sub Pro/Max
   ```
8. Tạo `CLAUDE.md` placeholder (skeleton, sẽ fill ở M3)
9. Tạo `.mcp.json` placeholder

**Exit**: `pnpm -r build` thành công với package rỗng. `claude -p "hello"` chạy bằng sub.

### M1 — Remotion render core (~3-5 ngày)

1. `packages/remotion/src/Root.tsx` — register compositions
2. `compositions/NewsTok916.tsx` — props `{ storyboard: Storyboard }`, render từng segment qua `<Sequence>`
3. `scenes/TitleCard.tsx`, `scenes/KeyPoint.tsx`, `scenes/Outro.tsx` — built-in. Sử dụng Lucide icons cho mọi visual icon (Play, Mic, Tag...). Không dùng emoji.
4. `effects/kenBurns.ts`, `effects/typewriter.ts`
5. **Dynamic scene resolver**: composition đọc `segment.scene`:
   - Tên built-in → import từ library
   - Tên custom → lookup `data/projects/<projectId>/scenes/<Name>.tsx`
   - Implement qua dynamic map gen tại build time (`packages/remotion` có script gen scene-map per-project)
6. `packages/render/src/renderSegment.ts` — `bundle` + `selectComposition` + `renderMedia`
7. `packages/render/src/renderFull.ts` — render all segments + ffmpeg concat
8. CLI test: `pnpm tsx packages/render/scripts/smoke.ts`

**Risks**:
- **Dynamic scene loading + Remotion bundle là static** → mỗi project có custom scene phải re-bundle. Cache bundle theo hash danh sách scene. Per-project bundle là chấp nhận được vì user không tạo project mới mỗi phút.
- Font tiếng Việt: `@remotion/google-fonts/BeVietnamPro`. Test sớm.

**Exit**: render 15s video 9:16 từ storyboard hardcode, text VI có dấu đúng, scene custom hoạt động.

### M2 — Media adapters (~2-3 ngày)

1. `packages/media/src/cache.ts` — hash-based: `key = sha256(JSON.stringify(args))` → file path
2. `pexels.ts` — `searchImage({ query, orientation? })` → download, return cache path
3. `pixabay.ts` — `searchImage()` fallback + `searchMusic({ mood, durationSec })`
4. `edge-tts.ts` — `synthesize({ text, voiceId, speed })`, `listVoices(language)`
5. `readability.ts` — `extract(url) → { title, text, byline, excerpt }`
6. `ffmpeg.ts`:
   - `concat(paths[], out)` — concat demuxer
   - `mixAudio({ video, narration, bgMusic, bgVolume })` — `-filter_complex amix`
   - `ffmpeg-static` + `execa`
7. Mọi adapter expose **plain TS function** (không phụ thuộc MCP) — Studio import được trực tiếp
8. **`packages/shared/src/sanitize.ts`**:
   - `stripEmoji(text: string): string` — regex unicode emoji range
   - `readability.ts` chạy text qua `stripEmoji` trước khi return
   - Studio API `PATCH /api/projects/[id]` cũng strip emoji segment.text trước khi save

**Risks**:
- Edge TTS flaky → retry 2x với jitter
- ffmpeg concat cần input cùng codec → ép Remotion preset cố định (h264, yuv420p, 30fps)
- Emoji unicode range thay đổi theo Unicode version → dùng lib `emoji-regex` thay vì tự regex

**Exit**: 5 adapter chạy độc lập từ CLI script, output đúng cache path.

### M3 — MCP server cho Claude (~2-3 ngày)  ← **CRITICAL, làm song song với M1/M2**

Đây là phần unknown nhất; nên test sớm.

1. `packages/mcp-server/`:
   - `package.json` với `bin: { "news-tok-mcp": "./dist/index.js" }`
   - Dùng `@modelcontextprotocol/sdk` (TypeScript official)
   - Register tools với zod schema:
     - `createProject({ source, language, aspect })` → `{ projectId, path }`
     - `listProjects()` → array
     - `extractArticle({ url })`
     - `searchImage({ query, orientation? })`
     - `searchMusic({ mood, durationSec })`
     - `synthesizeVoice({ text, voiceId, speed? })`
     - `listVoices({ language })`
     - `renderSegment({ projectId, segmentId })`
     - `renderProject({ projectId })`
   - Mỗi handler try/catch → return MCP error response chuẩn
2. Build qua **tsup** ra `dist/index.js`
3. `.mcp.json` ở root:
   ```json
   {
     "mcpServers": {
       "news-tok": {
         "type": "stdio",
         "command": "node",
         "args": ["./packages/mcp-server/dist/index.js"],
         "env": {}
       }
     }
   }
   ```
4. Viết `CLAUDE.md` chi tiết (xem section 4)
5. Viết example prompts trong `prompts/`:
   - `generate.md` — paste template "Tạo video <duration>s từ <URL/text> — <language>, <aspect>"
   - `edit.md` — paste template các action chỉnh sửa hay dùng
6. Test thủ công:
   ```bash
   claude mcp list                             # phải thấy "news-tok"
   claude
   > List Vietnamese voices                    # test listVoices
   > Create a test project from this text:...  # test createProject + flow
   ```

**Risks**:
- MCP tool schema sai → Claude không gọi. Test từng tool riêng.
- Tool handler crash → return error, không die.
- Claude có thể gọi tool sai thứ tự → CLAUDE.md phải nêu rõ flow.

**Exit**: `claude` interactive → 1 lệnh tự nhiên → ra output.mp4 valid.

### M4 — Web Studio core (~4-6 ngày)

1. Next.js 14 app trong `apps/studio/`
2. Routes:
   - `/` — landing
   - `/projects` — list (scan `data/projects/`)
   - `/projects/[id]` — editor
3. Editor layout:
   - Top: project title, save indicator, "Render full" button
   - Left: timeline (segments list, drag-reorder, click to select)
   - Center: `<Player>` Remotion (auto-reload khi storyboard.json đổi qua file watcher)
   - Right: edit panel cho segment đang chọn
     - text (textarea)
     - voice (dropdown — list từ Edge TTS qua API call)
     - duration (slider)
     - swap image (button → open AssetPicker modal)
     - swap bg music (project-level)
4. API routes (Next App Router, runtime `nodejs`):
   - `GET /api/projects` — list
   - `GET /api/projects/[id]` — read storyboard
   - `PATCH /api/projects/[id]` — write storyboard (validate qua zod)
   - `POST /api/projects/[id]/render?scope=segment|full&segmentId=...` — gọi `packages/render`
   - `GET /api/voices?lang=vi` — list voices
   - `GET /api/search/image?q=...` — search Pexels/Pixabay (proxy, không expose key tới browser)
   - `GET /api/search/music?mood=...&duration=...`
5. **File watcher**: studio nghe `data/projects/<id>/storyboard.json` qua `chokidar` → SSE → reload Player. Đảm bảo khi Claude edit từ terminal, Studio thấy ngay.
6. Render queue: `data/projects/<id>/.job.json` ghi trạng thái — đủ cho v1
7. Project list: scan filesystem, không cần DB
8. Delete/duplicate: thuần filesystem ops
9. **Icon system**:
   - Cài `lucide-react` ở `apps/studio`
   - Mọi icon trong Studio import named từ `lucide-react`, size lấy từ `packages/shared/src/ui-tokens.ts`
   - **Không dùng emoji** ở button label, toast, log
10. **ESLint setup**:
    - Cài `eslint-plugin-no-emoji` (hoặc viết custom rule simple với regex unicode emoji range)
    - Áp dụng `apps/studio/**`, `packages/remotion/**`, `**/*.md`
    - lint-staged + husky pre-commit hook chạy `eslint --max-warnings 0`

**Risks**:
- `<Player>` cần bundle Remotion code chạy browser → `packages/remotion` cần export dual (Node + browser). Test sớm.
- File watcher có race condition khi Studio + Claude cùng write — Studio ghi tạm vào `.tmp` rồi atomic rename.
- API routes runtime: phải `export const runtime = 'nodejs'` (không edge) vì dùng `fs`.

**Exit**: User flow đầy đủ — list project → mở editor → edit text/voice → re-render segment → preview → export mp4.

### M5 — Studio asset pickers (~2-3 ngày)

1. **Image picker**: modal search bar → query Pexels/Pixabay qua API → grid thumbnails → click chọn → set `segment.visuals.background`
2. **Music picker**: mood selector (chill, energetic, dramatic, news...) + duration filter → list thumbnails với audio preview button → chọn → set `bgMusic`
3. **Voice picker**: list voices theo language → button preview (synthesize "Xin chào" hoặc "Hello") → chọn → set `segment.voice`
4. **Drag-reorder**: dnd-kit (react), update storyboard.segments array, re-render full

**Exit**: Mọi swap asset làm được qua UI; không cần terminal trừ khi user muốn hiệu ứng custom.

### M6 — Polish

- Subtitle burn-in từ Edge TTS word boundaries (option toggle)
- Aspect 16:9 / 1:1
- Export preset
- Project duplicate / template
- Batch render

---

## 6. Risk register

| Risk | Mức | Mitigation |
|---|---|---|
| `ANTHROPIC_API_KEY` env override → tính tiền API | **Cao** | Document rõ trong README; thêm script check `pnpm doctor` warn nếu env có |
| Edge TTS bị Microsoft block | Cao | Adapter pattern ở M2 (interface + 1 impl); Piper fallback impl đẩy về M6 nếu cần |
| MCP tool schema/contract sai | Cao | Test từng tool riêng từ M3; viết `CLAUDE.md` cẩn thận |
| Claude "đi lạc" — gọi sai tool, vòng lặp | Trung | `CLAUDE.md` nêu rõ flow; user có thể Ctrl-C ở terminal |
| Custom scene TSX → cần re-bundle Remotion | Trung | Cache bundle theo hash scene list; per-project bundle OK |
| File watcher race (Claude + Studio cùng ghi) | Trung | Atomic write (tmp + rename); Studio ghi qua API duy nhất |
| `<Player>` không render được scene Node-only | Trung | Đảm bảo `packages/remotion` browser-safe; test sớm ở M4 |
| Vietnamese font sai | Trung | Test ở M1 |
| Pexels/Pixabay rate limit | Trung | Cache aggressive |
| ffmpeg codec mismatch | Thấp | Ép preset cố định |
| Remotion license team > 3 | Thấp | Tool cá nhân, document rõ |
| Emoji lọt vào video qua text bài báo / user input | Trung | Sanitize storyboard segment text — strip emoji unicode range trước khi render. Implement ở `packages/shared/src/sanitize.ts`, gọi tại boundary nhập/save. |
| Claude vô tình viết emoji vào scene TSX | Trung | CLAUDE.md có dòng "NEVER use emoji"; ESLint rule chặn pre-commit; `packages/remotion/scenes/*.tsx` review trong M3 |

---

## 7. Quyết định mở (chốt theo milestone)

- **M1**: Font default (đề xuất Be Vietnam Pro cho VI, Inter cho EN — đã chốt)
- **M1**: Dynamic scene loading (đề xuất per-project bundle với cache hash)
- **M2**: Cache TTL (đề xuất forever, hash-based)
- **M3**: Tool naming (đề xuất `mcp__news-tok__verbNoun`)
- **M4**: File watcher → realtime push (SSE) hay polling? (đề xuất SSE)
- **M4**: ESLint plugin chính xác cho cấm emoji — chốt khi setup (`eslint-plugin-no-emoji` vs custom)
- **M6**: Subtitle hard-burn hay .srt? (đề xuất cả 2)

---

## 8. Câu hỏi cho user

1. Chỉ chạy Windows local, hay sẽ deploy Docker/Linux sau? (ảnh hưởng `ffmpeg-static` binary)
2. Có muốn ship Electron/Tauri package sau M6 không?
3. Sub Pro/Max của bạn có lo rate limit không? (sub Max quota cao hơn nhiều)

---

## 9. Bắt đầu từ đâu?

**Thứ tự đề xuất:**

1. **M0** (1 ngày) — setup
2. **M1 + M2 + M3 song song** (gần như độc lập) — đặt deadline ~1 tuần:
   - M1: Remotion render + scenes mẫu
   - M2: Media adapters
   - M3: MCP server + CLAUDE.md (cần M2 done để wrap)
3. End-to-end terminal flow chạy được trước khi đụng Studio
4. **M4** (4-6 ngày) — Web Studio core
5. **M5** (2-3 ngày) — Asset pickers
6. **M6** — polish theo nhu cầu

Lý do làm M3 sớm: cần test giả thuyết "Claude CLI orchestrator" thật sự work với MCP custom của ta. Nếu M3 fail, kiến trúc phải đổi → tốt hơn biết sớm.

Trong khi chờ duyệt plan, không code gì — chỉ setup M0 skeleton nếu user confirm.
