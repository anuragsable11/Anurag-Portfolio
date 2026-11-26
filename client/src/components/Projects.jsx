import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { FiArrowRight, FiLock, FiMaximize2, FiX } from 'react-icons/fi'
import { FaGithub, FaPlay } from 'react-icons/fa'
import SectionHead from './SectionHead.jsx'
import { projects, projectsHead } from '../data/content.js'
import { useHydrated } from '../hooks/useHydrated.js'
import { celebrate } from '../lib/companion.js'
import { holdScroll } from '../lib/smooth-scroll.js'

const ease = [0.22, 1, 0.36, 1]

/** Locks page scroll while an overlay is open, then restores what was there. */
function useScrollLock() {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const release = holdScroll()
    return () => {
      document.body.style.overflow = prev
      release()
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
      data-lenis-prevent
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
      data-lenis-prevent
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
 * A project in the gallery: its landing page, then its name and what it
 * is. The whole card opens the project's details, where its links are.
 */
function ProjectCard({ project, onOpen }) {
  const { showcase } = project
  return (
    <li className="work-card">
      <button
        className="work-hit"
        onClick={(e) => {
          celebrate()
          onOpen(project, e.currentTarget)
        }}
        aria-label={`${project.name}, ${project.subtitle}. Open details`}
      >
        <span className="work-shot">
          <span className="work-pic">
            {showcase && (
              <Shot
                showcase={showcase}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
            )}
          </span>
        </span>
        <span className="work-name">{project.name}</span>
        <span className="work-sub">{project.subtitle}</span>
      </button>
    </li>
  )
}

export default function Projects() {
  const [detail, setDetail] = useState(null)
  const hydrated = useHydrated()
  const openProject = useCallback((project, from) => setDetail({ project, from }), [])
  const closeProject = useCallback(() => setDetail(null), [])

  return (
    <section id="projects" className="section band-tint band-warm">
      <div className="container">
        <SectionHead {...projectsHead} />

        {/* Every project as a card in the gallery, in the order the data
            lists them: the three LLM systems first, then the web apps. */}
        <ol className="work-grid">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} onOpen={openProject} />
          ))}
        </ol>

        {/* Every project on one page: a sphere of covers you can turn. */}
        <div className="projects-more">
          <a className="btn btn-ghost" href="/projects.html">
            View all projects
            <FiArrowRight aria-hidden="true" />
          </a>
        </div>
      </div>

      {/* Portalled: the section sits inside transformed layout wrappers, which
          would otherwise trap a position: fixed overlay. Mounted once
          hydrated: the prerendered page has no document.body to portal to. */}
      {hydrated &&
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
