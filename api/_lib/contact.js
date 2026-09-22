/**
 * Contact-form validation and rate limiting.
 *
 * Shared by the local Express server (server/index.js) and the Vercel
 * serverless function (api/contact.js) so the rules can never drift apart.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function validateContact(body) {
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
   Rate limiting — 5 submissions per IP per 15 minutes.

   In-memory, so on serverless it only holds within a warm instance.
   That is fine as a first line of defence against casual spam.
   ------------------------------------------------------------------ */
const WINDOW_MS = 15 * 60 * 1000
const MAX_HITS = 5
const hits = new Map()

export function checkRateLimit(ip = 'unknown') {
  const now = Date.now()
  const record = hits.get(ip)

  if (!record || now > record.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return { ok: true }
  }

  if (record.count >= MAX_HITS) {
    return { ok: false, retryMinutes: Math.ceil((record.resetAt - now) / 60000) }
  }

  record.count += 1
  return { ok: true }
}

/** Drops expired buckets so the map cannot grow unbounded. */
export function pruneRateLimits() {
  const now = Date.now()
  for (const [ip, record] of hits) if (now > record.resetAt) hits.delete(ip)
}

export { WINDOW_MS, MAX_HITS }
