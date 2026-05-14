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
  deleteProject as deleteProjectFiles,
  projectStoryboardPath,
  renderProjectMedia,
  renderSegmentMedia,
  writeStoryboard,
} from '@news-tok/render'
import { generateSocialCaptions } from '@news-tok/shared/social'
import { createProject, listProjects } from './projects.js'
import { researchProjectAesthetic } from './research.js'

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
        'Create a new news-tok project folder under data/projects/<id>/ with an empty storyboard.json. Returns the projectId and the absolute path to the storyboard.',
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
        "Write a fully-formed project JSON to data/projects/<id>/storyboard.json. The tool runs Studio-equivalent sanitisation (strip emoji from title + every segment.text, stretch each segment.durationSec to fit narration + 0.4s buffer) and validates the result against ProjectSchema before writing. Prefer this over raw Write/Edit on storyboard.json so the file never lands in an invalid state. Returns the persisted project (after sanitisation) plus a list of duration adjustments the helper applied, if any.",
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
        // Sanitisation chain: strip emoji from title + every segment.text,
        // then stretch durations to fit narration. Same chain Studio's
        // PATCH /api/projects/[id] runs, so MCP and HTTP callers end up
        // with identical on-disk shape.
        const cleaned = {
          ...parsed.data,
          title: stripEmoji(parsed.data.title),
          segments: parsed.data.segments.map((s) => ({ ...s, text: stripEmoji(s.text) })),
          updatedAt: new Date().toISOString(),
        }
        const { project: fitted, adjustments } = fitSegmentDurations(cleaned)
        // Re-parse so the on-disk file is always schema-clean even if the
        // sanitisation step accidentally introduced an invalid shape.
        const final = ProjectSchema.parse(fitted)
        await writeStoryboard(projectId, final)
        return ok({ project: final, adjustments })
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
      title: 'Extract clean article text from a URL',
      description:
        'Fetch a URL and run Mozilla Readability + emoji-strip on the result. Returns {title, text, byline, excerpt, siteName, lang}.',
      inputSchema: {
        url: z.string().url(),
        force: z.boolean().optional(),
      },
    },
    async ({ url, force }) => {
      try {
        const article = await extractArticle(url, { force })
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
        "Pulls title + segment.text from data/projects/<id>/storyboard.json and produces three caption variants the user can paste straight into a social post: one tuned for TikTok (hook + 2 bullets + tight tag tail), one for Facebook (narrative with numbered keypoints + CTA), one for Instagram (emoji-led hook + arrow-bulleted keypoints + dense hashtag block). Hashtags are topic-aware: the tool auto-classifies the project via the same keyword classifier as researchProjectAesthetic (override by passing `topic`), unions a topic-specific pool with keywords extracted from the title and a few evergreen high-reach tags, deduped and capped at 12. 100% local — no LLM call.",
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
