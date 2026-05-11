export const ICON = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
  xxl: 48,
  strokeWidth: 1.75,
} as const

export type IconSize = keyof Omit<typeof ICON, 'strokeWidth'>

export const COLOR = {
  bg: '#0b0b0f',
  surface: '#15151b',
  surfaceHover: '#1d1d25',
  border: '#27272f',
  text: '#f4f4f6',
  textMuted: '#9b9ba8',
  accent: '#6366f1',
  danger: '#ef4444',
  success: '#10b981',
} as const

export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const

export const RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  full: 9999,
} as const

export const FONT = {
  ui: 'Inter, system-ui, -apple-system, sans-serif',
  videoVi: '"Be Vietnam Pro", sans-serif',
  videoEn: 'Inter, sans-serif',
} as const
