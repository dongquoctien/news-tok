import { loadFont as loadBeVietnamPro } from '@remotion/google-fonts/BeVietnamPro'
import { loadFont as loadInter } from '@remotion/google-fonts/Inter'
import type { Language } from '@news-tok/shared/schema'

const be = loadBeVietnamPro('normal', { weights: ['400', '600', '700'] })
const inter = loadInter('normal', { weights: ['400', '600', '700'] })

export function fontFor(language: Language): string {
  return language === 'vi' ? be.fontFamily : inter.fontFamily
}
