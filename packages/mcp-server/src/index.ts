import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import {
  AspectSchema,
  LanguageSchema,
  ProjectSchema,
} from '@news-tok/shared/schema'
import {
  fitSegmentDurations,
  normalizeAssetPaths,
  normalizeSceneNames,
  reconcileLibrary,
  recommendSegmentDurationSec,
  stripEmoji,
} from '@news-tok/shared/sanitize'
import {
  archive,
  crawler,
  extractArticle,
  listVoices,
  openverse,
  pexels,
  pixabay,
  synthesize,
  unsplash,
  wikimedia,
} from '@news-tok/media'
import {
  dataDir,
  deleteProject as deleteProjectFiles,
  projectScenesDir,
  projectStoryboardPath,
  readStoryboard,
  renderProjectMedia,
  renderSegmentMedia,
  writeStoryboard,
} from '@news-tok/render'
import { readdir } from 'node:fs/promises'
import { DEFAULT_VOICES } from '@news-tok/shared/schema'
import { generateSocialCaptions } from '@news-tok/shared/social'
import { createProject, listProjects } from './projects.js'
import { researchProjectAesthetic } from './research.js'
import {
  runGenerateThumbnail,
  runRegenerateThumbnail,
  runPreviewSafeZones,
  generateThumbnailInputSchema,
  regenerateThumbnailInputSchema,
  previewSafeZonesInputSchema,
} from './thumbnail-tools.js'

function ok(payload: unknown) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)
  return { content: [{ type: 'text' as const, text }] }
}

function fail(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  return {
    content: [{ type: 'text' as const, text: `Error: ${msg}` }],
    isError: true,
  }
}

/**
 * Built-in scene kinds registered in
 * `packages/remotion/src/scenes/registry.ts`. Anything else has to be a
 * custom scene file under `data/projects/<id>/scenes/` (loaded by
 * `packages/render/src/bundle.ts`); names outside both sets fail the
 * Studio PATCH and the MCP `updateStoryboard` guard with a clear
 * "Unknown scene" message that suggests the lowercase correction.
 */
const BUILT_IN_SCENE_KINDS = new Set(['title', 'keypoint', 'quote', 'outro'])

async function listProjectCustomSceneNames(projectId: string): Promise<Set<string>> {
  const dir = projectScenesDir(projectId)
  if (!existsSync(dir)) return new Set()
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return new Set(
      entries
        .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
        .map((e) => e.name.replace(/\.tsx?$/, ''))
    )
  } catch {
    return new Set()
  }
}

/**
 * Validate that every segment.scene resolves to a built-in kind or a
 * custom scene file. Returns the offending segments with a `suggestion`
 * for common PascalCase typos so the caller can fix-and-retry rather
 * than guess what went wrong.
 */
async function validateSceneNames(
  projectId: string,
  project: { segments: { id: string; scene: string }[] }
): Promise<{ segmentId: string; scene: string; suggestion?: string }[]> {
  const custom = await listProjectCustomSceneNames(projectId)
  const bad: { segmentId: string; scene: string; suggestion?: string }[] = []
  for (const seg of project.segments) {
    const name = String(seg.scene)
    if (BUILT_IN_SCENE_KINDS.has(name)) continue
    if (custom.has(name)) continue
    const lower = name.toLowerCase()
    const suggestion =
      lower === 'titlecard' ? 'title' :
      lower === 'keypoint' ? 'keypoint' :
      lower === 'outro' ? 'outro' :
      lower === 'quote' ? 'quote' :
      lower === 'missingscene' ? 'title' :
      undefined
    bad.push({ segmentId: seg.id, scene: name, suggestion })
  }
  return bad
}

async function main() {
  if (process.env.ANTHROPIC_API_KEY) {
    process.stderr.write(
      '[news-tok-mcp] warning: ANTHROPIC_API_KEY is set; Claude CLI will bill via API instead of your subscription.\n'
    )
  }

  const server = new McpServer(
    { name: 'news-tok', version: '0.1.0' },
    { capabilities: { tools: {} } }
  )

  server.registerTool(
    'createProject',
    {
      title: 'Create a new video project',
      description:
        'Create a new news-tok project folder under data/projects/<id>/ with an empty storyboard.json. Returns the projectId and the absolute path to the storyboard. Aspect supports 9:16 (1080x1920, default for TikTok/Reels/Shorts), 16:9 (1920x1080, for YouTube/landscape), and 1:1 (1080x1080, for Facebook/Instagram feed). At 1:1 a curated subset of layouts is supported — others auto-fall-back to FullBleed at render time. Supported 1:1 layouts: builtin-fullBleed, builtin-storyPill, builtin-storyChip, builtin-storyVtv, builtin-card, builtin-magazineCover, builtin-statHero, builtin-breakingNews, builtin-newstokvn-keypoint-flame, builtin-newstokvn-keypoint-highlight, builtin-newstokvn-keypoint-quote, builtin-newstokvn-keypoint-bulletin, builtin-newstokvn-keypoint-comparison, builtin-newstokvn-keypoint-international.',
      inputSchema: {
        source: z.object({
          type: z.enum(['text', 'url', 'file']),
          value: z.string().min(1),
        }),
        language: LanguageSchema,
        aspect: AspectSchema,
        title: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const result = await createProject({
          source: args.source,
          language: args.language,
          aspect: args.aspect,
          title: args.title,
        })
        return ok(result)
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'listProjects',
    {
      title: 'List existing projects',
      description: 'Return a summary of all projects under data/projects/, sorted most recently updated first.',
      inputSchema: {},
    },
    async () => {
      try {
        const items = await listProjects()
        return ok({ projects: items, count: items.length })
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'getStoryboard',
    {
      title: 'Read a project storyboard',
      description: 'Return the parsed storyboard.json for the given projectId.',
      inputSchema: { projectId: z.string().min(1) },
    },
    async ({ projectId }) => {
      try {
        const path = projectStoryboardPath(projectId)
        if (!existsSync(path)) {
          return fail(new Error(`No storyboard at ${path}`))
        }
        const raw = await readFile(path, 'utf8')
        const parsed = ProjectSchema.safeParse(JSON.parse(raw))
        if (!parsed.success) {
          return fail(
            new Error(
              `Invalid storyboard: ${parsed.error.issues
                .map((i) => `${i.path.join('.')}: ${i.message}`)
                .join('; ')}`
            )
          )
        }
        return ok(parsed.data)
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'updateStoryboard',
    {
      title: 'Persist a full project storyboard',
      description:
        "Write a fully-formed project JSON to data/projects/<id>/storyboard.json. " +
        "Each segment's `scene` field must be a lowercase kind — one of `title`, `keypoint`, `quote`, `outro` — OR the filename (without extension) of a custom scene under data/projects/<id>/scenes/. " +
        "Do NOT use PascalCase React component names like `TitleCard` / `KeyPoint` / `Outro` — these are filenames, not scene values. " +
        "The tool runs Studio-equivalent sanitisation (strip emoji from title + every segment.text, lowercase + remap known PascalCase scene typos, stretch each segment.durationSec to fit narration + 0.4s buffer) and validates against ProjectSchema before writing. Returns the persisted project plus lists of any duration adjustments and scene-name corrections applied.",
      inputSchema: {
        projectId: z.string().min(1),
        project: z.unknown(),
      },
    },
    async ({ projectId, project }) => {
      try {
        const parsed = ProjectSchema.safeParse(project)
        if (!parsed.success) {
          const issues = parsed.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          }))
          return fail(
            new Error(
              `Invalid project payload (${issues.length} issue${issues.length === 1 ? '' : 's'}): ` +
                issues.map((i) => `${i.path || '<root>'}: ${i.message}`).join('; ')
            )
          )
        }
        if (parsed.data.id !== projectId) {
          return fail(
            new Error(`Project id mismatch: payload.id=${parsed.data.id} vs projectId=${projectId}`)
          )
        }
        // Sanitisation chain — same shape Studio's PATCH runs so MCP +
        // HTTP callers end up with identical on-disk state.
        //   1. Strip emoji from title + every segment.text
        //   2. Normalize scene names: lowercase + map common PascalCase
        //      typos (TitleCard→title, KeyPoint→keypoint, …) so the
        //      orchestrator can't accidentally save a name the
        //      renderer doesn't know.
        //   3. Stretch each segment.durationSec to fit narration.
        const stripped = {
          ...parsed.data,
          title: stripEmoji(parsed.data.title),
          segments: parsed.data.segments.map((s) => ({ ...s, text: stripEmoji(s.text) })),
          updatedAt: new Date().toISOString(),
        }
        const { project: scenesNormalized, adjustments: sceneAdjustments } =
          normalizeSceneNames(stripped)
        // Hard guard for anything sanitiser couldn't auto-fix: still
        // an unknown scene? Reject with a clear suggestion so the
        // caller can retry rather than hit a render-time "Unknown
        // scene" 30 seconds later.
        const badScenes = await validateSceneNames(projectId, scenesNormalized)
        if (badScenes.length > 0) {
          return fail(
            new Error(
              `Unknown scene name${badScenes.length > 1 ? 's' : ''}: ` +
                badScenes
                  .map((b) =>
                    b.suggestion
                      ? `"${b.scene}" (segment ${b.segmentId}; did you mean "${b.suggestion}"?)`
                      : `"${b.scene}" (segment ${b.segmentId})`
                  )
                  .join(', ')
            )
          )
        }
        const { project: fitted, adjustments } = fitSegmentDurations(scenesNormalized)
        // Reconcile project.library with the project's actual media:
        // dedupe existing entries, then mirror every segment background
        // into the library so Studio's Library tab is always the
        // authoritative "all media currently in this project" view —
        // stock backgrounds, article-seeded images, manual uploads
        // alike.
        const {
          project: withLibrary,
          added: libraryAdded,
          deduped: libraryDeduped,
        } = reconcileLibrary(fitted)
        // Rewrite AssetRef paths to the relative-to-data/ form last,
        // after reconcileLibrary's segment mirroring has had a chance
        // to add new entries. AI orchestrators that call searchImage
        // get back absolute paths (cache adapters still emit those);
        // this is the chokepoint that converts them before they hit
        // disk so the storyboard stays portable.
        const { project: pathsNormalized, converted: pathsConverted } =
          normalizeAssetPaths(withLibrary, dataDir())
        // Re-parse so the on-disk file is always schema-clean even if the
        // sanitisation step accidentally introduced an invalid shape.
        const final = ProjectSchema.parse(pathsNormalized)
        await writeStoryboard(projectId, final)
        return ok({
          project: final,
          adjustments,
          sceneAdjustments,
          libraryAdded,
          libraryDeduped,
          pathsConverted,
        })
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'deleteProject',
    {
      title: 'Permanently delete a project directory',
      description:
        "Recursively remove data/projects/<id>/ — storyboard, scenes, per-segment mp4s, and any rendered output. This is irreversible. The caller must pass `confirm: true` so a stray invocation cannot wipe out a real project; without it the tool returns an error. Use only for test or abandoned projects; for archiving prefer leaving the folder untouched.",
      inputSchema: {
        projectId: z.string().min(1),
        confirm: z.literal(true).describe('Must be exactly `true` — guards against accidental deletion.'),
      },
    },
    async ({ projectId, confirm }) => {
      try {
        if (confirm !== true) {
          return fail(new Error('deleteProject requires `confirm: true`'))
        }
        await deleteProjectFiles(projectId)
        return ok({ deleted: projectId })
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'extractArticle',
    {
      title: 'Extract clean article text + media from a URL',
      description:
        "Fetch a URL and run Mozilla Readability + emoji-strip on the result. " +
        "Returns {title, text, byline, excerpt, siteName, lang, media, mediaAssets}. " +
        "`media` is the raw list of image/video URLs found in the article DOM (og:image / figure / inline img). " +
        "`mediaAssets` is the AssetRef[] for images that were auto-downloaded into the cache (videos are listed but never auto-downloaded — they can be hundreds of MB). " +
        "When orchestrating a video: stock photos via `searchImage` are usually higher quality / better aspect for short-form video, so prefer those for segment backgrounds. The article's own images live in `mediaAssets` either way and will appear in the project Library after `updateStoryboard` saves the storyboard, giving the user a one-click option to swap a stock photo for the article's actual photo.",
      inputSchema: {
        url: z.string().url(),
        force: z.boolean().optional(),
        skipMediaDownload: z
          .boolean()
          .optional()
          .describe('Set true when only the text is needed (e.g. caption rewrites) to skip image downloads.'),
      },
    },
    async ({ url, force, skipMediaDownload }) => {
      try {
        const article = await extractArticle(url, { force, skipMediaDownload })
        return ok(article)
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'searchImage',
    {
      title: 'Search a free stock image',
      description:
        'Search for an image and return an AssetRef. Default provider is Pexels (most reliable). Use "wikimedia" when the query is a proper noun — named people, places, events, logos, maps, or historical photos — since Pexels/Unsplash only carry generic stock for those. Crawl-based providers ("crawl:pixabay-image", "crawl:unsplash") use a headless Chromium to bypass Cloudflare JA3 fingerprinting; they are slower but work when the JSON APIs are blocked or rate-limited.',
      inputSchema: {
        query: z.string().min(1),
        orientation: z.enum(['landscape', 'portrait', 'square']).optional(),
        provider: z
          .enum([
            'pexels',
            'unsplash',
            'pixabay',
            'openverse',
            'wikimedia',
            'crawl:pixabay-image',
            'crawl:unsplash',
          ])
          .optional(),
      },
    },
    async ({ query, orientation, provider }) => {
      try {
        const which = provider ?? 'pexels'
        if (which.startsWith('crawl:')) {
          const name = which.slice('crawl:'.length)
          const asset = await crawler.crawlImage({
            provider: name,
            params: { query, orientation },
          })
          return ok(asset)
        }
        if (which === 'pixabay') {
          const pxOrientation =
            orientation === 'landscape'
              ? 'horizontal'
              : orientation === 'portrait'
                ? 'vertical'
                : 'all'
          const asset = await pixabay.searchImage({ query, orientation: pxOrientation })
          return ok(asset)
        }
        if (which === 'unsplash') {
          const asset = await unsplash.searchImage({ query, orientation })
          return ok(asset)
        }
        if (which === 'openverse') {
          const asset = await openverse.searchImage({ query, orientation })
          return ok(asset)
        }
        if (which === 'wikimedia') {
          const asset = await wikimedia.searchImage({ query, orientation })
          return ok(asset)
        }
        const asset = await pexels.searchImage({ query, orientation })
        return ok(asset)
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'searchMusic',
    {
      title: 'Search free background music',
      description:
        'Search free music tracks matching the mood, picking the result whose duration is closest to durationSec. Default provider is Internet Archive (CC0/CC-BY filtered for commercial use). Pixabay is available as a fallback but may be rate-limited by Cloudflare.',
      inputSchema: {
        mood: z.string().min(1),
        durationSec: z.number().positive(),
        provider: z.enum(['archive', 'pixabay']).optional(),
      },
    },
    async ({ mood, durationSec, provider }) => {
      try {
        const which = provider ?? 'archive'
        if (which === 'pixabay') {
          const asset = await pixabay.searchMusic({ mood, durationSec })
          return ok(asset)
        }
        const asset = await archive.searchMusic({ mood, durationSec })
        return ok(asset)
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'synthesizeVoice',
    {
      title: 'Synthesize narration via Edge TTS',
      description:
        'Generate an mp3 narration using Microsoft Edge neural voices (free). Returns {asset, durationSec, wordBoundaries, recommendedSegmentDurationSec}. The orchestrator should set segment.durationSec = recommendedSegmentDurationSec after this call so the narration is never clipped by a too-short slot.',
      inputSchema: {
        text: z.string().min(1),
        voiceId: z.string().min(1),
        speed: z.number().min(0.5).max(2).optional(),
      },
    },
    async ({ text, voiceId, speed }) => {
      try {
        const result = await synthesize({ text, voiceId, speed })
        // Surface a one-number hint so the orchestrator can write
        // `segment.durationSec = recommendedSegmentDurationSec` directly
        // and avoid narration getting clipped by a too-short slot.
        const recommendedSegmentDurationSec =
          result.durationSec > 0
            ? recommendSegmentDurationSec(result.durationSec)
            : undefined
        return ok({ ...result, recommendedSegmentDurationSec })
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'listVoices',
    {
      title: 'List available Edge TTS voices',
      description: 'Return the Edge TTS voice list, optionally filtered to "vi" or "en".',
      inputSchema: {
        language: LanguageSchema.optional(),
      },
    },
    async ({ language }) => {
      try {
        const voices = await listVoices(language)
        return ok({ count: voices.length, voices })
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'regenerateAllVoices',
    {
      title: 'Batch-synthesize narration for every segment of a project',
      description:
        "Re-run Edge TTS for every segment in data/projects/<id>/storyboard.json. By default only fills segments missing audio.narration (pass onlyMissing=false to overwrite existing narration). When voiceId is set, every segment is forced onto that voice (useful after the user changes the project voice); otherwise each segment keeps its current voiceId. Runs sequentially because Edge TTS rate-limits parallel WebSocket bursts. Writes the updated storyboard to disk once at the end. Returns per-segment status plus a summary {total, synthesized, skipped, failed}. Use this when the user asks to 'gen voice tất cả' or after a batch text edit.",
      inputSchema: {
        projectId: z.string().min(1),
        voiceId: z.string().min(1).optional(),
        speed: z.number().min(0.5).max(2).optional(),
        onlyMissing: z.boolean().optional(),
      },
    },
    async ({ projectId, voiceId: overrideVoiceId, speed, onlyMissing }) => {
      try {
        const project = await readStoryboard(projectId)
        const defaultVoiceId = DEFAULT_VOICES[project.language]
        const fillOnlyMissing = onlyMissing ?? true

        type SegmentResult = {
          segmentId: string
          status: 'synthesized' | 'skipped' | 'failed'
          durationSec?: number
          voiceId?: string
          error?: string
        }
        const results: SegmentResult[] = []
        let mutated = false

        for (const segment of project.segments) {
          if (!segment.text || segment.text.trim().length === 0) {
            results.push({ segmentId: segment.id, status: 'skipped' })
            continue
          }
          if (fillOnlyMissing && segment.audio?.narration?.path) {
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
            results.push({
              segmentId: segment.id,
              status: 'failed',
              voiceId,
              error: err instanceof Error ? err.message : String(err),
            })
          }
        }

        if (mutated) {
          project.updatedAt = new Date().toISOString()
          await writeStoryboard(projectId, project)
        }

        const summary = {
          total: results.length,
          synthesized: results.filter((r) => r.status === 'synthesized').length,
          skipped: results.filter((r) => r.status === 'skipped').length,
          failed: results.filter((r) => r.status === 'failed').length,
        }
        return ok({ projectId, results, summary })
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'renderSegment',
    {
      title: 'Render a single segment',
      description:
        'Render one segment of a project to data/projects/<id>/segments/<segmentId>.mp4. Use after editing a segment to preview just that change.',
      inputSchema: {
        projectId: z.string().min(1),
        segmentId: z.string().min(1),
      },
    },
    async ({ projectId, segmentId }) => {
      try {
        const outPath = await renderSegmentMedia(projectId, segmentId)
        return ok({ outputPath: outPath })
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'researchProjectAesthetic',
    {
      title: 'Recommend variants + music mood from an article',
      description:
        'Classify an article by topic (crime / finance / tech / health / sports / entertainment / lifestyle / travel / food / nature / politics / education / generic) using cheap keyword matching, then return a set of three variant picks (textStyleId per scene kind) and a music mood string compatible with `searchMusic`. Optionally returns one or two tailored TextStyle JSON entries when `proposeNewStyles=true` — the orchestrator should append those to project.userTextStyles before render. Deterministic, sub-millisecond, no network. Call this right after `extractArticle` and use the result to seed the project.',
      inputSchema: {
        articleTitle: z.string(),
        articleText: z.string(),
        language: LanguageSchema,
        userStyles: z.array(z.any()).optional(),
        proposeNewStyles: z.boolean().optional(),
      },
    },
    async ({ articleTitle, articleText, language, userStyles, proposeNewStyles }) => {
      try {
        const result = researchProjectAesthetic({
          articleTitle,
          articleText,
          language,
          userStyles: userStyles as Parameters<typeof researchProjectAesthetic>[0]['userStyles'],
          proposeNewStyles,
        })
        return ok(result)
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'generateSocialCaption',
    {
      title: 'Draft social-media captions + hashtags from a storyboard',
      description:
        "Pulls title + segment.text from data/projects/<id>/storyboard.json and produces four caption variants the user can paste straight into a social post: one tuned for TikTok (hook + 2 bullets + tight tag tail), one for Facebook (narrative with numbered keypoints + CTA), one for Instagram (emoji-led hook + arrow-bulleted keypoints + dense hashtag block), and one for YouTube (SEO-first hook + 2-3 keypoint paragraphs + sparse hashtag tail starting with #shorts). Hashtags are topic-aware: the tool auto-classifies the project via the same keyword classifier as researchProjectAesthetic (override by passing `topic`), unions a topic-specific pool with keywords extracted from the title and a few evergreen high-reach tags, deduped and capped at 12. Tier-1 sensitive words (chết / giết / tự tử / ma túy / kill / suicide / drug / gun) are auto-masked per platform: TikTok / IG / YouTube get dot-insert (c.h.ế.t), Facebook gets euphemism (không còn). Pass `sanitize: { facebook: 'off' }` etc to override. Known IG-banned hashtags (#alone, #killingit) are stripped defensively across all platforms. 100% local — no LLM call.",
      inputSchema: {
        projectId: z.string().min(1),
        topic: z
          .enum([
            'crime',
            'finance',
            'tech',
            'health',
            'sports',
            'entertainment',
            'lifestyle',
            'travel',
            'food',
            'nature',
            'politics',
            'education',
            'generic',
          ])
          .optional(),
      },
    },
    async ({ projectId, topic }) => {
      try {
        const path = projectStoryboardPath(projectId)
        if (!existsSync(path)) {
          return fail(new Error(`No storyboard at ${path}`))
        }
        const raw = await readFile(path, 'utf8')
        const parsed = ProjectSchema.safeParse(JSON.parse(raw))
        if (!parsed.success) {
          return fail(
            new Error(
              `Invalid storyboard: ${parsed.error.issues
                .map((i) => `${i.path.join('.')}: ${i.message}`)
                .join('; ')}`
            )
          )
        }
        const project = parsed.data
        // generateSocialCaptions auto-classifies when topic is undefined.
        const result = generateSocialCaptions({ project, topic })
        return ok(result)
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'rewriteSocialCaptions',
    {
      title: 'Persist Claude-rewritten social captions onto the project',
      description:
        "Use this AFTER calling generateSocialCaption (baseline) and rewriting each caption per CLAUDE.md guidance. The tool ENFORCES per-platform upper bounds and REJECTS any payload that exceeds them — TikTok MUST be ≤250 chars, Facebook ≤800, Instagram ≤500, YouTube ≤1500. When rejected, the error message names every offending platform with its actual count and how many chars to drop; shorten those captions and call this tool again. The retry-until-accepted loop is the success path. On success, captions + hashtags persist into `project.socialCaptions` so Studio's caption dialog shows them next time. charCount is computed automatically. Pass `source: 'llm-rewrite'` (default) to mark these as Claude-generated; pass `source: 'template'` to seed the cache with the raw template.",
      inputSchema: {
        projectId: z.string().min(1),
        topic: z.string().min(1),
        captions: z
          .array(
            z.object({
              platform: z.enum(['tiktok', 'facebook', 'instagram', 'youtube']),
              text: z.string().min(1),
            })
          )
          .min(1)
          .max(4),
        hashtags: z.array(z.string()).min(1).max(30),
        source: z.enum(['template', 'llm-rewrite']).optional(),
      },
    },
    async ({ projectId, topic, captions, hashtags, source }) => {
      try {
        const path = projectStoryboardPath(projectId)
        if (!existsSync(path)) {
          return fail(new Error(`No storyboard at ${path}`))
        }
        const raw = await readFile(path, 'utf8')
        const parsed = ProjectSchema.safeParse(JSON.parse(raw))
        if (!parsed.success) {
          return fail(
            new Error(
              `Invalid storyboard: ${parsed.error.issues
                .map((i) => `${i.path.join('.')}: ${i.message}`)
                .join('; ')}`
            )
          )
        }
        const project = parsed.data
        // Normalise hashtags: ensure each starts with '#', trim, dedupe.
        const cleanedHashtags = Array.from(
          new Set(
            hashtags
              .map((h) => h.trim())
              .filter(Boolean)
              .map((h) => (h.startsWith('#') ? h : `#${h}`))
          )
        )
        const captionEntries = captions.map((c) => ({
          platform: c.platform,
          text: c.text,
          charCount: c.text.length,
        }))
        // Per-platform upper bound enforcement. Caption that overshoots
        // hurts reach (TikTok/IG truncate, Facebook collapses with
        // "See more" cutting the CTA) — the whole point of the rewrite
        // is to land inside the sweet spot. Reject hard so Claude CLI
        // retries the rewrite instead of saving an oversized result.
        const PLATFORM_MAX_CHARS = {
          tiktok: 250,
          facebook: 800,
          instagram: 500,
          youtube: 1500,
        } as const
        const oversized = captionEntries.filter(
          (c) => c.charCount > PLATFORM_MAX_CHARS[c.platform]
        )
        if (oversized.length > 0) {
          const detail = oversized
            .map(
              (c) =>
                `${c.platform} is ${c.charCount} chars but the sweet-spot max is ${PLATFORM_MAX_CHARS[c.platform]} (shorten by ${c.charCount - PLATFORM_MAX_CHARS[c.platform]} chars)`
            )
            .join('; ')
          return fail(
            new Error(
              `Caption length exceeds sweet spot — please rewrite shorter and call this tool again. ${detail}.`
            )
          )
        }
        const next = {
          ...project,
          socialCaptions: {
            generatedAt: new Date().toISOString(),
            topic,
            source: source ?? ('llm-rewrite' as const),
            hashtags: cleanedHashtags,
            captions: captionEntries,
          },
          updatedAt: new Date().toISOString(),
        }
        // Re-validate through the schema so a bad payload from Claude
        // (e.g. text exceeding string limit somewhere) fails loudly
        // here instead of corrupting the storyboard on disk.
        const reparsed = ProjectSchema.safeParse(next)
        if (!reparsed.success) {
          return fail(
            new Error(
              `Rewritten captions failed validation: ${reparsed.error.issues
                .map((i) => `${i.path.join('.')}: ${i.message}`)
                .join('; ')}`
            )
          )
        }
        await writeStoryboard(projectId, reparsed.data)
        return ok({
          projectId,
          captionsCount: captionEntries.length,
          hashtagCount: cleanedHashtags.length,
          generatedAt: reparsed.data.socialCaptions?.generatedAt,
        })
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'renderProject',
    {
      title: 'Render the full project video',
      description:
        'Render the project. With no `variants` arg, behaves as before and writes data/projects/<id>/output.mp4. Pass `variants: ["A"]` to render a single variant, `variants: ["A","B","C"]` to render specific ones, or `variants: "all"` to render every variant declared on the project. Each variant produces data/projects/<id>/output-<variantId>.mp4 and the response returns the list of output paths.',
      inputSchema: {
        projectId: z.string().min(1),
        variants: z.union([z.array(z.string()), z.literal('all')]).optional(),
      },
    },
    async ({ projectId, variants }) => {
      try {
        const outPaths = await renderProjectMedia(projectId, { variants })
        return ok({ outputPaths: outPaths })
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'generateThumbnail',
    {
      title: 'Generate a social-upload thumbnail (1080x1920 JPG)',
      description:
        'Generate a 1080x1920 JPG thumbnail for the project, sized to be safe on TikTok / YT Shorts / FB Reels / IG Reels (single shared file). Requires renderProject to have completed — the tool extracts 5 candidate frames from output.mp4 (10/30/50/70/90%), picks the middle one as background, drops the headline + eyebrow chip + watermark inside the universal safe zone (y=250..1440), and renders the still to data/projects/<id>/thumb.jpg. Auto-classifies topic from the project (crime → news-breaking red plate, entertainment → bomb yellow chip, tech/health → science-clean gradient, education/travel/food → knowledge-bookish cream, sports → sports-hype). Pass `layout` to override. The Thumbnail config (layout, background, edits, candidateFrames, warnings) persists into project.thumbnail so Studio can edit it.',
      inputSchema: generateThumbnailInputSchema,
    },
    async (args) => {
      try {
        const result = await runGenerateThumbnail(args)
        return ok(result)
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'regenerateThumbnail',
    {
      title: 'Re-render the thumbnail keeping current edits',
      description:
        'Re-extract candidate frames from output.mp4 and re-render thumb.jpg using the current project.thumbnail edits (title, position, eyebrow, layout, watermark). Use after a fresh renderProject when you want the thumbnail to reflect new video content but keep the user-tuned text + styling. If project.thumbnail is missing, falls back to a full generateThumbnail.',
      inputSchema: regenerateThumbnailInputSchema,
    },
    async (args) => {
      try {
        const result = await runRegenerateThumbnail(args)
        return ok(result)
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'previewSafeZones',
    {
      title: 'List platform safe-zone rects for thumbnail editing',
      description:
        'Return every platform UI overlay rect for TikTok / YT Shorts / FB Reels / IG Reels on a 1080x1920 canvas. The Studio editor draws these as translucent masks so users can verify their headline + face placement reads on every platform. Useful as a no-render lint pass before regenerating.',
      inputSchema: previewSafeZonesInputSchema,
    },
    async (args) => {
      try {
        const result = await runPreviewSafeZones(args)
        return ok(result)
      } catch (err) {
        return fail(err)
      }
    }
  )

  const transport = new StdioServerTransport()
  await server.connect(transport)
  process.stderr.write('[news-tok-mcp] ready on stdio\n')
}

// Never let an uncaught error in a third-party lib (notably the
// edge-tts WebSocket, which sometimes emits 'error' after we've already
// rejected the synth promise) take down the stdio server. Log and keep
// the process alive — the next MCP tool call will simply succeed or
// surface its own error via the tool wrapper.
process.on('uncaughtException', (err) => {
  process.stderr.write(
    `[news-tok-mcp] uncaughtException (ignored): ${
      err instanceof Error ? err.stack ?? err.message : String(err)
    }\n`
  )
})
process.on('unhandledRejection', (reason) => {
  process.stderr.write(
    `[news-tok-mcp] unhandledRejection (ignored): ${
      reason instanceof Error ? reason.stack ?? reason.message : String(reason)
    }\n`
  )
})

main().catch((err) => {
  process.stderr.write(`[news-tok-mcp] fatal: ${err instanceof Error ? err.stack : String(err)}\n`)
  process.exit(1)
})
