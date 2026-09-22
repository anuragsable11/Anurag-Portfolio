import { FiAward } from 'react-icons/fi'
import Reveal from './Reveal.jsx'
import SectionHead from './SectionHead.jsx'
import { certifications, timeline } from '../data/content.js'

export default function Journey() {
  return (
    <section id="journey" className="section">
      <div className="container">
        <SectionHead
          eyebrow="Journey"
          title="Training, education and"
          highlight="certifications"
          sub="Where the foundations came from — and what I picked up along the way."
        />

        <div className="journey-grid">
          <div className="timeline">
            {timeline.map((item, i) => (
              <Reveal key={item.id} delay={i * 0.1} x={-16} y={0}>
                <div className="tl-item" data-kind={item.kind}>
                  <span className="tl-dot" />
                  <div className="tl-period">{item.period}</div>
                  <h3 className="tl-title">{item.title}</h3>
                  <div className="tl-org">{item.org}</div>
                  {item.points.length > 0 && (
                    <ul className="tl-points">
                      {item.points.map((p, k) => (
                        <li key={k}>{p}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </Reveal>
            ))}
          </div>

          <div className="cert-list">
            {certifications.map((cert, i) => (
              <Reveal key={cert.id} delay={0.12 + i * 0.1}>
                <div className="card cert-card">
                  <span className="cert-icon">
                    <FiAward />
                  </span>
                  <div>
                    <h4>{cert.title}</h4>
                    <div className="cert-meta">
                      {cert.issuer} · {cert.date}
                    </div>
                    <p>{cert.detail}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
