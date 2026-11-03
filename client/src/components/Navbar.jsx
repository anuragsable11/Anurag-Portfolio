import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { HiOutlineMenuAlt4, HiX } from 'react-icons/hi'
import { FiArrowUpRight } from 'react-icons/fi'
import ThemeToggle from './ThemeToggle.jsx'
import { navLinks, profile } from '../data/content.js'
import { useActiveSection, useScrolled } from '../hooks/useActiveSection.js'
import { watchOpeningZoom } from '../lib/opening.js'

const ids = navLinks.map((l) => l.id)

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const scrolled = useScrolled(24)
  const active = useActiveSection(ids)

  // Inside the opening card the bar shrinks with it, towards the middle of
  // the screen (see .nav in the CSS), so it reads as the card's own navbar
  // and becomes the page's as the card fills the screen. Written straight
  // to the element: it changes every frame of the zoom.
  const headerRef = useRef(null)
  const [miniature, setMiniature] = useState(false)
  useEffect(
    () =>
      watchOpeningZoom((zoom) => {
        const inside = zoom < 0.999
        // `none` rather than scale(1) once out: no transform left behind.
        if (headerRef.current) headerRef.current.style.transform = inside ? `scale(${zoom})` : 'none'
        setMiniature(inside)
      }),
    []
  )

  // Lock body scroll while the mobile sheet is open.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <>
      {/* Drops in with CSS (.nav), from the prerendered page's first paint. */}
      <header
        ref={headerRef}
        className={`nav${scrolled ? ' scrolled' : ''}${miniature ? ' is-miniature' : ''}`}
      >
        <nav className="nav-inner">
          <a href="#home" className="nav-logo" aria-label="Back to top">
            <span className="nav-mark">AS</span>
            <span>
              Anurag<span style={{ color: 'var(--text-mute)' }}>.dev</span>
            </span>
          </a>

          <ul className="nav-links">
            {navLinks.map((link) => (
              <li key={link.id} style={{ position: 'relative' }}>
                <a
                  href={`#${link.id}`}
                  className={`nav-link ${active === link.id ? 'active' : ''}`}
                >
                  {active === link.id && (
                    <motion.span
                      layoutId="nav-pill"
                      className="nav-pill"
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    />
                  )}
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="nav-cta">
            <ThemeToggle />
            <a
              className="btn btn-primary"
              href={profile.resume}
              target="_blank"
              rel="noreferrer"
            >
              Resume <FiArrowUpRight />
            </a>
            <button
              className="nav-toggle"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
            >
              {open ? <HiX size={20} /> : <HiOutlineMenuAlt4 size={20} />}
            </button>
          </div>
        </nav>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            key="scrim"
            className="nav-scrim"
            aria-hidden="true"
            onClick={() => setOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />
        )}
        {open && (
          <motion.div
            key="sheet"
            className="nav-mobile"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <ul>
              {navLinks.map((link) => (
                <li key={link.id}>
                  <a
                    href={`#${link.id}`}
                    className={active === link.id ? 'active' : ''}
                    onClick={() => setOpen(false)}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              <li>
                <a
                  className="btn btn-primary"
                  href={profile.resume}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setOpen(false)}
                >
                  Download Resume <FiArrowUpRight />
                </a>
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
