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
// M10 — Style builder expansion. 20 extra display + body fonts that
// either have a Vietnamese subset on Google Fonts or are popular TikTok
// caption picks. Verified against the @remotion/google-fonts CJS export
// list bundled with Remotion 4.0.
import { loadFont as loadBangers } from '@remotion/google-fonts/Bangers'
import { loadFont as loadBarlow } from '@remotion/google-fonts/Barlow'
import { loadFont as loadDMSans } from '@remotion/google-fonts/DMSans'
import { loadFont as loadKanit } from '@remotion/google-fonts/Kanit'
import { loadFont as loadMerriweather } from '@remotion/google-fonts/Merriweather'
import { loadFont as loadOpenSans } from '@remotion/google-fonts/OpenSans'
import { loadFont as loadOutfit } from '@remotion/google-fonts/Outfit'
import { loadFont as loadPlusJakartaSans } from '@remotion/google-fonts/PlusJakartaSans'
import { loadFont as loadPoppins } from '@remotion/google-fonts/Poppins'
import { loadFont as loadPrompt } from '@remotion/google-fonts/Prompt'
import { loadFont as loadQuicksand } from '@remotion/google-fonts/Quicksand'
import { loadFont as loadRaleway } from '@remotion/google-fonts/Raleway'
import { loadFont as loadRoboto } from '@remotion/google-fonts/Roboto'
import { loadFont as loadRobotoCondensed } from '@remotion/google-fonts/RobotoCondensed'
import { loadFont as loadRubik } from '@remotion/google-fonts/Rubik'
import { loadFont as loadSourceSans3 } from '@remotion/google-fonts/SourceSans3'
import { loadFont as loadSpaceGrotesk } from '@remotion/google-fonts/SpaceGrotesk'
import { loadFont as loadSpaceMono } from '@remotion/google-fonts/SpaceMono'
import { loadFont as loadTikTokSans } from '@remotion/google-fonts/TikTokSans'
import { loadFont as loadWorkSans } from '@remotion/google-fonts/WorkSans'
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

// Restrict each font to the subsets the renderer actually uses (Latin +
// Vietnamese). Without this, Remotion's @google-fonts loader pulls every
// available subset (cyrillic, greek, devanagari…) and fires 30+ network
// requests per font — slow first paint, noisy console.
const VI_SUBSETS = ['latin', 'latin-ext', 'vietnamese'] as const
const LATIN_SUBSETS = ['latin', 'latin-ext'] as const

const be = loadBeVietnamPro('normal', {
  weights: ['400', '600', '700', '800'],
  subsets: [...VI_SUBSETS],
})
const inter = loadInter('normal', {
  weights: ['400', '600', '700', '800', '900'],
  subsets: [...VI_SUBSETS],
})
const montserrat = loadMontserrat('normal', {
  weights: ['400', '700', '800', '900'],
  subsets: [...VI_SUBSETS],
})
const anton = loadAnton('normal', { weights: ['400'], subsets: [...VI_SUBSETS] })
const bebas = loadBebasNeue('normal', { weights: ['400'], subsets: [...LATIN_SUBSETS] })
const playfair = loadPlayfairDisplay('normal', {
  weights: ['400', '700', '900'],
  subsets: [...VI_SUBSETS],
})
const jet = loadJetBrainsMono('normal', {
  weights: ['400', '600', '700'],
  subsets: [...VI_SUBSETS],
})
const lexend = loadLexend('normal', {
  weights: ['400', '500', '700', '800'],
  subsets: [...VI_SUBSETS],
})
const manrope = loadManrope('normal', {
  weights: ['400', '600', '700', '800'],
  subsets: [...VI_SUBSETS],
})
const oswald = loadOswald('normal', {
  weights: ['400', '600', '700'],
  subsets: [...VI_SUBSETS],
})
const archivoBlack = loadArchivoBlack('normal', {
  weights: ['400'],
  subsets: [...LATIN_SUBSETS],
})
const nunito = loadNunito('normal', {
  weights: ['400', '700', '800', '900'],
  subsets: [...VI_SUBSETS],
})

// Expansion fonts. Single weight when the family only ships one
// (display fonts: Bangers, Bebas, Anton); otherwise grab the same
// 4-weight set the existing pool uses (400 body / 700 bold / 800 / 900
// display) so the builder's weight slider produces real changes.
const bangers = loadBangers('normal', { weights: ['400'], subsets: [...LATIN_SUBSETS] })
const barlow = loadBarlow('normal', {
  weights: ['400', '600', '700', '800', '900'],
  subsets: [...VI_SUBSETS],
})
// DMSans / Merriweather / Quicksand only ship `latin` + `latin-ext`
// on Google Fonts — `vietnamese` is not a published subset for those
// families, so Remotion's typed loader rejects it. Vietnamese diacritics
// still render correctly because `latin-ext` covers them; the subset
// list here is what the network request asks for, not what glyphs the
// font supports.
const dmSans = loadDMSans('normal', {
  weights: ['400', '500', '700'],
  subsets: [...LATIN_SUBSETS],
})
const kanit = loadKanit('normal', {
  weights: ['400', '600', '700', '800', '900'],
  subsets: [...VI_SUBSETS],
})
const merriweather = loadMerriweather('normal', {
  weights: ['400', '700', '900'],
  subsets: [...LATIN_SUBSETS],
})
const openSans = loadOpenSans('normal', {
  weights: ['400', '600', '700', '800'],
  subsets: [...VI_SUBSETS],
})
const outfit = loadOutfit('normal', {
  weights: ['400', '600', '700', '800', '900'],
  subsets: [...LATIN_SUBSETS],
})
const plusJakartaSans = loadPlusJakartaSans('normal', {
  weights: ['400', '600', '700', '800'],
  subsets: [...VI_SUBSETS],
})
const poppins = loadPoppins('normal', {
  weights: ['400', '600', '700', '800', '900'],
  subsets: [...LATIN_SUBSETS],
})
const prompt = loadPrompt('normal', {
  weights: ['400', '600', '700', '800', '900'],
  subsets: [...VI_SUBSETS],
})
const quicksand = loadQuicksand('normal', {
  weights: ['400', '500', '700'],
  subsets: [...LATIN_SUBSETS],
})
const raleway = loadRaleway('normal', {
  weights: ['400', '600', '700', '800', '900'],
  subsets: [...VI_SUBSETS],
})
const roboto = loadRoboto('normal', {
  weights: ['400', '500', '700', '900'],
  subsets: [...VI_SUBSETS],
})
const robotoCondensed = loadRobotoCondensed('normal', {
  weights: ['400', '500', '700', '900'],
  subsets: [...VI_SUBSETS],
})
const rubik = loadRubik('normal', {
  weights: ['400', '600', '700', '800', '900'],
  subsets: [...LATIN_SUBSETS],
})
const sourceSans3 = loadSourceSans3('normal', {
  weights: ['400', '600', '700', '900'],
  subsets: [...VI_SUBSETS],
})
const spaceGrotesk = loadSpaceGrotesk('normal', {
  weights: ['400', '500', '600', '700'],
  subsets: [...VI_SUBSETS],
})
const spaceMono = loadSpaceMono('normal', {
  weights: ['400', '700'],
  subsets: [...VI_SUBSETS],
})
const tikTokSans = loadTikTokSans('normal', {
  weights: ['400', '600', '700', '800', '900'],
  subsets: [...VI_SUBSETS],
})
const workSans = loadWorkSans('normal', {
  weights: ['400', '500', '600', '700', '800', '900'],
  subsets: [...VI_SUBSETS],
})

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
  // M10 — expansion fonts
  bangers: bangers.fontFamily,
  barlow: barlow.fontFamily,
  dmSans: dmSans.fontFamily,
  kanit: kanit.fontFamily,
  merriweather: merriweather.fontFamily,
  openSans: openSans.fontFamily,
  outfit: outfit.fontFamily,
  plusJakartaSans: plusJakartaSans.fontFamily,
  poppins: poppins.fontFamily,
  prompt: prompt.fontFamily,
  quicksand: quicksand.fontFamily,
  raleway: raleway.fontFamily,
  roboto: roboto.fontFamily,
  robotoCondensed: robotoCondensed.fontFamily,
  rubik: rubik.fontFamily,
  sourceSans3: sourceSans3.fontFamily,
  spaceGrotesk: spaceGrotesk.fontFamily,
  spaceMono: spaceMono.fontFamily,
  tikTokSans: tikTokSans.fontFamily,
  workSans: workSans.fontFamily,
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
