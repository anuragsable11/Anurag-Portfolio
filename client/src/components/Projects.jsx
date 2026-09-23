import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { FiArrowUpRight, FiCheck, FiChevronDown, FiMaximize2, FiX } from 'react-icons/fi'
import { FaGithub } from 'react-icons/fa'
import Reveal from './Reveal.jsx'
import SectionHead from './SectionHead.jsx'
import { projects } from '../data/content.js'

const ease = [0.22, 1, 0.36, 1]

/** Full-size view of a landing page screenshot. Esc, the button or the backdrop closes it. */
function Lightbox({ showcase, name, onClose }) {
  const closeRef = useRef(null)

  useEffect(() => {
    const returnTo = document.activeElement
    closeRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      returnTo?.focus?.()
    }
  }, [onClose])

  return (
    <motion.div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`${name} landing page`}
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <motion.figure
        className="lightbox-figure"
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.96, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.97, y: 8 }}
        transition={{ duration: 0.35, ease }}
      >
        <div className="browser-bar">
          <span className="browser-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="browser-address">{showcase.address}</span>
          <button
            ref={closeRef}
            className="lightbox-close"
            onClick={onClose}
            aria-label="Close"
          >
            <FiX />
          </button>
        </div>
        <img
          src={showcase.image}
          width={showcase.width}
          height={showcase.height}
          alt={showcase.alt}
        />
      </motion.figure>
    </motion.div>
  )
}

/**
 * The product as a user meets it: its landing page in a browser frame, beside
 * the promise it makes. The engineering write-up follows below.
 */
function ProjectShowcase({ project }) {
  const { showcase } = project
  const [zoomed, setZoomed] = useState(false)
  const close = useCallback(() => setZoomed(false), [])

  return (
    <div className="project-showcase">
      <button
        className="showcase-shot"
        onClick={() => setZoomed(true)}
        aria-label={`View the ${project.name} landing page full size`}
      >
        <span className="browser-bar" aria-hidden="true">
          <span className="browser-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="browser-address">{showcase.address}</span>
        </span>
        <img
          src={showcase.image}
          srcSet={`${showcase.imageSmall} 800w, ${showcase.image} 1600w`}
          sizes="(max-width: 1024px) 100vw, 720px"
          width={showcase.width}
          height={showcase.height}
          alt={showcase.alt}
          loading="lazy"
          decoding="async"
        />
        <span className="showcase-zoom" aria-hidden="true">
          <FiMaximize2 /> View full size
        </span>
      </button>

      <div className="showcase-copy">
        <h5>{project.name} · landing page</h5>
        <p className="showcase-headline">“{showcase.headline}”</p>
        <p className="showcase-pitch">{showcase.pitch}</p>
        <ul className="showcase-promises">
          {showcase.promises.map((promise) => (
            <li key={promise}>
              <FiCheck aria-hidden="true" />
              {promise}
            </li>
          ))}
        </ul>
      </div>

      {/* Portalled: the card sits inside transformed layout wrappers, which
          would otherwise trap a position: fixed overlay. */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {zoomed && <Lightbox showcase={showcase} name={project.name} onClose={close} />}
          </AnimatePresence>,
          document.body
        )}
    </div>
  )
}

function ProjectCard({ project }) {
  const [open, setOpen] = useState(project.featured)

  return (
    <div className={`card project-card ${project.featured ? 'featured' : ''}`}>
      {project.showcase && <ProjectShowcase project={project} />}
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
            <div className="project-meta">
              <span className="project-year">{project.year}</span>
              {project.links?.github && (
                <a
                  className="project-link"
                  href={project.links.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${project.name} source code on GitHub (opens in a new tab)`}
                >
                  <FaGithub aria-hidden="true" />
                  Code
                  <FiArrowUpRight aria-hidden="true" />
                </a>
              )}
            </div>
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
