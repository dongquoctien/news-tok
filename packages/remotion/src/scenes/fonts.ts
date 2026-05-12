import { loadFont as loadBeVietnamPro } from '@remotion/google-fonts/BeVietnamPro'
import { loadFont as loadInter } from '@remotion/google-fonts/Inter'
import { loadFont as loadMontserrat } from '@remotion/google-fonts/Montserrat'
import { loadFont as loadAnton } from '@remotion/google-fonts/Anton'
import { loadFont as loadBebasNeue } from '@remotion/google-fonts/BebasNeue'
import { loadFont as loadPlayfairDisplay } from '@remotion/google-fonts/PlayfairDisplay'
import { loadFont as loadJetBrainsMono } from '@remotion/google-fonts/JetBrainsMono'
import { loadFont as loadLexend } from '@remotion/google-fonts/Lexend'
import { loadFont as loadManrope } from '@remotion/google-fonts/Manrope'
import { loadFont as loadOswald } from '@remotion/google-fonts/Oswald'
import { loadFont as loadArchivoBlack } from '@remotion/google-fonts/ArchivoBlack'
import { loadFont as loadNunito } from '@remotion/google-fonts/Nunito'
import type { Language } from '@news-tok/shared/schema'

// Twelve Google Fonts the renderer is guaranteed to load. Built-in text
// styles all reference one of these via a logical id. Vietnamese diacritic
// quality verified per https://vietnamesetypography.com/type-recommendations/
// and https://fonts.google.com/?subset=vietnamese.
//
//   beVietnamPro   default body for VI, diacritics tuned natively
//   inter          default body for EN
//   montserrat     TikTok / Hormozi-style headline (Black 900)
//   anton          tall condensed display (single weight 400)
//   bebasNeue      condensed all-caps display (single weight 400)
//   playfairDisplay editorial serif, luxury / quote
//   jetBrainsMono  monospaced typewriter / mono caption
//   lexend         max-legibility sans (NASA-tested) for caption / body
//   manrope        modern geometric for explainer / corporate
//   oswald         condensed sans alternative to Anton with weight range
//   archivoBlack   block-bold display, intrinsic stroke (no faux-stroke)
//   nunito         rounded friendly sans for playful / educational

const be = loadBeVietnamPro('normal', { weights: ['400', '600', '700', '800'] })
const inter = loadInter('normal', { weights: ['400', '600', '700', '800', '900'] })
const montserrat = loadMontserrat('normal', { weights: ['400', '700', '800', '900'] })
const anton = loadAnton('normal', { weights: ['400'] })
const bebas = loadBebasNeue('normal', { weights: ['400'] })
const playfair = loadPlayfairDisplay('normal', { weights: ['400', '700', '900'] })
const jet = loadJetBrainsMono('normal', { weights: ['400', '600', '700'] })
const lexend = loadLexend('normal', { weights: ['400', '500', '700', '800'] })
const manrope = loadManrope('normal', { weights: ['400', '600', '700', '800'] })
const oswald = loadOswald('normal', { weights: ['400', '600', '700'] })
const archivoBlack = loadArchivoBlack('normal', { weights: ['400'] })
const nunito = loadNunito('normal', { weights: ['400', '700', '800', '900'] })

export const FONT_FAMILIES = {
  beVietnamPro: be.fontFamily,
  inter: inter.fontFamily,
  montserrat: montserrat.fontFamily,
  anton: anton.fontFamily,
  bebasNeue: bebas.fontFamily,
  playfairDisplay: playfair.fontFamily,
  jetBrainsMono: jet.fontFamily,
  lexend: lexend.fontFamily,
  manrope: manrope.fontFamily,
  oswald: oswald.fontFamily,
  archivoBlack: archivoBlack.fontFamily,
  nunito: nunito.fontFamily,
} as const

export type FontFamilyId = keyof typeof FONT_FAMILIES

/** Resolve a logical font id (or raw family string) to the bundler-known family. */
export function resolveFontFamily(idOrFamily: string): string {
  if (idOrFamily in FONT_FAMILIES) {
    return FONT_FAMILIES[idOrFamily as FontFamilyId]
  }
  return idOrFamily
}

export function fontFor(language: Language): string {
  return language === 'vi' ? be.fontFamily : inter.fontFamily
}
