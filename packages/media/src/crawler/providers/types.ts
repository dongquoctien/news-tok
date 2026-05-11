import { z } from 'zod'

/**
 * A field-extraction rule. `selector` resolves relative to the parent
 * `items` selector when applied per-item. The rule outputs a string
 * (from text content or an attribute) — callers cast to number where
 * needed.
 */
export const FieldRuleSchema = z.object({
  selector: z.string().min(1),
  /** Pull `text` content. */
  text: z.boolean().optional(),
  /** Pull an HTML attribute. */
  attr: z.string().optional(),
  /** Pull a CSS computed style. */
  css: z.string().optional(),
  /** Optional regex to extract a substring from the raw value. */
  regex: z.string().optional(),
})
export type FieldRule = z.infer<typeof FieldRuleSchema>

export const ExtractRulesSchema = z.object({
  items: z.string().min(1),
  itemFields: z.record(FieldRuleSchema),
})
export type ExtractRules = z.infer<typeof ExtractRulesSchema>

export const ProviderConfigSchema = z.object({
  name: z.string().min(1),
  /** "image", "music", "video", "sfx", or anything custom. */
  kind: z.enum(['image', 'music', 'video', 'sfx']),

  search: z.object({
    /**
     * URL template with `{query}`, `{orientation}`, `{durationSec}` etc.
     * Placeholders not provided by the caller become empty strings.
     */
    url: z.string().url(),
    waitFor: z
      .object({
        selector: z.string().min(1),
        timeoutMs: z.number().int().positive().default(15_000),
      })
      .optional(),
    extract: ExtractRulesSchema,
  }),

  download: z
    .object({
      /**
       * "direct": fetch `downloadUrl` from the extracted item via the
       *           browser context (cookies + JA3 from the page).
       * "page-attr": navigate to the item's page URL and pull the asset
       *              from another attribute on that page.
       */
      mode: z.enum(['direct', 'page-attr']).default('direct'),
      /** Required when mode === "page-attr". Selector on the item page. */
      onPage: ExtractRulesSchema.partial({ items: true }).optional(),
    })
    .default({ mode: 'direct' }),

  rateLimit: z
    .object({
      requestsPerMin: z.number().int().positive().default(20),
    })
    .default({ requestsPerMin: 20 }),

  license: z.string().optional(),
  /** Free-form note shown in logs / Studio. */
  note: z.string().optional(),
})
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>

export const SearchParamsSchema = z.object({
  query: z.string().min(1),
  orientation: z.enum(['landscape', 'portrait', 'square']).optional(),
  durationSec: z.number().positive().optional(),
})
export type SearchParams = z.infer<typeof SearchParamsSchema>

export type CrawlItem = Record<string, string>

export type CrawlResult = {
  items: CrawlItem[]
  /** Page URL actually loaded (after substitution). */
  searchUrl: string
}
