import crypto from 'node:crypto'
import mongoose from 'mongoose'
import { PlatformAdmin } from '../models/PlatformAdmin.js'
import { PlatformAuditLog } from '../models/PlatformAuditLog.js'
import { Clinic } from '../models/Clinic.js'
import { User } from '../models/User.js'
import { Patient } from '../models/Patient.js'
import { Appointment } from '../models/Appointment.js'
import { Consultation } from '../models/Consultation.js'
import { Prescription } from '../models/Prescription.js'
import { Invoice } from '../models/Invoice.js'
import { AuditLog } from '../models/AuditLog.js'
import { ApiError } from '../utils/ApiError.js'
import { writeAuditLog } from '../utils/audit.js'

// The platform admin panel: how the people running Clinix see and support
// every clinic. It deliberately exposes counts and account details only -
// never a patient's name, record or anything clinical. A platform admin
// supports the software; they are not part of any clinic's care team.

const DAY_MS = 24 * 60 * 60 * 1000
const daysAgo = (n) => new Date(Date.now() - n * DAY_MS)

function assertValidId(id, label) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.badRequest(`Invalid ${label}`, 'INVALID_ID')
  }
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function recordPlatformAction({ admin, action, clinicId, targetUserId, metadata, ipAddress }) {
  return PlatformAuditLog.create({ adminId: admin._id, action, clinicId, targetUserId, metadata, ipAddress })
}

// --- Auth -------------------------------------------------------------------

export async function login({ email, password }) {
  const admin = await PlatformAdmin.findOne({ email }).select('+passwordHash')
  if (!admin || !admin.active || !(await admin.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS')
  }
  admin.lastLoginAt = new Date()
  await admin.save()
  return admin
}

// --- Overview ---------------------------------------------------------------

export async function getOverview() {
  const [clinics, suspended, newClinics7d, newClinics30d, activeClinicIds, patients, appointments30d] =
    await Promise.all([
      Clinic.countDocuments(),
      Clinic.countDocuments({ active: false }),
      Clinic.countDocuments({ createdAt: { $gte: daysAgo(7) } }),
      Clinic.countDocuments({ createdAt: { $gte: daysAgo(30) } }),
      // "Active" = anyone at the clinic did anything that got audited.
      AuditLog.distinct('clinicId', { createdAt: { $gte: daysAgo(7) } }),
      Patient.countDocuments(),
      Appointment.countDocuments({ createdAt: { $gte: daysAgo(30) } }),
    ])
  return {
    clinics,
    suspended,
    newClinics7d,
    newClinics30d,
    activeClinics7d: activeClinicIds.length,
    patients,
    appointments30d,
  }
}

// --- Clinics ----------------------------------------------------------------

// { clinicId: count } for the given clinics, from one grouped query.
async function countByClinic(Model, clinicIds, extraMatch = {}) {
  const rows = await Model.aggregate([
    { $match: { clinicId: { $in: clinicIds }, ...extraMatch } },
    { $group: { _id: '$clinicId', count: { $sum: 1 } } },
  ])
  return new Map(rows.map((r) => [String(r._id), r.count]))
}

const PAGE_SIZE = 20

export async function listClinics({ search, status = 'all', page = 1 }) {
  const filter = {}
  if (status === 'active') filter.active = true
  if (status === 'suspended') filter.active = false
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i')
    // Match the clinic itself, or any of its staff by name/email - "the clinic
    // that drsharma@... belongs to" is the usual support question.
    const staffClinicIds = await User.distinct('clinicId', { $or: [{ name: pattern }, { email: pattern }] })
    filter.$or = [{ name: pattern }, { slug: pattern }, { email: pattern }, { phone: pattern }, { _id: { $in: staffClinicIds } }]
  }

  const [total, clinics] = await Promise.all([
    Clinic.countDocuments(filter),
    Clinic.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .select('name slug phone email active suspendedAt createdAt logoUrl'),
  ])

  const ids = clinics.map((c) => c._id)
  const [owners, staffCounts, patientCounts, appointmentCounts, lastActivity] = await Promise.all([
    User.find({ clinicId: { $in: ids }, role: 'owner' }).sort({ createdAt: 1 }).select('clinicId name email'),
    countByClinic(User, ids),
    countByClinic(Patient, ids),
    countByClinic(Appointment, ids, { createdAt: { $gte: daysAgo(30) } }),
    AuditLog.aggregate([
      { $match: { clinicId: { $in: ids } } },
      { $group: { _id: '$clinicId', at: { $max: '$createdAt' } } },
    ]),
  ])
  const ownerByClinic = new Map()
  for (const o of owners) if (!ownerByClinic.has(String(o.clinicId))) ownerByClinic.set(String(o.clinicId), o)
  const lastActivityByClinic = new Map(lastActivity.map((r) => [String(r._id), r.at]))

  return {
    clinics: clinics.map((c) => {
      const id = String(c._id)
      const owner = ownerByClinic.get(id)
      return {
        ...c.toJSON(),
        owner: owner ? { _id: owner._id, name: owner.name, email: owner.email } : null,
        staffCount: staffCounts.get(id) ?? 0,
        patientCount: patientCounts.get(id) ?? 0,
        appointments30d: appointmentCounts.get(id) ?? 0,
        lastActivityAt: lastActivityByClinic.get(id) ?? null,
      }
    }),
    pagination: { page, limit: PAGE_SIZE, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
  }
}

async function findClinic(clinicId) {
  assertValidId(clinicId, 'clinic id')
  const clinic = await Clinic.findById(clinicId)
  if (!clinic) throw ApiError.notFound('Clinic not found')
  return clinic
}

export async function getClinic(clinicId) {
  const clinic = await findClinic(clinicId)
  const id = clinic._id
  const [staff, patients, appointments, appointments30d, consultations, prescriptions, invoices, activity, platformActions] =
    await Promise.all([
      User.find({ clinicId: id }).sort({ createdAt: 1 }).select('name email role active createdAt'),
      Patient.countDocuments({ clinicId: id }),
      Appointment.countDocuments({ clinicId: id }),
      Appointment.countDocuments({ clinicId: id, createdAt: { $gte: daysAgo(30) } }),
      Consultation.countDocuments({ clinicId: id }),
      Prescription.countDocuments({ clinicId: id }),
      Invoice.countDocuments({ clinicId: id }),
      // What happened, by whom and when - but not the audit metadata or IPs.
      AuditLog.find({ clinicId: id })
        .sort({ createdAt: -1 })
        .limit(15)
        .select('action resourceType userId createdAt')
        .populate('userId', 'name role'),
      PlatformAuditLog.find({ clinicId: id })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('action targetUserId metadata createdAt adminId')
        .populate('adminId', 'name')
        .populate('targetUserId', 'name email'),
    ])

  return {
    clinic: {
      _id: clinic._id,
      name: clinic.name,
      slug: clinic.slug,
      email: clinic.email,
      phone: clinic.phone,
      address: clinic.address,
      timezone: clinic.timezone,
      logoUrl: clinic.logoUrl,
      whatsappEnabled: clinic.whatsappEnabled,
      emailEnabled: clinic.emailEnabled,
      active: clinic.active,
      suspendedAt: clinic.suspendedAt,
      suspendedReason: clinic.suspendedReason,
      createdAt: clinic.createdAt,
    },
    staff,
    usage: { patients, appointments, appointments30d, consultations, prescriptions, invoices },
    activity,
    platformActions,
  }
}

export async function setClinicSuspended(admin, clinicId, { suspended, reason }, ipAddress) {
  const clinic = await findClinic(clinicId)
  clinic.active = !suspended
  clinic.suspendedAt = suspended ? new Date() : undefined
  clinic.suspendedReason = suspended ? reason : undefined
  await clinic.save()

  const action = suspended ? 'CLINIC_SUSPENDED' : 'CLINIC_UNSUSPENDED'
  await recordPlatformAction({ admin, action, clinicId: clinic._id, metadata: suspended ? { reason } : undefined, ipAddress })
  // Also in the clinic's own audit log, so the owner can see it happened.
  await writeAuditLog({
    clinicId: clinic._id,
    action,
    resourceType: 'Clinic',
    resourceId: clinic._id,
    metadata: { by: 'Clinix support' },
  })
  return clinic
}

// Readable but strong: 12 characters from an alphabet without look-alikes
// (no 0/O, 1/l/I), so it can be read out over the phone.
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
function generateTempPassword(length = 12) {
  const bytes = crypto.randomBytes(length)
  return Array.from(bytes, (b) => TEMP_PASSWORD_ALPHABET[b % TEMP_PASSWORD_ALPHABET.length]).join('')
}

// For "I forgot my password" until the app can send email: sets a fresh
// temporary password, signs the person out everywhere, and returns the
// password once - it is never stored or shown again.
export async function resetStaffPassword(admin, clinicId, userId, ipAddress) {
  const clinic = await findClinic(clinicId)
  assertValidId(userId, 'staff id')
  const user = await User.findOne({ _id: userId, clinicId: clinic._id })
  if (!user) throw ApiError.notFound('Staff member not found')

  const temporaryPassword = generateTempPassword()
  user.passwordHash = await User.hashPassword(temporaryPassword)
  user.sessionVersion = (user.sessionVersion ?? 0) + 1
  await user.save()

  await recordPlatformAction({
    admin,
    action: 'STAFF_PASSWORD_RESET',
    clinicId: clinic._id,
    targetUserId: user._id,
    ipAddress,
  })
  await writeAuditLog({
    clinicId: clinic._id,
    action: 'PASSWORD_RESET_BY_SUPPORT',
    resourceType: 'User',
    resourceId: user._id,
    metadata: { by: 'Clinix support' },
  })
  return { user: { _id: user._id, name: user.name, email: user.email }, temporaryPassword }
}
