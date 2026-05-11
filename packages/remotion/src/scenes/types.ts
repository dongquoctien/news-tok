import type { Segment, Project } from '@news-tok/shared/schema'
import type { ComponentType } from 'react'

export type SceneProps = {
  segment: Segment
  project: Project
}

export type SceneComponent = ComponentType<SceneProps>

export type CustomSceneModule = {
  default: SceneComponent
}
