import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FiArrowUp } from 'react-icons/fi'
import { profile } from '../data/content.js'
import { scrollToTop } from '../lib/smooth-scroll.js'

export default function Footer() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 600)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <footer className="footer">
        <div className="container footer-inner">
          {/* The year is the build's in the prerendered HTML; this one wins. */}
          <p suppressHydrationWarning>
            {`© ${new Date().getFullYear()} ${profile.name}`}
          </p>
        </div>
      </footer>

      <AnimatePresence>
        {show && (
          <motion.button
            className="to-top"
            onClick={scrollToTop}
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            transition={{ duration: 0.25 }}
            aria-label="Back to top"
          >
            <FiArrowUp />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  )
}
