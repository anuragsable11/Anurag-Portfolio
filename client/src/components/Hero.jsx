import { FiArrowDown, FiMail } from 'react-icons/fi'
import { FaLinkedinIn, FaGithub } from 'react-icons/fa'
import { HiOutlineDocumentArrowDown } from 'react-icons/hi2'
import portrait from '../assets/portrait.webp'
import { profile } from '../data/content.js'

export default function Hero() {
  return (
    <section id="home" className="hero">
      <div className="container">
        <div className="hero-grid">
          {/* ---- Left: who I am and what I do, and nothing more ---- */}
          {/* Both halves rise in with CSS, from the prerendered page's first
              paint rather than once the JavaScript has loaded. */}
          <div className="hero-lines hero-enter">
            <span className="hero-badge">
              <span className="pulse-dot" />
              {profile.availability}
            </span>

            <h1 className="hero-name">
              <span>Anurag</span>{' '}
              <span className="gradient-text">Sable</span>
            </h1>

            <p className="hero-role">{profile.role}</p>

            <p className="hero-tagline">{profile.tagline}</p>

            <div className="hero-actions">
              <a href="#projects" className="btn btn-primary">
                View My Work <FiArrowDown />
              </a>
              <a
                href={profile.resume}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost"
              >
                <HiOutlineDocumentArrowDown size={18} /> Download Resume
              </a>
            </div>

            <div className="hero-socials">
              <a
                className="social-btn"
                href={profile.linkedin}
                target="_blank"
                rel="noreferrer"
                aria-label="LinkedIn"
              >
                <FaLinkedinIn />
              </a>
              <a
                className="social-btn"
                href={profile.github}
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub"
              >
                <FaGithub />
              </a>
              <a
                className="social-btn"
                href={`mailto:${profile.email}`}
                aria-label="Email Anurag"
              >
                <FiMail />
              </a>
            </div>
          </div>

          {/* ---- Right: my photo, the first thing a visitor sees, so it
              loads first and at full resolution ---- */}
          <div className="hero-visual hero-enter hero-enter-late">
            <figure className="hero-photo">
              <img
                src={portrait}
                alt={profile.name}
                width="966"
                height="1169"
                fetchpriority="high"
                decoding="async"
              />
            </figure>
          </div>
        </div>
      </div>
    </section>
  )
}
