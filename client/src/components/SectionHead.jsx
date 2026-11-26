import Reveal from './Reveal.jsx'

/**
 * Heading text with its hyphenated words kept whole: a line may break
 * between words, never after a hyphen inside one ("AI-" / "driven").
 */
function keepHyphenated(text) {
  return text.split(/(\s+)/).map((part, i) =>
    part.includes('-') ? (
      <span key={i} className="nowrap">
        {part}
      </span>
    ) : (
      part
    )
  )
}

export default function SectionHead({ eyebrow, title, highlight, sub }) {
  return (
    <div className="section-head">
      <Reveal>
        <span className="eyebrow">{eyebrow}</span>
      </Reveal>
      <Reveal delay={0.08}>
        <h2 className="section-title">
          {keepHyphenated(title)}{' '}
          {highlight && <span className="gradient-text">{keepHyphenated(highlight)}</span>}
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
