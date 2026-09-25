import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import SectionHead from './SectionHead.jsx'
import { TECH } from '../data/tech.js'
import { supports3D } from '../lib/capabilities.js'

// three.js is only fetched once we know the scene can run.
const ToolsCloud3D = lazy(() => import('./ToolsCloud3D.jsx'))

/** Plain list so the logos are still announced to screen readers. */
function TechLabels() {
  return (
    <p className="visually-hidden">Technologies: {TECH.map((t) => t.name).join(', ')}.</p>
  )
}

/** Flat grid for reduced-motion visitors and browsers without WebGL. */
function StaticGrid() {
  return (
    <div className="container">
      <div className="cloud-static">
        {TECH.map(({ name, Icon, color }) => (
          <span className="cloud-tile static" key={name} title={name}>
            <Icon style={color ? { color } : undefined} />
          </span>
        ))}
      </div>
    </div>
  )
}

export default function Skills() {
  const [can3D] = useState(supports3D)
  const anchorRef = useRef(null)
  const [near, setNear] = useState(false)

  // Hold the three.js download until the section is close to being seen.
  useEffect(() => {
    if (!can3D || near) return
    const el = anchorRef.current
    if (!el) return

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true)
          io.disconnect()
        }
      },
      { rootMargin: '400px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [can3D, near])

  return (
    <section id="skills" className="section skills-section">
      <div className="container">
        <SectionHead
          eyebrow="Skills"
          title="Tools I"
          highlight="work with"
          sub="The stack behind my projects — backend services, LLMs and the ML frameworks around them, and the data layers underneath. Watch them drop in, then grab one and throw it."
        />

        <TechLabels />
      </div>

      <div ref={anchorRef} />

      {!can3D ? (
        <StaticGrid />
      ) : (
        <Suspense fallback={<div className="cloud3d" aria-hidden="true" />}>
          {near ? <ToolsCloud3D /> : <div className="cloud3d" aria-hidden="true" />}
        </Suspense>
      )}
    </section>
  )
}
