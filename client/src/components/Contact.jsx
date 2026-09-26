import { useState } from 'react'
import { motion } from 'framer-motion'
import { FiAlertCircle, FiCheckCircle, FiMail, FiMapPin, FiPhone, FiSend } from 'react-icons/fi'
import { FaLinkedinIn } from 'react-icons/fa'
import Reveal from './Reveal.jsx'
import SectionHead from './SectionHead.jsx'
import { profile } from '../data/content.js'
import { celebrate, setMood } from '../lib/companion.js'

const channels = [
  {
    icon: <FiMail />,
    label: 'Email',
    value: profile.email,
    href: `mailto:${profile.email}`,
  },
  {
    icon: <FiPhone />,
    label: 'Phone',
    value: profile.phone,
    href: `tel:${profile.phone.replace(/\s/g, '')}`,
  },
  {
    icon: <FaLinkedinIn />,
    label: 'LinkedIn',
    value: 'anurag-sable-4181382a6',
    href: profile.linkedin,
  },
  {
    icon: <FiMapPin />,
    label: 'Location',
    value: profile.location,
    href: null,
  },
]

const empty = { name: '', email: '', subject: '', message: '' }

function validate(values) {
  const errors = {}
  if (!values.name.trim()) errors.name = 'Please enter your name.'
  if (!values.email.trim()) errors.email = 'Please enter your email.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim()))
    errors.email = 'That email does not look right.'
  if (!values.message.trim()) errors.message = 'Please write a message.'
  else if (values.message.trim().length < 10) errors.message = 'A little more detail, please.'
  return errors
}

export default function Contact() {
  const [values, setValues] = useState(empty)
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState({ state: 'idle', message: '' })

  const update = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }))
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev))
  }

  async function onSubmit(e) {
    e.preventDefault()

    const found = validate(values)
    setErrors(found)
    if (Object.keys(found).length) return

    setStatus({ state: 'sending', message: '' })

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.')

      setStatus({
        state: 'success',
        message: data.message || 'Message sent. I will get back to you soon.',
      })
      setValues(empty)
      celebrate()
    } catch (err) {
      setStatus({
        state: 'error',
        message: `${err.message} You can also email me directly at ${profile.email}.`,
      })
      setMood('thinking', 2600)
    }
  }

  const sending = status.state === 'sending'

  return (
    <section id="contact" className="section">
      <div className="container">
        <SectionHead
          eyebrow="Contact"
          title="Let us build something"
          highlight="together"
          sub="Open to backend and AI engineering roles, internships and collaboration. The fastest way to reach me is email — or use the form and it lands in my inbox."
        />

        <div className="contact-grid">
          <div>
            <Reveal>
              <div className="contact-links">
                {channels.map((c, i) => {
                  const inner = (
                    <>
                      <span className="contact-link-icon">{c.icon}</span>
                      <span>
                        <span className="contact-link-label">{c.label}</span>
                        <span className="contact-link-value" style={{ display: 'block' }}>
                          {c.value}
                        </span>
                      </span>
                    </>
                  )

                  return c.href ? (
                    <a
                      key={c.label}
                      className="contact-link"
                      href={c.href}
                      target={c.href.startsWith('http') ? '_blank' : undefined}
                      rel="noreferrer"
                    >
                      {inner}
                    </a>
                  ) : (
                    <div key={c.label} className="contact-link">
                      {inner}
                    </div>
                  )
                })}
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.12}>
            <form className="card form-card" onSubmit={onSubmit} noValidate>
              {status.state === 'success' && (
                <motion.div
                  className="form-status ok"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <FiCheckCircle /> {status.message}
                </motion.div>
              )}
              {status.state === 'error' && (
                <motion.div
                  className="form-status err"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <FiAlertCircle /> {status.message}
                </motion.div>
              )}

              <div className="form-row">
                <div className={`field ${errors.name ? 'invalid' : ''}`}>
                  <label htmlFor="name">Your name</label>
                  <input
                    id="name"
                    name="name"
                    value={values.name}
                    onChange={update('name')}
                    placeholder="Jane Doe"
                    autoComplete="name"
                  />
                  {errors.name && <span className="field-error">{errors.name}</span>}
                </div>

                <div className={`field ${errors.email ? 'invalid' : ''}`}>
                  <label htmlFor="email">Email</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={values.email}
                    onChange={update('email')}
                    placeholder="jane@company.com"
                    autoComplete="email"
                  />
                  {errors.email && <span className="field-error">{errors.email}</span>}
                </div>
              </div>

              <div className="field">
                <label htmlFor="subject">Subject</label>
                <input
                  id="subject"
                  name="subject"
                  value={values.subject}
                  onChange={update('subject')}
                  placeholder="Backend role / project idea"
                />
              </div>

              <div className={`field ${errors.message ? 'invalid' : ''}`}>
                <label htmlFor="message">Message</label>
                <textarea
                  id="message"
                  name="message"
                  value={values.message}
                  onChange={update('message')}
                  placeholder="Tell me what you are working on..."
                />
                {errors.message && <span className="field-error">{errors.message}</span>}
              </div>

              <button type="submit" className="btn btn-primary" disabled={sending}>
                {sending ? (
                  <>
                    <span className="spinner" /> Sending
                  </>
                ) : (
                  <>
                    Send message <FiSend />
                  </>
                )}
              </button>
            </form>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
