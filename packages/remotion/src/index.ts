import { registerRoot } from 'remotion'
import { RemotionRoot } from './Root.js'

registerRoot(RemotionRoot)

export { RemotionRoot } from './Root.js'
export { NewsTokComposition } from './compositions/NewsTokComposition.js'
export { resolveScene } from './scenes/registry.js'
export type { CustomSceneModule, SceneProps } from './scenes/types.js'
