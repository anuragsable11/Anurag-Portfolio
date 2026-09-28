import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { animate, useInView, useReducedMotion } from 'framer-motion'
import { FiCpu, FiLayers, FiZap } from 'react-icons/fi'
import Reveal from './Reveal.jsx'
import SectionHead from './SectionHead.jsx'
import { profile, stats } from '../data/content.js'
import { supports3D } from '../lib/capabilities.js'

const AgentGraph3D = lazy(() => import('./AgentGraph3D.jsx'))

const focus = [
  {
    icon: <FiCpu />,
    group: 'ai',
    title: 'LLM Orchestration',
    body: 'Routing conversation turns between clients, queues, tools and a locally hosted model — with context that survives the turn.',
  },
  {
    icon: <FiLayers />,
    group: 'ai',
    title: 'Retrieval-Augmented Generation',
    body: 'Extract, chunk, embed, retrieve, generate — grounding model answers in real documents with traceable sources.',
  },
  {
    icon: <FiZap />,
    group: 'backend',
    title: 'Async Backend Design',
    body: 'Celery and Redis keep inference off the request cycle, so APIs stay fast while the heavy work runs in the background.',
  },
]

/**
 * A figure that counts up from zero the first time it scrolls into view.
 * Years ("2026") stay put — a year ticking up from zero reads as noise.
 */
function Figure({ value }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.6 })
  const reduceMotion = useReducedMotion()
  const [, digits, suffix = ''] = /^(\d+)(.*)$/.exec(value) || []
  const target = digits === undefined ? null : Number(digits)
  const counts = target !== null && target < 1000 && !reduceMotion
  const [shown, setShown] = useState(counts ? 0 : target)

  useEffect(() => {
    if (!counts || !inView) return
    const controls = animate(0, target, {
      duration: 1.3,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setShown(Math.round(v)),
    })
    return () => controls.stop()
  }, [counts, inView, target])

  return (
    <>
      <span ref={ref} aria-hidden="true">
        {target === null ? value : `${shown}${suffix}`}
      </span>
      <span className="visually-hidden">{value}</span>
    </>
  )
}

/** Moves the console's spotlight to the pointer. */
function trackPointer(e) {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
}

export default function About() {
  const [can3D] = useState(supports3D)

  return (
    <section id="about" className="section">
      <div className="container">
        <SectionHead
          eyebrow="About"
          title="Backend engineering for"
          highlight="AI-driven systems"
          sub="I care about the layer beneath the model — the part that decides what the model sees, remembers and does next."
        />

        <div className="about-grid">
          <div className="about-copy">
            {profile.summary.map((para, i) => (
              <Reveal key={i} delay={i * 0.1}>
                <p className={i === 0 ? 'about-lead' : undefined}>{para}</p>
              </Reveal>
            ))}
          </div>

          {/* A sibling of the copy, so the grid can seat it beside the copy
              on wide screens and under it elsewhere. */}
          <div className="focus-list">
            {focus.map((f, i) => (
              <Reveal key={f.title} delay={0.1 + i * 0.09} x={-14} y={0}>
                <div className="focus-item" data-skill-group={f.group}>
                  <span className="focus-icon">{f.icon}</span>
                  <div>
                    <h4>{f.title}</h4>
                    <p>{f.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          {/* The figures, the agent loop and the credo, on one dark glass
              console — the same surface the project frames use. */}
          <Reveal className="about-console-slot" delay={0.12}>
            <div className="about-console" onPointerMove={trackPointer}>
              <div className="stats-grid">
                {stats.map((s, i) => (
                  <Reveal key={s.label} delay={0.2 + i * 0.07}>
                    <div className="stat">
                      <div className="stat-value">
                        <Figure value={s.value} />
                      </div>
                      <div className="stat-label">{s.label}</div>
                    </div>
                  </Reveal>
                ))}
              </div>

              {can3D && (
                <Suspense fallback={<div className="graph3d" aria-hidden="true" />}>
                  <AgentGraph3D />
                </Suspense>
              )}

              <div className="quote-card">
                <p>
                  <span className="q-mark">{'//'}</span> A model on its own answers questions.
                  A good backend gives it memory, tools and a place to put the work — that is
                  the part I build.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
