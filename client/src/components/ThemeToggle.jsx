import { AnimatePresence, motion } from 'framer-motion'
import { FiMoon, FiSun } from 'react-icons/fi'
import { useTheme } from '../hooks/useTheme.js'

export default function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ opacity: 0, rotate: -80, scale: 0.6 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 80, scale: 0.6 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: 'grid', placeItems: 'center' }}
        >
          {isDark ? <FiSun size={16} /> : <FiMoon size={16} />}
        </motion.span>
      </AnimatePresence>
    </button>
  )
}
