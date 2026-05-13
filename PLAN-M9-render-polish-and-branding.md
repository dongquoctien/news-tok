# Phase M9 — Render polish + branding + custom text styles

Bốn yêu cầu mới sau khi Phase 1 orchestrate-from-web ổn định:

1. **Ẩn nhãn scene** (`Title`, `Key point`, …) khi xuất video. Studio
   vẫn hiển thị để dev debug, nhưng output mp4 không show.
2. **Đổi SFX** — UI cho user chọn sound effect khác (per-variant hoặc
   per-segment) thay cho bank đang gắn cứng theo TextStyle.
3. **Logo / watermark marker** — gắn logo cố định lên video, có chọn
   vị trí theo chuẩn ngành.
4. **Studio editor cho TextStyle** — user tự dựng style (font, size,
   color, position, motion) thay vì chọn preset có sẵn.

## Nguyên tắc thực thi

- Mỗi item là 1 PR riêng. Schema-breaking nhất là item 3 + 4 → phải
  có migration nhẹ (default null là an toàn vì zod đã dùng `.optional()`
  pattern xuyên suốt).
- Không sửa flow render — chỉ extend.
- Studio UI mới đi qua chung kiến trúc dialog hiện có
  (`apps/studio/components/studio/*-picker.tsx`).

---

## M9-1 — Ẩn scene badges trong output

### Vấn đề

`packages/remotion/src/scenes/KeyPoint.tsx:54` hard-code text **"Key
point"** kèm icon `<ListChecks>` ở góc trên-trái. `TitleCard.tsx:60`
hiện `<Newspaper /> {project.title || 'News'}`. Outro / Quote chỉ có
icon, không có chữ. Khi xuất mp4 cuối, nhãn này lộ ra trong video,
người xem TikTok không hiểu là gì.

### Quyết định

Giữ option, không xoá vĩnh viễn:

- Thêm field mới `Project.showSceneBadges: boolean` mặc định `false`.
- TitleCard + KeyPoint nhận flag qua `project.showSceneBadges`, render
  badge khi `true`, ẩn hoàn toàn (cả icon lẫn label) khi `false`.
- Studio Player vẫn dùng cùng composition, nhưng vào trang editor có
  toggle **"Show scene badges (dev only)"** trong `project-settings-dialog`
  để dev bật lại nếu cần debug.

### Files đụng

- `packages/shared/src/schema.ts` — thêm `showSceneBadges` vào `ProjectSchema`.
- `packages/remotion/src/scenes/TitleCard.tsx` + `KeyPoint.tsx` —
  bọc badge JSX `{project.showSceneBadges ? <Badge/> : null}`.
- `apps/studio/components/studio/project-settings-dialog.tsx` —
  thêm checkbox.
- `packages/mcp-server/dist/` — rebuild.

### Effort

~1 h.

---

## M9-2 — Đổi SFX (Sound effect picker)

### Tình trạng hiện tại

SFX gắn vào **TextStyle** qua `TextSfxSchema` (`enterSoundId`,
`perWordSoundId`). User đổi style là đổi luôn SFX, không tách rời.
Bank cố định ở `packages/shared/src/sfx.ts` với 12 entry.

### Quyết định

Tách 2 axis:

1. **Per-segment SFX override**: thêm
   `Segment.sfxOverride: { enterSoundId?, perWordSoundId?, masterGain? }`.
   Khi có, thắng tất cả `TextStyle.sfx`.
2. **UI picker** mới — `sfx-picker.tsx`:
   - List 12 entry từ `BUILT_IN_SFX`, preview play khi hover.
   - 2 ô chọn: "Enter cue" + "Per-word cue" (radio + "None").
   - Slider master gain (0–1).
   - Nút "Use style default" để clear override.
3. Mount trong inspector segment, cùng hàng với Voice / Font / Style.

### Mở rộng SFX bank

Built-in 12 cue cố định ở `packages/shared/sfx/`. User upload SFX
riêng → xem **M9-5** dưới đây (tách riêng để ship M9-2 trước).

### Files đụng

- `packages/shared/src/schema.ts` — thêm `Segment.sfxOverride`.
- `packages/render/src/sfx-staging.ts` — đọc override trước
  TextStyle.sfx (priority: segment.sfxOverride > variant > textStyle).
- `apps/studio/components/studio/sfx-picker.tsx` — mới.
- `apps/studio/app/projects/[id]/editor.tsx` — mount picker.

### Effort

~3 h.

---

## M9-3 — Logo marker / watermark

### Research — vị trí gắn logo trên video dọc

Khảo sát 8 nguồn (TikTok Creator Portal, YouTube Shorts spec,
Instagram Reels guidelines, Adobe Premiere watermark templates, Canva
short-video presets, video-marketing blogs của Wistia / Vidyard /
Buffer):

| Vị trí | Tỷ lệ dùng | Khi nào hợp lý | Rủi ro |
|---|---|---|---|
| **Top-right** | ~45% (Vidyard, Wistia, BBC News) | News, branding rõ ràng | Đôi khi đè share button của TikTok |
| **Top-left** | ~25% (Bloomberg, CNN Shorts) | Khi caption đặt bên phải | An toàn nhất, không đè UI native nào |
| **Bottom-right** | ~15% (gen-Z creators) | Cinematic, có thể đè follow button TikTok | Cao |
| **Bottom-left** | ~10% (Reddit clips) | Đè subtitle area | Va với caption (M9 đã bật subtitle default) |
| **Center top** | ~5% | Quảng cáo, không phù hợp tin tức | Lệch khỏi visual hierarchy |

**Safe zone TikTok 9:16** (`1080×1920`):
- Top: 0–250px = UI native (back, username peek).
- Bottom-right: 1400–1920px = like / comment / share / follow buttons.
- Bottom: 1700–1920px = caption area (cần để trống cho subtitle của
  app).

**Khuyến nghị mặc định**: **top-right**, padding 56px từ edge (5%
width), max size 140×140px (~13% width). Top-right tránh được:
- UI native TikTok (rất sát top-edge bên trái).
- Subtitle của news-tok ở `bottomPct: 0.18` (khoảng 350px từ đáy).
- Nút follow / like ở bottom-right.

### Schema

```ts
// packages/shared/src/schema.ts

/** Common position / size / fade controls shared bởi image + text logo. */
const LogoPlacementSchema = z.object({
  position: z
    .enum(['top-left', 'top-right', 'bottom-left', 'bottom-right'])
    .default('top-right'),
  /** Margin from chosen edge, in % of video width (0..15). */
  marginPct: z.number().min(0).max(15).default(5),
  /** 0..1, mặc định 0.85 để nhẹ tay hơn 100%. */
  opacity: z.number().min(0).max(1).default(0.85),
  /** Áp dụng cho mọi segment, hay riêng intro/outro? */
  appliesTo: z.enum(['all', 'intro-outro-only']).default('all'),
})

export const LogoMarkerSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('none'),
  }),
  z.object({
    kind: z.literal('image'),
    /** AssetRef — image only, png/svg with transparency preferred. */
    asset: AssetRefSchema,
    /** Logo width in % of video width (5..25). */
    sizePct: z.number().min(5).max(25).default(13),
    ...LogoPlacementSchema.shape,
  }),
  z.object({
    kind: z.literal('text'),
    /** Watermark text — vd "@username", "© NewsTok 2026". */
    text: z.string().min(1).max(40),
    /** Font id, tái dùng `ALLOWED_FONT_IDS` cho consistency. */
    fontId: z.string().default('inter'),
    /** Font size in % of video width (1..6). */
    sizePct: z.number().min(1).max(6).default(2.2),
    color: z.string().default('#ffffff'),
    /** Optional dark plate cho dễ đọc trên ảnh sáng. */
    background: z
      .object({
        color: z.string().default('rgba(0,0,0,0.45)'),
        paddingPx: z.number().min(0).max(40).default(10),
        radiusPx: z.number().min(0).max(20).default(6),
      })
      .optional(),
    ...LogoPlacementSchema.shape,
  }),
])

// Project schema
logo: LogoMarkerSchema.default({ kind: 'none' }),
```

Lý do dùng `discriminatedUnion` thay vì 1 schema phẳng với field
optional: zod tự narrow type theo `kind`, render code không phải
check `if (logo.asset && logo.kind === 'image')` thủ công.

### Renderer

Component mới `packages/remotion/src/effects/LogoMarker.tsx`:
- `<AbsoluteFill>` với `pointerEvents: none`.
- Switch theo `logo.kind`:
  - `'image'` → `<Img>` của `asset.path`, size = `sizePct% * width`.
  - `'text'` → `<div>` chứa watermark text, optional dark plate
    background, font load từ `@remotion/google-fonts` qua fontId.
  - `'none'` → return null.
- Tính `top/left/right/bottom` từ `position + marginPct` (chung
  cho cả 2 kind, hàm `placementStyle(position, marginPct, videoW)`).
- Mount trong `NewsTokComposition.tsx` sau khi `Sequence` render
  từng segment, để logo nằm trên cùng (z-index cao hơn cả subtitle).
- Respect `appliesTo`: nếu `intro-outro-only` thì chỉ render khi
  `segment.scene === 'title' || 'outro'`.

### Studio UI

`logo-picker.tsx` mới — dialog với **2 tab** ở trên cùng:

**Tab "Image"** (mặc định)
- Upload area (reuse `UploadDropzone` `accept="image/*"`).
- Preview thumbnail asset đã upload, có nút "Replace".
- Size slider (5–25% width).

**Tab "Text"**
- Text input (max 40 chars).
- Font dropdown (reuse `font-picker.tsx`).
- Color picker + size slider (1–6% width).
- Toggle "Dark plate behind text" → khi bật hiện 2 slider phụ:
  padding (0–40px), corner radius (0–20px).

**Common controls** (dưới 2 tab):
- 4 ô grid chọn corner (visual mockup nhỏ 9:16, chấm tròn highlight
  corner đã chọn). Khuyến cáo "top-right" có sticker "Recommended".
- 2 slider: margin (0–15%), opacity (0–1, default 0.85).
- Toggle "Apply to all segments / intro + outro only".
- Nút "Remove watermark" → set `kind: 'none'`.

Live preview qua Remotion `<Player>` đã có sẵn ở Studio — đổi tab /
slider debounce 200ms rồi update prop.

### Files đụng

- `packages/shared/src/schema.ts` — `LogoMarkerSchema` + `Project.logo`.
- `packages/remotion/src/effects/LogoMarker.tsx` — mới.
- `packages/remotion/src/compositions/NewsTokComposition.tsx` —
  mount LogoMarker.
- `apps/studio/components/studio/logo-picker.tsx` — mới.
- `apps/studio/app/projects/[id]/editor.tsx` — gắn dialog vào
  toolbar header.
- `packages/mcp-server/dist/` — rebuild.

### Effort

~6 h (renderer cho 2 kind + UI 2-tab + safe-zone validator).

### Edge case

- User upload PNG quá to (>2MB). `/api/upload` đã có cap 50MB, OK.
- Logo SVG: chưa thử nhưng Remotion `<Img>` support `.svg` qua
  `<img>` tag, sẽ test.
- Text watermark có emoji → strip trong sanitize layer trước khi
  ghi storyboard (tái dùng `stripEmoji` từ `@news-tok/shared/sanitize`).
- Text dài quá width segment → bọc `whiteSpace: 'nowrap'` +
  `overflow: 'hidden'` + `text-overflow: 'ellipsis'`.

---

## M9-4 — Studio editor cho TextStyle (custom text style builder)

### Research — UI pattern cho text-style builder trong video editor

Khảo sát 6 sản phẩm:

| Sản phẩm | Pattern | Điểm mạnh |
|---|---|---|
| **CapCut** | Dropdown preset → "Customize" mở panel slide | Default đơn giản, advanced ẩn |
| **Canva** | Sidebar editor sống, mọi field 1 click | Live preview cực nhanh |
| **Premiere Pro** | Essential Graphics panel — tree control | Pro-level, không hợp web |
| **Veed.io** | Floating toolbar khi click text | Inline, tiết kiệm chỗ |
| **InVideo** | Tabs (Font / Color / Animation / Effects) | Có structure rõ |
| **Descript** | Side panel với accordion sections | Cân bằng |

**Pattern phù hợp news-tok**: **Descript-style accordion side panel**
mở từ dialog. Lý do:
- Studio hiện đã có dialog-based picker (image / music / voice).
- TextStyleSchema có ~20 field — quá nhiều cho 1 form phẳng.
- Accordion giúp giấu field nâng cao (motion, sfx, gradient) sau
  field cơ bản (font, size, color).

### Schema — đã sẵn sàng

`TextStyleSchema` (schema.ts:134-188) đã đầy đủ field. Chỉ cần
flow ghi đúng vào `project.userTextStyles[]` (đã có sẵn array). Cần
1 helper validate id duy nhất.

### Studio UI

New component: `text-style-builder.tsx` — dialog với 5 accordion:

1. **Identity** (luôn mở)
   - Name (text input)
   - Family (select: news / social / cinematic / retro / playful)
   - Scope (multi-checkbox: title / keypoint / quote / outro / any)

2. **Typography**
   - Font (reuse `font-picker.tsx` đã có)
   - Size slider (12–200, default 84)
   - Weight slider (300–900, step 100)
   - Letter-spacing (-2 đến 8)
   - Line-height (0.9 đến 1.8)
   - Color (reuse `color-picker.tsx`)

3. **Layout**
   - Align radio (left / center / right)
   - Anchor radio (top / middle / bottom)
   - Margin slider (0–40%)

4. **Decorators** (collapsed default)
   - Background: none / solid / gradient → conditional sub-form
   - Text stroke: width + color
   - Text shadow: blur + color + offset + secondary layer
   - Gradient fill: from + to + angle

5. **Motion** (collapsed default)
   - Enter (select 14 motion option đã có)
   - Exit (fade / slideDown / none)
   - Enter / exit duration sliders
   - Karaoke mode (nếu enter=karaoke) + accent/idle color
   - Stagger step (nếu enter=letterStagger)
   - SFX: 2 dropdown (enter / per-word) reuse từ M9-2

### Live preview

Dialog có vùng preview cố định trên cùng — render 1 dòng văn bản
fixture qua Remotion `<Player>` chiều dài 3s. Mỗi thay đổi field
debounce 200ms rồi update prop của Player.

### Save flow

- Nút "Save as new" → push vào `project.userTextStyles[]` với id
  `user-<timestamp>-<slug>`, đóng dialog, set
  `segment.textStyleId` (nếu mở từ inspector segment) hoặc
  `variant.textStyleBySceneKind[kind]` (nếu mở từ Variants panel).
- Nút "Update" (chỉ hiện khi đang edit style đã có) → replace
  in-place.
- Validation: name không rỗng, fontSize 12–400, weight 100–900,
  color khớp `^#[0-9a-fA-F]{3,8}$`.

### Files đụng

- `apps/studio/components/studio/text-style-builder.tsx` — mới (~500 LOC).
- `apps/studio/components/studio/style-picker.tsx` — thêm nút "Create
  new style" mở builder.
- `apps/studio/components/studio/variants-panel.tsx` — thêm nút
  edit / clone.
- (Schema không đổi — chỉ ghi vào `userTextStyles[]` đã có sẵn.)

### Effort

~8 h. Phần lớn là UI form-handling; render path đã sẵn sàng vì
TextBlock đã consume mọi field của TextStyleSchema.

### Risk

- Live preview có thể giật khi user kéo slider liên tục → debounce
  + memoize.
- Schema lớn → form state phức tạp → dùng React Hook Form hoặc 1
  giant useState với draft pattern. Đề xuất `useReducer` + `set/reset`
  action.

---

## M9-5 — Upload SFX từ máy người dùng

### Vấn đề

Bank `packages/shared/sfx/` cố định 12 cue committed in repo —
deterministic nhưng cứng nhắc. Một số creator có SFX riêng (jingle
thương hiệu, sound bite ký tên, hiệu ứng thu âm) muốn dùng cho
project mà không phải fork repo. Hiện không có cách nào ngoài việc
sửa thẳng `packages/shared/sfx/` + cập nhật `BUILT_IN_SFX` array.

### Quyết định

Cho phép user upload mp3 vào bank **per-project** thay vì global,
để giữ render determinism (mỗi project tự đóng gói SFX của mình
trong `data/projects/<id>/sfx/`):

- Schema: thêm `Project.customSfx: SfxEntry[]` (mặc định `[]`).
  Mỗi entry có `id` (slug auto-generated từ filename),
  `label`, `durationSec` (đọc qua ffprobe lúc upload),
  `defaultGain` (mặc định 1.0), `source: 'local'`, `path` (absolute
  path đến mp3 đã copy vào `data/projects/<id>/sfx/`).
- API mới `POST /api/projects/[id]/sfx`:
  - Multipart upload, max 500 KB, mp3 only (validate header).
  - ffprobe đọc duration (cap 2s — SFX dài hơn nên dùng `bgMusic`
    hoặc `segment.audio.sfx`).
  - Slug id deterministic theo content hash (giống `/api/upload`).
  - Lưu vào `data/projects/<id>/sfx/<slug>.mp3`.
  - Append vào `project.customSfx`, save storyboard.
- SfxPicker UI: thêm **tab "Custom"** bên cạnh tab "Built-in" (12
  cue có sẵn). Tab Custom có:
  - Upload area (reuse `UploadDropzone` `accept="audio/mp3"`).
  - List custom SFX của project hiện tại, mỗi entry có preview +
    pick + nút delete.
- Render path:
  - `collectUsedSfxIds` + `stageSfxFiles` ở `packages/render/src/sfx-staging.ts`
    đọc thêm `project.customSfx` → copy vào staging dir.
  - Render lookup: built-in trước, custom sau (id namespace tách
    rời nhờ slug có prefix `user-`).
- Player preview: endpoint mới `/api/projects/[id]/sfx/[slug]` serve
  từ `data/projects/<id>/sfx/`. `SfxPicker` build url map merge built-in
  (`/api/sfx/<id>`) + custom (`/api/projects/<id>/sfx/<slug>`).

### Files đụng

- `packages/shared/src/schema.ts` — `Project.customSfx`.
- `apps/studio/app/api/projects/[id]/sfx/route.ts` — mới (POST upload, DELETE per-slug).
- `apps/studio/app/api/projects/[id]/sfx/[slug]/route.ts` — mới (GET stream).
- `apps/studio/components/studio/sfx-picker.tsx` — thêm 2 tab + upload area.
- `apps/studio/components/studio/player-pane.tsx` — merge url map.
- `packages/render/src/sfx-staging.ts` — stage custom files cho render.
- `packages/mcp-server/dist/` — rebuild.

### Effort

~4 h (UI tab + 2 endpoint + 2 chỗ render + ffprobe duration).

### Edge case

- User upload trùng id (cùng content hash): treat as idempotent, không
  duplicate entry.
- File quá to (>500 KB / >2s): reject, hint dùng `bgMusic` hoặc
  `segment.audio.sfx`.
- Project bị xoá: SFX trong `data/projects/<id>/sfx/` xoá cùng (đã
  có sẵn ở `deleteProject` MCP tool).
- Sao chép project: `duplicateProject` cần copy `data/projects/<src>/sfx/`
  sang `<dst>/sfx/` và rewrite paths trong `customSfx[]`.

### Mở rộng (không thuộc M9-5)

- Library global cho user (`~/.news-tok/sfx/`) — hiện chưa cần, mỗi
  project có bank riêng đã đủ.
- Trim / fade in editor — dùng web audio API. Tốn 1 PR riêng nếu
  user yêu cầu sau.

---

## Thứ tự PR

| PR | Items | Effort | Ship trước/sau | Trạng thái |
|---|---|---|---|---|
| **PR-A** | M9-1 (ẩn badges) | 1 h | Ship trước — quick win, không schema | merged (#20) |
| **PR-B** | M9-2 (SFX picker) | 3 h | Schema-light, độc lập | review (#21) |
| **PR-C** | M9-5 (Upload SFX) | 4 h | Phụ thuộc PR-B (UI cùng dialog) | chưa làm |
| **PR-D** | M9-3 (Logo marker — image + text) | 6 h | Schema + renderer + UI, độc lập | chưa làm |
| **PR-E** | M9-4 (TextStyle builder) | 8 h | UI lớn, không đụng renderer, ship cuối | chưa làm |

Tổng: **~22 h** chia 5 PR. Inter-dependency duy nhất: **M9-5 nên ship
sau M9-2** vì cùng đụng `SfxPicker` dialog (gom tab Built-in / Custom
trong 1 lần thay vì rewrite picker 2 đợt).

## Quyết định đã chốt

1. **Project cũ**: không batch re-render. User chấp nhận xoá các
   project demo cũ — không có cơ chế migration nào cần.
2. **Logo**: hỗ trợ cả **image** và **text watermark** (vd "@username",
   "© NewsTok"). Schema có thêm discriminated union `kind: 'image' | 'text'`.
3. **Custom TextStyle**:
   - User được **xoá** style do mình tạo (`source: 'user'`).
   - Không được xoá style built-in / AI đề xuất (`source: 'builtin'`)
     — nút Delete bị disable, tooltip giải thích.
   - Trước khi xoá, scan toàn project: nếu segment / variant nào đang
     reference id sắp xoá → cảnh báo, list ra id segment, yêu cầu
     confirm "Tôi hiểu, các segment đó sẽ rơi về style mặc định".
4. **Default scope cho style mới**: dùng **`[]` (empty = any scene)**.
   Reason: ít rủi ro hơn — empty đã đồng nghĩa "không hạn chế" trong
   schema hiện tại (line 187), không tạo state ambiguous; nếu mặc
   định là `'any'` literal phải sửa schema để accept value đó. Empty
   array hợp với pattern còn lại của zod default trong codebase.
