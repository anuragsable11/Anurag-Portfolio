import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import SamuraiFallback from './Samurai3D/SamuraiFallback.jsx'
import { useHydrated } from '../hooks/useHydrated.js'
import { canRenderSamurai, isPhone } from '../lib/capabilities.js'
import { MOVES, useCompanion } from '../lib/companion.js'
import { preloadSamurai } from '../lib/samurai-preload.js'

// Three.js is a large dependency — only fetch it when the scene can run.
// Swap this for './Robot3D.jsx' to put the robot character back instead.
const loadSamurai = () => import('./Samurai3D/Samurai3D.jsx')
const Samurai3D = lazy(loadSamurai)

/**
 * The samurai's poster in his stage: what shows while his code loads, and
 * all that shows where 3D cannot run (`still`). On a phone it is a button
 * until he is woken (`onWake`); `waking` shows the summon glow over it
 * while he loads.
 */
function SamuraiStill({ still = false, waking = false, onWake }) {
  const modifiers = `${still ? ' is-fallback' : ''}${onWake ? ' is-asleep' : ''}${waking ? ' is-waking' : ''}`
  return onWake ? (
    <div
      className={`robot3d samurai3d has-poster${modifiers}`}
      role="button"
      tabIndex={0}
      aria-label="3D samurai companion. Tap to bring him to life."
      onClick={onWake}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        onWake()
      }}
    >
      <SamuraiFallback />
    </div>
  ) : (
    <div className={`robot3d samurai3d has-poster${modifiers}`} aria-hidden="true">
      <SamuraiFallback />
    </div>
  )
}

/**
 * True once the page has loaded and the browser has a moment to spare. The
 * samurai's preparation (a texture worker, his code, a build with tasks of
 * 50–280 ms) waits until then, so it never holds up the first paint or the
 * visitor's first clicks. His poster stands in meanwhile.
 */
function useAfterLoad() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let idle = 0
    const go = () => {
      if (window.requestIdleCallback) {
        idle = window.requestIdleCallback(() => setReady(true), { timeout: 1200 })
      } else setReady(true)
    }
    if (document.readyState === 'complete') go()
    else window.addEventListener('load', go, { once: true })
    return () => {
      window.removeEventListener('load', go)
      if (idle) window.cancelIdleCallback?.(idle)
    }
  }, [])
  return ready
}

/**
 * The samurai's spot on the page (beside About). He is built once the page
 * has loaded, so he is ready by the time About scrolls in; until then, and
 * while he is off screen, he draws nothing. Once his spot has scrolled
 * past, he waits in the corner on wide screens (see Samurai3D/SamuraiDock).
 */
export default function SamuraiSpot() {
  const [canRender] = useState(canRenderSamurai)
  // Unknown until hydrated: the prerendered page cannot know about WebGL.
  const can3D = useHydrated() ? canRender : undefined
  const settled = useAfterLoad()

  // On a phone he sleeps as his poster until woken: tapping him (he then
  // draws his katana, as a tap on him always does) or playing a move (he
  // then plays it). `greet` is what he does once he is up.
  const [phone] = useState(isPhone)
  const [greet, setGreet] = useState(null)
  const asleep = phone && !greet
  // Woken by hand, he comes at once.
  const buildSamurai = settled || !!greet
  const { action } = useCompanion()
  const seenAction = useRef(action?.id ?? 0)
  useEffect(() => {
    if (!action || action.id === seenAction.current) return
    seenAction.current = action.id
    if (asleep && MOVES.some((m) => m.action === action.name)) setGreet(action.name)
  }, [action, asleep])

  // Start the samurai's texture worker and reflection map once the page has
  // loaded (both run off the main thread), and fetch his code alongside
  // building him.
  useEffect(() => {
    if (!can3D || asleep || !(settled || greet)) return
    preloadSamurai()
  }, [can3D, asleep, settled, greet])

  useEffect(() => {
    if (can3D && !asleep && buildSamurai) loadSamurai()
  }, [can3D, asleep, buildSamurai])

  return (
    <div className="samurai-spot">
      {can3D === false ? (
        <SamuraiStill still />
      ) : can3D && !asleep && buildSamurai ? (
        <Suspense fallback={<SamuraiStill waking={!!greet} />}>
          <Samurai3D greet={greet} />
        </Suspense>
      ) : (
        <SamuraiStill onWake={can3D && asleep ? () => setGreet('cinematic') : undefined} />
      )}
    </div>
  )
}
