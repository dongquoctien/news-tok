import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { synthesize } from '@news-tok/media'
import { recommendSegmentDurationSec } from '@news-tok/shared/sanitize'
import { DEFAULT_VOICES, type Project } from '@news-tok/shared/schema'
import { readStoryboard, writeStoryboard } from '@news-tok/render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z
  .object({
    // When set, override every segment's voice with this one. When
    // omitted, each segment keeps its current voiceId (falling back to
    // the language default).
    voiceId: z.string().min(1).optional(),
    speed: z.number().min(0.5).max(2).optional(),
    // When true (default), only segments missing audio.narration are
    // synthesized. When false, every segment is re-synthesized.
    onlyMissing: z.boolean().optional(),
  })
  .strict()

type SegmentResult = {
  segmentId: string
  status: 'synthesized' | 'skipped' | 'failed'
  durationSec?: number
  voiceId?: string
  error?: string
}

/**
 * Batch-synthesize narration for every segment of a project.
 *
 * Strategy:
 *   - Load the storyboard from disk (single source of truth — avoids
 *     racing with whatever the editor is holding in memory).
 *   - For each segment, run synthesize sequentially. Edge TTS opens a
 *     WebSocket per call and parallel bursts get throttled and fail
 *     intermittently; sequential is slower but reliable.
 *   - After each successful call, mutate the in-memory project copy
 *     with the new narration AssetRef + stretch durationSec to fit.
 *   - Write the whole updated storyboard ONCE at the end so we don't
 *     thrash the file on disk per-segment (and so a mid-batch failure
 *     doesn't leave a partially-updated storyboard staring at the
 *     editor).
 *
 * The response includes per-segment status so the UI can render a
 * checklist. `onlyMissing=true` skips segments that already have audio
 * — the common "I added new segments, only fill those" path.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: z.infer<typeof Body>
  try {
    body = Body.parse(await req.json().catch(() => ({})))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid body'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  let project: Project
  try {
    project = await readStoryboard(params.id)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message.toLowerCase().includes('enoent') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }

  const onlyMissing = body.onlyMissing ?? true
  const speed = body.speed
  const overrideVoiceId = body.voiceId
  const defaultVoiceId = DEFAULT_VOICES[project.language]

  const results: SegmentResult[] = []
  let mutated = false

  for (const segment of project.segments) {
    if (!segment.text || segment.text.trim().length === 0) {
      results.push({ segmentId: segment.id, status: 'skipped' })
      continue
    }
    if (onlyMissing && segment.audio?.narration?.path) {
      results.push({
        segmentId: segment.id,
        status: 'skipped',
        durationSec: segment.audio.narration.durationSec,
        voiceId: segment.voice.voiceId || defaultVoiceId,
      })
      continue
    }

    const voiceId =
      overrideVoiceId ?? segment.voice.voiceId ?? defaultVoiceId

    try {
      const result = await synthesize({
        text: segment.text,
        voiceId,
        speed: speed ?? segment.voice.speed,
      })

      const idx = project.segments.findIndex((s) => s.id === segment.id)
      if (idx < 0) continue
      const fittedDuration = recommendSegmentDurationSec(
        result.durationSec,
        project.segments[idx]!.durationSec
      )
      project.segments[idx] = {
        ...project.segments[idx]!,
        voice: {
          ...project.segments[idx]!.voice,
          // Persist the voiceId actually used so the UI reflects the
          // batch override on subsequent loads.
          voiceId,
          ...(speed !== undefined ? { speed } : {}),
        },
        durationSec: fittedDuration,
        audio: {
          ...project.segments[idx]!.audio,
          narration: {
            kind: 'audio',
            path: result.asset.path,
            source: { provider: 'edge-tts', id: voiceId },
            durationSec: result.durationSec,
          },
        },
      }
      mutated = true

      results.push({
        segmentId: segment.id,
        status: 'synthesized',
        durationSec: result.durationSec,
        voiceId,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.push({
        segmentId: segment.id,
        status: 'failed',
        voiceId,
        error: message,
      })
    }
  }

  if (mutated) {
    project.updatedAt = new Date().toISOString()
    await writeStoryboard(params.id, project)
  }

  const summary = {
    total: results.length,
    synthesized: results.filter((r) => r.status === 'synthesized').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    failed: results.filter((r) => r.status === 'failed').length,
  }

  return NextResponse.json({ project, results, summary })
}
