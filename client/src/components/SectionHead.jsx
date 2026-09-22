import Reveal from './Reveal.jsx'

export default function SectionHead({ eyebrow, title, highlight, sub }) {
  return (
    <div className="section-head">
      <Reveal>
        <span className="eyebrow">{eyebrow}</span>
      </Reveal>
      <Reveal delay={0.08}>
        <h2 className="section-title">
          {title} {highlight && <span className="gradient-text">{highlight}</span>}
        </h2>
      </Reveal>
      {sub && (
        <Reveal delay={0.14}>
          <p className="section-sub">{sub}</p>
        </Reveal>
      )}
    </div>
  )
}
