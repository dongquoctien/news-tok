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
  archive,
  extractArticle,
  listVoices,
  pexels,
  pixabay,
  synthesize,
  unsplash,
} from '@news-tok/media'
import {
  projectStoryboardPath,
  renderProjectMedia,
  renderSegmentMedia,
} from '@news-tok/render'
import { createProject, listProjects } from './projects.js'

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
        'Search Pexels (default), Unsplash, or Pixabay for an image matching the query, download into the local cache, and return an AssetRef. Note: Pixabay sits behind Cloudflare and is occasionally rate-limited from Node; prefer Pexels or Unsplash for reliability.',
      inputSchema: {
        query: z.string().min(1),
        orientation: z.enum(['landscape', 'portrait', 'square']).optional(),
        provider: z.enum(['pexels', 'unsplash', 'pixabay']).optional(),
      },
    },
    async ({ query, orientation, provider }) => {
      try {
        const which = provider ?? 'pexels'
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
        'Generate an mp3 narration using Microsoft Edge neural voices (free). Returns {asset, durationSec, wordBoundaries}.',
      inputSchema: {
        text: z.string().min(1),
        voiceId: z.string().min(1),
        speed: z.number().min(0.5).max(2).optional(),
      },
    },
    async ({ text, voiceId, speed }) => {
      try {
        const result = await synthesize({ text, voiceId, speed })
        return ok(result)
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
    'renderProject',
    {
      title: 'Render the full project video',
      description:
        'Render the entire project composition to data/projects/<id>/output.mp4. Use as the final step after the storyboard and all per-segment assets are ready.',
      inputSchema: { projectId: z.string().min(1) },
    },
    async ({ projectId }) => {
      try {
        const outPath = await renderProjectMedia(projectId)
        return ok({ outputPath: outPath })
      } catch (err) {
        return fail(err)
      }
    }
  )

  const transport = new StdioServerTransport()
  await server.connect(transport)
  process.stderr.write('[news-tok-mcp] ready on stdio\n')
}

main().catch((err) => {
  process.stderr.write(`[news-tok-mcp] fatal: ${err instanceof Error ? err.stack : String(err)}\n`)
  process.exit(1)
})
