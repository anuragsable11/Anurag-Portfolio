import { useRef } from 'react'
import SectionHead from './SectionHead.jsx'
import SkillsSwarm from './SkillsSwarm.jsx'
import { TECH } from '../data/tech.js'

export default function Skills() {
  const centerRef = useRef(null)

  return (
    <section id="skills" className="section skills-section">
      {/* The title sits in the middle; the icons burst out around it. */}
      <div className="skills-stage">
        <div className="skills-center" ref={centerRef}>
          <SectionHead
            eyebrow="Skills"
            title="Tools I"
            highlight="work with"
            sub="The stack behind my projects — backend services, LLMs and the ML frameworks around them, and the data layers underneath."
          />
        </div>
        <SkillsSwarm centerRef={centerRef} />
      </div>

      {/* The icons are drawn on a canvas, so name them for screen readers. */}
      <p className="visually-hidden">Technologies: {TECH.map((t) => t.name).join(', ')}.</p>
    </section>
  )
}
