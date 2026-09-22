import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FiArrowUp } from 'react-icons/fi'
import { profile } from '../data/content.js'

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
          <p>
            © {new Date().getFullYear()} {profile.name} · {profile.role}
          </p>
          <span className="footer-built">
            Built with <b>React</b> · <b>Vite</b> · <b>Node.js</b> · <b>Express</b>
          </span>
        </div>
      </footer>

      <AnimatePresence>
        {show && (
          <motion.button
            className="to-top"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
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
