import { Fragment } from 'react'
import Reveal from './Reveal.jsx'

/**
 * A word with its apostrophes tucked in: the Mincho sets ’ on a wide body,
 * which leaves a gap inside the word ("I’ m", "Let’ s"); .apos closes it.
 */
function tuckApostrophes(word) {
  const bits = word.split('’')
  if (bits.length === 1) return word
  return bits.map((bit, i) => (
    <Fragment key={i}>
      {i > 0 && <span className="apos">’</span>}
      {bit}
    </Fragment>
  ))
}

/**
 * Heading text with its hyphenated words kept whole: a line may break
 * between words, never after a hyphen inside one ("AI-" / "driven").
 */
function keepHyphenated(text) {
  return text.split(/(\s+)/).map((part, i) =>
    part.includes('-') ? (
      <span key={i} className="nowrap">
        {tuckApostrophes(part)}
      </span>
    ) : (
      <Fragment key={i}>{tuckApostrophes(part)}</Fragment>
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
