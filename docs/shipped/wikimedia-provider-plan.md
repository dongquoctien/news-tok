# Wikimedia Commons — Image Provider Plan

Add Wikimedia Commons as the 5th image provider for `searchImage`, alongside
Pexels, Unsplash, Pixabay, and Openverse. It is the strongest source for
**named people, places, events, logos, maps, and historical photos** — the
exact category where Pexels/Unsplash currently return generic stock that
doesn't match the article content.

## Why direct API instead of Openverse passthrough

Openverse already federates Wikimedia, but:

- Openverse re-ranks across Flickr / Smithsonian / museums, so Commons results
  often get pushed down for proper-noun queries.
- Calling Commons directly uses MediaWiki's native fulltext search
  (`generator=search`), which is more accurate for entity names in EN and VI.
- Same cost tier as Openverse (free, no API key, anonymous OK).

## Why not DuckDuckGo (reference)

Researched but rejected:

1. No license filter — DDG Images is a meta-search over the open web, most
   results are copyrighted. Risky for public TikTok/Reels uploads.
2. Endpoint instability — DDG uses an undocumented `i.js` endpoint with a
   rotating `vqd` token; npm wrappers (`duck-duck-scrape` etc.) break
   periodically.
3. Relevance not better than Pexels — DDG sorts by general web PageRank, not
   image engagement. Top results are often thumbnails / watermarked news photos.

## Files to change

### 1. New file: `packages/media/src/wikimedia.ts` (~80 LOC)

Mirror the shape of `packages/media/src/openverse.ts`.

**Endpoint:**

```
GET https://commons.wikimedia.org/w/api.php
  ?action=query
  &generator=search
  &gsrsearch=<query> filetype:bitmap
  &gsrnamespace=6
  &gsrlimit=10
  &prop=imageinfo|info
  &iiprop=url|size|extmetadata|mime
  &iiurlwidth=1920
  &format=json
  &formatversion=2
```

**Required header** (Wikimedia policy):

```
User-Agent: news-tok/0.1 (+https://github.com/itdongquoctien/news-tok)
```

Without a self-identifying UA, requests can be blocked.

**Filtering (client-side):**

- Drop items whose `mime` is not `image/jpeg`, `image/png`, or `image/webp`.
  SVG/TIFF render badly under Remotion KenBurns.
- Drop items with `width < 800` or `height < 800` (same threshold Openverse
  uses).
- Sort remaining items by `Math.abs(targetRatio - imageRatio)` when
  `orientation` is supplied, since Commons has no native aspect-ratio param.

**Download:** use `imageinfo.thumburl` (already resized to 1920px) via the
existing `downloadToCache` helper.

**Cache keys** (same pattern as Openverse):

- Metadata: `['wikimedia', 'searchImage', query, orientation ?? 'any']`
- Binary: `['wikimedia', pageid]`

**Attribution** (build from `extmetadata`):

- CC-BY / CC-BY-SA: `"<title> by <Artist> (<LicenseShortName>)"`
- Public domain: `"<title> (public domain via Wikimedia Commons)"`

The license string is non-optional — Commons mixes PD, CC0, CC-BY, CC-BY-SA
and each requires a different credit treatment downstream.

**Error contract:**

- 0 results → `throw new Error('Wikimedia: no results for "<query>"')`.
- Do not try-fallback to another provider inside this module. Keep it
  single-provider so the orchestrator owns the retry policy.

### 2. `packages/shared/src/schema.ts`

Add `'wikimedia'` to the `AssetRef.source.provider` enum, between
`'openverse'` and `'archive'`:

```ts
provider: z.enum([
  'pexels',
  'pixabay',
  'unsplash',
  'openverse',
  'wikimedia',        // NEW
  'archive',
  'jamendo',
  'freesound',
  'edge-tts',
  'local',
  'fma',
  'crawl',
]),
```

### 3. `packages/media/src/index.ts`

Add one export line:

```ts
export * as wikimedia from './wikimedia.js'
```

### 4. `packages/mcp-server/src/index.ts`

In the `searchImage` tool:

- Add `'wikimedia'` to the `provider` enum.
- Import `wikimedia` from `@news-tok/media`.
- Add a branch:

  ```ts
  if (which === 'wikimedia') {
    const asset = await wikimedia.searchImage({ query, orientation })
    return ok(asset)
  }
  ```

- Update the tool description: append `"wikimedia (best for named people /
  places / events / logos / historical photos — Wikimedia Commons API,
  CC-licensed, no key)"`.

### 5. `CLAUDE.md`

Two edits:

- In the `searchImage` tool description block, add `'wikimedia'` to the
  provider list with the same one-liner.
- In `Conventions`, append a sentence after the existing image-source
  guidance: "Use `wikimedia` when the query is a proper noun (person, place,
  event, logo, map) — Pexels/Unsplash only carry generic stock for those."

## Order of operations

1. Edit `packages/shared/src/schema.ts` (enum) — other packages import this.
2. Create `packages/media/src/wikimedia.ts`.
3. Add export in `packages/media/src/index.ts`.
4. Wire into `packages/mcp-server/src/index.ts`.
5. `pnpm mcp:build` so the Claude CLI picks up the new tool surface.
6. Update `CLAUDE.md`.
7. `pnpm typecheck` end-to-end.

## Open questions

Need answers before code lands:

1. **Smoke test?** Add a `wikimedia.searchImage({ query: 'Eiffel Tower' })`
   case to `scripts/smoke-media.ts` (and the network variant) — ~15 extra
   lines, but catches regressions in the JSON shape if Wikimedia changes
   their API.
2. **Auto-fallback inside `searchImage`?** Current pattern is "each provider
   standalone, orchestrator decides retry." Options:
   - **Keep current** — orchestrator (Claude CLI) calls `pexels` first,
     retries `wikimedia` on 0-result. Most flexible, matches existing
     Openverse behavior.
   - **Bake a default chain** — `searchImage` with no `provider` arg tries
     Pexels → Unsplash → Wikimedia → Openverse. Less flexible but lower
     orchestrator load.

   Lean: keep current. Less magic, easier to debug when a specific provider
   is misbehaving.

## Edge cases already considered

- **0 results from Commons:** throws; orchestrator handles fallback.
- **SVG / TIFF:** filtered by `mime` check.
- **Public domain items:** still record an attribution string for
  transparency even though no credit is legally required.
- **Rate limit:** Commons allows ~200 req/s anonymous. News-tok issues ≤10
  req/render → no backoff needed.
- **VN-language queries:** MediaWiki fulltext search works fine on Vietnamese,
  but Commons content is overwhelmingly English-tagged. For VN proper nouns
  ("Hoàng Sa", "Sa Pa"), consider also passing an English alias when
  available — orchestrator concern, not provider concern.

## Out of scope

- A `searchVideo` MCP tool wrapping the existing `crawler.crawlVideo`. Useful
  future work but unrelated to the Wikimedia addition.
- Query extraction from `segment.text` (the other lever for improving image
  relevance). Plan separately if needed.
