import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { HiOutlineMenuAlt4, HiX } from 'react-icons/hi'
import { FiArrowUpRight } from 'react-icons/fi'
import { navLinks, profile } from '../data/content.js'
import { useActiveSection, useScrolled } from '../hooks/useActiveSection.js'

const ids = navLinks.map((l) => l.id)

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const scrolled = useScrolled(24)
  const active = useActiveSection(ids)

  // Lock body scroll while the mobile sheet is open.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <>
      <motion.header
        className={`nav ${scrolled ? 'scrolled' : ''}`}
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
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
            <a
              className="btn btn-primary"
              href={profile.resume}
              target="_blank"
              rel="noreferrer"
              style={{ padding: '10px 20px', fontSize: '0.86rem' }}
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
      </motion.header>

      <AnimatePresence>
        {open && (
          <motion.div
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
