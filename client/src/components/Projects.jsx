import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  FiChevronLeft,
  FiChevronRight,
  FiInfo,
  FiLock,
  FiMaximize2,
  FiPlus,
  FiX,
} from 'react-icons/fi'
import { FaGithub, FaPlay } from 'react-icons/fa'
import Reveal from './Reveal.jsx'
import SectionHead from './SectionHead.jsx'
import { projects } from '../data/content.js'
import { act, celebrate } from '../lib/companion.js'

const ease = [0.22, 1, 0.36, 1]

/** Locks page scroll while an overlay is open, then restores what was there. */
function useScrollLock() {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])
}

/** The address pill in a browser frame's toolbar. */
function BrowserAddress({ address }) {
  return (
    <span className="browser-address">
      <FiLock aria-hidden="true" />
      <span className="browser-url">{address}</span>
    </span>
  )
}

/** A project's landing-page screenshot, responsive to the slot it fills. */
function Shot({ showcase, sizes, alt = '' }) {
  return (
    <img
      src={showcase.image}
      srcSet={`${showcase.imageSmall} 800w, ${showcase.image} 1600w`}
      sizes={sizes}
      width={showcase.width}
      height={showcase.height}
      alt={alt}
      loading="lazy"
      decoding="async"
    />
  )
}

/** Full-size view of a landing page screenshot. Esc, the button or the backdrop closes it. */
function Lightbox({ showcase, name, onClose }) {
  const closeRef = useRef(null)
  useScrollLock()

  useEffect(() => {
    const returnTo = document.activeElement
    closeRef.current?.focus()
    // Caught on the way down and stopped, so Esc closes this view and not
    // the project page behind it.
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      returnTo?.focus?.()
    }
  }, [onClose])

  return (
    <motion.div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`${name} landing page`}
      onClick={(e) => {
        e.stopPropagation()
        onClose()
      }}
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
          <BrowserAddress address={showcase.address} />
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

/** Live and Code, as the title page's play and secondary buttons. */
function ProjectLinks({ project }) {
  const { links = {} } = project
  return (
    <>
      {links.live && (
        <a
          className="bb-btn bb-play"
          href={links.live}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${project.name} live demo (opens in a new tab)`}
          onClick={celebrate}
        >
          <FaPlay aria-hidden="true" />
          Live
        </a>
      )}
      {links.github && (
        <a
          className="bb-btn bb-glass"
          href={links.github}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${project.name} source code on GitHub (opens in a new tab)`}
          onClick={celebrate}
        >
          <FaGithub aria-hidden="true" />
          Code
        </a>
      )}
    </>
  )
}

/**
 * A project's detail view, laid out like a title page on a streaming service:
 * the landing page as art, the name, summary, stack and links over it, and
 * the engineering write-up underneath.
 */
function ProjectModal({ project, returnFocusTo, onClose }) {
  const { showcase } = project
  const closeRef = useRef(null)
  const [zoomed, setZoomed] = useState(false)
  const closeZoom = useCallback(() => setZoomed(false), [])
  const titleId = `project-${project.id}-title`
  useScrollLock()

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      returnFocusTo?.focus?.()
    }
  }, [onClose, returnFocusTo])

  return (
    <motion.div
      className="project-modal-backdrop"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <motion.div
        className="project-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-accent={project.accent}
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 28, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.4, ease }}
      >
        <button ref={closeRef} className="modal-close" onClick={onClose} aria-label="Close">
          <FiX />
        </button>

        <div className={`billboard ${showcase ? '' : 'no-art'}`}>
          <div className="billboard-art">
            {showcase && (
              <Shot showcase={showcase} alt={showcase.alt} sizes="(max-width: 940px) 100vw, 720px" />
            )}
          </div>
          {showcase && <div className="billboard-frost" aria-hidden="true" />}
          <div className="billboard-shade" aria-hidden="true" />

          {showcase && (
            <button
              className="billboard-zoom"
              onClick={() => {
                setZoomed(true)
                celebrate()
              }}
              aria-label={`View the ${project.name} landing page full size`}
            >
              <FiMaximize2 aria-hidden="true" />
            </button>
          )}

          <div className="billboard-info">
            <div className="billboard-meta">
              <span className="billboard-category">{project.category}</span>
              <span className="billboard-year">{project.year}</span>
            </div>
            <h2 id={titleId} className="billboard-title">
              {project.name}
            </h2>
            <p className="billboard-subtitle">{project.subtitle}</p>
            <p className="billboard-summary">{project.summary}</p>
            <div className="billboard-stack">
              {project.stack.map((tech) => (
                <span className="chip" key={tech}>
                  {tech}
                </span>
              ))}
            </div>
            {(project.links?.live || project.links?.github) && (
              <div className="billboard-actions">
                <ProjectLinks project={project} />
              </div>
            )}
          </div>
        </div>

        <div className={`project-details ${project.flow ? 'has-flow' : ''}`}>
          <div className="project-main">
            <ul className="project-points">
              {project.highlights.map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
          </div>

          {project.flow && (
            <aside className="project-side">
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
            </aside>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {zoomed && <Lightbox showcase={showcase} name={project.name} onClose={closeZoom} />}
      </AnimatePresence>
    </motion.div>
  )
}

/**
 * What a poster opens into on hover: the landing page, the main action, and
 * the project in a line. With a live demo, Live leads and "+" opens the
 * details; without one, the details lead.
 */
function ProjectPreview({ project, onOpen }) {
  const { showcase, links = {} } = project

  return (
    <div className="shelf-preview">
      {/* The poster button is the keyboard route to the same place. */}
      <div
        className={`preview-art ${showcase ? '' : 'no-art'}`}
        onClick={onOpen}
        aria-hidden="true"
      >
        {showcase && <Shot showcase={showcase} sizes="420px" />}
        <span className="preview-title">{project.name}</span>
      </div>

      <div className="preview-body">
        <div className="preview-actions">
          {links.live ? (
            <a
              className="bb-btn bb-play preview-main"
              href={links.live}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${project.name} live demo (opens in a new tab)`}
              onClick={celebrate}
            >
              <FaPlay aria-hidden="true" />
              Live
            </a>
          ) : (
            <button className="bb-btn bb-play preview-main" onClick={onOpen}>
              <FiInfo aria-hidden="true" />
              What I built
            </button>
          )}
          {links.github && (
            <a
              className="preview-square"
              href={links.github}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${project.name} source code on GitHub (opens in a new tab)`}
              title="Code"
              onClick={celebrate}
            >
              <FaGithub aria-hidden="true" />
            </a>
          )}
          {links.live && (
            <button
              className="preview-square"
              onClick={onOpen}
              aria-label={`What I built: ${project.name}`}
              title="What I built"
            >
              <FiPlus aria-hidden="true" />
            </button>
          )}
        </div>

        <p className="preview-meta">
          <span>{project.year}</span>
          <span>{project.category}</span>
          <span>{project.stack[0]}</span>
        </p>
        <p className="preview-summary">{project.summary}</p>
      </div>
    </div>
  )
}

/** Opens the preview leftward when opening rightward would run off the row. */
function placePreview(e) {
  const item = e.currentTarget.closest('.shelf-item')
  const row = item?.closest('.shelf-row')
  const preview = item?.querySelector('.shelf-preview')
  if (!row || !preview) return
  const edge = Math.min(row.getBoundingClientRect().right, document.documentElement.clientWidth)
  const flip = item.getBoundingClientRect().left + preview.offsetWidth > edge - 16
  item.dataset.flip = String(flip)
}

// Forwards its ref: AnimatePresence's popLayout measures each child through it.
const ShelfItem = forwardRef(function ShelfItem({ project, index, onOpen }, ref) {
  const { showcase } = project
  const posterRef = useRef(null)
  const open = () => {
    celebrate()
    onOpen(project, posterRef.current)
  }

  return (
    <motion.li
      ref={ref}
      className="shelf-item"
      data-accent={project.accent}
      onPointerEnter={placePreview}
      layout
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.45, delay: index * 0.05, ease }}
    >
      <button
        ref={posterRef}
        className={`shelf-poster ${showcase ? '' : 'no-art'}`}
        onClick={open}
        onFocus={placePreview}
        aria-label={`${project.name}, ${project.subtitle}. Open details`}
      >
        {showcase && (
          <>
            {/* The same shot, blurred into a glass base the colour of the product. */}
            <img className="poster-ambient" src={showcase.imageSmall} alt="" aria-hidden="true" />
            <span className="poster-art">
              <Shot showcase={showcase} sizes="(max-width: 760px) 300px, 460px" />
            </span>
          </>
        )}
        <span className="poster-title">
          {project.name.split(' ').map((word, i) => (
            <span key={i}>
              {i > 0 && ' '}
              <span className="poster-word">{word}</span>
            </span>
          ))}
        </span>
      </button>
      <ProjectPreview project={project} onOpen={open} />
    </motion.li>
  )
})

export default function Projects() {
  const categories = useMemo(
    () => ['All', ...Array.from(new Set(projects.map((p) => p.category)))],
    []
  )
  const [filter, setFilter] = useState('All')
  const [active, setActive] = useState(null)
  const rowRef = useRef(null)
  const [edges, setEdges] = useState({ start: true, end: true })

  const visible = useMemo(
    () => (filter === 'All' ? projects : projects.filter((p) => p.category === filter)),
    [filter]
  )

  const openProject = useCallback((project, from) => setActive({ project, from }), [])
  const closeProject = useCallback(() => setActive(null), [])

  const updateEdges = useCallback(() => {
    const row = rowRef.current
    if (!row) return
    setEdges({
      start: row.scrollLeft <= 4,
      end: row.scrollLeft + row.clientWidth >= row.scrollWidth - 4,
    })
  }, [])

  useEffect(() => {
    updateEdges()
    window.addEventListener('resize', updateEdges)
    return () => window.removeEventListener('resize', updateEdges)
  }, [updateEdges, visible])

  const scrollRow = (dir) => {
    const row = rowRef.current
    row?.scrollBy({ left: dir * row.clientWidth * 0.75, behavior: 'smooth' })
  }

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
                aria-pressed={filter === cat}
                onClick={() => {
                  if (cat !== filter) act('nod')
                  setFilter(cat)
                }}
              >
                {filter === cat && (
                  <motion.span
                    layoutId="projects-filter-pill"
                    className="filter-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                  />
                )}
                <span className="filter-label">{cat}</span>
              </button>
            ))}
          </div>
        </Reveal>

        <Reveal className="shelf" delay={0.08}>
          <button
            className={`shelf-nav prev ${edges.start ? 'is-hidden' : ''}`}
            onClick={() => scrollRow(-1)}
            aria-label="Scroll projects left"
            tabIndex={edges.start ? -1 : 0}
          >
            <FiChevronLeft aria-hidden="true" />
          </button>

          <ol ref={rowRef} className="shelf-row" onScroll={updateEdges}>
            <AnimatePresence mode="popLayout" initial={false}>
              {visible.map((project, i) => (
                <ShelfItem
                  key={project.id}
                  project={project}
                  index={i}
                  onOpen={openProject}
                />
              ))}
            </AnimatePresence>
          </ol>

          <button
            className={`shelf-nav next ${edges.end ? 'is-hidden' : ''}`}
            onClick={() => scrollRow(1)}
            aria-label="Scroll projects right"
            tabIndex={edges.end ? -1 : 0}
          >
            <FiChevronRight aria-hidden="true" />
          </button>
        </Reveal>
      </div>

      {/* Portalled: the section sits inside transformed layout wrappers, which
          would otherwise trap a position: fixed overlay. */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {active && (
              <ProjectModal
                key={active.project.id}
                project={active.project}
                returnFocusTo={active.from}
                onClose={closeProject}
              />
            )}
          </AnimatePresence>,
          document.body
        )}
    </section>
  )
}
