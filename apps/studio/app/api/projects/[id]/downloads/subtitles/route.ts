import { NextResponse, type NextRequest } from 'next/server'
import { readStoryboard } from '@news-tok/render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/projects/[id]/downloads/subtitles
 *
 * Compose an SRT file from `segment.wordBoundaries` + segment
 * durations. Each segment becomes one subtitle entry timed to the
 * segment's offset in the video; if word boundaries are available the
 * entry is broken into lines at every ~6 words for readability on
 * vertical formats.
 *
 * SRT is the universal upload format for TikTok, YouTube Shorts,
 * Facebook Reels, Vimeo. WebVTT export can land later if we ship a
 * web player that needs it.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  let project
  try {
    project = await readStoryboard(params.id)
  } catch {
    return NextResponse.json({ error: 'project not found' }, { status: 404 })
  }

  const lines: string[] = []
  let cursorSec = 0
  let cueIndex = 1
  for (const segment of project.segments) {
    const start = cursorSec
    const end = cursorSec + segment.durationSec
    // Wrap the narration text at ~40 chars so TikTok / Reels don't
    // truncate. The SRT spec lets us put a hard newline inside a cue;
    // most players honour it.
    const wrapped = wrap(segment.text.trim(), 40)
    lines.push(String(cueIndex++))
    lines.push(`${formatSrtTime(start)} --> ${formatSrtTime(end)}`)
    lines.push(wrapped)
    lines.push('') // blank line between cues
    cursorSec = end
  }
  const srt = lines.join('\n')
  return new Response(srt, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-subrip; charset=utf-8',
      'Content-Disposition': `attachment; filename="${params.id}-subtitles.srt"`,
      'Cache-Control': 'no-store',
    },
  })
}

function formatSrtTime(seconds: number): string {
  // SRT format: HH:MM:SS,mmm — comma as decimal separator, three
  // digits of millisecond precision.
  const ms = Math.round(seconds * 1000)
  const hh = Math.floor(ms / 3_600_000)
  const mm = Math.floor((ms % 3_600_000) / 60_000)
  const ss = Math.floor((ms % 60_000) / 1000)
  const mmm = ms % 1000
  return `${pad(hh, 2)}:${pad(mm, 2)}:${pad(ss, 2)},${pad(mmm, 3)}`
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0')
}

/**
 * Split a string into lines of at most `max` characters, breaking on
 * word boundaries. Avoids splitting in the middle of a word so
 * Vietnamese accented characters stay intact.
 */
function wrap(text: string, max: number): string {
  const words = text.split(/\s+/)
  const out: string[] = []
  let line = ''
  for (const w of words) {
    if (line.length === 0) {
      line = w
      continue
    }
    if (line.length + 1 + w.length > max) {
      out.push(line)
      line = w
    } else {
      line += ' ' + w
    }
  }
  if (line) out.push(line)
  return out.join('\n')
}
