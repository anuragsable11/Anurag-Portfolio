import { checkRateLimit, validateContact } from './_lib/contact.js'

/**
 * Vercel serverless handler for the contact form.
 *
 * Serverless filesystems are ephemeral, so unlike the local Express server
 * this does not write messages to disk. It always logs the submission (visible
 * in the Vercel dashboard under Logs) and, when RESEND_API_KEY and
 * CONTACT_TO_EMAIL are configured, also forwards it by email.
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

  try {
    await forwardByEmail(entry)
  } catch (err) {
    // A delivery failure must not lose the message — it is already logged.
    console.error('[contact] email forwarding failed:', err.message)
  }

  return res.status(201).json({
    ok: true,
    id: entry.id,
    message: 'Thanks for reaching out. I will get back to you soon.',
  })
}

/** Sends the message on via Resend, if it has been configured. */
async function forwardByEmail(entry) {
  const key = process.env.RESEND_API_KEY
  const to = process.env.CONTACT_TO_EMAIL
  if (!key || !to) return

  const from = process.env.CONTACT_FROM_EMAIL || 'Portfolio <onboarding@resend.dev>'

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      reply_to: entry.email,
      subject: `Portfolio: ${entry.subject}`,
      text: [
        `From:    ${entry.name} <${entry.email}>`,
        `Subject: ${entry.subject}`,
        `Time:    ${entry.receivedAt}`,
        '',
        entry.message,
      ].join('\n'),
    }),
  })

  if (!response.ok) {
    throw new Error(`Resend responded ${response.status}`)
  }
}
