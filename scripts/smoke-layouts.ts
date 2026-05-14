/**
 * Smoke render for the 5 PR-B layouts. Builds a fixture project where
 * each segment is assigned a different layoutId, renders the full mp4,
 * and asserts it landed at a sane size. Open the output in mpv / VLC
 * for a visual pass.
 *
 * Run: pnpm exec tsx scripts/smoke-layouts.ts
 */
import { existsSync, statSync } from 'node:fs'
import {
  ProjectSchema,
  DEFAULT_VOICES,
  type Project,
} from '@news-tok/shared/schema'
import { renderProjectMedia, writeStoryboard } from '@news-tok/render'

const PROJECT_ID = 'smoke-layouts'

const LAYOUTS_TO_TEST = [
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
] as const

function buildStoryboard(): Project {
  const now = new Date().toISOString()
  return ProjectSchema.parse({
    id: PROJECT_ID,
    title: 'Layout smoke',
    source: { type: 'text', value: 'Layout smoke fixture' },
    language: 'vi',
    aspect: '9:16',
    bgMusicVolume: 0.0,
    createdAt: now,
    updatedAt: now,
    // One segment per layout. Each carries the slot data its layout
    // needs so we exercise both the headline and the eyebrow / chips /
    // fileId branches.
    segments: [
      {
        id: 'seg-fullbleed',
        durationSec: 3,
        scene: 'title',
        text: 'Full bleed — image fills, text overlays.',
        voice: { provider: 'edge-tts', voiceId: DEFAULT_VOICES.vi, speed: 1 },
        visuals: {},
        effects: [],
        layoutId: 'builtin-fullBleed',
      },
      {
        id: 'seg-card',
        durationSec: 3,
        scene: 'keypoint',
        text: 'Card layout — media in a rounded panel.',
        voice: { provider: 'edge-tts', voiceId: DEFAULT_VOICES.vi, speed: 1 },
        visuals: {},
        effects: [],
        layoutId: 'builtin-card',
        eyebrow: 'KEY POINT',
      },
      {
        id: 'seg-split',
        durationSec: 3,
        scene: 'keypoint',
        text: 'SplitVertical — photo top, headline below.',
        voice: { provider: 'edge-tts', voiceId: DEFAULT_VOICES.vi, speed: 1 },
        visuals: {},
        effects: [],
        layoutId: 'builtin-splitVertical',
        eyebrow: 'BREAKING',
      },
      {
        id: 'seg-magazine',
        durationSec: 3,
        scene: 'title',
        text: 'MagazineCover — editorial bottom-left headline.',
        voice: { provider: 'edge-tts', voiceId: DEFAULT_VOICES.vi, speed: 1 },
        visuals: {},
        effects: [],
        layoutId: 'builtin-magazineCover',
        eyebrow: 'ISSUE 04',
        fileId: 'VOL. 12',
      },
      {
        id: 'seg-stat',
        durationSec: 3,
        scene: 'keypoint',
        text: '47%',
        voice: { provider: 'edge-tts', voiceId: DEFAULT_VOICES.vi, speed: 1 },
        visuals: {},
        effects: [],
        layoutId: 'builtin-statHero',
        eyebrow: 'YoY GROWTH',
        chips: ['FY 2026', 'CONFIRMED'],
        fileId: 'PRIMARY METRIC',
      },
      {
        id: 'seg-dossier',
        durationSec: 3,
        scene: 'keypoint',
        text: 'DossierCard — chips read like evidence tags.',
        voice: { provider: 'edge-tts', voiceId: DEFAULT_VOICES.vi, speed: 1 },
        visuals: {},
        effects: [],
        layoutId: 'builtin-dossierCard',
        eyebrow: 'CASE FILE',
        fileId: 'FILE 07',
        chips: ['ARRESTED 2024', '12 COUNTRIES', '$1B LOSS', 'INTERPOL'],
      },
      {
        id: 'seg-phone',
        durationSec: 3,
        scene: 'keypoint',
        text: 'Meta ra mắt nền tảng AI mới',
        voice: { provider: 'edge-tts', voiceId: DEFAULT_VOICES.vi, speed: 1 },
        visuals: {},
        effects: [],
        layoutId: 'builtin-phoneMockup',
        eyebrow: 'PROFILE ID',
        chips: ['AUTODATA', 'FRAMEWORK AGENTIC', 'LLM TỰ TẠO'],
      },
      {
        id: 'seg-browser',
        durationSec: 3,
        scene: 'keypoint',
        text: 'Jarvis: AI của bạn',
        voice: { provider: 'edge-tts', voiceId: DEFAULT_VOICES.vi, speed: 1 },
        visuals: {},
        effects: [],
        layoutId: 'builtin-browserWindow',
        eyebrow: 'CASE FILE',
        fileId: 'JARVIS.APP',
      },
      {
        id: 'seg-neon',
        durationSec: 3,
        scene: 'keypoint',
        text: 'Ruflo là gì?',
        voice: { provider: 'edge-tts', voiceId: DEFAULT_VOICES.vi, speed: 1 },
        visuals: {},
        effects: [],
        layoutId: 'builtin-neonSign',
        eyebrow: 'PROFILE ID',
        fileId: 'uFlo',
        chips: ['OPEN SOURCE', 'MULTI-AGENT', 'TỐI ƯU'],
      },
      {
        id: 'seg-numbered',
        durationSec: 3,
        scene: 'keypoint',
        text: 'Chip AI Huawei cháy hàng',
        voice: { provider: 'edge-tts', voiceId: DEFAULT_VOICES.vi, speed: 1 },
        visuals: {},
        effects: [],
        layoutId: 'builtin-numberedSteps',
        eyebrow: 'TRUNG QUỐC BỨT PHÁ',
        fileId: '01',
        chips: ['AI KHÔNG CẦN MỸ', 'NGÀNH AI CHẤN ĐỘNG', 'CỘNG ĐỒNG NGỠ NGÀNG'],
      },
      {
        id: 'seg-mesh',
        durationSec: 3,
        scene: 'keypoint',
        text: 'Toto làm chip AI?',
        voice: { provider: 'edge-tts', voiceId: DEFAULT_VOICES.vi, speed: 1 },
        visuals: {},
        effects: [],
        layoutId: 'builtin-gradientMesh',
        eyebrow: 'HÀNG BỎN CẦU NỐI TIẾNG',
        chips: ['BƯỚC VÀO CHUỖI BÁN DẪN', 'CỔ PHIẾU TĂNG VỌT'],
      },
      {
        id: 'seg-crt',
        durationSec: 3,
        scene: 'title',
        text: 'Thứ gì đang quay trở lại?',
        voice: { provider: 'edge-tts', voiceId: DEFAULT_VOICES.vi, speed: 1 },
        visuals: {},
        effects: [],
        layoutId: 'builtin-crtTerminal',
        eyebrow: 'PRIMARY METRIC',
        fileId: 'LIVE EP: 8 / OS 4',
        chips: ['TRONG THỜI ĐẠI AI', 'DẪN DẮT XU HƯỚNG'],
      },
      {
        id: 'seg-comparison',
        durationSec: 3,
        scene: 'keypoint',
        text: 'AI thắng bác sĩ?',
        voice: { provider: 'edge-tts', voiceId: DEFAULT_VOICES.vi, speed: 1 },
        visuals: {},
        effects: [],
        layoutId: 'builtin-comparisonSplit',
        eyebrow: 'EVIDENCE OVERLAY',
        fileId: '15 NĂM SINH NGHIỆM',
        chips: ['Triệu ca bệnh', 'Kết quả bất ngờ', 'FDA duyệt thử nghiệm'],
      },
    ],
    variants: [],
    userTextStyles: [],
  })
}

async function main() {
  console.log(`[smoke-layouts] writing storyboard for ${PROJECT_ID}...`)
  const project = buildStoryboard()
  await writeStoryboard(PROJECT_ID, project)

  console.log(
    `[smoke-layouts] rendering — ${project.segments.length} segments × ` +
      `${project.segments.length > 0 ? LAYOUTS_TO_TEST.length : 0} layouts...`
  )
  const t0 = Date.now()
  let lastPct = -1
  const outPaths = await renderProjectMedia(PROJECT_ID, {
    onProgress: (p) => {
      const pct = Math.floor(p * 100)
      if (pct !== lastPct && pct % 10 === 0) {
        lastPct = pct
        console.log(`  progress: ${pct}%`)
      }
    },
  })
  const ms = Date.now() - t0
  console.log(`[smoke-layouts] rendered in ${(ms / 1000).toFixed(1)}s`)

  // Single output expected (no variants).
  const outPath = outPaths[0]
  if (!outPath || !existsSync(outPath)) {
    throw new Error(`Render reported success but no mp4 at ${outPath ?? '(no path)'}`)
  }
  const size = statSync(outPath).size
  const kb = (size / 1024) | 0
  if (size < 50_000) {
    throw new Error(
      `[smoke-layouts] output suspiciously small (${kb} KB) — likely an empty composition`
    )
  }
  console.log(`[smoke-layouts] OK → ${outPath} (${kb} KB)`)
  console.log('[smoke-layouts] open the mp4 to verify each layout renders cleanly:')
  for (const seg of project.segments) {
    console.log(`  - ${seg.layoutId} (${seg.text.slice(0, 50)})`)
  }
}

main().catch((err) => {
  console.error('[smoke-layouts] failed:', err)
  process.exit(1)
})
