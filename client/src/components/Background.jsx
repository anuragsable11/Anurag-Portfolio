import { motion, useScroll, useSpring } from 'framer-motion'

export default function Background() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 26, restDelta: 0.001 })

  return (
    <>
      <motion.div className="scroll-progress" style={{ scaleX }} aria-hidden="true" />
      <div className="bg-layer" aria-hidden="true" />
    </>
  )
}
