import { Suspense, lazy, useState } from 'react'
import { FiCpu, FiLayers, FiZap } from 'react-icons/fi'
import Reveal from './Reveal.jsx'
import SectionHead from './SectionHead.jsx'
import { profile, stats } from '../data/content.js'
import { supports3D } from '../lib/capabilities.js'

const AgentGraph3D = lazy(() => import('./AgentGraph3D.jsx'))

const focus = [
  {
    icon: <FiCpu />,
    title: 'LLM Orchestration',
    body: 'Routing conversation turns between clients, queues, tools and a locally hosted model — with context that survives the turn.',
  },
  {
    icon: <FiLayers />,
    title: 'Retrieval-Augmented Generation',
    body: 'Extract, chunk, embed, retrieve, generate — grounding model answers in real documents with traceable sources.',
  },
  {
    icon: <FiZap />,
    title: 'Async Backend Design',
    body: 'Celery and Redis keep inference off the request cycle, so APIs stay fast while the heavy work runs in the background.',
  },
]

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
                <p>{para}</p>
              </Reveal>
            ))}

            <div className="focus-list">
              {focus.map((f, i) => (
                <Reveal key={f.title} delay={0.1 + i * 0.09} x={-14} y={0}>
                  <div className="focus-item">
                    <span className="focus-icon">{f.icon}</span>
                    <div>
                      <h4>{f.title}</h4>
                      <p>{f.body}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>

          <div>
            <div className="stats-grid">
              {stats.map((s, i) => (
                <Reveal key={s.label} delay={i * 0.08}>
                  <div className="stat">
                    <div className="stat-value">{s.value}</div>
                    <div className="stat-label">{s.label}</div>
                  </div>
                </Reveal>
              ))}
            </div>

            {can3D && (
              <Reveal delay={0.24}>
                <Suspense fallback={<div className="graph3d" aria-hidden="true" />}>
                  <AgentGraph3D />
                </Suspense>
              </Reveal>
            )}

            <Reveal delay={0.3}>
              <div className="quote-card">
                <p>
                  <span className="q-mark">{'//'}</span> A model on its own answers questions.
                  A good backend gives it memory, tools and a place to put the work — that is
                  the part I build.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  )
}
