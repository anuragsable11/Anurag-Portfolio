import Lenis from 'lenis'

/**
 * Smooth (inertial) scrolling for the page, by Lenis: a wheel or trackpad
 * glides to rest instead of stepping. Touch keeps the device's own native
 * scrolling (Lenis' default), and a visitor who prefers reduced motion gets
 * plain scrolling (Lenis honours the setting itself). In-page links (#about
 * …) glide too, stopping clear of the fixed navbar through the page's own
 * scroll-padding-top.
 *
 * The page still scrolls natively underneath, so scroll events, sticky
 * positioning and IntersectionObservers (the opening card, the samurai's
 * dock, the active nav link) work as before.
 */
let lenis = null
let holds = 0

/** Starts smooth scrolling, once. Returns a function that stops it. */
export function startSmoothScroll() {
  if (lenis || typeof window === 'undefined') return () => {}
  lenis = new Lenis({
    autoRaf: true,
    lerp: 0.11,
    anchors: true,
    stopInertiaOnNavigate: true,
  })
  if (holds) lenis.stop()
  return () => {
    lenis?.destroy()
    lenis = null
  }
}

/**
 * Holds the page still while an overlay (a dialog, the mobile menu) is
 * open; call the returned function to let it go. Holds stack, so two
 * overlays release the page only when both have closed.
 */
export function holdScroll() {
  holds += 1
  lenis?.stop()
  let released = false
  return () => {
    if (released) return
    released = true
    holds = Math.max(0, holds - 1)
    if (!holds) lenis?.start()
  }
}

/** Back to the top: gliding when smooth scrolling runs, natively otherwise. */
export function scrollToTop() {
  if (lenis) lenis.scrollTo(0)
  else window.scrollTo({ top: 0, behavior: 'smooth' })
}
