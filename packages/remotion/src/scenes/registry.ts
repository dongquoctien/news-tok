import type { SceneComponent } from './types.js'
import { TitleCard } from './TitleCard.js'
import { KeyPoint } from './KeyPoint.js'
import { Quote } from './Quote.js'
import { Outro } from './Outro.js'

const BUILT_IN: Record<string, SceneComponent> = {
  title: TitleCard,
  keypoint: KeyPoint,
  quote: Quote,
  outro: Outro,
}

// Custom scenes for a specific render are injected into the bundle via a
// global set by the render bundler (see packages/render/src/bundle.ts).
// The shape is: globalThis.__NEWS_TOK_CUSTOM_SCENES__ = { [name]: Component }.
declare global {
  // eslint-disable-next-line no-var
  var __NEWS_TOK_CUSTOM_SCENES__: Record<string, SceneComponent> | undefined
}

export function resolveScene(name: string): SceneComponent | null {
  const custom = globalThis.__NEWS_TOK_CUSTOM_SCENES__
  return BUILT_IN[name] ?? custom?.[name] ?? null
}

export function listBuiltInScenes(): string[] {
  return Object.keys(BUILT_IN)
}
