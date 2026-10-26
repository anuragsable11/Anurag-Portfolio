import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/**
 * False while the build prerenders the page and while the browser hydrates
 * that HTML; true from the render after. Whatever depends on the browser
 * (the theme, WebGL, portals) waits for it, so the first client render
 * matches the prerendered HTML exactly.
 */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}
