import { useEffect, useState } from 'react'
import HalftoneReveal from './HalftoneReveal.jsx'
import ParticleText from './ParticleText.jsx'
import portrait from '../assets/portrait.webp'
import { profile } from '../data/content.js'
import { prefersReducedMotion } from '../lib/capabilities.js'
import { markOpeningDone } from '../lib/opening.js'

// The longer of the two intros, with slack: the name's particles take
// 1.6 s to gather plus up to 0.42 s of stagger; the portrait's dots 1.4 s.
const OPENING_MS = 2400

/**
 * The page's paper, ink and brand colour (its --bg, --fg and --brand),
 * re-read whenever the theme flips, so the halftone prints straight onto
 * the page and the name lights up in the brand blue. Null until mounted:
 * the prerendered page cannot know the visitor's theme.
 */
function usePageInk() {
  const [colors, setColors] = useState(null)
  useEffect(() => {
    const root = document.documentElement
    const read = () => {
      const css = getComputedStyle(root)
      setColors({
        paper: css.getPropertyValue('--bg').trim(),
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

/**
 * The full-width screen that opens the page, before the samurai's hero: the
 * portrait printed as a halftone that swells into the full-colour picture
 * under the pointer (without WebGL 2, the plain picture), and the name
 * gathered out of particles across its faded waist. Hidden from assistive
 * tech: the hero's heading says the same thing.
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
  // On a phone the name shrinks to fit, so it is sampled more finely to
  // keep its strokes solid.
  const [narrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
  )

  // Both intros start as soon as this mounts; let the page know when
  // they are over, so the samurai's build does not make them stutter.
  useEffect(() => {
    if (prefersReducedMotion()) {
      markOpeningDone()
      return
    }
    const timer = setTimeout(markOpeningDone, OPENING_MS)
    return () => clearTimeout(timer)
  }, [])

  return (
    <section className="portrait-intro" aria-hidden="true">
      <div className="portrait-print">
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

      <div className="portrait-name">
        {colors && (
          <ParticleText
            text={profile.name}
            density={narrow ? 3 : 4}
            highlightColor={colors.brand}
            fontSize="var(--name-size)"
          />
        )}
      </div>
    </section>
  )
}
