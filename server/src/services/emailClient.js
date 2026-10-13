import { env } from '../config/env.js'

// The ONLY place in this codebase that talks to Brevo. Everything else goes
// through email.service.js, which goes through here.
//
// A single mutable object rather than standalone functions, mirroring
// whatsappClient and cloudinaryClient, so tests can monkey-patch the method
// instead of fighting Jest's ESM module mocking.

// A hanging Brevo call must never hold anything open for long - sends are
// fire-and-forget, but a stuck socket still costs memory.
const REQUEST_TIMEOUT_MS = 8000

export const emailClient = {
  // Sends one transactional email through Brevo's API
  // (POST /smtp/email). Resolves with Brevo's parsed response
  // ({ messageId }) on 2xx; throws on transport failure, timeout or a
  // non-2xx response. email.service.js turns that throw into a FAILED log
  // row - it never reaches a request handler.
  async sendEmail({ to, sender, replyTo, subject, html, text, tags = [] }) {
    const response = await fetch(`${env.email.brevoBaseUrl}/smtp/email`, {
      method: 'POST',
      headers: {
        'api-key': env.email.brevoApiKey ?? '',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender,
        to: [to],
        ...(replyTo ? { replyTo } : {}),
        subject,
        htmlContent: html,
        textContent: text,
        ...(tags.length > 0 ? { tags } : {}),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    // Brevo explains a rejection (unverified sender, bad key, invalid
    // address) in the JSON body, not the status line.
    const body = await response.json().catch(() => ({}))

    if (!response.ok) {
      const detail = body?.message || `HTTP ${response.status}`
      const err = new Error(`Email send failed: ${detail}`)
      err.status = response.status
      err.brevoError = body
      throw err
    }

    return body
  },
}
