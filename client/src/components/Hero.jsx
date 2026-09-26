import { Suspense, lazy, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { FiArrowDown, FiMail, FiMapPin } from 'react-icons/fi'
import { FaLinkedinIn, FaGithub } from 'react-icons/fa'
import { HiOutlineDocumentArrowDown } from 'react-icons/hi2'
import CodePanel from './CodePanel.jsx'
import { profile } from '../data/content.js'
import { supports3D } from '../lib/capabilities.js'

// Three.js is a large dependency — only fetch it when the scene can run.
// Swap this for './Robot3D.jsx' to put the robot character back instead.
const loadSamurai = () => import('./Samurai3D.jsx')
const Samurai3D = lazy(loadSamurai)

/**
 * True once the hero has painted and the browser has a moment to spare.
 * Building the samurai's geometry takes a few seconds of main thread on a
 * phone; doing it after the intro is on screen keeps the first paint fast.
 */
function useAfterFirstPaint(minDelay = 1000) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let idle = 0
    const timer = setTimeout(() => {
      if (window.requestIdleCallback) {
        idle = window.requestIdleCallback(() => setReady(true), { timeout: 1500 })
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
  const [can3D] = useState(supports3D)
  const buildSamurai = useAfterFirstPaint()

  // Fetch the samurai's code straight away — that also starts his texture
  // worker and reflection map — and only hold back building him.
  useEffect(() => {
    if (can3D) loadSamurai()
  }, [can3D])

  return (
    <section id="home" className="hero">
      <div className="container">
        <div className="hero-grid">
          {/* ---- Left: intro ---- */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          >
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
          </motion.div>

          {/* ---- Right: the samurai ---- */}
          <motion.div
            initial={{ opacity: 0, y: 36 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            {can3D ? (
              buildSamurai ? (
                <Suspense fallback={<div className="robot3d samurai3d" aria-hidden="true" />}>
                  <Samurai3D />
                </Suspense>
              ) : (
                <div className="robot3d samurai3d" aria-hidden="true" />
              )
            ) : (
              <CodePanel />
            )}

            <div className="pipeline">
              {['Client', 'API', 'Queue', 'LLM', 'Memory'].map((node, i, arr) => (
                <span key={node} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span className="pipe-node">{node}</span>
                  {i < arr.length - 1 && <span className="pipe-arrow">→</span>}
                </span>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
