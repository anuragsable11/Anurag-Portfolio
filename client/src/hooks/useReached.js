import { useEffect, useState } from 'react'

/**
 * True once `ref`'s element has scrolled into view, and from then on. The
 * bottom of the viewport is pulled up by `bottomMargin` (a CSS length or
 * percentage), so "in view" means that far in rather than its first pixel.
 */
export function useReached(ref, bottomMargin = '5%') {
  const [reached, setReached] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || reached) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setReached(true)
      },
      { rootMargin: `0px 0px -${bottomMargin} 0px` }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, reached, bottomMargin])
  return reached
}
