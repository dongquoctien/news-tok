/**
 * Pre-render one thumbnail per built-in layout into
 * `apps/studio/public/layout-previews/<id>.png`. The Studio segment
 * editor dropdown loads these so users can see what each layout
 * actually looks like before picking.
 *
 * Run: pnpm exec tsx scripts/build-layout-previews.ts
 *
 * Re-run whenever a layout's visual identity changes. The committed
 * PNGs are the source of truth for the dropdown — there is no
 * runtime re-render.
 */
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  ProjectSchema,
  DEFAULT_VOICES,
  type Project,
} from '@news-tok/shared/schema'
import { renderProjectMedia, writeStoryboard } from '@news-tok/render'
import { ffmpegBinary } from '@news-tok/media'

/** Slug → layoutId mapping. Order matches the catalog. */
const LAYOUTS = [
  'builtin-fullBleed',
  'builtin-card',
  'builtin-splitVertical',
  'builtin-magazineCover',
  'builtin-statHero',
  'builtin-dossierCard',
  'builtin-phoneMockup',
  'builtin-browserWindow',
  'builtin-neonSign',
  'builtin-numberedSteps',
  'builtin-gradientMesh',
  'builtin-crtTerminal',
  'builtin-comparisonSplit',
  // News & journalism set (PR #39).
  'builtin-breakingNews',
  'builtin-portraitQuote',
  'builtin-timestampedWar',
  'builtin-healthCards',
] as const

/**
 * Sample slot data picked to exercise every visual lever each layout
 * uses. Numbers / chips / eyebrows are short so the layout doesn't
 * have to truncate.
 */
const SAMPLES: Record<(typeof LAYOUTS)[number], {
  text: string
  eyebrow?: string
  chips?: string[]
  fileId?: string
}> = {
  'builtin-fullBleed': {
    text: 'Tin nổi bật hôm nay',
  },
  'builtin-card': {
    text: 'Bão di chuyển vào miền Trung',
    eyebrow: 'KEY POINT',
  },
  'builtin-splitVertical': {
    text: 'Đội tuyển Việt Nam giành chiến thắng',
    eyebrow: 'BREAKING',
  },
  'builtin-magazineCover': {
    text: 'AI cướp việc thật?',
    eyebrow: 'ISSUE 04',
    fileId: 'VOL. 12',
  },
  'builtin-statHero': {
    text: '47%',
    eyebrow: 'YOY GROWTH',
    chips: ['FY 2026', 'CONFIRMED'],
    fileId: 'PRIMARY',
  },
  'builtin-dossierCard': {
    text: 'Đường dây ma túy bị triệt phá',
    eyebrow: 'CASE FILE',
    fileId: 'FILE 07',
    chips: ['2024', '12 NƯỚC', '$1B', 'INTERPOL'],
  },
  'builtin-phoneMockup': {
    text: 'Meta ra mắt nền tảng AI mới',
    eyebrow: 'PROFILE ID',
    chips: ['AUTODATA', 'FRAMEWORK', 'LLM TỰ TẠO'],
  },
  'builtin-browserWindow': {
    text: 'Jarvis: AI của bạn',
    eyebrow: 'CASE FILE',
    fileId: 'JARVIS.APP',
  },
  'builtin-neonSign': {
    text: 'Ruflo là gì?',
    eyebrow: 'PROFILE ID',
    fileId: 'uFlo',
    chips: ['OPEN SOURCE', 'MULTI-AGENT', 'TỐI ƯU'],
  },
  'builtin-numberedSteps': {
    text: 'Chip AI Huawei cháy hàng',
    eyebrow: 'TRUNG QUỐC BỨT PHÁ',
    fileId: '01',
    chips: ['AI KHÔNG CẦN MỸ', 'NGÀNH AI CHẤN ĐỘNG', 'CỘNG ĐỒNG NGỠ NGÀNG'],
  },
  'builtin-gradientMesh': {
    text: 'Toto làm chip AI?',
    eyebrow: 'HÀNG BỎN CẦU NỐI TIẾNG',
    chips: ['BƯỚC VÀO CHUỖI BÁN DẪN', 'CỔ PHIẾU TĂNG VỌT'],
  },
  'builtin-crtTerminal': {
    text: 'Thứ gì đang quay trở lại?',
    eyebrow: 'PRIMARY METRIC',
    fileId: 'LIVE EP: 8 / OS 4',
    chips: ['TRONG THỜI ĐẠI AI', 'DẪN DẮT XU HƯỚNG MỚI'],
  },
  'builtin-comparisonSplit': {
    text: 'AI thắng bác sĩ?',
    eyebrow: 'EVIDENCE OVERLAY',
    fileId: '15 NĂM SINH NGHIỆM',
    chips: ['Triệu ca bệnh', 'Kết quả bất ngờ', 'FDA duyệt thử nghiệm'],
  },
  // News & journalism set — copy chosen to exercise each layout's
  // distinctive slot. eyebrow on breakingNews overrides the default
  // "BREAKING NEWS" banner text.
  'builtin-breakingNews': {
    text: 'Vụ án oan mới: bị cáo được thả tự do',
    eyebrow: 'TIN TỨC PHÁP LUẬT',
  },
  'builtin-portraitQuote': {
    text: 'Quyền lợi của bị cáo là trên hết.',
    eyebrow: 'CHUYÊN GIA PHÁP LUẬT',
    // fileId capped at 20 chars by ProjectSchema — full name +
    // affiliation goes elsewhere; here we use the short form that
    // typically reads in the name-tag band.
    fileId: 'LS. NGUYỄN T. MAI',
  },
  'builtin-timestampedWar': {
    text: 'Cập nhật chiến sự miền Đông',
    eyebrow: 'CHIẾN SỰ · LIVE',
    chips: [
      '04:30 AM: Giao tranh trung tâm',
      '07:15 AM: Tiếng nổ lớn gần BV',
      '09:00 AM: Sơ tán dân thường',
    ],
  },
  'builtin-healthCards': {
    text: '5 bước để cơ thể khỏe mạnh mỗi ngày',
    eyebrow: 'SỨC KHỎE CỘNG ĐỒNG',
    chips: [
      'Uống đủ nước mỗi ngày',
      'Ngủ đủ giấc 7-8 tiếng',
      'Ăn xanh, sống sạch',
      'Vận động 30 phút',
      'Chăm sóc tim mạch',
    ],
  },
}

const PROJECT_ID = 'preview-layouts'

function buildStoryboard(): Project {
  const now = new Date().toISOString()
  return ProjectSchema.parse({
    id: PROJECT_ID,
    title: 'Layout preview',
    source: { type: 'text', value: 'Layout preview fixture' },
    language: 'vi',
    aspect: '9:16',
    bgMusicVolume: 0,
    createdAt: now,
    updatedAt: now,
    segments: LAYOUTS.map((layoutId) => {
      const sample = SAMPLES[layoutId]
      return {
        id: `seg-${layoutId.replace('builtin-', '')}`,
        durationSec: 1.5,
        scene: 'keypoint' as const,
        text: sample.text,
        voice: { provider: 'edge-tts', voiceId: DEFAULT_VOICES.vi, speed: 1 },
        visuals: {},
        effects: [],
        layoutId,
        eyebrow: sample.eyebrow,
        chips: sample.chips,
        fileId: sample.fileId,
      }
    }),
    variants: [],
    userTextStyles: [],
  })
}

async function main() {
  const out = resolve(process.cwd(), 'apps', 'studio', 'public', 'layout-previews')
  if (!existsSync(out)) mkdirSync(out, { recursive: true })

  console.log(`[layout-previews] rendering ${LAYOUTS.length} layouts...`)
  await writeStoryboard(PROJECT_ID, buildStoryboard())

  const t0 = Date.now()
  const outPaths = await renderProjectMedia(PROJECT_ID, {
    onProgress: (p) => {
      const pct = Math.floor(p * 100)
      if (pct % 25 === 0) process.stdout.write(`  ${pct}%\n`)
    },
  })
  const ms = Date.now() - t0
  console.log(`[layout-previews] rendered in ${(ms / 1000).toFixed(1)}s`)

  // The render produces one combined mp4 — we'd normally split it into
  // per-segment frames via ffmpeg, but for v1 each segment is 1.5s so
  // the combined mp4 already cycles through all 6 layouts. The simpler
  // approach: ship the combined mp4 as-is and let the editor pick the
  // frame range via <video poster>. Actually for a dropdown thumbnail
  // we just need a single representative PNG per layout.
  //
  // Extract frames via ffmpeg:
  await extractFramesWithFfmpeg(outPaths[0]!, out)

  for (const layoutId of LAYOUTS) {
    const path = resolve(out, `${layoutId}.png`)
    if (!existsSync(path)) {
      console.warn(`[layout-previews] MISSING ${layoutId} → ${path}`)
      continue
    }
    const kb = (statSync(path).size / 1024) | 0
    console.log(`[layout-previews] OK ${layoutId} (${kb} KB)`)
  }
  console.log('[layout-previews] done.')
}

async function extractFramesWithFfmpeg(mp4Path: string, outDir: string): Promise<void> {
  const { spawn } = await import('node:child_process')
  // Use the ffmpeg-static binary the rest of the pipeline relies on so
  // we don't need the user's system PATH to have ffmpeg installed.
  const bin = ffmpegBinary()
  // Each layout occupies 1.5s of the timeline. Grab a frame at the
  // midpoint (0.75s offset from segment start) so the KenBurns motion
  // is roughly centred. Frame timestamps: 0.75, 2.25, 3.75, 5.25, 6.75, 8.25.
  let i = 0
  for (const layoutId of LAYOUTS) {
    const ts = i * 1.5 + 0.75
    const out = resolve(outDir, `${layoutId}.png`)
    await new Promise<void>((res, rej) => {
      const child = spawn(
        bin,
        ['-y', '-ss', String(ts), '-i', mp4Path, '-frames:v', '1', '-q:v', '3', out],
        { stdio: 'ignore' }
      )
      child.on('exit', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}`))))
      child.on('error', rej)
    })
    i++
  }
}

main().catch((err) => {
  // Avoid Node 25's util.inspect crashing on certain error shapes —
  // dump message + stack as plain strings so the actual upstream
  // error reaches stderr.
  const msg = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error && err.stack ? err.stack : ''
  process.stderr.write(`[layout-previews] failed: ${msg}\n`)
  if (stack) process.stderr.write(stack + '\n')
  process.exit(1)
})
