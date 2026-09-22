import { motion } from 'framer-motion'

/**
 * Scroll-triggered entrance animation.
 * Animates once, when ~15% of the element enters the viewport.
 */
export default function Reveal({
  children,
  delay = 0,
  y = 26,
  x = 0,
  duration = 0.65,
  className = '',
  as = 'div',
  ...rest
}) {
  const Tag = motion[as] || motion.div

  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y, x }}
      whileInView={{ opacity: 1, y: 0, x: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration, delay, ease: [0.22, 1, 0.36, 1] }}
      {...rest}
    >
      {children}
    </Tag>
  )
}
