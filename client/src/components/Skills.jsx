import { FiCode, FiDatabase, FiServer, FiTool } from 'react-icons/fi'
import { HiOutlineCpuChip, HiOutlineSparkles } from 'react-icons/hi2'
import Reveal from './Reveal.jsx'
import SectionHead from './SectionHead.jsx'
import { skillGroups } from '../data/content.js'

const icons = {
  server: <FiServer />,
  brain: <HiOutlineCpuChip />,
  sparkles: <HiOutlineSparkles />,
  database: <FiDatabase />,
  code: <FiCode />,
  tools: <FiTool />,
}

/** Tracks the cursor so the card can render a spotlight glow behind it. */
function handleMove(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${e.clientX - rect.left}px`)
  e.currentTarget.style.setProperty('--my', `${e.clientY - rect.top}px`)
}

export default function Skills() {
  return (
    <section id="skills" className="section">
      <div className="container">
        <SectionHead
          eyebrow="Toolkit"
          title="Technologies I"
          highlight="build with"
          sub="The stack behind my projects — from request handling and schema design to embeddings, vector search and model orchestration."
        />

        <div className="skills-grid">
          {skillGroups.map((group, i) => (
            <Reveal key={group.id} delay={i * 0.07}>
              <div className="card skill-card" onMouseMove={handleMove}>
                <div className="skill-head">
                  <span className="skill-icon">{icons[group.icon]}</span>
                  <h3>{group.title}</h3>
                </div>
                <p className="skill-blurb">{group.blurb}</p>
                <div className="skill-items">
                  {group.items.map((item) => (
                    <span className="chip" key={item}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
