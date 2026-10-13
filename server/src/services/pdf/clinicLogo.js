import { cloudinaryClient } from '../cloudinaryClient.js'

const FETCH_TIMEOUT_MS = 3000
const MAX_LOGO_BYTES = 1024 * 1024
const CACHE_TTL_MS = 60 * 60 * 1000
const CACHE_MAX_ENTRIES = 100

// publicId -> { buffer, expires }. A replaced logo gets a new publicId
// (uploads use unique_filename), so a changed logo is never served stale -
// the TTL only bounds memory for logos nobody is printing any more.
const cache = new Map()

// Fetches the clinic's logo as PNG bytes for embedding in a PDF, or null.
//
// - Built from logoPublicId, never logoUrl: the URL is generated for this
//   app's own Cloudinary account, so the server never fetches an arbitrary
//   address, and asking Cloudinary for format=png means a WebP upload still
//   embeds (pdfkit only understands PNG and JPEG).
// - Never throws. A slow or failed fetch costs at most FETCH_TIMEOUT_MS and
//   the PDF is generated without a logo - a missing logo must never stop a
//   prescription or receipt from printing.
export async function loadClinicLogoForPdf(clinic) {
  const publicId = clinic?.logoPublicId
  if (!publicId) return null

  const hit = cache.get(publicId)
  if (hit && hit.expires > Date.now()) return hit.buffer

  try {
    const res = await fetch(cloudinaryClient.pdfLogoUrl(publicId), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length > MAX_LOGO_BYTES) throw new Error(`logo is ${buffer.length} bytes, over the PDF limit`)

    if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value)
    cache.set(publicId, { buffer, expires: Date.now() + CACHE_TTL_MS })
    return buffer
  } catch (err) {
    console.error(`[pdf] could not load clinic logo ${publicId}:`, err.message)
    return null
  }
}

export function clearPdfLogoCache() {
  cache.clear()
}
