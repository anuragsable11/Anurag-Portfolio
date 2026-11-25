/**
 * Contact-form email delivery.
 *
 * Shared by the local Express server and the Vercel serverless function so
 * both behave identically. Sends through Gmail's SMTP server with nodemailer.
 *
 * Configure with environment variables:
 *   GMAIL_USER          required — the Gmail address that sends the mail
 *   GMAIL_APP_PASSWORD  required — a 16-character app password for that
 *                       account (Google Account → Security → 2-Step
 *                       Verification → App passwords). NOT the normal
 *                       Gmail password; Google rejects that over SMTP.
 *   CONTACT_TO_EMAIL    optional — where messages land; defaults to GMAIL_USER
 */

import { createTransport } from 'nodemailer'

let transport = null

function credentials() {
  const user = process.env.GMAIL_USER?.trim() || ''
  // Google displays app passwords as "abcd efgh ijkl mnop"; the spaces are
  // only for readability, so accept the value pasted either way.
  const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '')
  return { user, pass }
}

/** Reports whether email is wired up, and why not if it isn't. */
export function mailerStatus() {
  const { user, pass } = credentials()

  const missing = []
  if (!user) missing.push('GMAIL_USER')
  if (!pass) missing.push('GMAIL_APP_PASSWORD')

  return {
    configured: missing.length === 0,
    provider: 'gmail',
    to: process.env.CONTACT_TO_EMAIL?.trim() || user || null,
    from: user || null,
    missing,
  }
}

function getTransport() {
  if (!transport) {
    const { user, pass } = credentials()
    transport = createTransport({
      service: 'gmail',
      auth: { user, pass },
      // Fail fast instead of eating the whole serverless time budget when
      // SMTP is unreachable.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    })
  }
  return transport
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
    const info = await getTransport().sendMail({
      from: { name: 'Portfolio contact', address: status.from },
      to: status.to,
      // Hitting "Reply" in the inbox answers the visitor, not yourself.
      replyTo: { name: entry.name, address: entry.email },
      subject: `Portfolio: ${entry.subject}`,
      text: buildBody(entry),
    })
    return { sent: true, id: info.messageId ?? null }
  } catch (err) {
    // A bad password is by far the most common failure — say so plainly,
    // because Gmail's own "535 Username and Password not accepted" does not
    // mention app passwords.
    const hint =
      err.code === 'EAUTH'
        ? ' — check GMAIL_APP_PASSWORD: it must be an app password (needs 2-Step Verification on), not the normal Gmail password'
        : ''
    return {
      sent: false,
      reason: `gmail ${err.code ?? 'error'}: ${String(err.message).slice(0, 300)}${hint}`,
    }
  }
}
