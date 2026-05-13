import type { ReactNode } from 'react'
import { Inter } from 'next/font/google'
import { ThemeProvider } from '@/components/theme/theme-provider'
import './globals.css'

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
  variable: '--font-sans',
})

export const metadata = {
  title: 'news-tok Studio',
  description: 'Local editor for news-tok video projects',
}

// Inline script runs before React hydrates so the user's saved theme is
// applied on the very first paint — without this, the page flashes the
// default theme for one frame before the ThemeProvider effect runs.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('news-tok.theme');var c=document.documentElement.classList;c.remove('light','dark');if(t==='light'||t==='dark'){c.add(t);}}catch(e){}})();`

// All Google Fonts that the renderer / TextStyleBuilder reference. Loaded
// lazily here so the builder's font picker preview shows real glyphs
// instead of a fallback. `display=swap` keeps the page interactive while
// the font streams in. `vietnamese` subset is requested for the families
// that have it so VN characters render correctly (which is the whole
// reason most of these are in the pool).
const FONT_FAMILIES_HREF = [
  // M7 pool — Inter is already loaded via next/font above, but listing
  // it here lets the builder grab the family name directly.
  'Be+Vietnam+Pro:wght@400;600;700;800',
  'Montserrat:wght@400;700;800;900',
  'Anton:wght@400',
  'Bebas+Neue:wght@400',
  'Playfair+Display:wght@400;700;900',
  'JetBrains+Mono:wght@400;600;700',
  'Lexend:wght@400;500;700;800',
  'Manrope:wght@400;600;700;800',
  'Oswald:wght@400;600;700',
  'Archivo+Black:wght@400',
  'Nunito:wght@400;700;800;900',
  // M10 expansion
  'Bangers:wght@400',
  'Barlow:wght@400;600;700;800;900',
  'DM+Sans:wght@400;500;700',
  'Kanit:wght@400;600;700;800;900',
  'Merriweather:wght@400;700;900',
  'Open+Sans:wght@400;600;700;800',
  'Outfit:wght@400;600;700;800;900',
  'Plus+Jakarta+Sans:wght@400;600;700;800',
  'Poppins:wght@400;600;700;800;900',
  'Prompt:wght@400;600;700;800;900',
  'Quicksand:wght@400;500;700',
  'Raleway:wght@400;600;700;800;900',
  'Roboto:wght@400;500;700;900',
  'Roboto+Condensed:wght@400;500;700;900',
  'Rubik:wght@400;600;700;800;900',
  'Source+Sans+3:wght@400;600;700;900',
  'Space+Grotesk:wght@400;500;600;700',
  'Space+Mono:wght@400;700',
  'TikTok+Sans:wght@400;600;700;800;900',
  'Work+Sans:wght@400;500;600;700;800;900',
]
const FONT_HREF =
  'https://fonts.googleapis.com/css2?' +
  FONT_FAMILIES_HREF.map((f) => `family=${f}`).join('&') +
  '&display=swap'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONT_HREF} />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
