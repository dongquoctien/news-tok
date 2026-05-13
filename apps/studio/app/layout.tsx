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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
