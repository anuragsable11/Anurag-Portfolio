import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FiChevronDown } from 'react-icons/fi'
import Reveal from './Reveal.jsx'
import SectionHead from './SectionHead.jsx'
import { projects } from '../data/content.js'

const ease = [0.22, 1, 0.36, 1]

function ProjectCard({ project }) {
  const [open, setOpen] = useState(project.featured)

  return (
    <div className={`card project-card ${project.featured ? 'featured' : ''}`}>
      <div className="project-inner">
        <div className="project-main">
          <span className="project-tag" data-accent={project.accent}>
            {project.category}
          </span>

          <div className="project-top">
            <div>
              <h3 className="project-title">{project.name}</h3>
              <p className="project-subtitle">{project.subtitle}</p>
            </div>
            <span className="project-year">{project.year}</span>
          </div>

          <p className="project-summary">{project.summary}</p>

          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                className="details-wrap"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.4, ease }}
              >
                <ul className="project-points">
                  {project.highlights.map((point, i) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="project-stack">
            {project.stack.map((tech) => (
              <span className="chip" key={tech}>
                {tech}
              </span>
            ))}
          </div>

          <button
            className="project-toggle"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? 'Hide details' : 'What I built'}
            <motion.span
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: 0.3, ease }}
              style={{ display: 'inline-flex' }}
            >
              <FiChevronDown />
            </motion.span>
          </button>
        </div>

        {project.featured && project.flow && (
          <aside className="project-side">
            <div>
              <h5>Pipeline</h5>
              <div className="flow-list">
                {project.flow.map((step, i) => (
                  <div key={step}>
                    <div className="flow-step">
                      <span className="flow-num">{i + 1}</span>
                      {step}
                    </div>
                    {i < project.flow.length - 1 && <div className="flow-connector" />}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}

export default function Projects() {
  const categories = useMemo(
    () => ['All', ...Array.from(new Set(projects.map((p) => p.category)))],
    []
  )
  const [filter, setFilter] = useState('All')

  const visible = useMemo(
    () => (filter === 'All' ? projects : projects.filter((p) => p.category === filter)),
    [filter]
  )

  return (
    <section id="projects" className="section">
      <div className="container">
        <SectionHead
          eyebrow="Projects"
          title="Things I have"
          highlight="designed and shipped"
          sub="Two LLM systems built end to end, plus the web applications where I learned the fundamentals."
        />

        <Reveal>
          <div className="projects-filter">
            {categories.map((cat) => (
              <button
                key={cat}
                className={`filter-btn ${filter === cat ? 'active' : ''}`}
                onClick={() => setFilter(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </Reveal>

        <motion.div layout className="projects-list">
          <AnimatePresence mode="popLayout">
            {visible.map((project, i) => (
              <motion.div
                key={project.id}
                layout
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12, scale: 0.98 }}
                transition={{ duration: 0.5, delay: i * 0.06, ease }}
              >
                <ProjectCard project={project} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  )
}
