import { AbsoluteFill } from 'remotion'
import { AlertTriangle } from 'lucide-react'
import { ICON } from '@news-tok/shared/ui-tokens'
import type { SceneProps } from './types.js'
import { fontFor } from './fonts.js'

export const MissingScene = ({ segment, project }: SceneProps) => {
  const fontFamily = fontFor(project.language)
  return (
    <AbsoluteFill
      style={{
        background: '#15151b',
        color: '#f4f4f6',
        fontFamily,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 64,
        textAlign: 'center',
      }}
    >
      <AlertTriangle size={ICON.xxl} strokeWidth={ICON.strokeWidth} color="#ef4444" />
      <div style={{ marginTop: 24, fontSize: 36, fontWeight: 600 }}>
        Unknown scene: {segment.scene}
      </div>
      <div style={{ marginTop: 12, color: '#9b9ba8', fontSize: 22 }}>{segment.text}</div>
    </AbsoluteFill>
  )
}
