import SectionHead from './SectionHead.jsx'
import { timeline } from '../data/content.js'

const fromTimeline = ({ id, title, org, period, points }) => ({ id, title, org, when: period, points })
const ofKind = (kind) => timeline.filter((t) => t.kind === kind).map(fromTimeline)

/**
 * The section's own three words, one group each, set as a typeset ledger:
 * the group in the margin, then each entry with its date flush right.
 */
const groups = [
  { id: 'experience', label: 'Experience', entries: ofKind('experience') },
  { id: 'training', label: 'Training', entries: ofKind('training') },
  { id: 'education', label: 'Education', entries: ofKind('education') },
]

export default function Journey() {
  return (
    <section id="journey" className="section">
      <div className="container">
        <SectionHead
          eyebrow="Journey"
          title="Experience, training and"
          highlight="education"
          sub="Where the foundations came from — and what I picked up along the way."
        />

        <div className="ledger">
          {groups.map((group) => (
            <div className="ledger-group" key={group.id}>
              <h3 className="ledger-label">{group.label}</h3>
              <ol className="ledger-entries">
                {group.entries.map((entry) => (
                  <li className="ledger-entry" key={entry.id}>
                    <div className="ledger-head">
                      <h4 className="ledger-title">{entry.title}</h4>
                      <span className="ledger-when">{entry.when}</span>
                    </div>
                    <div className="ledger-org">{entry.org}</div>
                    {entry.points.length === 1 && <p className="ledger-note">{entry.points[0]}</p>}
                    {entry.points.length > 1 && (
                      <ul className="ledger-points">
                        {entry.points.map((p, k) => (
                          <li key={k}>{p}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
