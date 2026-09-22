import { useCallback, useEffect, useState } from 'react'

/**
 * Light/dark theme, persisted to localStorage.
 *
 * The initial value is resolved by the inline script in index.html before
 * first paint, so this hook only has to read what that script decided.
 */
export function useTheme() {
  const [theme, setTheme] = useState(() =>
    typeof document === 'undefined'
      ? 'light'
      : document.documentElement.dataset.theme || 'light'
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('theme', theme)
    } catch {
      // Private mode or blocked storage — the theme still applies for this visit.
    }
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, toggle }
}
