import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import {
  WINDOW_MS,
  checkRateLimit,
  pruneRateLimits,
  validateContact,
} from '../api/_lib/contact.js'

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
   Rate limiting — rules live in api/_lib/contact.js so that this server
   and the Vercel function enforce exactly the same limits.
   ------------------------------------------------------------------ */
function rateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown'
  const limit = checkRateLimit(ip)

  if (!limit.ok) {
    return res.status(429).json({
      error: `Too many messages sent. Please try again in ${limit.retryMinutes} minute(s).`,
    })
  }

  next()
}

setInterval(pruneRateLimits, WINDOW_MS).unref()

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
