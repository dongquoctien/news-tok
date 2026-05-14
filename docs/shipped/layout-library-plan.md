# Plan: Layout Library — package độc lập, video pipeline chỉ lookup

> Status: proposal — chưa code. Mục tiêu: tách phần "thiết kế cách bày khung hình" thành **một product độc lập** với MCP tool riêng. User build layout library lúc nào tuỳ thích; flow paste-link-→-video chỉ **lookup** layout phù hợp từ pool, không sinh code mới, không round-trip generation.

> Quyết định đã chốt với user (2026-05-13):
> - **Layout đa dạng, không ràng buộc design system** — pool layout tự do, user mix per-segment.
> - **`eyebrow + chips + fileId` là field schema rõ ràng** — user sửa được trong Studio, không sinh ngầm.
> - **Tách layout thành package độc lập** — MCP tool riêng tạo/sửa/xoá; flow video chỉ đọc.
> - **Pool mặc định**: ship 11 built-in P0 (`fullBleed`, `card`, `polaroid`, `splitVertical`, `browserWindow`, `phoneMockup`, `magazineCover`, `neonFrame`, `gradientMeshHero`, `statHero`, `dossierCard`) → pool không bao giờ trống.
> - **`createLayout` nhận text brief + 0-N ảnh reference** → khớp flow "share screenshot YupVid" tự nhiên.
> - **Toàn cục `data/layouts/`** — 1 lần tạo, mọi project dùng. Storyboard chỉ chứa `layoutId: string` (pointer).

## 0. Bối cảnh

- Render pipeline = Remotion bundle React → Chromium headless screenshot frame → ffmpeg encode (`packages/render/src/render.ts`). Chromium chạy đầy đủ HTML/CSS → bất cứ design nào web làm được, render được.
- Hiện 100% segment dùng **1 layout duy nhất**: ảnh full-bleed `<KenBurns>` + gradient overlay đáy + `<TextBlock>` căn giữa/dưới (`packages/remotion/src/scenes/TitleCard.tsx`). 4 scene kind chỉ khác nhau ở eyebrow badge và spacing — về bản chất cùng 1 ngôn ngữ thị giác.
- 17 text effect đã có chỉ đa dạng ở **cấp ký tự**, không thay đổi cách bày khung hình.
- Khung tham chiếu (YupVid): cùng `text + ảnh` bày thành dossier card, browser/phone mockup, polaroid, magazine cover, neon hero, …
- **Mấu chốt**: cái thiếu không phải scene kind mới, mà là **thư viện layout** — và layout phải là **product độc lập** có thể build trước/song song, không khoá trong flow video.

## 1. Mục tiêu

Sau khi xong plan này:

1. Layout là **package + MCP tool độc lập**: `createLayout`, `listLayouts`, `previewLayout`, `updateLayout`, `deleteLayout`. User chat riêng với Claude để build library.
2. Pool 11 layout built-in ship sẵn → user mới vào paste link đã có ngay design đa dạng.
3. User mở rộng pool tuỳ thích — gửi screenshot + brief, Claude sinh layout TSX vào `data/layouts/<id>/`.
4. Flow paste-link-→-video **chỉ lookup**: pick `layoutId` cho mỗi segment từ pool có sẵn. Không sinh code, không async generation, deterministic.
5. Schema project gọn: thêm 4 field optional vào `Segment` (`layoutId`, `eyebrow`, `chips`, `fileId`). Storyboard cũ render không đổi.
6. Studio có trang `/layouts` quản lý library + dropdown chọn layout trong editor.

## 2. Concept: Layout = component wrap quanh building blocks

Layout **không quyết định** nội dung — chỉ quyết định **cách bày**. Mọi layout đọc cùng 1 bộ input:

```ts
type LayoutProps = {
  // Nội dung (từ Segment)
  text: string
  eyebrow?: string                  // "CASE FILE", "PRIMARY METRIC", "EP 03"
  chips?: string[]                  // ["FDA APPROVED", "BREAKTHROUGH", "2027"]
  fileId?: string                   // "FILE 02", "PROFILE ID 03"
  media?: AssetRef

  // Style resolved (đã có sẵn từ pipeline hiện tại)
  textStyle: TextStyle
  fontOverride?: string
  colorOverride?: ColorOverride

  // Context
  segment: Segment
  project: Project
}
```

Mỗi layout là 1 React component dùng inline style + tokens từ `@news-tok/shared/ui-tokens`. Scenes (`TitleCard`, `KeyPoint`, `Quote`, `Outro`) trở thành rất mỏng: resolve `layoutId` → gọi layout component. Cùng segment, đổi `layoutId` → đổi phong cách khung hình.

## 3. Data model — toàn cục, decoupled

### 3.1 Layout sống ở `data/layouts/`

```
data/
  layouts/
    <layoutId>/                     # vd. user-scoreboard, user-postcard-dalat
      layout.tsx                    React component, export default
      meta.json                     metadata (xem 3.2)
      preview.png                   1 frame render sẵn cho Studio dropdown
      reference/                    optional, ảnh reference user gửi lúc create
        ref-1.jpg
        ref-2.png
```

Built-in layouts sống trong source code (`packages/remotion/src/layouts/`) để có lợi ích typecheck + ship sẵn. Resolution order: `data/layouts/` first (user override), fallback `packages/remotion/src/layouts/`.

### 3.2 `meta.json` shape

```ts
// packages/shared/src/layout-meta.ts (mới)
export const LayoutMetaSchema = z.object({
  id: z.string().regex(/^(user|builtin)-[a-z0-9-]+$/),  // namespace bắt buộc
  name: z.string().min(1).max(60),                       // "Scoreboard"
  family: z.enum([
    'media-led',      // fullBleed, card, polaroid, splitVertical, collage
    'chrome-mockup',  // browserWindow, phoneMockup, terminalWindow, tweetCard
    'editorial',      // magazineCover, dropCap, pullQuote, newspaperClipping
    'design-forward', // neonFrame, gradientMeshHero, statHero, dossierCard
    'custom',         // user-tạo, không cần fit family
  ]),
  tags: z.array(z.string()).default([]),                 // ["sport", "football", "scoreboard"]
  // Slot requirements để orchestrator biết khi nào layout dùng được
  requiresMedia: z.boolean().default(false),
  requiresEyebrow: z.boolean().default(false),
  requiresChips: z.boolean().default(false),
  minChips: z.number().int().min(0).default(0),
  maxChips: z.number().int().min(0).default(5),
  // Provenance
  source: z.enum(['builtin', 'user']).default('user'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  brief: z.string().optional(),                          // brief text dùng lúc createLayout
  referenceImages: z.array(z.string()).default([]),      // path tới ảnh ref đã copy vào layout/reference/
})
```

### 3.3 Schema project — thêm 4 field optional vào `Segment`

```ts
// packages/shared/src/schema.ts
export const SegmentSchema = z.object({
  // ... các field cũ giữ nguyên
  /**
   * Pointer tới layout trong pool toàn cục. Khi vắng mặt, renderer
   * fallback 'fullBleed' (hành vi cũ — ảnh full + text overlay).
   */
  layoutId: z.string().optional(),
  eyebrow: z.string().max(40).optional(),
  chips: z.array(z.string().max(30)).max(5).optional(),
  fileId: z.string().max(20).optional(),
})
```

Storyboard cũ thiếu 4 field này → resolve `layoutId=undefined` → `fullBleed` → render y như hiện tại.

## 4. MCP tools cho layout (độc lập với video)

5 tool mới dưới namespace `mcp__news-tok__*`:

### 4.1 `createLayout`

```ts
createLayout({
  brief: string,                     // "scoreboard bóng đá, 2 logo, tỷ số to giữa"
  name?: string,                     // default = derive from brief
  family?: LayoutFamily,             // optional hint
  tags?: string[],
  referenceImages?: string[],        // paths tới ảnh reference (vd. screenshot YupVid)
  requiresMedia?: boolean,           // default từ Claude phân tích brief
})
→ { layoutId, layoutPath, previewPath, meta }
```

Implementation:
1. Resolve `layoutId = 'user-<slug from name>'`. Throw nếu trùng built-in.
2. Đọc reference images, encode base64 đưa vào prompt context.
3. Claude (chính tool — qua subagent với tool Write) sinh `layout.tsx` theo template + inline style từ `ui-tokens`.
4. Validate: TSX phải export `default` component, prop interface match `LayoutProps`.
5. Render 1 frame `preview.png` qua Remotion với data mẫu (`text: 'Sample headline'`, `eyebrow: 'PREVIEW'`, `chips: ['TAG 1', 'TAG 2']`, `media: built-in stock image`).
6. Lưu `data/layouts/<id>/layout.tsx`, `meta.json`, `preview.png`, copy reference vào `reference/`.
7. Trả path. Failure modes: validate fail → return error với reason, không lưu.

### 4.2 `listLayouts`

```ts
listLayouts({
  family?: LayoutFamily,
  tags?: string[],
  requiresMedia?: boolean,          // filter theo slot capability
  source?: 'builtin' | 'user' | 'all',
})
→ Array<{ id, name, family, tags, previewUrl, requiresMedia, source, ... }>
```

Trả về union của built-in + user. Cho phép orchestrator filter trước khi pick.

### 4.3 `previewLayout`

```ts
previewLayout({
  layoutId,
  sampleText?: string,
  sampleEyebrow?: string,
  sampleChips?: string[],
  sampleFileId?: string,
  sampleMediaPath?: string,         // dùng asset user-supplied thay vì stock
})
→ { previewPath }
```

Render 1 frame PNG với data mẫu, trả path. Cùng cơ chế `createLayout` step 5. Dùng cho:
- Studio thumbnail (auto-call khi user mở `/layouts`).
- Confirm gate trong `createLayout` workflow.
- Cho user xem trước khi assign `layoutId` cho segment.

### 4.4 `updateLayout`

```ts
updateLayout({
  layoutId,
  brief?: string,                   // mô tả thay đổi muốn áp dụng
  meta?: Partial<LayoutMeta>,       // sửa metadata trực tiếp (tags, name, ...)
  referenceImages?: string[],       // thêm reference mới
})
→ { layoutPath, previewPath, meta }
```

2 mode: chỉ sửa metadata (instant), hoặc regen layout.tsx theo brief mới (full pipeline như `createLayout`). Built-in không update được — clone trước (`cloneLayout` để sau, sprint 6+).

### 4.5 `deleteLayout`

```ts
deleteLayout({ layoutId, confirm: true })
→ { deleted: boolean }
```

Chỉ xoá user-created. Built-in throw error. Khi xoá, segment nào đang dùng `layoutId` này → fallback `fullBleed` lúc render (không break, chỉ degrade gracefully).

## 5. Catalog 11 built-in P0 (sprint 2)

Ship trong source code, không nằm trong `data/layouts/`. Mỗi cái 1 file dưới `packages/remotion/src/layouts/`.

### Họ media-led
| Tên | requires | Kỹ thuật CSS chính |
|---|---|---|
| `builtin-fullBleed` | media | (hành vi cũ, default fallback) |
| `builtin-card` | media | `border-radius`, `box-shadow`, padding container, chip pills `backdrop-filter` |
| `builtin-polaroid` | media | `transform: rotate`, paper texture, `filter: drop-shadow`, handwriting font |
| `builtin-splitVertical` | media | CSS Flex column 60/40 |

### Họ chrome-mockup
| Tên | requires | Kỹ thuật CSS chính |
|---|---|---|
| `builtin-browserWindow` | media | SVG traffic-light dots, mono URL bar, `border-radius` |
| `builtin-phoneMockup` | media | SVG bezel + notch, `clip-path` cho dynamic island |

### Họ editorial
| Tên | requires | Kỹ thuật CSS chính |
|---|---|---|
| `builtin-magazineCover` | media + eyebrow | mixed serif + sans, full-bleed, `letter-spacing` |

### Họ design-forward
| Tên | requires | Kỹ thuật CSS chính |
|---|---|---|
| `builtin-neonFrame` | media | `conic-gradient` + `@property` angle animate, `box-shadow` glow |
| `builtin-gradientMeshHero` | none | nhiều `radial-gradient` chồng, `mix-blend-mode: screen`, `-webkit-text-stroke` |
| `builtin-statHero` | none | big number `tabular-nums`, `-webkit-text-stroke` outline, delta pill |
| `builtin-dossierCard` | media (mờ) + eyebrow + chips | chip grid `backdrop-filter`, eyebrow uppercase tracking — đây là "YupVid case file" |

Sprint sau (P1/P2): `splitDiagonal`, `collage`, `terminalWindow`, `tweetCard`, `chatBubble`, `dropCap`, `pullQuote`, `newspaperClipping`, `stickyNote`.

## 6. Registry & resolver

```ts
// packages/remotion/src/layouts/registry.ts
import type { ComponentType } from 'react'
import type { LayoutProps } from './types.js'
import { FullBleed } from './FullBleed.js'
import { Card } from './Card.js'
// ... import built-in

const BUILT_IN_LAYOUTS: Record<string, ComponentType<LayoutProps>> = {
  'builtin-fullBleed': FullBleed,
  'builtin-card': Card,
  // ...
}

// User layouts injected qua global (giống cơ chế custom scenes hiện tại
// ở packages/remotion/src/scenes/registry.ts:18)
declare global {
  var __NEWS_TOK_USER_LAYOUTS__: Record<string, ComponentType<LayoutProps>> | undefined
}

export function resolveLayout(id?: string): ComponentType<LayoutProps> {
  if (!id) return FullBleed
  const userLayouts = globalThis.__NEWS_TOK_USER_LAYOUTS__
  return userLayouts?.[id] ?? BUILT_IN_LAYOUTS[id] ?? FullBleed
}
```

`packages/render/src/bundle.ts` quét `data/layouts/` lúc build, dynamic-import các `layout.tsx` và inject vào `__NEWS_TOK_USER_LAYOUTS__` (giống đang làm cho custom scenes).

**Runtime safety**: scene wrapper bắt error từ layout component → fallback `FullBleed` + log warning. Layout user-created bug không crash render full project.

## 7. Flow paste-link-→-video sau khi có layout library

Flow CLAUDE.md hiện có 9 bước. Chèn 1 bước "pick layout" gọn, không sinh code:

```
1. createProject(url, language, aspect)
2. extractArticle(url) → article text
3. researchProjectAesthetic → topic + variantPicks + musicMood
   ↳ AskUserQuestion: preset trio / tailored style / skip
4. AskUserQuestion: story structure (intro+body+outro / chỉ intro+body)
5. Plan segments (5-10s mỗi cái — text + scene kind như cũ)
6. [MỚI] Pick layout cho mỗi segment:
   6a. listLayouts({ tags: hint từ topic }) → pool ứng viên
   6b. Heuristic match từng segment → layoutId (xem mục 8)
   6c. Sinh eyebrow + chips + fileId từ article context (Claude rút keyword)
   6d. Refine ảnh query theo layout (polaroid → "personal portrait",
       browserWindow → "UI screenshot", …) — skip nếu layout không cần media
7. updateStoryboard với layoutId + eyebrow + chips + fileId
8. Parallel cho mỗi segment:
   - searchImage (CHỈ segment có layout với requiresMedia=true)
   - synthesizeVoice
9. searchMusic
10. AskUserQuestion: render 1 / 3 / skip
11. renderProject
12. Báo output path
```

**Tính chất quan trọng**:
- Bước 6 chỉ là **lookup + assign**, không async generation. Mất < 1s tổng.
- Bước 8 tiết kiệm cuộc gọi `searchImage` cho layout typography-only (`statHero`, `gradientMeshHero`).
- Pool trống ⇒ mọi segment fallback `builtin-fullBleed` ⇒ render = behavior hiện tại. **Không bao giờ break**.

## 8. Heuristic pick layout (cho orchestrator)

Lưu vào CLAUDE.md. Bảng này chạy cho từng segment độc lập, sau đó orchestrator áp **brand cohesion**: không quá 5 layout khác nhau trong 1 video < 8 segment, title + outro nên cùng họ.

| Đặc điểm beat | Layout gợi ý (theo priority) |
|---|---|
| Mở bài (hook) | `magazineCover`, `gradientMeshHero`, `neonFrame` |
| Câu có **con số nổi bật** ("47%", "$2.1B") | `statHero` |
| Câu **liệt kê / evidence** (chips: tag1, tag2, tag3) | `dossierCard` |
| Câu **tech / phần mềm / web** | `browserWindow` |
| Câu **app / mobile / social** | `phoneMockup` |
| Câu **so sánh / trước-sau** | `splitVertical` |
| Câu **kể chuyện / cảm xúc / lifestyle** | `polaroid`, `card` |
| Câu **báo chí / nghiêm trọng** | `magazineCover` |
| Câu **kết / CTA** | `gradientMeshHero`, `neonFrame` |
| Câu trung tính | `card`, `fullBleed` |

User-created layout cũng vào pool với `tags` từ `meta.json` — orchestrator filter qua `listLayouts({ tags: ['sport'] })` khi topic = football.

## 8.5. TextStyle x Layout — phân quyền ở render time

Hai trục `TextStyle` (font/color/motion/karaoke, đã có) và `Layout` (cách bày khung hình, mới) tồn tại song song. Layout **không loại bỏ** các tính năng đang có của TextStyle — user vẫn pick font, customise màu, pick text style như bình thường. Mục này nói rõ **layout dùng cái gì, không dùng cái gì**.

### 8.5.1 Layout dùng gì, không dùng gì

**Câu trả lời ngắn**: layout dùng **tất cả** trừ 3 field placement (`align`, `anchor`, `marginPct`) trên headline.

| Tính năng user pick | Layout có dùng? | Tại sao |
|---|---|---|
| **Pick a text style** (`textStyleId`) | ✅ Có | Headline render qua `<TextBlock>` với style đầy đủ |
| **Pick a font** (`fontOverride`) | ✅ Có | Font override áp lên headline, đè `TextStyle.fontFamily` như cũ |
| **Customise colours** (`colorOverride`) | ✅ Có | `primary/accent/idle/stroke` áp lên headline như cũ |
| **Font size, weight, letterSpacing, lineHeight** | ✅ Có | Typography hoàn chỉnh của TextStyle |
| **Text decorators** (`textShadow`, `textStroke`, `gradientFill`, `background` plate) | ✅ Có | Decorators áp đầy đủ |
| **Motion** (`enter`, `exit`, karaoke, letterStagger, 17 effect) | ✅ Có | Motion primitive chạy bình thường |
| **Variant-level override** (textStyle, font, color theo variant) | ✅ Có | Resolution chain cũ giữ nguyên |
| **Placement** (`align`, `anchor`, `marginPct`) | ❌ **Layout thắng** | Layout đã đặt headline vào slot cụ thể (vd. `MagazineCover` đặt dưới-trái) — nếu cho `align=center` override thì layout bể |

**Tóm lại**: của TextStyle có 4 nhóm field — Typography, Decorators, Motion, Placement. Layout chỉ thắng **Placement**. 3 nhóm còn lại + `fontOverride` + `colorOverride` đều áp lên headline đầy đủ như hiện tại.

**Backward compat**: layout `builtin-fullBleed` (default cũ) **vẫn tôn trọng** placement của TextStyle → storyboard cũ render không đổi.

### 8.5.2 Ví dụ cụ thể

User pick các thứ sau cho 1 segment:
- Layout: `builtin-dossierCard`
- Text style: `social-impact` (Montserrat Black 920, white, gradient fill, align=center, anchor=bottom)
- Font override: `playfairDisplay`
- Color override: `{ primary: '#ff3b30' }`

Khi render, `DossierCard` layout component vẽ ra:

```
┌──────────────────────────────────┐
│ CASE FILE         [eyebrow]      │  ← cứng từ layout: Inter 24px tracking 4px,
│                                  │     color #a5b4fc — không đụng pick của user
│                                  │
│       [background image mờ]      │  ← media full-bleed mờ
│                                  │
│                                  │
│   AI CƯỚP VIỆC THẬT?  [headline] │  ← render qua <TextBlock mode="slot"
│   ───────────────────            │     style={social-impact}
│   ↑ playfairDisplay (override)   │     fontOverride="playfairDisplay"
│   ↑ size/weight từ social-impact │     colorOverride={primary: '#ff3b30'}>
│   ↑ color #ff3b30 (override)     │
│   ↑ gradient fill từ social-impact│     Vị trí: chỗ layout đặt sẵn
│   ↑ enter animation từ style     │     align/anchor/margin của social-impact bị ignore
│                                  │
│ [CÁP 1.000Đ] [TỨC THÌ] [PHÁ SẢN] │  ← chips: cứng từ layout (pill, backdrop-filter,
│                                  │     white text) — không đụng pick của user
└──────────────────────────────────┘
```

Notice:
- **Headline được áp đầy đủ**: font Playfair (override), size/weight từ TextStyle, color đỏ (override), gradient + motion từ TextStyle.
- **Chỉ vị trí** (giữa, trên chips) là do layout quyết — `align=center, anchor=bottom` của `social-impact` không áp.
- **Eyebrow + chips** là slot phụ, dùng style cứng của layout (xem 8.5.4).

### 8.5.3 `TextBlock` 2 mode — owned vs slot

Hiện `TextBlock` (`packages/remotion/src/effects/text/TextBlock.tsx`) tự kiểm soát `AbsoluteFill + anchorStyle()` (`TextBlock.tsx:149`). Refactor thành 2 mode:

```tsx
type TextBlockMode = 'owned' | 'slot'

export function TextBlock({ text, style, mode = 'owned', ... }: {
  text: string
  style: TextStyle
  mode?: TextBlockMode
  fontOverride?: string
  colorOverride?: ColorOverride
  // ...
}) {
  const Primitive = PRIMITIVES[style.enter] ?? FadeInText
  const plate = plateStyle(style, r.unit * 16)
  const wrap = <Primitive
    text={text}
    style={style}
    fontOverride={fontOverride}
    colorOverride={colorOverride}
    ...
  />
  const inner = plate ? <div style={plate}>{wrap}</div> : wrap

  if (mode === 'slot') {
    // Layout đã cấp container — TextBlock vẫn render đầy đủ typography +
    // decorators + motion + plate + fontOverride + colorOverride. Chỉ bỏ
    // AbsoluteFill + anchorStyle() vì layout đã quyết vị trí rồi.
    return inner
  }
  // 'owned' mode = behavior hiện tại, dùng cho fullBleed và storyboard cũ.
  return (
    <AbsoluteFill style={{ display: 'flex', ...anchorStyle(style) }}>
      {inner}
    </AbsoluteFill>
  )
}
```

Layout custom luôn gọi `<TextBlock mode="slot" ... />`. `FullBleed` legacy gọi `<TextBlock mode="owned" ... />` (default, không cần đổi callsite cũ).

**Quan trọng**: ở mode `slot`, `fontOverride` và `colorOverride` vẫn được forward đến primitive y như mode `owned`. User pick font/color **luôn có hiệu lực** trên headline, không phụ thuộc layout.

### 8.5.4 Eyebrow / chips / fileId — style cứng theo layout (v1)

Quyết định v1: **TextStyle chỉ áp cho headline** (= `segment.text`). Các slot phụ (eyebrow, chips, fileId) có style cứng do layout author quyết định:

| Slot | Style source | Lý do |
|---|---|---|
| `text` (headline) | `segment.textStyleId` + `fontOverride` + `colorOverride` — user pick đầy đủ | Đây là main content, user cần kiểm soát |
| `eyebrow` | Cứng trong layout TSX (vd. `MagazineCover` luôn Inter 24px uppercase tracking 4px `#a5b4fc`) | Micro-typography, user hiếm khi cần fine-tune |
| `chips` | Cứng trong layout TSX (vd. `DossierCard` luôn pill `rgba(255,255,255,0.08)` backdrop-filter blur) | Cùng lý do |
| `fileId` | Cứng trong layout TSX | Cùng lý do |

Lý do gộp:
- Schema gọn — không phải thêm `eyebrowStyleId`, `chipStyleId`, `fileIdStyleId` vào segment.
- Layout author kiểm soát identity visual phụ → user pick combo lố (eyebrow Comic Sans hồng + headline serif đen) không xảy ra.
- Eyebrow/chips/fileId là supporting elements — user pick text style là pick cho **headline** (cái chính), không phải toàn cảnh.

Sprint sau (xa) có thể mở slot-level TextStyle nếu user thực sự cần. Hiện tại keep it simple.

### 8.5.5 Layout `recommendedTextStyles` — gợi ý mềm

Mỗi layout meta.json khai báo các style hoạt động tốt:

```ts
// LayoutMetaSchema bổ sung
recommendedTextStyles: z.array(z.string()).default([]),  // textStyleId list
```

Ví dụ:
- `builtin-magazineCover`: `['editorial-serif-headline', 'classic']`
- `builtin-dossierCard`: `['news-bold-sans', 'social-impact']`
- `builtin-statHero`: `['display-mono-numeric', 'cinematic-thin']`
- `builtin-browserWindow`: `['tech-mono', 'system-sans']`

Studio editor — trong dropdown text style, badge xanh "Recommended for DossierCard" ở các style match. **Không auto-apply, không ép buộc** — chỉ là hint cho user "combo này được test".

Orchestrator (Claude bước 6 trong flow paste-link) có thể ưu tiên pick recommended style khi không có textStyleId nào user explicit set cho segment.

### 8.5.6 Render time resolution order

Lúc render 1 segment:

```
1. Resolve textStyle (logic cũ, không đổi):
   variant.textStyleBySegmentId[seg.id]
   → segment.textStyleId
   → variant.textStyleBySceneKind[seg.scene]
   → 'classic' fallback

2. Resolve fontOverride (logic cũ, không đổi):
   variant.fontOverrideBySegmentId[seg.id]
   → segment.fontOverride
   → undefined (primitive fallback về style.fontFamily)

3. Resolve colorOverride (logic cũ, không đổi):
   variant.colorOverrideBySegmentId[seg.id]   (merge với segment-level)
   → segment.colorOverride

4. Resolve layout (mới):
   variant.layoutBySegmentId[seg.id]
   → segment.layoutId
   → variant.layoutBySceneKind[seg.scene]
   → 'builtin-fullBleed' fallback

5. Layout component nhận tất cả:
   <Layout
     text={seg.text}
     eyebrow={seg.eyebrow}
     chips={seg.chips}
     fileId={seg.fileId}
     media={seg.visuals.background}
     textStyle={resolvedStyle}         // typography + decorators + motion áp lên headline
     fontOverride={resolvedFont}        // áp lên headline
     colorOverride={resolvedColor}      // áp lên headline
     ...
   />

6. Bên trong layout component:
   - Render eyebrow/chips/fileId với style cứng do layout quy định.
   - Render <TextBlock mode="slot" text={text} style={textStyle}
                       fontOverride={fontOverride}
                       colorOverride={colorOverride} ... />
     trong slot text layout đã đặt sẵn. TextStyle áp đầy đủ typography +
     decorators + motion + fontOverride + colorOverride; chỉ align/anchor/margin
     bị ignore vì layout đã quyết vị trí.
```

### 8.5.7 Studio UX cho user

Khi user mở segment inspector, các control hiện tại **không bị bỏ**:

1. **Layout dropdown** (mới ở mục 10.2) — chọn layout.
2. **Pick a text style** (đã có) — chọn typography/motion/decorators. Badge xanh "Recommended for DossierCard" hiện ở các style được layout gợi ý.
3. **Pick a font** (đã có) — font override cho headline. Vẫn hoạt động đầy đủ.
4. **Customise colours** (đã có) — color override cho headline (primary/accent/idle/stroke). Vẫn hoạt động đầy đủ.
5. **Eyebrow/Chips/FileID inputs** (mới ở mục 10.2) — nội dung text các slot phụ. Style không tweak được (cứng theo layout).

Live preview reload mỗi khi đổi bất kỳ field nào.

**Chú thích nhỏ trong UI** (khi layout != fullBleed): "Headline position is controlled by the layout. Text style, font, and colours still apply." → user hiểu ngay sao đổi `align=center` không thấy gì khác.

### 8.5.8 Migration

Storyboard cũ thiếu `layoutId` → resolve thành `'builtin-fullBleed'` → TextBlock chạy `mode="owned"` → behavior hiện tại nguyên vẹn. Zero migration cost.

Storyboard mới có `layoutId` → layout custom render → TextBlock chạy `mode="slot"`. Tất cả pick của user (text style, font, color) **vẫn áp đầy đủ lên headline** — chỉ vị trí headline do layout quyết. User chỉ nhận ra điều này khi explicit pick layout — không bất ngờ.

## 9. Workflow build library (tách hẳn flow video)

User chat tự do với Claude:

> "Tạo layout scoreboard bóng đá cho tôi. Phong cách giống đây [share screenshot]. 2 logo CLB hai bên, tỷ số to giữa, eyebrow 'FULL TIME' màu đỏ."

Claude:
1. Gọi `createLayout({ brief, referenceImages: [<path>], tags: ['sport', 'football'] })`.
2. Tool sinh TSX + render preview.
3. Show preview PNG qua AskUserQuestion: OK / regenerate với feedback / discard.
4. User OK → lưu vào `data/layouts/user-scoreboard/`. Lần sau làm video bóng đá, layout này tự xuất hiện trong pool.

**Không khoá vào project nào**. User có thể build 20 layout signature trước, rồi mới làm video — hoặc làm video xong nhận thấy "tôi muốn 1 cảnh kiểu scoreboard riêng cho thể loại bóng đá", quay lại `createLayout`, rồi `updateStoryboard` đổi `segment.layoutId`.

## 10. Studio changes

### 10.1 Trang `/layouts` mới
- Grid preview giống `/projects` đang có (`apps/studio/app/projects/page.tsx`).
- Mỗi card: preview.png + name + family + tags + nút Edit/Delete.
- Filter sidebar: family, tags, source (built-in/user).
- Nút "+ New Layout" mở dialog: text brief + drop ảnh reference → call MCP `createLayout` (qua Studio API route).

### 10.2 Editor segment
- Dropdown "Layout" mới trong inspector (`apps/studio/app/projects/[id]/editor.tsx`).
- Options group theo family, mỗi option có thumbnail.
- 3 input mới: Eyebrow (text), Chips (tag input max 5), File ID (text).
- Live preview qua `<Player>` reload khi đổi.

### 10.3 Variant-level layout override (sprint 3)

```ts
// VariantSchema
layoutBySegmentId: z.record(z.string()).default({}),
layoutBySceneKind: z.record(z.string()).default({}),
```

Priority: `variant.layoutBySegmentId[id]` > `segment.layoutId` > `variant.layoutBySceneKind[scene]` > `'builtin-fullBleed'`. Cho phép 3 variant render cùng project với layout pool khác hẳn.

### 10.4 Layout editor (`/layouts/[id]/edit` hoặc dialog từ `/layouts`)

**Lý do cần**: chat-driven (`createLayout` qua MCP) tốt cho lần đầu sinh ra, nhưng sau đó user thường muốn tinh chỉnh nhỏ: đổi màu eyebrow, dời chip xuống dưới, tăng padding, đổi font. Bắt user mở terminal/Claude mỗi lần là quá nặng — Studio phải có editor visual.

Pattern UX bám theo `text-style-builder.tsx` đã có (5 tab Identity / Typography / Layout / Decorators / Motion). Đặt ở `apps/studio/components/studio/layout-builder.tsx`, mở bằng dialog (giống text style builder) hoặc trang riêng `/layouts/[id]/edit` cho việc edit dài.

#### 10.4.1 2 chế độ edit

| Chế độ | Khi nào dùng | UX |
|---|---|---|
| **Metadata-only (instant)** | Đổi `name`, `tags`, `family`, `requiresMedia` flag, v.v. | Form thường, save → call `updateLayout({ meta: {...} })` → reload preview |
| **AI regenerate (slow, ~15-30s)** | Đổi visual: muốn chip cards lớn hơn, eyebrow đỏ thay vì xám, bỏ chrome browser, đổi mood màu | Textarea brief "tôi muốn thay đổi gì" + optional drop ảnh reference mới → `updateLayout({ brief })` → loading spinner → preview mới + diff |

Không cho user **edit TSX trực tiếp** trong v1 — quá kỹ thuật cho audience BA/content creator, và mở cửa cho XSS/runtime crash. TSX edit để sprint sau cho "advanced mode".

#### 10.4.2 Tab structure

```
┌─────────────────────────────────────────────────────────────────┐
│ Layout Editor — user-scoreboard                          [×]    │
├─────────────────────────────────────────────────────────────────┤
│ [Identity] [Slots] [Preview Data] [Regenerate]                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────┐    ┌─────────────────────────────┐    │
│  │                      │    │ Name: Scoreboard            │    │
│  │   LIVE PREVIEW       │    │ Family: [design-forward ▾]  │    │
│  │   (1080×1920          │    │ Tags: sport, football [+]   │    │
│  │    canvas scaled      │    │                             │    │
│  │    to 270×480)        │    │ Source: user                │    │
│  │                      │    │ Created: 2026-05-13          │    │
│  │                      │    │                             │    │
│  └──────────────────────┘    └─────────────────────────────┘    │
│  [Refresh preview]                                              │
└─────────────────────────────────────────────────────────────────┘
```

**Tab 1 — Identity** (metadata-only, instant save):
- Name (text input).
- Family (dropdown: media-led / chrome-mockup / editorial / design-forward / custom).
- Tags (chip input, autocomplete từ tag pool đã dùng trong các layout khác).
- Source readonly (builtin / user).
- Built-in layout: tất cả field readonly, chỉ có nút "Clone to edit" tạo bản user-copy.

**Tab 2 — Slots** (metadata-only, instant save):
- Checkbox `requiresMedia`, `requiresEyebrow`, `requiresChips`.
- `minChips` / `maxChips` (number inputs 0-5).
- Tooltip giải thích: "Khi orchestrator pick layout cho segment, nó skip layout có `requiresMedia=true` nếu segment không có ảnh."

**Tab 3 — Preview Data**:
- 5 input để override sample data cho preview: `sampleText`, `sampleEyebrow`, `sampleChips[]`, `sampleFileId`, drop zone cho `sampleMediaPath`.
- Khi đổi → debounced 500ms → call `previewLayout(layoutId, {...sampleData})` → reload PNG.
- Mục đích: user test layout với content gần giống thực tế trước khi assign vào segment thật.

**Tab 4 — Regenerate** (chỉ user layout):
- Textarea brief lớn: "Mô tả những gì muốn thay đổi" — placeholder "Eyebrow chuyển sang màu đỏ, chip cards lớn gấp đôi, bỏ paper texture".
- Drop zone reference images mới (append vào `meta.referenceImages`).
- Nút "Regenerate" → call `updateLayout({ brief, referenceImages })` → spinner 15-30s → split view "Before / After" 2 PNG.
- 2 nút: "Keep new" (commit) hoặc "Revert" (rollback `.tsx` file từ backup tự động).

#### 10.4.3 Backup & history

Mỗi lần `updateLayout` ở chế độ regen → tự động backup file `layout.tsx` cũ vào `data/layouts/<id>/.history/<timestamp>.tsx`. Tab Regenerate hiển thị danh sách history với mini preview, user revert về bất kỳ version nào. Giới hạn 10 version, FIFO.

#### 10.4.4 Live preview cơ chế

Preview frame render trên server (Node side) qua `previewLayout` MCP tool, trả PNG path. Studio hiển thị `<img>` thuần. **Không** dùng `<Player>` Remotion in-browser vì:
- Layout user-created chưa được bundle vào Studio's Remotion bundle (Studio bundle là build-time, layout là runtime).
- 1 frame PNG đủ để judge visual; motion review để khi assign vào segment.

Optimize: cache preview PNG theo hash `(layoutId, sampleData, layout.tsx mtime)`. Đổi sample → call API → server check cache → 200ms cache hit hoặc 2-5s cache miss.

#### 10.4.5 Create new layout từ Studio

Cùng dialog nhưng start với draft state:
- Tab 1: name + family + tags.
- Tab 2: slots.
- **Tab khác bị disable** cho đến khi click "Generate" — vì chưa có file TSX để preview.
- Nút "Generate" trong header mở modal con: brief textarea + drop reference images → call `createLayout` → 15-30s → quay lại editor với tabs đầy đủ.

#### 10.4.6 Delete

Nút "Delete layout" ở góc footer (chỉ user layout). Confirm dialog cảnh báo: "Layout này đang được dùng bởi N segment trong M project. Xoá sẽ làm các segment đó fallback về fullBleed." (Studio query qua API `/api/layouts/<id>/usage`.) Sau confirm → call `deleteLayout({ confirm: true })`.

#### 10.4.7 API routes mới trong Studio

```
GET    /api/layouts                    → listLayouts MCP wrapper
GET    /api/layouts/<id>               → meta + preview URL
POST   /api/layouts                    → createLayout (multipart: brief + images)
PATCH  /api/layouts/<id>               → updateLayout (metadata hoặc regen brief)
DELETE /api/layouts/<id>               → deleteLayout
POST   /api/layouts/<id>/preview       → previewLayout với sample data
GET    /api/layouts/<id>/usage         → đếm segment/project đang ref
GET    /api/layouts/<id>/history       → list backup versions
POST   /api/layouts/<id>/history/<ts>/restore  → revert version
```

Studio gọi MCP server qua child_process spawn (giống cách render API hiện tại gọi `@news-tok/render`). Hoặc gọn hơn: import trực tiếp các helper từ `@news-tok/mcp-server` (vì cả 2 cùng Node process).

### 10.5 AI Gen Layout — entry point chính trên Studio

**Mục đích**: hạ rào cản tạo layout từ "phải mở Claude CLI" xuống "1 click trên website". Đây là feature chính, không chỉ là form ẩn trong dialog editor — phải hiện rõ trên `/layouts` để user khám phá được.

#### 10.5.1 UX entry points

**Vị trí 1 — Hero CTA trên `/layouts`** (chính)

```
┌────────────────────────────────────────────────────────────────┐
│  LAYOUT LIBRARY                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  ✦ Generate layout with AI                          [→]  │  │
│  │  Describe what you want, drop reference screenshots,     │  │
│  │  Claude builds the layout for you.                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  Filter: [All] [Media-led] [Mockup] [Editorial] ...   24 items │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐              │
│  │card│ │polr│ │brws│ │phon│ │mag │ │neon│ │stat│  ...        │
│  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘              │
└────────────────────────────────────────────────────────────────┘
```

Hero card to ở đầu trang, gradient background bắt mắt, icon `Sparkles` (đã import sẵn ở `create-prompt.tsx`). Click → mở full-screen wizard.

**Vị trí 2 — Inline trong segment editor**

Trong dropdown chọn layout, ở cuối list:
```
─────────────────
✦ Generate new layout for this segment...
```

Click → mở wizard với pre-filled brief từ context segment (`text`, `topic`, `scene` kind đã có).

**Vị trí 3 — Floating button**

Nút `+ AI Layout` góc dưới phải mọi trang `/layouts/*`, luôn accessible.

#### 10.5.2 Wizard 3-step

Full-screen modal hoặc trang riêng `/layouts/new`:

**Step 1 — Describe**
```
┌──────────────────────────────────────────────────────────────┐
│  Generate layout                                       [1/3] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  What kind of layout?                                        │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ A football scoreboard. Two team logos on each side,    │  │
│  │ giant score in the middle, "FULL TIME" eyebrow in red. │  │
│  │ Dark stadium background with vignette.                 │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  Reference images (optional, drag-drop or paste)             │
│  ┌──────┐ ┌──────┐ ┌─ + ─┐                                   │
│  │ ref1 │ │ ref2 │ │ add │                                   │
│  └──────┘ └──────┘ └─────┘                                   │
│                                                              │
│  Quick presets (optional, fills the brief above)             │
│  [Magazine] [Scoreboard] [Postcard] [Spotlight] [Code]       │
│                                                              │
│                                            [Cancel] [Next →] │
└──────────────────────────────────────────────────────────────┘
```

- Textarea brief (giống `create-prompt.tsx` pattern).
- Drop zone reference images — Studio gửi nhiều ảnh là OK, hỗ trợ paste từ clipboard (Ctrl+V để dán screenshot).
- **Quick presets** = 5-8 brief mẫu, click sẽ fill textarea với template được pre-test bởi team. Giảm "blank canvas paralysis" cho user mới.
- "Next" enabled khi brief ≥ 20 ký tự.

**Step 2 — Configure**
```
┌──────────────────────────────────────────────────────────────┐
│  Generate layout                                       [2/3] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Name        [Scoreboard                              ]      │
│  Family      [design-forward ▾]                              │
│  Tags        [sport] [football] [+ add]                      │
│                                                              │
│  This layout needs:                                          │
│  ☑ Background image       (e.g., stadium photo)              │
│  ☑ Eyebrow text           (e.g., "FULL TIME")                │
│  ☐ Chips                  Min: [0] Max: [5]                  │
│  ☐ File ID                                                   │
│                                                              │
│  Preview sample data (used in the generated preview only)    │
│  Text:    [Manchester United 3 - 2 Barcelona]                │
│  Eyebrow: [FULL TIME]                                        │
│  Chips:   [empty]                                            │
│                                                              │
│                                          [← Back] [Generate] │
└──────────────────────────────────────────────────────────────┘
```

- Auto-derive defaults từ brief: Claude parse brief lúc bấm Next → suggest name, family, tags, slot requirements, sample data. Form đã pre-fill, user chỉ xác nhận.
- Slot requirements quan trọng vì orchestrator dùng để filter (xem 3.2).
- Sample data dùng cho preview gate ở step 3 — không lưu vào layout, chỉ test.

**Step 3 — Generate & preview**
```
┌──────────────────────────────────────────────────────────────┐
│  Generate layout                                       [3/3] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ⏳ Generating layout TSX...           [ ████░░░░░░ ] 40%   │
│     Step 2 of 4: Validating prop interface                   │
│                                                              │
│  ─────────────────── after ~20s ───────────────────          │
│                                                              │
│  ┌──────────────────────┐    Looks good?                     │
│  │                      │                                    │
│  │   [PREVIEW PNG]      │    Brief: "A football scoreboard..."│
│  │   1080×1920          │    Family: design-forward          │
│  │                      │    Tags: sport, football           │
│  │                      │                                    │
│  └──────────────────────┘    [Refresh preview]               │
│                                                              │
│  ┌─ Refine ─────────────────────────────────────────────┐    │
│  │ Make the score bigger, move FULL TIME to top right.  │    │
│  └──────────────────────────────────────────────────────┘    │
│  [Regenerate] [Discard] [Save layout]                        │
└──────────────────────────────────────────────────────────────┘
```

- Progress bar realtime: steps "Drafting TSX → Validating → Bundling → Rendering preview". Reuse job-polling pattern từ `create-prompt.tsx` (đã có sẵn `/api/orchestrate` model — clone thành `/api/layouts/jobs/<id>`).
- Khi xong: preview PNG to giữa, metadata bên phải.
- **Refine textarea** ở dưới: user mô tả tinh chỉnh, click "Regenerate" → chạy lại với brief = original + refinement. Tối đa 5 lần regen mỗi session để khỏi loop vô tận.
- "Discard" → xoá draft, không lưu gì vào `data/layouts/`.
- "Save layout" → commit → redirect về `/layouts/<id>/edit` để tinh chỉnh tiếp nếu muốn.

#### 10.5.3 Backend flow

```
Browser POST /api/layouts/generate
  body: { brief, referenceImages[], name, family, tags, slots, sampleData }
  ↓
Studio API tạo job record (giống /api/orchestrate hiện tại)
  job.id = uuid
  job.status = 'running'
  job.steps = [drafting, validating, bundling, rendering]
  ↓
Studio spawn background task (in-process, không cần worker):
  1. Call MCP createLayout(brief, referenceImages, ...) → layoutId + path
  2. Bundle Remotion với layout mới → serveUrl
  3. Render 1 frame PNG với sampleData → preview path
  4. Update job.status = 'completed', job.previewUrl, job.layoutId
  ↓
Browser poll GET /api/layouts/generate/<jobId> mỗi 1s
  ↓
Khi completed → render UI step 3 với preview
```

Regenerate flow: cùng endpoint, body thêm `parentJobId` + `refinement`. Backend đọc original brief từ parent, concat refinement, call lại createLayout với cùng layoutId (overwrite). Hoặc tạo layout draft riêng `draft-<sessionId>` chưa commit, chỉ rename thành final khi user Save.

#### 10.5.4 Lưu draft, resume sau

Wizard có thể bị bỏ giữa chừng (user đóng tab lúc generating). Backend lưu job state vào `data/jobs/layout-gen-<id>.json`. Khi user quay lại `/layouts`:
- Banner: "You have an unfinished layout generation: 'Scoreboard'. [Resume] [Discard]"
- Resume → mở wizard step 3 với preview đã có (nếu job completed).

Tương tự pattern Studio dùng cho project orchestration job (`create-prompt.tsx` đã có `useEffect` check `running job` lúc mount).

#### 10.5.5 Cost & rate limit

Mỗi `createLayout` tốn ~15-30s render + 1 Claude call. Để tránh user spam:
- Throttle: tối đa 3 generation đồng thời.
- Refine limit: 5 lần regen mỗi session, reset khi save hoặc discard.
- Disk: layout draft chưa save tự xoá sau 1h.
- UI hiển thị estimate "Tốn ~25s" trước khi user click Generate.

#### 10.5.6 Quick presets (bundled với Studio)

5-8 brief template ship sẵn trong `apps/studio/lib/layout-presets.ts`, giúp user mới bắt đầu nhanh:

```ts
export const QUICK_PRESETS = [
  {
    id: 'magazine-cover',
    label: 'Magazine cover',
    icon: 'BookOpen',
    brief: 'Editorial magazine cover style. Full-bleed photo background, huge serif headline overlapping the image at the bottom-left, small "ISSUE 04 · MAR 2026" metadata at the top. Black text on light background or vice versa.',
    suggestedTags: ['editorial', 'magazine'],
  },
  {
    id: 'scoreboard',
    label: 'Sports scoreboard',
    icon: 'Trophy',
    brief: 'Sports broadcast scoreboard. Two team names/logos on left and right, giant centered score with monospace numerals, "FULL TIME" or status eyebrow in red at top, dark gradient background.',
    suggestedTags: ['sport', 'scoreboard'],
  },
  {
    id: 'postcard',
    label: 'Travel postcard',
    icon: 'MapPin',
    brief: 'Vintage travel postcard. Photo in white frame with slight rotation, handwritten-style caption below, postage stamp SVG in top right corner, paper texture background.',
    suggestedTags: ['travel', 'lifestyle'],
  },
  {
    id: 'ceo-spotlight',
    label: 'Person spotlight',
    icon: 'User',
    brief: 'CEO/celebrity spotlight. Black and white portrait taking 60% of frame, large serif name on right with role label below, optional signature SVG underneath. Editorial newspaper feel.',
    suggestedTags: ['editorial', 'portrait'],
  },
  {
    id: 'code-callout',
    label: 'Code snippet',
    icon: 'Code',
    brief: 'Code editor snippet card. VS Code-style dark window with traffic light dots, syntax-highlighted code block in monospace, file name "main.ts" in tab, glow border.',
    suggestedTags: ['tech', 'code'],
  },
  {
    id: 'stock-ticker',
    label: 'Stock ticker',
    icon: 'TrendingUp',
    brief: 'Financial stock ticker card. Symbol like "AAPL" big at top, current price huge below, delta percentage with green/red arrow, mini candlestick sparkline at bottom, dark trading-terminal aesthetic.',
    suggestedTags: ['finance', 'data'],
  },
]
```

Có thể thêm nữa qua PR. Mỗi preset là entry điểm "tôi muốn làm video kiểu này" — user click → wizard pre-fills → 80% công việc xong.

#### 10.5.7 Sprint 4B mở rộng

Đưa AI Gen wizard vào đợt 4B (đã có layout editor) — cùng pattern dialog/wizard:

- [ ] Hero CTA card trên `/layouts`.
- [ ] Wizard 3-step (`apps/studio/components/studio/layout-gen-wizard.tsx`).
- [ ] Quick presets (`apps/studio/lib/layout-presets.ts`).
- [ ] `POST /api/layouts/generate` + `GET /api/layouts/generate/<jobId>` job-polling.
- [ ] Resume unfinished job (banner trên `/layouts`).
- [ ] Throttle + rate limit + disk cleanup.
- [ ] Inline "Generate new layout..." option trong segment editor dropdown.
- [ ] Floating `+ AI Layout` button.

### 10.6 Image-first flow — "thấy đẹp, làm giống"

Use case rất phổ biến: user lướt Pinterest / TikTok / Behance / báo, thấy 1 khung hình đẹp, screenshot lại, muốn Studio dựng layout giống vậy. Đây là cách user **suy nghĩ tự nhiên nhất** về thiết kế — không phải mô tả bằng text. Plan 10.5 đã có drop reference images như input phụ; mục này promote nó thành **flow chính ngang hàng** với text brief.

#### 10.6.1 Entry point chuyên cho image-first

Trên `/layouts`, ngoài Hero CTA "Generate with AI" (10.5.1), thêm 1 entry point đặc biệt:

```
┌──────────────────────────────────────────────────────────────┐
│  ✨ Generate from image                                       │
│  Drop a screenshot or paste an image. Claude will analyze    │
│  the visual style and build a matching layout.               │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                                                      │    │
│  │         Drop image here, or paste (Ctrl+V)           │    │
│  │              or click to upload                      │    │
│  │                                                      │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

Drag-drop trực tiếp lên trang — **không cần mở wizard trước**. Drop xong tự mở wizard với ảnh đã ở step 1.

**Paste support quan trọng**: Ctrl+V dán screenshot từ clipboard (Mac Cmd+Shift+4 → Cmd+V, Windows Snipping Tool → Ctrl+V). Đây là cách user thực sự dùng — screenshot không lưu file rồi mới upload.

#### 10.6.2 Wizard variant — image-first

Khi user vào wizard với 1 hoặc nhiều ảnh nhưng chưa có brief, **flow đảo ngược**:

**Step 1 — Analyze image (mới, thay vì Describe)**

```
┌──────────────────────────────────────────────────────────────┐
│  Generate from image                                   [1/3] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────┐    🔍 Analyzing image...           │
│  │                      │       [████░░░░░░] 60%             │
│  │   [UPLOADED IMAGE]   │                                    │
│  │                      │    ─── after ~8s ───               │
│  │                      │                                    │
│  └──────────────────────┘    Claude detected:                │
│                              • Magazine cover style          │
│                              • Serif headline, bottom-left   │
│  Add another reference?       • Full-bleed photo with        │
│  [+ Add image]                  dark gradient overlay        │
│                              • Small "ISSUE 04" eyebrow      │
│                                top-left, uppercase tracking  │
│                              • Family: editorial             │
│                              • Tags: magazine, editorial     │
│                                                              │
│  Refine the analysis (optional)                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Make eyebrow red instead of white. Add a small       │    │
│  │ author byline below the headline.                    │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│                                            [Cancel] [Next →] │
└──────────────────────────────────────────────────────────────┘
```

Bước này có **2 phase**:

1. **Auto-analyze** (8-12s): Backend gửi ảnh + system prompt vision đến Claude, yêu cầu structured output:
   ```ts
   type ImageAnalysis = {
     style: string                  // "Magazine cover style"
     elements: string[]             // ["Serif headline bottom-left", "Full-bleed photo with dark gradient", ...]
     suggestedFamily: LayoutFamily
     suggestedTags: string[]
     suggestedSlots: {
       requiresMedia: boolean
       requiresEyebrow: boolean
       requiresChips: boolean
       minChips: number
       maxChips: number
     }
     suggestedSampleData: {
       text?: string                // có thể đọc OCR từ ảnh nếu Claude nhìn thấy text
       eyebrow?: string
       chips?: string[]
     }
     brief: string                  // auto-composed brief, dùng làm input cho createLayout
   }
   ```

2. **User refine** (optional): textarea để user thêm tinh chỉnh — "đổi màu eyebrow", "thêm byline". Refinement này append vào auto-brief.

**Step 2 — Configure**: giống 10.5.2, nhưng tất cả field đã pre-filled từ analysis. User chỉ confirm/sửa nhỏ.

**Step 3 — Generate & preview**: giống 10.5.2. Quan trọng: preview phải **side-by-side với reference image** để user so sánh trực quan:

```
┌──────────────────────────────────────────────────────────────┐
│  Compare                                                     │
│  ┌──────────────────┐    ┌──────────────────┐                │
│  │                  │    │                  │                │
│  │   REFERENCE      │    │   GENERATED      │                │
│  │   (your image)   │    │   (preview)      │                │
│  │                  │    │                  │                │
│  └──────────────────┘    └──────────────────┘                │
│                                                              │
│  Refine                                                      │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Headline should be bigger. Use a warmer color tone.  │    │
│  └──────────────────────────────────────────────────────┘    │
│  [Regenerate] [Discard] [Save layout]                        │
└──────────────────────────────────────────────────────────────┘
```

#### 10.6.3 Multi-reference flow

User có thể drop nhiều ảnh (vd. 3 magazine covers khác nhau) → Claude phân tích **điểm chung** và sinh layout tổng hợp style. Backend gửi tất cả ảnh kèm prompt: "These are reference images. Identify the common visual language and design a layout that captures it."

Hữu ích khi user có sở thích phong cách rõ nhưng không có 1 ảnh nào hoàn hảo — gộp 3-5 ảnh từ cùng moodboard → layout tổng hoà.

#### 10.6.4 Visual diff preview

Sau khi generate, ngoài side-by-side, có thêm 1 chế độ **overlay diff**:
- Slider để fade giữa reference và generated.
- Highlight các region khác biệt (vd. dùng SSIM diff đơn giản, hoặc bbox của text element).

Mục đích: giúp user pinpoint chính xác chỗ nào chưa match → refine brief cụ thể ("the headline is too small" thay vì "looks wrong").

Không bắt buộc trong v1 — ship side-by-side trước, overlay diff thuộc sprint sau nếu user thực sự cần.

#### 10.6.5 Lưu reference image cùng layout

Reference images được dùng để generate sẽ **copy vào `data/layouts/<id>/reference/`** (xem 3.1) và lưu path vào `meta.referenceImages`. Mục đích:
- Studio editor (10.4) có thể hiển thị "Layout này được tạo từ reference X, Y" — context cho user khi quay lại sau 3 tháng.
- Khi user `updateLayout` với refinement, backend re-feed reference cũ + brief mới + ảnh thêm vào (nếu có) — giữ continuity visual.
- Layout share giữa team trong tương lai (sprint 6+): export bundle layout = TSX + meta + reference → người nhận hiểu rõ ý đồ.

Lưu ý privacy: reference có thể là screenshot có thông tin nhạy cảm. Cần warning ở UI: "Reference images sẽ được lưu cùng layout. Đừng upload ảnh chứa thông tin cá nhân."

#### 10.6.6 Backend: prompt design cho vision

`createLayout` MCP tool khi nhận `referenceImages` sẽ chia thành 2 phase rõ:

```
Phase 1 — Vision analysis (gọi 1 lần, cache theo hash ảnh)
  Input:  reference images (base64) + user refinement (optional)
  Output: ImageAnalysis JSON (xem 10.6.2)
  Prompt template: "You are a design analyst. Given these reference
                   images, identify the visual style and produce
                   structured JSON describing the layout..."

Phase 2 — TSX generation
  Input:  brief (= analysis.brief + user refinement), slot config
  Output: layout.tsx code
  Prompt template: existing layout generation prompt + analysis context
```

Tách 2 phase để:
- Cache phase 1 — cùng ảnh dùng 2 lần (vd. user thử lại với name khác) không phải gọi vision lại.
- User thấy được phase 1 output trong wizard step 1 → minh bạch, dễ refine.
- Tách lỗi: phase 1 fail (ảnh không rõ) khác phase 2 fail (TSX validate lỗi) → error message khác nhau.

#### 10.6.7 Cost & rate limit cho vision

Vision call tốn token hơn text-only:
- Throttle: max 2 vision analysis đồng thời (chặt hơn 3 của 10.5.5).
- Ảnh giới hạn: max 5 ảnh per generation, max 5MB mỗi ảnh, auto-resize xuống 1024px max dimension trước khi gửi (giảm token cost ~70%).
- Vision cache: hash SHA-256 của ảnh + refinement → `data/cache/vision-analysis/<hash>.json`, TTL 7 ngày. Cùng ảnh phân tích lần 2 → instant.
- UI estimate: "Tốn ~30s" (cộng cả vision + generation + render).

#### 10.6.8 Sprint 4B bổ sung checklist

Thêm vào 4B (đã có wizard text-first):

- [ ] Drag-drop zone + paste-image-from-clipboard handler trên `/layouts` (entry point image-first).
- [ ] Wizard step 1 variant cho image-first (auto-analyze + structured output display).
- [ ] `POST /api/layouts/analyze-image` endpoint cho vision phase, cache hash-based.
- [ ] `createLayout` MCP tool nhận `referenceImages` paths + tách 2 phase (vision → TSX).
- [ ] Side-by-side compare preview (reference vs generated) ở step 3.
- [ ] Copy reference images vào `data/layouts/<id>/reference/` lúc save.
- [ ] Privacy warning UI khi upload.
- [ ] Auto-resize ảnh client-side xuống 1024px trước upload.
- [ ] Multi-reference support (≥ 2 ảnh → prompt "find common style").

## 11. Rollout — 5 sprint

### Sprint 1 — Foundation (1.5 ngày)

- [ ] Thêm `LayoutMetaSchema` vào `packages/shared/src/layout-meta.ts`.
- [ ] Thêm `layoutId`, `eyebrow`, `chips`, `fileId` (optional) vào `SegmentSchema`.
- [ ] Tạo `packages/remotion/src/layouts/` với `types.ts` (LayoutProps), `registry.ts`, `FullBleed.tsx` (port logic từ `KeyPoint` hiện tại).
- [ ] Refactor `TitleCard/KeyPoint/Quote/Outro` thành scene mỏng gọi `resolveLayout`.
- [ ] `packages/render/src/bundle.ts` quét `data/layouts/` và inject vào `__NEWS_TOK_USER_LAYOUTS__`.
- [ ] Runtime safety: try/catch quanh layout component → fallback FullBleed.
- [ ] Smoke: storyboard cũ render không đổi (regression).

### Sprint 2 — 11 built-in P0 (4-5 ngày)

**Đợt 2A — layout đơn giản (3 ngày):**
- [ ] `Card`, `Polaroid`, `SplitVertical`, `MagazineCover`, `StatHero`.

**Đợt 2B — layout chrome/mockup (2 ngày):**
- [ ] `BrowserWindow`, `PhoneMockup`, `NeonFrame`, `GradientMeshHero`, `DossierCard`.

Mỗi layout ship kèm:
- 1 frame screenshot `docs/screenshots/layouts/<id>.png`.
- Test render qua `pnpm smoke:render` với 1 segment dùng layout.
- Checklist kỹ thuật CSS đã dùng (PR description).

### Sprint 3 — MCP layout tools (2-3 ngày)

- [ ] `packages/mcp-server/src/layouts.ts` với 5 tool: `createLayout`, `listLayouts`, `previewLayout`, `updateLayout`, `deleteLayout`.
- [ ] Layout TSX generator: Claude prompt template + validate prop interface.
- [ ] Preview render: hàm `renderLayoutPreview(layoutId, sampleData)` dùng Remotion programmatic render trả ra PNG path.
- [ ] Sample assets (stock image, sample text) ship trong `packages/shared/src/sample-data.ts`.
- [ ] Smoke: `pnpm smoke:mcp` thêm test list/create/preview/delete layout.

### Sprint 4 — Studio (4-5 ngày)

**Đợt 4A — Library + segment editor (2 ngày):**
- [ ] Trang `/layouts` với grid + filter (family, tags, source).
- [ ] Layout dropdown + eyebrow/chips/fileId inputs trong segment editor (`editor.tsx`).
- [ ] Pre-render preview thumbnails script `scripts/build-layout-previews.ts` cho built-in (commit kết quả vào `public/layout-previews/`).
- [ ] Variant-level layout override.

**Đợt 4B — Layout editor (2-3 ngày):**
- [ ] `layout-builder.tsx` component theo pattern `text-style-builder.tsx` (4 tab: Identity / Slots / Preview Data / Regenerate).
- [ ] API routes: `GET/POST /api/layouts`, `PATCH/DELETE /api/layouts/<id>`, `POST /api/layouts/<id>/preview`, `GET /api/layouts/<id>/usage`, history endpoints.
- [ ] Live preview với debounce + cache PNG theo hash `(layoutId, sampleData, mtime)`.
- [ ] Backup history: tự động lưu `.history/<timestamp>.tsx` khi regen, UI list + restore.
- [ ] Create new layout flow: dialog với "Generate" button disable các tab cho đến khi có TSX.
- [ ] Delete confirm với usage count.
- [ ] Clone built-in để edit (tạo bản user-copy với prefix `user-<original>-copy`).

### Sprint 5 — Orchestrator integration (1.5 ngày)

- [ ] CLAUDE.md: thêm mục "Layout library" với link bảng heuristic 8.
- [ ] Update "Common task: create video from a URL" → bước 6 mới.
- [ ] Update `prompts/` demo flow build layout + flow paste-link.
- [ ] Smoke end-to-end: 1 URL → kỳ vọng ≥ 4 layout khác nhau trong output.

## 12. Rủi ro & cách giảm

- **Layout AI sinh bug runtime.** Mitigate: validate prop interface lúc create, try/catch lúc render fallback FullBleed, preview gate confirm trước khi save.
- **Layout user trùng tên.** Mitigate: `user-` prefix bắt buộc qua regex schema.
- **Pool trống lần đầu.** Không xảy ra — 11 built-in ship sẵn.
- **Preview render chậm** (mỗi `createLayout` mất 10-20s do bundle Remotion). Mitigate: cache bundle giữa các call, chỉ rebuild khi `data/layouts/` thay đổi.
- **Layout x text style x font x color combinatorial.** Mitigate: layout phải robust với mọi text style, test 3 style + 2 ngôn ngữ trước khi ship.
- **`backdrop-filter` + `mix-blend-mode` perf.** Mitigate: budget ≤ 40s/segment 6s, đo qua `pnpm smoke:render`.
- **Layout deleted nhưng segment vẫn ref.** Mitigate: render fallback `FullBleed`, Studio warn user "layout deleted".

## 13. Tiêu chí thành công

Sau Sprint 5:

1. User chat "tạo layout scoreboard" → ≤ 30s sau có preview PNG.
2. User paste URL → render video có ≥ 4 layout khác nhau, không có round-trip generation, < 30s thêm so với baseline hiện tại.
3. Pool trống (xoá hết) → render fallback FullBleed → output = behavior cũ.
4. Storyboard cũ render không đổi.
5. `pnpm smoke:render` + `pnpm smoke:mcp` pass.
6. CLAUDE.md có mục Layout library, người mới đọc plan ra workflow build-library + workflow video tách bạch.

## 14. Mở rộng tương lai

- **`<OffthreadVideo>` b-roll** cho layout `fullBleed`, `splitVertical`, `phoneMockup` (cần provider video search).
- **Layout transitions** giữa segment (`@remotion/transitions`).
- **`promoteLayout`**: copy user layout lên `packages/remotion/src/layouts/` thành built-in cho mọi project sau (cần git workflow).
- **`cloneLayout`**: fork built-in thành user-editable bản.
- **Aesthetic cache**: hash `(topic, mood, brief)` → reuse layout cũ.
- **AI auto-suggest layout từ pool** dùng embedding tags + content (sprint xa).
- **User export/import layout** chia sẻ giữa máy/team.
