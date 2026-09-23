import { User } from '../models/User.js'
import { ApiError } from '../utils/ApiError.js'

// Every function here takes clinicId as an explicit argument supplied by
// the controller from req.clinicId (which itself comes only from the
// authenticated JWT) - never from req.body/req.params/req.query. This is
// the tenant-isolation boundary for the whole staff module.

// Which roles a requester may assign to a new staff member. Owner is the
// only role that can grant owner/admin-level access - admin can still only
// create the same non-management roles it always could.
const ASSIGNABLE_ROLES_BY_REQUESTER = {
  owner: ['owner', 'admin', 'doctor', 'receptionist', 'nurse'],
  admin: ['doctor', 'receptionist', 'nurse'],
}

export async function createStaff(clinicId, { name, email, password, role }, requesterRole) {
  const assignable = ASSIGNABLE_ROLES_BY_REQUESTER[requesterRole] ?? []
  if (!assignable.includes(role)) {
    throw ApiError.forbidden(`You do not have permission to create a ${role} account`)
  }

  const existing = await User.findOne({ email })
  if (existing) {
    throw ApiError.conflict('An account with this email already exists', 'EMAIL_TAKEN')
  }

  const passwordHash = await User.hashPassword(password)
  return User.create({ clinicId, name, email, passwordHash, role })
}

export async function listStaff(clinicId) {
  return User.find({ clinicId }).sort({ createdAt: -1 })
}

export async function setStaffActive(clinicId, userId, active) {
  const user = await User.findOne({ _id: userId, clinicId })
  if (!user) {
    throw ApiError.notFound('Staff member not found')
  }
  if (['owner', 'admin'].includes(user.role) && !active) {
    throw ApiError.badRequest('Cannot disable an owner or admin account', 'CANNOT_DISABLE_ADMIN')
  }
  user.active = active
  await user.save()
  return user
}
