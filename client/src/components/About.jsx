import { FiCpu, FiLayers, FiZap } from 'react-icons/fi'
import SectionHead from './SectionHead.jsx'
import { profile, stats } from '../data/content.js'

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

export default function About() {
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
              <p key={i} className={i === 0 ? 'about-lead' : undefined}>
                {para}
              </p>
            ))}
            <blockquote className="about-quote">
              <p>
                <span className="q-mark">{'//'}</span> A model on its own answers questions.
                A good backend gives it memory, tools and a place to put the work — that is
                the part I build.
              </p>
            </blockquote>
          </div>

          <dl className="about-stats">
            {stats.map((s) => (
              <div className="stat" key={s.label}>
                <dt className="stat-label">{s.label}</dt>
                <dd className="stat-value">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <ul className="focus-list">
          {focus.map((f) => (
            <li className="focus-item" key={f.title} data-skill-group={f.group}>
              <span className="focus-icon" aria-hidden="true">
                {f.icon}
              </span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
