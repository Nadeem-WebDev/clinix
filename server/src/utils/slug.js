// Public, URL-safe clinic identifier used by the no-login queue page
// (/q/:slug). Kept deliberately dumb - uniqueness is the caller's job
// (see clinic.service.js's generateUniqueSlug), this file only knows how
// to turn arbitrary text into the allowed shape.

// Lowercase alphanumeric words separated by single hyphens, no leading or
// trailing hyphen. Mirrored as a schema-level validator on Clinic.slug and
// as a Zod check on the public route's :slug param.
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

// Long enough that a clinic name stays recognisable in the URL, short
// enough to read off a poster in a waiting room.
const MAX_BASE_LENGTH = 48

export function slugify(input) {
  return String(input ?? '')
    .normalize('NFKD')
    // Strip combining marks left behind by NFKD so "Café" -> "cafe" rather
    // than losing the letter entirely to the non-alphanumeric pass below.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_BASE_LENGTH)
    .replace(/-+$/g, '')
}

// Clinic names that slugify to nothing at all (scripts with no Latin
// transliteration, or a name that's purely punctuation) still need a
// usable URL - fall back rather than generating an empty slug.
export function slugifyWithFallback(input, fallback = 'clinic') {
  return slugify(input) || fallback
}

// Collision suffix. Not security-sensitive (it only disambiguates two
// clinics with the same name), so Math.random is fine here - but it is
// deliberately not sequential, so a slug never leaks how many clinics are
// on the platform.
export function randomSlugSuffix(length = 4) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}
