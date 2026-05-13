/**
 * Human-friendly labels for the logical font ids the renderer guarantees
 * to load (see packages/remotion/src/scenes/fonts.ts). Used by FontPicker,
 * StylePicker, and TextStyleBuilder so users see the font name without
 * reading the id.
 */
export const FONT_LABEL: Record<string, string> = {
  // M7 pool
  beVietnamPro: 'Be Vietnam Pro',
  inter: 'Inter',
  montserrat: 'Montserrat',
  anton: 'Anton',
  bebasNeue: 'Bebas Neue',
  playfairDisplay: 'Playfair Display',
  jetBrainsMono: 'JetBrains Mono',
  lexend: 'Lexend',
  manrope: 'Manrope',
  oswald: 'Oswald',
  archivoBlack: 'Archivo Black',
  nunito: 'Nunito',
  // M10 expansion
  bangers: 'Bangers',
  barlow: 'Barlow',
  dmSans: 'DM Sans',
  kanit: 'Kanit',
  merriweather: 'Merriweather',
  openSans: 'Open Sans',
  outfit: 'Outfit',
  plusJakartaSans: 'Plus Jakarta Sans',
  poppins: 'Poppins',
  prompt: 'Prompt',
  quicksand: 'Quicksand',
  raleway: 'Raleway',
  roboto: 'Roboto',
  robotoCondensed: 'Roboto Condensed',
  rubik: 'Rubik',
  sourceSans3: 'Source Sans 3',
  spaceGrotesk: 'Space Grotesk',
  spaceMono: 'Space Mono',
  tikTokSans: 'TikTok Sans',
  workSans: 'Work Sans',
}

export function fontLabel(id: string | undefined): string {
  if (!id) return ''
  return FONT_LABEL[id] ?? id
}
