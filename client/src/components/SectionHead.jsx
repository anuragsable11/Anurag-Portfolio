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

/** The label over a heading: the section's formal kanji numeral (壱, 弐…) when it
 *  has one, then its name. */
function Label({ eyebrow, kanji }) {
  if (!kanji) return <span className="eyebrow">{eyebrow}</span>
  return (
    <span className="eyebrow eyebrow-jp">
      <b aria-hidden="true">{kanji}</b>
      {eyebrow}
    </span>
  )
}

export default function SectionHead({ eyebrow, kanji, title, highlight, sub }) {
  return (
    <div className="section-head">
      <Reveal>
        <Label eyebrow={eyebrow} kanji={kanji} />
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
