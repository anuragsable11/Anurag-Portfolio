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
 * True once the hero has painted and the browser has a moment to spare.
 * The samurai builds his geometry in small slices, so he can start soon
 * after the intro is on screen without stalling its animation.
 */
function useAfterFirstPaint(minDelay = 400) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let idle = 0
    const timer = setTimeout(() => {
      if (window.requestIdleCallback) {
        idle = window.requestIdleCallback(() => setReady(true), { timeout: 800 })
      } else setReady(true)
    }, minDelay)
    return () => {
      clearTimeout(timer)
      if (idle) window.cancelIdleCallback?.(idle)
    }
  }, [minDelay])
  return ready
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
  const buildSamurai = useAfterFirstPaint()

  // On a phone he sleeps as his poster until woken: tapping him (he then
  // draws his katana, as a tap on him always does) or playing a move (he
  // then plays it). `greet` is what he does once he is up.
  const [phone] = useState(isPhone)
  const [greet, setGreet] = useState(null)
  const asleep = phone && !greet
  const { action } = useCompanion()
  const seenAction = useRef(action?.id ?? 0)
  useEffect(() => {
    if (!action || action.id === seenAction.current) return
    seenAction.current = action.id
    if (asleep && MOVES.some((m) => m.action === action.name)) setGreet(action.name)
  }, [action, asleep])

  // Start the samurai's texture worker and reflection map at once, fetch his
  // code alongside them, and only hold back building him.
  useEffect(() => {
    if (!can3D || asleep) return
    preloadSamurai()
    loadSamurai()
  }, [can3D, asleep])

  return (
    <section id="home" className="hero">
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
