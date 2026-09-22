import { useEffect, useState } from 'react'

/**
 * Tracks which section id is currently in view, for nav highlighting.
 */
export function useActiveSection(ids, offset = 120) {
  const [active, setActive] = useState(ids[0])

  useEffect(() => {
    const onScroll = () => {
      const pos = window.scrollY + offset

      // Bottom of page always resolves to the last section.
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 80) {
        setActive(ids[ids.length - 1])
        return
      }

      let current = ids[0]
      for (const id of ids) {
        const el = document.getElementById(id)
        if (el && el.offsetTop <= pos) current = id
      }
      setActive(current)
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [ids, offset])

  return active
}

/**
 * True once the page has been scrolled past `threshold` pixels.
 */
export function useScrolled(threshold = 24) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])

  return scrolled
}
