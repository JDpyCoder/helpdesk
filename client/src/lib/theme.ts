import { useEffect, useState } from 'react'
import { useMediaQuery } from '@/lib/use-media-query.ts'

// Light, dark, or whatever the operating system prefers. The choice is kept per browser in localStorage;
// index.html applies it before the app loads so the page never flashes the wrong theme. Keep the key and the
// rule there in step with this file.
export const themes = ['light', 'dark', 'system'] as const
export type Theme = (typeof themes)[number]

export const THEME_STORAGE_KEY = 'helpdesk-theme'

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return themes.includes(stored as Theme) ? (stored as Theme) : 'system'
  } catch {
    // Storage can be blocked (private mode, site data off): fall back to the system theme
    return 'system'
  }
}

// The chosen theme and a setter; puts the `dark` class on <html> whenever the effective theme is dark
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readTheme)
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)')
  const dark = theme === 'dark' || (theme === 'system' && systemDark)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  function setTheme(next: Theme) {
    setThemeState(next)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Not saved; the choice still applies until the page is reloaded
    }
  }

  return { theme, setTheme }
}
