# User-authored text styles

Drop JSON files into `data/user-styles/*.json` to extend the built-in
text style registry. Each file is validated against `TextStyleSchema`
(`packages/shared/src/schema.ts`); a malformed file is skipped with a
warning on both MCP startup and Studio API load.

## Minimal example

```json
{
  "id": "my-bold-pink",
  "name": "My bold pink",
  "family": "social",
  "fontFamily": "Inter, sans-serif",
  "fontSize": 84,
  "fontWeight": 900,
  "color": "#ec4899",
  "textStroke": { "widthPx": 5, "color": "#000000" },
  "background": { "kind": "none" },
  "align": "center",
  "anchor": "middle",
  "marginPct": 8,
  "enter": "wordPop",
  "exit": "fade",
  "enterDurationSec": 0.5,
  "exitDurationSec": 0.4,
  "sfx": { "enterSoundId": "pop", "enterVolume": 0.5, "perWordSoundId": "pop", "perWordVolume": 0.35 },
  "source": "user",
  "scope": ["keypoint"]
}
```

## Fields

See `TextStyleSchema` in `packages/shared/src/schema.ts` for the full
contract. The most-edited fields:

| Field | Notes |
|---|---|
| `id` | Must be unique. If it matches a built-in id, your style wins. |
| `family` | One of `news` / `social` / `cinematic` / `retro` / `playful`. Used by the orchestrator to match article tone. |
| `fontFamily` | Any Google Font already wired in `packages/remotion/src/scenes/fonts.ts`, or `'system'`. New fonts require a code change. |
| `fontSize` | Logical px at the 1080-wide canvas. The scene scales it for 16:9 and 1:1. |
| `background` | `{ kind: 'none' }`, `{ kind: 'solid', color, paddingPct, radiusPx, opacity }`, or `{ kind: 'gradient', from, to, angleDeg, paddingPct, radiusPx }`. |
| `gradientFill` | Sets `background-clip: text` so the letter shapes are filled with a gradient. |
| `textStroke` | Outline applied via `WebkitTextStroke`. |
| `textShadow` | Soft glow; the optional `secondary` block enables an RGB-split look (used by `cyberpunk-glitch`). |
| `enter` | One of nine motion primitives. See `packages/remotion/src/effects/text/`. |
| `scope` | List of scene kinds the orchestrator should restrict this style to. Empty = anywhere. |

## Sharing

JSON files in `data/user-styles/` are local — `data/` is gitignored on
purpose. To share a style with the team, copy its JSON into a Pull
Request or paste it into a chat. The renderer loads built-ins from code
and user styles from disk, so any clone with the same JSON file gets
the same result.

## Sound effects

`sfx.enterSoundId` and `sfx.perWordSoundId` reference ids from
`packages/shared/src/sfx.ts`. The current bank has 12 clips
(`whoosh-short`, `pop`, `ding`, `boing`, `arcade-coin`, …). You can
also leave SFX unset for a clean look — that is the default for
`classic`, `cinematic`, and `minimal-mono`.
