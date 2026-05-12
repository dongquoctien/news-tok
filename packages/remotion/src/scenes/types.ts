import type { Segment, Project, TextStyle } from '@news-tok/shared/schema'
import type { ComponentType } from 'react'

export type SceneProps = {
  segment: Segment
  project: Project
  /**
   * Resolved text style for this segment under the current variant. Built-in
   * scenes pass this to <TextBlock>. Custom scenes may ignore it.
   */
  textStyle?: TextStyle
}

export type SceneComponent = ComponentType<SceneProps>

export type CustomSceneModule = {
  default: SceneComponent
}
