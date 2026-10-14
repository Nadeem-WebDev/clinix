import mongoose from 'mongoose'
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

// --- Doctor profile ---------------------------------------------------------

const PROFILE_FIELDS = ['qualifications', 'specialization', 'registrationNumber', 'registrationCouncil']

// A doctor edits their own profile; an owner/admin edits any doctor's in
// their clinic. Nobody else, and only accounts with the doctor role have one.
async function findEditableDoctor(clinicId, requester, doctorId, select) {
  if (!mongoose.Types.ObjectId.isValid(doctorId)) {
    throw ApiError.badRequest('Invalid staff id', 'INVALID_ID')
  }
  const isSelf = String(requester._id) === String(doctorId)
  if (!isSelf && !['owner', 'admin'].includes(requester.role)) {
    throw ApiError.forbidden("You can only edit your own doctor profile")
  }
  const query = User.findOne({ _id: doctorId, clinicId })
  if (select) query.select(select)
  const doctor = await query
  if (!doctor) throw ApiError.notFound('Staff member not found')
  if (doctor.role !== 'doctor') {
    throw ApiError.badRequest('Only doctors have a doctor profile', 'NOT_A_DOCTOR')
  }
  return doctor
}

export async function updateDoctorProfile(clinicId, requester, doctorId, fields) {
  // What a doctor charges is the clinic's call: a doctor may set their own
  // hours, but not their own fee.
  if (fields.consultationFee !== undefined && !['owner', 'admin'].includes(requester.role)) {
    throw ApiError.forbidden("Only the clinic's owner or admin can change a doctor's fee")
  }
  const doctor = await findEditableDoctor(clinicId, requester, doctorId)
  if (!doctor.doctorProfile) doctor.doctorProfile = {}
  for (const key of PROFILE_FIELDS) {
    if (fields[key] !== undefined) doctor.doctorProfile[key] = fields[key] || undefined
  }
  if (fields.consultationFee !== undefined) doctor.doctorProfile.consultationFee = fields.consultationFee ?? undefined
  if (fields.workingHours !== undefined) {
    // A day off keeps no sessions, so "available" always means "has hours".
    doctor.doctorProfile.workingHours = fields.workingHours?.map((d) => ({
      ...d,
      sessions: d.isAvailable ? d.sessions : [],
    }))
  }
  await doctor.save()
  return doctor
}

// Checked by content, not just the declared type: pdfkit must be able to
// draw it into the prescription, and a renamed file would only fail there.
function sniffImageType(buffer) {
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  return null
}

export async function setDoctorSignature(clinicId, requester, doctorId, file) {
  if (!file) throw ApiError.badRequest('Choose an image of the signature', 'FILE_REQUIRED')
  const contentType = sniffImageType(file.buffer)
  if (!contentType) {
    throw ApiError.badRequest('Only PNG and JPG images are allowed', 'UNSUPPORTED_FILE_TYPE')
  }
  const doctor = await findEditableDoctor(clinicId, requester, doctorId)
  if (!doctor.doctorProfile) doctor.doctorProfile = {}
  doctor.doctorProfile.signature = { data: file.buffer, contentType, updatedAt: new Date() }
  await doctor.save()
  return doctor
}

export async function removeDoctorSignature(clinicId, requester, doctorId) {
  const doctor = await findEditableDoctor(clinicId, requester, doctorId)
  if (doctor.doctorProfile?.signature?.updatedAt) {
    doctor.doctorProfile.signature = undefined
    await doctor.save()
  }
  return doctor
}

// The image itself, for the profile form's preview. Same access rule as
// editing - other staff never need to see a doctor's signature.
export async function getDoctorSignature(clinicId, requester, doctorId) {
  const doctor = await findEditableDoctor(clinicId, requester, doctorId, '+doctorProfile.signature.data')
  const signature = doctor.doctorProfile?.signature
  if (!signature?.data?.length) throw ApiError.notFound('No signature uploaded')
  return signature
}
