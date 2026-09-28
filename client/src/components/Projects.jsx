import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion'
import { FiInfo, FiLock, FiMaximize2, FiPlus, FiX } from 'react-icons/fi'
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

/** The frame opened by default: the middle one. */
const middleOf = (count) => Math.floor((count - 1) / 2)

/** False on screens that can't hover — phones and most tablets. */
function useCanHover() {
  const query = '(hover: hover)'
  const [canHover, setCanHover] = useState(
    () => typeof window === 'undefined' || window.matchMedia(query).matches
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const update = () => setCanHover(mq.matches)
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return canHover
}

/**
 * One project as a framed photograph in the rail. Closed, it is a sliver of
 * its landing page; open, it widens, the shot re-crops into the new width,
 * and the caption fades in over a scrim.
 */
function RailFrame({ project, open, onActivate, onOpen }) {
  const { showcase, links = {} } = project
  const hitRef = useRef(null)
  const lastPointer = useRef('')

  const showDetails = () => {
    celebrate()
    onOpen(project, hitRef.current)
  }

  return (
    <li
      className={`rail-frame ${open ? 'is-open' : ''} ${showcase ? '' : 'no-art'}`}
      data-accent={project.accent}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') onActivate()
      }}
      onFocus={(e) => {
        // Keyboard focus only: a tap focuses too on some browsers, and a tap
        // has its own rule below.
        if (e.target.matches(':focus-visible')) onActivate()
      }}
    >
      <figure className="rail-figure">
        <div
          className="rail-pic"
          style={showcase ? { '--shot': `url(${showcase.image})` } : undefined}
          aria-hidden="true"
        />
        <button
          ref={hitRef}
          className="rail-hit"
          onPointerDown={(e) => {
            lastPointer.current = e.pointerType
          }}
          onClick={() => {
            // A tap on a closed frame opens it; anything else shows the details.
            const tap = lastPointer.current === 'touch'
            lastPointer.current = ''
            if (tap && !open) onActivate()
            else showDetails()
          }}
          aria-label={`${project.name}, ${project.subtitle}. Open details`}
        />
        <figcaption className="rail-caption">
          <div className="rail-meta">
            <span className="billboard-category">{project.category}</span>
            <span className="billboard-year">{project.year}</span>
          </div>
          <h3 className="rail-title">
            {project.name.split(' ').map((word, i) => (
              <span key={i}>
                {i > 0 && ' '}
                <span className="rail-word">{word}</span>
              </span>
            ))}
          </h3>
          <span className="rail-subtitle">{project.subtitle}</span>
          <div className="rail-actions">
            {links.live ? (
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
            ) : (
              <button className="bb-btn bb-play" onClick={showDetails}>
                <FiInfo aria-hidden="true" />
                What I built
              </button>
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
            {links.live && (
              <button
                className="rail-round"
                onClick={showDetails}
                aria-label={`What I built: ${project.name}`}
                title="What I built"
              >
                <FiPlus aria-hidden="true" />
              </button>
            )}
          </div>
        </figcaption>
      </figure>
    </li>
  )
}

const countFor = (cat) =>
  cat === 'All' ? projects.length : projects.filter((p) => p.category === cat).length

export default function Projects() {
  const categories = useMemo(
    () => ['All', ...Array.from(new Set(projects.map((p) => p.category)))],
    []
  )
  const [filter, setFilter] = useState('All')
  const [openIndex, setOpenIndex] = useState(() => middleOf(projects.length))
  const [detail, setDetail] = useState(null)

  const visible = useMemo(
    () => (filter === 'All' ? projects : projects.filter((p) => p.category === filter)),
    [filter]
  )

  const openProject = useCallback((project, from) => setDetail({ project, from }), [])
  const closeProject = useCallback(() => setDetail(null), [])

  // Screens that can't hover play the rail themselves: the next frame opens
  // every 2.4s while the rail is on screen. A touch holds it for a while.
  const stageRef = useRef(null)
  const inView = useInView(stageRef, { amount: 0.35 })
  const canHover = useCanHover()
  const reduceMotion = useReducedMotion()
  const holdUntil = useRef(0)
  const autoplay = !canHover && !reduceMotion && inView && !detail && visible.length > 1

  useEffect(() => {
    if (!autoplay) return
    const id = setInterval(() => {
      if (document.hidden || Date.now() < holdUntil.current) return
      setOpenIndex((i) => (i + 1) % visible.length)
    }, 2400)
    return () => clearInterval(id)
  }, [autoplay, visible.length])

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
                  if (cat === filter) return
                  act('nod')
                  setFilter(cat)
                  setOpenIndex(middleOf(countFor(cat)))
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

        <Reveal delay={0.08}>
          <div
            className="rail-stage"
            ref={stageRef}
            onPointerDown={(e) => {
              if (e.pointerType === 'touch') holdUntil.current = Date.now() + 8000
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.ol
                key={filter}
                className="rail"
                style={{ '--n': visible.length }}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease }}
              >
                {visible.map((project, i) => (
                  <RailFrame
                    key={project.id}
                    project={project}
                    open={i === openIndex}
                    onActivate={() => setOpenIndex(i)}
                    onOpen={openProject}
                  />
                ))}
              </motion.ol>
            </AnimatePresence>
          </div>
        </Reveal>
      </div>

      {/* Portalled: the section sits inside transformed layout wrappers, which
          would otherwise trap a position: fixed overlay. */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {detail && (
              <ProjectModal
                key={detail.project.id}
                project={detail.project}
                returnFocusTo={detail.from}
                onClose={closeProject}
              />
            )}
          </AnimatePresence>,
          document.body
        )}
    </section>
  )
}
