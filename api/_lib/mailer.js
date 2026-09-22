/**
 * Contact-form email delivery.
 *
 * Shared by the local Express server and the Vercel serverless function so
 * both behave identically. Uses Resend's HTTP API through global fetch, so
 * there is no dependency to install.
 *
 * Configure with environment variables:
 *   RESEND_API_KEY      required — from https://resend.com/api-keys
 *   CONTACT_TO_EMAIL    required — where messages should land
 *   CONTACT_FROM_EMAIL  optional — defaults to Resend's shared test sender
 *
 * With the default sender (onboarding@resend.dev) Resend will only deliver to
 * the address that owns the API key. That is fine for a personal portfolio.
 * To send anywhere else, verify your own domain in Resend and set
 * CONTACT_FROM_EMAIL to an address on it.
 */

const DEFAULT_FROM = 'Portfolio <onboarding@resend.dev>'

/** Reports whether email is wired up, and why not if it isn't. */
export function mailerStatus() {
  const hasKey = Boolean(process.env.RESEND_API_KEY)
  const to = process.env.CONTACT_TO_EMAIL

  const missing = []
  if (!hasKey) missing.push('RESEND_API_KEY')
  if (!to) missing.push('CONTACT_TO_EMAIL')

  return {
    configured: missing.length === 0,
    provider: 'resend',
    to: to || null,
    from: process.env.CONTACT_FROM_EMAIL || DEFAULT_FROM,
    missing,
  }
}

function buildBody(entry) {
  return [
    `From:    ${entry.name} <${entry.email}>`,
    `Subject: ${entry.subject}`,
    `Time:    ${entry.receivedAt}`,
    `Ref:     ${entry.id}`,
    '',
    '---',
    '',
    entry.message,
  ].join('\n')
}

/**
 * Sends one contact message.
 *
 * Never throws: delivery failing must not lose the submission, which the
 * caller has already stored or logged. Returns what happened so the caller
 * can surface it.
 */
export async function sendContactEmail(entry) {
  const status = mailerStatus()

  if (!status.configured) {
    return {
      sent: false,
      reason: `email not configured (missing ${status.missing.join(', ')})`,
    }
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: status.from,
        to: [status.to],
        reply_to: entry.email,
        subject: `Portfolio: ${entry.subject}`,
        text: buildBody(entry),
      }),
    })

    if (!response.ok) {
      // Resend puts the actual cause in the body — surface it, because
      // "sending failed" alone is not diagnosable.
      const detail = await response.text().catch(() => '')
      return {
        sent: false,
        reason: `resend responded ${response.status}: ${detail.slice(0, 300)}`,
      }
    }

    const data = await response.json().catch(() => ({}))
    return { sent: true, id: data.id ?? null }
  } catch (err) {
    return { sent: false, reason: `request failed: ${err.message}` }
  }
}
