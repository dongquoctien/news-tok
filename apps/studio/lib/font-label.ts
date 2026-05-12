/**
 * Human-friendly labels for the 12 logical font ids the renderer guarantees
 * to load (see packages/remotion/src/scenes/fonts.ts). Used by FontPicker
 * and StylePicker so users see the font name without reading the id.
 */
export const FONT_LABEL: Record<string, string> = {
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
}

export function fontLabel(id: string | undefined): string {
  if (!id) return ''
  return FONT_LABEL[id] ?? id
}
