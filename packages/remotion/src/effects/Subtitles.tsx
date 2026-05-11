import { useCurrentFrame, useVideoConfig, AbsoluteFill } from 'remotion'
import type { WordBoundary } from '@news-tok/shared/schema'
import { useResponsive } from '../scenes/sizing.js'

export type SubtitlesProps = {
  wordBoundaries: WordBoundary[]
  /** Position relative to bottom edge (0..1). 0 = bottom edge, 1 = top edge. */
  bottomPct?: number
  /** Font family — pass the project's chosen font. */
  fontFamily?: string
  /** Group N words at a time as a single readable chunk. */
  chunkSize?: number
}

type Chunk = {
  startSec: number
  endSec: number
  text: string
}

function buildChunks(words: WordBoundary[], chunkSize: number): Chunk[] {
  const chunks: Chunk[] = []
  for (let i = 0; i < words.length; i += chunkSize) {
    const slice = words.slice(i, i + chunkSize)
    if (slice.length === 0) continue
    const first = slice[0]!
    const last = slice[slice.length - 1]!
    chunks.push({
      startSec: first.offsetSec,
      endSec: last.offsetSec + last.durationSec,
      text: slice.map((w) => w.text).join(' '),
    })
  }
  return chunks
}

export const Subtitles = ({
  wordBoundaries,
  bottomPct = 0.18,
  fontFamily,
  chunkSize = 4,
}: SubtitlesProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const r = useResponsive()
  const tSec = frame / fps
  const chunks = buildChunks(wordBoundaries, chunkSize)
  const active = chunks.find((c) => tSec >= c.startSec && tSec < c.endSec)
  if (!active) return null

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: `${bottomPct * 100}%`,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          maxWidth: '85%',
          padding: `${14 * r.unit}px ${26 * r.unit}px`,
          borderRadius: 12,
          background: 'rgba(11,11,15,0.78)',
          color: '#f4f4f6',
          fontFamily,
          fontSize: 38 * r.font,
          fontWeight: 600,
          lineHeight: 1.3,
          textAlign: 'center',
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        }}
      >
        {active.text}
      </div>
    </AbsoluteFill>
  )
}
