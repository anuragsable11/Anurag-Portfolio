import { checkRateLimit, validateContact } from './_lib/contact.js'
import { mailerStatus, sendContactEmail } from './_lib/mailer.js'

/**
 * Vercel serverless handler for the contact form.
 *
 * Serverless filesystems are ephemeral, so unlike the local Express server
 * this does not write messages to disk. It always logs the submission (visible
 * in the Vercel dashboard under Logs) and, when RESEND_API_KEY and
 * CONTACT_TO_EMAIL are set, emails it via api/_lib/mailer.js — the same
 * delivery path the local server uses.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed.' })
  }

  const ip =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown'

  const limit = checkRateLimit(ip)
  if (!limit.ok) {
    return res.status(429).json({
      error: `Too many messages sent. Please try again in ${limit.retryMinutes} minute(s).`,
    })
  }

  const { error, data } = validateContact(req.body)
  if (error) return res.status(400).json({ error })

  const entry = {
    id: `msg_${Date.now().toString(36)}`,
    ...data,
    receivedAt: new Date().toISOString(),
  }

  // Always recorded in the Vercel function logs.
  console.log('[contact]', JSON.stringify(entry))

  const delivery = await sendContactEmail(entry)
  if (delivery.sent) {
    console.log(`[contact] emailed to ${mailerStatus().to} (${delivery.id ?? 'no id'})`)
  } else {
    // Never lose the message over a delivery failure — it is already logged.
    console.warn(`[contact] NOT EMAILED — ${delivery.reason}`)
  }

  return res.status(201).json({
    ok: true,
    id: entry.id,
    delivered: delivery.sent,
    message: 'Thanks for reaching out. I will get back to you soon.',
  })
}

