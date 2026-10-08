import { useEffect, useState } from 'react'
import lightSmall from '../../assets/samurai/poster-light-2000.webp'
import lightLarge from '../../assets/samurai/poster-light-3000.webp'
import darkSmall from '../../assets/samurai/poster-dark-2000.webp'
import darkLarge from '../../assets/samurai/poster-dark-3000.webp'

/**
 * The samurai as a still picture: rendered from the 3D model itself (see
 * tools/render-samurai-poster.html), held at his first frame.
 *
 * It is shown at once while the 3D samurai loads, and the live canvas
 * fades in over it; it stays in his place wherever 3D cannot run (no WebGL,
 * a model that failed to load, a lost GPU context).
 *
 * The picture is 3:1 and the stage is never wider than that, so filling
 * the stage's height and cropping the sides (object-fit: cover) shows the
 * same framing as the live camera at any stage shape. Its drawn width is
 * therefore three times the stage height (--stage-h, clamp(340px, 30vw +
 * 40px, 600px)), which is what `sizes` tells the browser. The small one
 * serves 1× screens and laptops scaled to 125–150%; denser ones take the
 * large.
 */
const POSTERS = {
  light: { small: lightSmall, large: lightLarge },
  dark: { small: darkSmall, large: darkLarge },
}
const SIZES = '(max-width: 1000px) 1020px, (min-width: 1867px) 1800px, calc(90vw + 120px)'

/** The page's theme (data-theme on <html>), following the toggle. */
function usePageTheme() {
  const read = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  const [theme, setTheme] = useState(read)
  useEffect(() => {
    const watcher = new MutationObserver(() => setTheme(read()))
    watcher.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => watcher.disconnect()
  }, [])
  return theme
}

export default function SamuraiFallback() {
  const { small, large } = POSTERS[usePageTheme()]
  return (
    <img
      className="samurai-poster"
      src={small}
      srcSet={`${small} 2000w, ${large} 3000w`}
      sizes={SIZES}
      alt=""
      aria-hidden="true"
      decoding="async"
      draggable={false}
    />
  )
}
