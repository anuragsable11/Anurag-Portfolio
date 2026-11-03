import { useEffect, useState } from 'react'
import HalftoneReveal from './HalftoneReveal.jsx'
import ParticleText from './ParticleText.jsx'
import ScrollExpand from './ScrollExpand.jsx'
import portrait from '../assets/portrait.webp'
import { profile } from '../data/content.js'
import { prefersReducedMotion } from '../lib/capabilities.js'
import { markOpeningDone, setOpeningZoom } from '../lib/opening.js'

// The longer of the two intros, with slack: the welcome's particles take
// 1.6 s to gather plus up to 0.42 s of stagger; the portrait's dots 1.4 s.
const OPENING_MS = 2400

/**
 * The colours the opening prints with: its panel (--portrait-panel, the
 * card's paper), ink (--fg) and the brand blue the welcome lights up in.
 * Re-read whenever the theme flips. Null until mounted: the prerendered
 * page cannot know the visitor's theme.
 */
function usePageInk() {
  const [colors, setColors] = useState(null)
  useEffect(() => {
    const root = document.documentElement
    const read = () => {
      const css = getComputedStyle(root)
      setColors({
        paper: css.getPropertyValue('--portrait-panel').trim(),
        ink: css.getPropertyValue('--fg').trim(),
        brand: css.getPropertyValue('--brand').trim(),
      })
    }
    read()
    const observer = new MutationObserver(read)
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return colors
}

/** True from the visitor's first scroll (or a page that opens scrolled). */
function useScrolled() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    if (scrolled) return
    const onScroll = () => {
      if (window.scrollY > 4) setScrolled(true)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [scrolled])
  return scrolled
}

/**
 * The welcome as one line, or on a phone as two, split at the space nearest
 * its middle: on one line it would shrink too small to read in particles.
 * The CSS sizes it to match (.portrait-intro, max-width: 640px).
 */
function welcomeLines(text, narrow) {
  const spaces = [...text.matchAll(/ /g)].map((m) => m.index)
  if (!narrow || !spaces.length) return [text]
  const middle = text.length / 2
  const split = spaces.reduce((best, i) =>
    Math.abs(i - middle) < Math.abs(best - middle) ? i : best
  )
  return [text.slice(0, split), text.slice(split + 1)]
}

/**
 * The screen that opens the page, before the samurai's hero: a card that
 * opens to the whole screen as the page scrolls. In it, the portrait
 * printed as a halftone that swells into the full-colour picture under the
 * pointer (without WebGL 2, the plain picture), and a welcome that gathers
 * out of particles across its faded waist once the visitor scrolls, as the
 * card opens. The portrait is decoration; the welcome is read out from the
 * particle text's own label.
 */
export default function PortraitIntro() {
  const colors = usePageInk()
  const [printable] = useState(() => {
    if (typeof document === 'undefined') return false
    // A throwaway context, released at once: browsers cap how many are live.
    const gl = document.createElement('canvas').getContext('webgl2')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return Boolean(gl)
  })
  // On a phone the welcome takes two lines, sampled more finely to keep
  // their strokes solid.
  const [narrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
  )
  const scrolled = useScrolled()

  // Once the welcome starts gathering, let the page know when it is done,
  // so the samurai's build does not make it stutter. Its glow waits too:
  // while it gathers every particle is lit, and drawing them all again for
  // the bloom dropped frames on integrated graphics. Afterwards only the
  // few the pointer moves glow.
  const [opened, setOpened] = useState(false)
  useEffect(() => {
    if (!colors || !scrolled) return
    const open = () => {
      setOpened(true)
      markOpeningDone()
    }
    if (prefersReducedMotion()) {
      open()
      return
    }
    const timer = setTimeout(open, OPENING_MS)
    return () => clearTimeout(timer)
  }, [colors, scrolled])

  const screen = (
    <div className="portrait-intro">
      <div className="portrait-print" aria-hidden="true">
        {colors &&
          (printable ? (
            <HalftoneReveal
              src={portrait}
              fit="contain"
              inkColor={colors.ink}
              paperColor={colors.paper}
            />
          ) : (
            <img src={portrait} alt="" width="374" height="540" />
          ))}
      </div>

      <div className="portrait-welcome">
        {colors &&
          welcomeLines(profile.welcome, narrow).map((line) => (
            <ParticleText
              key={line}
              text={line}
              density={narrow ? 3 : 4}
              // At 1.75 px the particles are drawn as squares, not circles:
              // the same at this size, and cheaper on every frame.
              particleSize={1.75}
              // Still once formed: a resting drift redrew the whole band
              // every frame, all through the card's zoom.
              idleDrift={0}
              highlightColor={colors.brand}
              fontSize="var(--welcome-size)"
              hold={!scrolled}
              glow={opened}
            />
          ))}
      </div>
    </div>
  )

  // The card starts as the whole screen in miniature (frame and zoom at the
  // same scale), navbar included, and scrolling zooms into it until it is
  // the screen. A phone starts it larger. The CSS draws the same starting
  // card and navbar before this hydrates.
  const start = narrow ? 0.7 : 0.6
  return (
    <ScrollExpand
      className="portrait-expand"
      content={screen}
      useWindowScroll
      startWidth={start * 100}
      startHeight={start * 100}
      mediaZoom={start}
      overlayScrim={0}
      onProgress={(_, eased) => setOpeningZoom(start + (1 - start) * eased)}
    />
  )
}
