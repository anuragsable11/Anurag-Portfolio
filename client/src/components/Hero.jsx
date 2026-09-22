import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { FiArrowDown, FiMail, FiMapPin } from 'react-icons/fi'
import { FaLinkedinIn, FaGithub } from 'react-icons/fa'
import { HiOutlineDocumentArrowDown } from 'react-icons/hi2'
import { profile } from '../data/content.js'

/** Rotating type-on / type-off effect for the role line. */
function useTypewriter(words, typeMs = 75, eraseMs = 40, holdMs = 1700) {
  const [index, setIndex] = useState(0)
  const [text, setText] = useState('')
  const [erasing, setErasing] = useState(false)

  useEffect(() => {
    const word = words[index % words.length]

    if (!erasing && text === word) {
      const t = setTimeout(() => setErasing(true), holdMs)
      return () => clearTimeout(t)
    }

    if (erasing && text === '') {
      setErasing(false)
      setIndex((i) => (i + 1) % words.length)
      return
    }

    const t = setTimeout(
      () =>
        setText((cur) =>
          erasing ? word.slice(0, cur.length - 1) : word.slice(0, cur.length + 1)
        ),
      erasing ? eraseMs : typeMs
    )
    return () => clearTimeout(t)
  }, [text, erasing, index, words, typeMs, eraseMs, holdMs])

  return text
}

const codeLines = [
  { t: 'cmt', v: '# agent.py — orchestrate model, tools and memory' },
  { t: 'raw', v: [['key', 'class '], ['fn', 'AgentRuntime'], ['op', ':']] },
  {
    t: 'raw',
    v: [
      ['op', '    '],
      ['key', 'def '],
      ['fn', '__init__'],
      ['op', '(self, llm, tools, memory):'],
    ],
  },
  { t: 'raw', v: [['op', '        self.llm    = llm        '], ['cmt', '# Qwen3 via Ollama']] },
  { t: 'raw', v: [['op', '        self.tools  = tools      '], ['cmt', '# RAG · retrieval']] },
  { t: 'raw', v: [['op', '        self.memory = memory     '], ['cmt', '# Redis context']] },
  { t: 'blank' },
  {
    t: 'raw',
    v: [['op', '    '], ['key', 'async def '], ['fn', 'run'], ['op', '(self, turn):']],
  },
  {
    t: 'raw',
    v: [
      ['op', '        ctx     = '],
      ['key', 'await '],
      ['var', 'self.memory.'],
      ['fn', 'load'],
      ['op', '(turn.session)'],
    ],
  },
  {
    t: 'raw',
    v: [
      ['op', '        grounded= '],
      ['key', 'await '],
      ['var', 'self.tools.'],
      ['fn', 'retrieve'],
      ['op', '(turn.query, k='],
      ['num', '5'],
      ['op', ')'],
    ],
  },
  {
    t: 'raw',
    v: [
      ['op', '        answer  = '],
      ['key', 'await '],
      ['var', 'self.llm.'],
      ['fn', 'generate'],
      ['op', '(ctx, grounded)'],
    ],
  },
  {
    t: 'raw',
    v: [
      ['op', '        '],
      ['key', 'await '],
      ['var', 'self.memory.'],
      ['fn', 'append'],
      ['op', '(turn, answer)'],
    ],
  },
  { t: 'raw', v: [['op', '        '], ['key', 'return '], ['var', 'answer']] },
  { t: 'blank' },
  { t: 'cmt', v: '# queued on Celery → never blocks the request cycle' },
]

function CodeLine({ line }) {
  if (line.t === 'blank') return <div className="ln">&nbsp;</div>
  if (line.t === 'cmt') return <div className="ln tk-cmt">{line.v}</div>
  return (
    <div className="ln">
      {line.v.map(([tone, txt], i) => (
        <span key={i} className={`tk-${tone}`}>
          {txt}
        </span>
      ))}
    </div>
  )
}

export default function Hero() {
  const typed = useTypewriter(profile.roles)

  return (
    <section id="home" className="hero">
      <div className="container">
        <div className="hero-grid">
          {/* ---- Left: intro ---- */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="hero-badge">
              <span className="pulse-dot" />
              {profile.availability}
            </span>

            <h1 className="hero-name">
              <span>Anurag</span>
              <span className="gradient-text">Sable</span>
            </h1>

            <div className="hero-role">
              <span className="arrow">{'>'}</span>
              <span>
                {typed}
                <span className="type-caret" />
              </span>
            </div>

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
              <span className="social-divider" />
              <span className="hero-location">
                <FiMapPin size={13} /> {profile.location}
              </span>
            </div>
          </motion.div>

          {/* ---- Right: terminal ---- */}
          <motion.div
            initial={{ opacity: 0, y: 40, rotateX: 8 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ duration: 0.9, delay: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="terminal">
              <div className="terminal-bar">
                <span className="term-dot r" />
                <span className="term-dot y" />
                <span className="term-dot g" />
                <span className="terminal-title">anurag@backend ~ /agent.py</span>
              </div>
              <div className="terminal-body">
                {codeLines.map((line, i) => (
                  <CodeLine key={i} line={line} />
                ))}
              </div>
            </div>

            <div className="pipeline">
              {['Client', 'API', 'Queue', 'LLM', 'Memory'].map((node, i, arr) => (
                <span key={node} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span className="pipe-node">{node}</span>
                  {i < arr.length - 1 && <span className="pipe-arrow">→</span>}
                </span>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      <motion.a
        href="#about"
        className="scroll-hint"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.3, duration: 0.8 }}
        aria-label="Scroll to about section"
      >
        <span className="scroll-mouse" />
        Scroll
      </motion.a>
    </section>
  )
}
