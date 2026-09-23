// Phone numbers are stored as the clinic typed them (Patient.phone is a
// free-form trimmed string - usually a bare 10-digit Indian mobile). The
// WhatsApp Cloud API wants E.164 digits with no '+', and delivery webhooks
// come back in that same form. These helpers bridge the two without
// rewriting what's in the database.

// Indian mobile, matching the app's INR billing and hi/mr template
// support. Overridable per deployment.
const DEFAULT_COUNTRY_CODE = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '91'

// A national subscriber number is 10 digits in India; anything longer is
// assumed to already carry a country code.
const NATIONAL_NUMBER_LENGTH = 10

export function digitsOnly(phone) {
  return String(phone ?? '').replace(/\D/g, '')
}

// "+91 98765 43210", "09876543210", "9876543210" -> "919876543210".
// Returns null for anything too short to be a real number rather than
// guessing - the caller treats that as "can't message this patient".
export function toE164(phone, countryCode = DEFAULT_COUNTRY_CODE) {
  let digits = digitsOnly(phone)
  if (!digits) return null

  // A single national trunk prefix, e.g. 0 in "09876543210".
  if (digits.length === NATIONAL_NUMBER_LENGTH + 1 && digits.startsWith('0')) {
    digits = digits.slice(1)
  }
  if (digits.length === NATIONAL_NUMBER_LENGTH) {
    digits = `${countryCode}${digits}`
  }
  // Shortest plausible E.164 is ~8 digits; below that it's a typo, not a
  // number we should hand to Meta.
  if (digits.length < 8 || digits.length > 15) return null
  return digits
}

// Webhook-side matching. Meta reports the sender in E.164 while we store
// a national number, so compare on the last NATIONAL_NUMBER_LENGTH digits
// rather than requiring the two representations to be identical.
export function phoneMatches(storedPhone, incomingPhone) {
  const a = digitsOnly(storedPhone)
  const b = digitsOnly(incomingPhone)
  if (!a || !b) return false
  const tail = (v) => v.slice(-NATIONAL_NUMBER_LENGTH)
  return tail(a) === tail(b) && tail(a).length === NATIONAL_NUMBER_LENGTH
}
