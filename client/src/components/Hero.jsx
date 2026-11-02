import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { FiArrowDown, FiMail, FiMapPin } from 'react-icons/fi'
import { FaLinkedinIn, FaGithub } from 'react-icons/fa'
import { HiOutlineDocumentArrowDown } from 'react-icons/hi2'
import SamuraiMoves from './SamuraiMoves.jsx'
import SamuraiFallback from './Samurai3D/SamuraiFallback.jsx'
import { profile } from '../data/content.js'
import { useHydrated } from '../hooks/useHydrated.js'
import { canRenderSamurai, isPhone } from '../lib/capabilities.js'
import { MOVES, useCompanion } from '../lib/companion.js'
import { whenOpeningDone } from '../lib/opening.js'
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
 * True once the opening screen above the hero has formed and the browser
 * has a moment to spare. Until then the samurai's preparation would compete
 * with the portrait's and the name's intro for the main thread and the GPU,
 * and make them stutter.
 */
function useAfterOpening() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let idle = 0
    const stop = whenOpeningDone(() => {
      if (window.requestIdleCallback) {
        idle = window.requestIdleCallback(() => setReady(true), { timeout: 800 })
      } else setReady(true)
    })
    return () => {
      stop()
      if (idle) window.cancelIdleCallback?.(idle)
    }
  }, [])
  return ready
}

/**
 * True once `ref`'s element has started to come into view, and from then
 * on. The hero sits below the opening screen, so the samurai is built when
 * the visitor scrolls towards him rather than while they play with the
 * portrait above (his build's longer tasks would hitch it). His poster
 * stands in until he is ready.
 */
function useApproached(ref) {
  const [approached, setApproached] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || approached) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setApproached(true)
      },
      { rootMargin: '0px 0px -5% 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, approached])
  return approached
}

/** Rotating type-on / type-off effect for the role line. */
function useTypewriter(words, typeMs = 75, eraseMs = 40, holdMs = 1700) {
  const [index, setIndex] = useState(0)
  const [text, setText] = useState('')
  const [erasing, setErasing] = useState(false)

  useEffect(() => {
    const word = words[index % words.length]

    if (!erasing && text === word) {
      const t = setTimeout(() => setErasing(true), holdMs)
      return () => clearTimeout(t)
    }

    if (erasing && text === '') {
      setErasing(false)
      setIndex((i) => (i + 1) % words.length)
      return
    }

    const t = setTimeout(
      () =>
        setText((cur) =>
          erasing ? word.slice(0, cur.length - 1) : word.slice(0, cur.length + 1)
        ),
      erasing ? eraseMs : typeMs
    )
    return () => clearTimeout(t)
  }, [text, erasing, index, words, typeMs, eraseMs, holdMs])

  return text
}

export default function Hero() {
  const typed = useTypewriter(profile.roles)
  const [canRender] = useState(canRenderSamurai)
  // Unknown until hydrated: the prerendered page cannot know about WebGL.
  const can3D = useHydrated() ? canRender : undefined
  const heroRef = useRef(null)
  const settled = useAfterOpening()
  const approached = useApproached(heroRef)

  // On a phone he sleeps as his poster until woken: tapping him (he then
  // draws his katana, as a tap on him always does) or playing a move (he
  // then plays it). `greet` is what he does once he is up.
  const [phone] = useState(isPhone)
  const [greet, setGreet] = useState(null)
  const asleep = phone && !greet
  // Woken by hand, he comes at once.
  const buildSamurai = (settled && approached) || !!greet
  const { action } = useCompanion()
  const seenAction = useRef(action?.id ?? 0)
  useEffect(() => {
    if (!action || action.id === seenAction.current) return
    seenAction.current = action.id
    if (asleep && MOVES.some((m) => m.action === action.name)) setGreet(action.name)
  }, [action, asleep])

  // Start the samurai's texture worker and reflection map once the opening
  // has formed (both run off the main thread), and fetch his code as the
  // hero comes into view, alongside building him.
  useEffect(() => {
    if (!can3D || asleep || !(settled || greet)) return
    preloadSamurai()
  }, [can3D, asleep, settled, greet])

  useEffect(() => {
    if (can3D && !asleep && buildSamurai) loadSamurai()
  }, [can3D, asleep, buildSamurai])

  return (
    <section id="home" className="hero" ref={heroRef}>
      <div className="container">
        <div className="hero-grid">
          {/* ---- Left: intro ---- */}
          {/* Both halves rise in with CSS, from the prerendered page's first
              paint rather than once the JavaScript has loaded. */}
          <div className="hero-enter">
            <span className="hero-badge">
              <span className="pulse-dot" />
              {profile.availability}
            </span>

            <h1 className="hero-name">
              <span>Anurag</span>
              <span className="gradient-text">Sable</span>
            </h1>

            <div className="hero-role">
              <span className="arrow">{'>'}</span>
              <span>
                {typed}
                <span className="type-caret" />
              </span>
            </div>

            <p className="hero-tagline">{profile.tagline}</p>

            <div className="hero-actions">
              <a href="#projects" className="btn btn-primary">
                View My Work <FiArrowDown />
              </a>
              <a
                href={profile.resume}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost"
              >
                <HiOutlineDocumentArrowDown size={18} /> Download Resume
              </a>
            </div>

            <div className="hero-socials">
              <a
                className="social-btn"
                href={profile.linkedin}
                target="_blank"
                rel="noreferrer"
                aria-label="LinkedIn"
              >
                <FaLinkedinIn />
              </a>
              <a
                className="social-btn"
                href={profile.github}
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub"
              >
                <FaGithub />
              </a>
              <a
                className="social-btn"
                href={`mailto:${profile.email}`}
                aria-label="Email Anurag"
              >
                <FiMail />
              </a>
              <span className="social-divider" />
              <span className="hero-location">
                <FiMapPin size={13} /> {profile.location}
              </span>
            </div>
          </div>

          {/* ---- Right: the samurai ---- */}
          <div className="hero-enter hero-enter-late">
            {can3D === false ? (
              <SamuraiStill still />
            ) : can3D && !asleep && buildSamurai ? (
              <Suspense fallback={<SamuraiStill waking={!!greet} />}>
                <Samurai3D greet={greet} />
              </Suspense>
            ) : (
              <SamuraiStill onWake={can3D && asleep ? () => setGreet('cinematic') : undefined} />
            )}

            {/* The samurai's moves: a keycap per key, tappable on touch screens */}
            {can3D !== false && <SamuraiMoves />}

            <div className="pipeline">
              {['Client', 'API', 'Queue', 'LLM', 'Memory'].map((node, i, arr) => (
                <span key={node} className="pipe-step">
                  <span className="pipe-node">{node}</span>
                  {i < arr.length - 1 && <span className="pipe-arrow">→</span>}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
