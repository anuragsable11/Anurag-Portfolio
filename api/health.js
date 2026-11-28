import { mailerStatus } from './_lib/mailer.js'

/**
 * GET /api/health: whether this deployment can email contact messages.
 *
 * Open it in a browser after changing environment variables on Vercel: it
 * names any that this deployment does not have (variables only reach
 * deployments made after they were saved). Never shows a value.
 */
export default function handler(req, res) {
  const { configured, missing } = mailerStatus()
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ ok: true, email: { configured, missing } })
}
