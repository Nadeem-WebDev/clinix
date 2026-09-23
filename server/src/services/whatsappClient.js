import { env } from '../config/env.js'

// The ONLY place in this codebase that opens a connection to
// graph.facebook.com. Everything else goes through whatsapp.service.js,
// which goes through here.
//
// Exported as a single mutable object rather than standalone functions,
// deliberately mirroring cloudinaryClient: this environment has no real
// Meta credentials, and Jest's ESM module-mocking is fiddly, so tests
// monkey-patch these methods directly. ES modules are singletons, so every
// importer shares the object.

// A hanging Graph API call must never hold an appointment booking open.
// Meta's own p99 is well under a second; 8s is a generous ceiling, not a
// target.
const REQUEST_TIMEOUT_MS = 8000

export const whatsappClient = {
  // POSTs an approved template message. Resolves with Meta's parsed
  // response on 2xx; throws on transport failure, timeout, or a non-2xx
  // response. Callers in whatsapp.service.js turn that throw into a FAILED
  // log row - it never propagates to a request handler.
  async sendTemplate({ toPhone, templateName, languageCode = 'en', components = [] }) {
    const url = `${env.whatsapp.baseUrl}/${env.whatsapp.phoneNumberId}/messages`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.whatsapp.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          // Meta rejects an empty `components` array on some template
          // shapes, so omit the key entirely when there are no variables.
          ...(components.length > 0 ? { components } : {}),
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    // Read the body once, whatever the status - Meta puts the useful part
    // of an error (code, subcode, human-readable detail) in the JSON body,
    // not the status line.
    const body = await response.json().catch(() => ({}))

    if (!response.ok) {
      const detail = body?.error?.message || `HTTP ${response.status}`
      const err = new Error(`WhatsApp send failed: ${detail}`)
      err.status = response.status
      err.metaError = body?.error
      throw err
    }

    return body
  },
}
