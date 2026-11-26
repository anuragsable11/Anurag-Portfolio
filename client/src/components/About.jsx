import SectionHead from './SectionHead.jsx'
import SamuraiSpot from './SamuraiSpot.jsx'
import { profile, sectionHeads, stats } from '../data/content.js'

// Only what a visitor needs here: the headline, the one line that says who
// I am, where I work now, four quick figures, and the samurai beside them.
const { sub: _deck, ...aboutHead } = sectionHeads.about

export default function About() {
  return (
    <section id="about" className="section band-tint">
      <div className="container">
        <div className="about-grid">
          <div className="about-copy">
            <SectionHead {...aboutHead} />
            <p className="about-lead">{profile.summary[0]}</p>
            <p className="about-now">
              <span className="about-now-label">Now</span>{' '}
              <span>{profile.now}</span>
            </p>

            <dl className="about-stats">
              {stats.map((s) => (
                <div className="stat" key={s.label}>
                  <dt className="stat-label">{s.label}</dt>
                  <dd className="stat-value">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <SamuraiSpot />
        </div>
      </div>
    </section>
  )
}
