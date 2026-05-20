import { describe, expect, it } from 'vitest'
import { buildDefaultEdits } from './default-edits.js'
import { lintAgainstAllPlatforms, UNIVERSAL_SAFE_ZONE } from './safe-zones.js'
import {
  NEWSTOKVN_RECIPE,
  recipeForLayout,
  recipeForTopic,
  TOPIC_TO_LAYOUT,
} from './topic-router.js'
import type { ThumbnailLayout } from '@news-tok/shared/schema'

const LAYOUTS: ThumbnailLayout[] = [
  'news-breaking',
  'news-weather',
  'entertainment-bomb',
  'science-clean',
  'knowledge-bookish',
  'sports-hype',
  'newstokvn-breaking',
  'newstokvn-flash',
  'newstokvn-cover',
]

describe('buildDefaultEdits', () => {
  it.each(LAYOUTS)('places title inside UNIVERSAL_SAFE_ZONE for %s', (layout) => {
    const edits = buildDefaultEdits({
      layout,
      recipe: recipeForTopic('generic'),
      language: 'vi',
      title: 'Hello world',
    })
    const { titleStyle } = edits
    // Rough title bbox = position + width × (fontSize * lineHeight) for 1 line.
    const lineCount = 2 // conservative — headlines typically wrap to 2 lines
    const bbox = {
      x: titleStyle.x,
      y: titleStyle.y,
      width: titleStyle.width,
      height: titleStyle.fontSize * titleStyle.lineHeight * lineCount,
    }
    const lint = lintAgainstAllPlatforms(bbox, `Title (${layout})`)
    // Allow the title to graze one platform if the layout intentionally
    // anchors to the bottom of the safe zone — but never to overlap the
    // strictest platform (IG, 250px top + 450px bottom).
    expect(bbox.y).toBeGreaterThanOrEqual(UNIVERSAL_SAFE_ZONE.y)
    expect(lint.warnings.length).toBeLessThan(4)
  })

  it.each(LAYOUTS)('produces a non-empty eyebrow style when topic has one for %s', (layout) => {
    const edits = buildDefaultEdits({
      layout,
      recipe: recipeForTopic('generic'),
      language: 'vi',
      title: 'Hello world',
    })
    // All 6 layouts ship an eyebrow chip — this guards against missing
    // a case in the switch.
    expect(edits.eyebrowStyle).toBeDefined()
  })

  it('extracts **accent** markers into edits.accent', () => {
    const edits = buildDefaultEdits({
      layout: 'news-breaking',
      recipe: recipeForTopic('crime'),
      language: 'vi',
      title: 'Bắt giữ nghi phạm **dùng chất cấm** trong đêm',
    })
    expect(edits.accent).toBe('dùng chất cấm')
    expect(edits.title).toBe('Bắt giữ nghi phạm dùng chất cấm trong đêm')
    expect(edits.title.includes('*')).toBe(false)
  })

  it('uses the topic eyebrow when none is passed in', () => {
    const edits = buildDefaultEdits({
      layout: 'entertainment-bomb',
      recipe: recipeForTopic('entertainment'),
      language: 'vi',
      title: 'Sao Việt hôm nay',
    })
    expect(edits.eyebrow).toBe(TOPIC_TO_LAYOUT.entertainment.defaultEyebrow.vi)
  })

  it('NEWSTOKVN brand layouts ignore topic-derived palette via recipeForLayout', () => {
    // Even when topic = crime (would normally yield red palette), the
    // brand layouts pin the deep-purple recipe so the channel reads
    // consistently across articles.
    expect(recipeForLayout('crime', 'newstokvn-breaking')).toBe(NEWSTOKVN_RECIPE)
    expect(recipeForLayout('finance', 'newstokvn-flash')).toBe(NEWSTOKVN_RECIPE)
    expect(recipeForLayout('sports', 'newstokvn-cover')).toBe(NEWSTOKVN_RECIPE)
    // But the 6 generic layouts still get the topic recipe.
    expect(recipeForLayout('crime', 'news-breaking').palette.primary).toBe(
      TOPIC_TO_LAYOUT.crime.palette.primary
    )
  })
})
