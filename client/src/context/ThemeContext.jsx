import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'clinic-crm-theme'
const THEMES = ['light', 'dark', 'system']

const ThemeContext = createContext(null)

function resolveSystemTheme() {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function applyThemeClass(theme) {
  const root = document.documentElement
  const effective = theme === 'system' ? resolveSystemTheme() : theme
  root.classList.toggle('dark', effective === 'dark')
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return THEMES.includes(stored) ? stored : 'system'
    } catch {
      return 'system'
    }
  })

  useEffect(() => {
    applyThemeClass(theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // localStorage unavailable (private mode, etc.) - theme just won't persist
    }
  }, [theme])

  useEffect(() => {
    if (theme !== 'system') return undefined
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyThemeClass('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const value = useMemo(
    () => ({
      theme,
      setTheme: (next) => {
        if (THEMES.includes(next)) setThemeState(next)
      },
      effectiveTheme: theme === 'system' ? resolveSystemTheme() : theme,
    }),
    [theme],
  )

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- provider + hook are colocated by design
export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
