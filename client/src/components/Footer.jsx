import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FiArrowUp } from 'react-icons/fi'
import { profile } from '../data/content.js'
import { scrollToTop } from '../lib/smooth-scroll.js'

export default function Footer() {
  const [show, setShow] = useState(false)

  // Shown while the visitor scrolls back up, or near the end of the page;
  // hidden while they read on down, so it never sits over the content.
  useEffect(() => {
    let lastY = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      const end = document.documentElement.scrollHeight - window.innerHeight * 1.6
      const up = y < lastY - 2
      const down = y > lastY + 2
      lastY = y
      setShow((was) => y > 600 && (y >= end || up || (was && !down)))
    }
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
