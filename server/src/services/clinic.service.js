import { Clinic } from '../models/Clinic.js'
import { ApiError } from '../utils/ApiError.js'
import { slugifyWithFallback, randomSlugSuffix } from '../utils/slug.js'
import { cloudinaryClient } from './cloudinaryClient.js'
import { DEFAULT_TIMEZONE } from '../utils/dateRange.js'

// How many suffixed candidates to try before giving up. Each attempt adds
// 4 random characters from a 36-character alphabet, so two collisions in a
// row is already vanishingly unlikely - five is pure paranoia, not tuning.
const MAX_SLUG_ATTEMPTS = 5

// Derives a free public slug from a clinic name. Lives here (rather than
// in auth.service.js, which is the only caller today) so any future clinic
// -creation path picks up the same rules; see Clinic.slug for why it's
// globally unique rather than per-tenant.
//
// The uniqueness check is advisory, not a lock: two simultaneous
// registrations of the same clinic name could both see the base slug as
// free. That's why Clinic.slug also carries a unique index - Mongo is the
// actual arbiter, and the loser gets a duplicate-key error rather than a
// silently shared slug.
export async function generateUniqueSlug(name) {
  const base = slugifyWithFallback(name)
  if (!(await Clinic.exists({ slug: base }))) return base

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const candidate = `${base}-${randomSlugSuffix()}`
    if (!(await Clinic.exists({ slug: candidate }))) return candidate
  }

  throw ApiError.conflict('Could not generate a unique clinic URL', 'SLUG_GENERATION_FAILED')
}

// Public-page lookup: the one place a clinic is fetched by something other
// than the authenticated session's clinicId. Inactive clinics are treated
// as non-existent so a deactivated clinic's queue stops being readable.
export async function getActiveClinicBySlug(slug) {
  return Clinic.findOne({ slug, active: true })
}

export async function getClinicSettings(clinicId) {
  const clinic = await Clinic.findById(clinicId)
  if (!clinic) throw ApiError.notFound('Clinic not found')
  return clinic
}

export async function updateClinicSettings(clinicId, updates) {
  const clinic = await Clinic.findByIdAndUpdate(clinicId, updates, {
    new: true,
    runValidators: true,
  })
  if (!clinic) throw ApiError.notFound('Clinic not found')
  return clinic
}

// Removing the old image is best-effort and happens only after the DB
// points at its replacement - a Cloudinary hiccup must never leave the
// clinic without a logo, only (at worst) with an orphaned old file.
async function destroyOldLogo(publicId) {
  if (!publicId) return
  try {
    await cloudinaryClient.destroyPublicImage(publicId)
  } catch (err) {
    console.error(`[clinic] failed to delete old logo ${publicId}:`, err.message)
  }
}

export async function setClinicLogo(clinicId, file) {
  if (!file) throw ApiError.badRequest('Choose an image to upload', 'FILE_REQUIRED')

  const existing = await Clinic.findById(clinicId).select('logoPublicId')
  if (!existing) throw ApiError.notFound('Clinic not found')

  const uploaded = await cloudinaryClient.uploadPublicImage(file.buffer, {
    folder: `clinic-crm/${clinicId}/branding`,
    filename: file.originalname,
  })

  const clinic = await Clinic.findByIdAndUpdate(
    clinicId,
    { logoUrl: uploaded.secure_url, logoPublicId: uploaded.public_id },
    { new: true, runValidators: true },
  )
  await destroyOldLogo(existing.logoPublicId)
  return clinic
}

export async function removeClinicLogo(clinicId) {
  const existing = await Clinic.findById(clinicId).select('logoPublicId')
  if (!existing) throw ApiError.notFound('Clinic not found')

  const clinic = await Clinic.findByIdAndUpdate(
    clinicId,
    { $unset: { logoUrl: 1, logoPublicId: 1 } },
    { new: true },
  )
  await destroyOldLogo(existing.logoPublicId)
  return clinic
}

// The zone that defines this clinic's day (see utils/dateRange.js). Read per
// call rather than cached, so a change in Settings applies immediately.
export async function getClinicTimezone(clinicId) {
  const clinic = await Clinic.findById(clinicId).select('timezone').lean()
  return clinic?.timezone || DEFAULT_TIMEZONE
}
