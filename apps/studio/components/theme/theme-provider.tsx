'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type Theme = 'light' | 'dark' | 'system'

type ThemeContextValue = {
  /** What the user picked. Reflects localStorage. */
  theme: Theme
  /** What's actually painted right now ('light' or 'dark'). */
  resolvedTheme: 'light' | 'dark'
  setTheme: (next: Theme) => void
}

const STORAGE_KEY = 'news-tok.theme'

const ThemeContext = createContext<ThemeContextValue | null>(null)

function applyClass(theme: Theme) {
  if (typeof document === 'undefined') return
  const html = document.documentElement
  html.classList.remove('light', 'dark')
  if (theme === 'light' || theme === 'dark') {
    html.classList.add(theme)
  }
  // 'system' = no class → CSS @media (prefers-color-scheme) kicks in.
}

function readSystem(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readInitial(): Theme {
  if (typeof window === 'undefined') return 'system'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  return 'system'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system')
  const [systemMode, setSystemMode] = useState<'light' | 'dark'>('dark')

  // Hydrate from localStorage on mount.
  useEffect(() => {
    const initial = readInitial()
    setThemeState(initial)
    setSystemMode(readSystem())
    applyClass(initial)
  }, [])

  // Re-paint when OS preference changes (only matters when theme=system).
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemMode(e.matches ? 'dark' : 'light')
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    window.localStorage.setItem(STORAGE_KEY, next)
    applyClass(next)
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme: theme === 'system' ? systemMode : theme,
      setTheme,
    }),
    [theme, systemMode, setTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>')
  return ctx
}
