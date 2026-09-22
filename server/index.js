import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import 'dotenv/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 5000
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist')
const MESSAGES_FILE = path.join(__dirname, 'data', 'messages.json')

const app = express()
app.use(express.json({ limit: '32kb' }))
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:5173'],
  })
)

/* ------------------------------------------------------------------
   Rate limiting — 5 submissions per IP per 15 minutes, in memory.
   ------------------------------------------------------------------ */
const WINDOW_MS = 15 * 60 * 1000
const MAX_HITS = 5
const hits = new Map()

function rateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown'
  const now = Date.now()
  const record = hits.get(ip)

  if (!record || now > record.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return next()
  }

  if (record.count >= MAX_HITS) {
    const minutes = Math.ceil((record.resetAt - now) / 60000)
    return res.status(429).json({
      error: `Too many messages sent. Please try again in ${minutes} minute(s).`,
    })
  }

  record.count += 1
  next()
}

// Drop expired buckets every so often so the map cannot grow unbounded.
setInterval(() => {
  const now = Date.now()
  for (const [ip, record] of hits) if (now > record.resetAt) hits.delete(ip)
}, WINDOW_MS).unref()

/* ------------------------------------------------------------------
   Validation
   ------------------------------------------------------------------ */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function validateContact(body) {
  const name = String(body?.name ?? '').trim()
  const email = String(body?.email ?? '').trim()
  const subject = String(body?.subject ?? '').trim()
  const message = String(body?.message ?? '').trim()

  if (name.length < 2 || name.length > 80) return { error: 'Please provide a valid name.' }
  if (!EMAIL_RE.test(email) || email.length > 160)
    return { error: 'Please provide a valid email address.' }
  if (message.length < 10 || message.length > 4000)
    return { error: 'Message must be between 10 and 4000 characters.' }
  if (subject.length > 160) return { error: 'Subject is too long.' }

  return { data: { name, email, subject: subject || '(no subject)', message } }
}

/* ------------------------------------------------------------------
   Storage — appends to server/data/messages.json
   ------------------------------------------------------------------ */
async function saveMessage(entry) {
  await fs.mkdir(path.dirname(MESSAGES_FILE), { recursive: true })

  let existing = []
  try {
    existing = JSON.parse(await fs.readFile(MESSAGES_FILE, 'utf8'))
    if (!Array.isArray(existing)) existing = []
  } catch {
    // First message, or the file was unreadable — start a fresh list.
  }

  existing.push(entry)
  await fs.writeFile(MESSAGES_FILE, JSON.stringify(existing, null, 2), 'utf8')
}

/* ------------------------------------------------------------------
   Routes
   ------------------------------------------------------------------ */
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'portfolio-api', time: new Date().toISOString() })
})

app.post('/api/contact', rateLimit, async (req, res) => {
  const { error, data } = validateContact(req.body)
  if (error) return res.status(400).json({ error })

  const entry = {
    id: `msg_${Date.now().toString(36)}`,
    ...data,
    receivedAt: new Date().toISOString(),
    ip: req.ip,
  }

  try {
    await saveMessage(entry)
    console.log(`[contact] ${entry.name} <${entry.email}> — ${entry.subject}`)

    res.status(201).json({
      ok: true,
      id: entry.id,
      message: 'Thanks for reaching out. I will get back to you soon.',
    })
  } catch (err) {
    console.error('[contact] failed to store message:', err)
    res.status(500).json({ error: 'Could not save your message right now.' })
  }
})

/* ------------------------------------------------------------------
   Serve the built frontend in production
   ------------------------------------------------------------------ */
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(CLIENT_DIST))
  app.get('*', (req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')))
}

app.use((req, res) => res.status(404).json({ error: 'Not found' }))

app.listen(PORT, () => {
  console.log(`\n  Portfolio API running on http://localhost:${PORT}`)
  console.log(`  Health check: http://localhost:${PORT}/api/health\n`)
})
