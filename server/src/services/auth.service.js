import { Clinic, CLINIC_SUSPENDED_MESSAGE } from '../models/Clinic.js'
import { User } from '../models/User.js'
import { ApiError } from '../utils/ApiError.js'
import { generateUniqueSlug } from './clinic.service.js'

// Onboards a brand-new clinic + its first user in one step. This is the
// SaaS signup flow (section 46 acceptance criteria: "Admin creates clinic").
// That first user is the clinic's Owner - the one role above admin, held by
// whoever registered the clinic. Every subsequent user for this clinic is
// created by an owner/admin via the staff endpoints, not through this route.
export async function registerClinic({ clinicName, adminName, email, password }) {
  const existing = await User.findOne({ email })
  if (existing) {
    throw ApiError.conflict('An account with this email already exists', 'EMAIL_TAKEN')
  }

  // Generated server-side, never accepted from the signup form - the slug
  // is a public identifier and letting a registrant choose it would let
  // them impersonate another clinic's queue URL.
  const slug = await generateUniqueSlug(clinicName)
  const clinic = await Clinic.create({ name: clinicName, slug })

  const passwordHash = await User.hashPassword(password)
  const owner = await User.create({
    clinicId: clinic._id,
    name: adminName,
    email,
    passwordHash,
    role: 'owner',
  })

  return { clinic, user: owner }
}

// The caller is already authenticated, but the current password is still
// required - otherwise anyone at an unlocked front-desk PC could lock the
// owner out. A wrong one is a 400, not a 401: the session itself is fine.
export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+passwordHash')
  if (!user || !user.active) {
    throw ApiError.unauthorized('Account is disabled or no longer exists')
  }
  if (!(await user.comparePassword(currentPassword))) {
    throw ApiError.badRequest('Current password is incorrect', 'WRONG_PASSWORD')
  }

  user.passwordHash = await User.hashPassword(newPassword)
  user.sessionVersion = (user.sessionVersion ?? 0) + 1
  await user.save()
  return user
}

export async function login({ email, password }) {
  const user = await User.findOne({ email }).select('+passwordHash')
  if (!user || !user.active) {
    throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS')
  }

  const matches = await user.comparePassword(password)
  if (!matches) {
    throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS')
  }
  // Checked only after the password, so it can't be used to probe which
  // emails belong to a suspended clinic.
  if (!(await Clinic.exists({ _id: user.clinicId, active: true }))) {
    throw ApiError.forbidden(CLINIC_SUSPENDED_MESSAGE, 'CLINIC_SUSPENDED')
  }

  return user
}
