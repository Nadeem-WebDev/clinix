// Demo data seed script - run with `npm run seed` (server workspace).
//
// WIPES the database it points at (MONGODB_URI) and repopulates it with a
// realistic demo clinic: an Owner/Doctor/Receptionist, ~18 patients, and a
// mix of past visits (with invoices/payments) and today's appointments in
// various queue states - enough to click through every screen in a demo
// without staring at empty lists.
//
// Deliberately goes through the real service layer (registerClinic,
// createStaff, createPatient, createAppointment, createConsultation,
// createInvoice, recordPayment, ...) rather than raw Model.create() calls -
// that's the only way patient IDs, invoice numbers, token numbers, and
// tenant scoping end up exactly as they would from real usage.
/* eslint-disable no-console -- this whole file's job is CLI progress output */
import { connectDB, disconnectDB } from '../config/db.js'
import { env, isProduction } from '../config/env.js'
import { todayDateStr, addDaysToDateStr } from '../utils/dateRange.js'

import { Clinic, DAYS_OF_WEEK } from '../models/Clinic.js'
import { User } from '../models/User.js'
import { Patient } from '../models/Patient.js'
import { Appointment } from '../models/Appointment.js'
import { Consultation } from '../models/Consultation.js'
import { Prescription } from '../models/Prescription.js'
import { Invoice } from '../models/Invoice.js'
import { Payment } from '../models/Payment.js'
import { PatientDocument } from '../models/PatientDocument.js'
import { AuditLog } from '../models/AuditLog.js'
import { Counter } from '../models/Counter.js'

import * as authService from '../services/auth.service.js'
import * as userService from '../services/user.service.js'
import * as clinicService from '../services/clinic.service.js'
import * as patientService from '../services/patient.service.js'
import * as appointmentService from '../services/appointment.service.js'
import * as consultationService from '../services/consultation.service.js'
import * as invoiceService from '../services/invoice.service.js'

const DEMO_EMAIL_DOMAIN = 'demo-clinic.test'
const DEMO_PASSWORD = 'Demo@12345'

// ---------------------------------------------------------------------------
// Small randomization/data helpers
// ---------------------------------------------------------------------------

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function pick(arr) {
  return arr[randomInt(0, arr.length - 1)]
}

// A shuffled, collision-free list of {daysAgo, hour} slots - there's only
// one doctor, so independently random-picking a day+hour per patient can
// (and, once seen live, did) double-book the same slot twice. Building the
// full cross product once and handing out distinct slots in order avoids
// that entirely instead of retrying on conflict.
function shuffledSlots(daysAgoRange, hours) {
  const slots = []
  for (const daysAgo of daysAgoRange) {
    for (const hour of hours) slots.push({ daysAgo, hour })
  }
  for (let i = slots.length - 1; i > 0; i--) {
    const j = randomInt(0, i)
    ;[slots[i], slots[j]] = [slots[j], slots[i]]
  }
  return slots
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

// Anchored to the app's own UTC day-bucketing (see utils/dateRange.js) so
// these actually land in "today"/"N days ago" no matter the host machine's
// local timezone.
function atUtc(dateStr, hour, minute = 0) {
  return new Date(`${dateStr}T${pad2(hour)}:${pad2(minute)}:00.000Z`)
}
function todayAt(hour, minute = 0) {
  return atUtc(todayDateStr(), hour, minute)
}
function daysAgoAt(days, hour, minute = 0) {
  return atUtc(addDaysToDateStr(todayDateStr(), -days), hour, minute)
}

const FIRST_NAMES = {
  male: ['Amit', 'Rahul', 'Vikram', 'Suresh', 'Arjun', 'Rohan', 'Karan', 'Sanjay', 'Deepak', 'Manish', 'Aditya', 'Vivek'],
  female: ['Priya', 'Neha', 'Anjali', 'Pooja', 'Kavita', 'Sunita', 'Divya', 'Meera', 'Ritu', 'Swati', 'Nisha', 'Shreya'],
}
const LAST_NAMES = ['Sharma', 'Verma', 'Gupta', 'Iyer', 'Nair', 'Reddy', 'Patel', 'Singh', 'Joshi', 'Kulkarni', 'Bhat', 'Menon', 'Desai', 'Rao']
const LOCALITIES = ['Kothrud', 'Baner', 'Aundh', 'Viman Nagar', 'Kharadi', 'Hadapsar', 'Wakad', 'Shivaji Nagar']
const ALLERGY_POOL = ['Penicillin', 'Dust', 'Peanuts', 'Pollen', 'Sulfa drugs']
const CONDITION_POOL = ['Diabetes', 'Hypertension', 'Asthma', 'Thyroid']

function randomPhone() {
  return pick(['6', '7', '8', '9']) + Array.from({ length: 9 }, () => randomInt(0, 9)).join('')
}

// Coherent {complaint, diagnosis, treatment} triples, so a consultation
// never pairs e.g. "fever" with "lumbar strain" - picked as one unit below.
const VISIT_SCENARIOS = [
  {
    chiefComplaint: 'Fever and body ache for 3 days',
    diagnosis: 'Viral fever',
    treatmentPlan: 'Paracetamol 650mg twice daily for 3 days, plenty of fluids, rest.',
  },
  {
    chiefComplaint: 'Persistent cough and cold',
    diagnosis: 'Upper respiratory tract infection',
    treatmentPlan: 'Antihistamine + cough syrup, avoid cold beverages, review in 5 days.',
  },
  {
    chiefComplaint: 'Headache and dizziness',
    diagnosis: 'Tension headache',
    treatmentPlan: 'Rest, hydration, review in a week if not improved.',
  },
  {
    chiefComplaint: 'Stomach pain and acidity after meals',
    diagnosis: 'Acid reflux (GERD)',
    treatmentPlan: 'Antacid before meals, avoid spicy/oily food.',
  },
  {
    chiefComplaint: 'Routine diabetes checkup',
    diagnosis: 'Type 2 Diabetes - stable',
    treatmentPlan: 'Continue Metformin 500mg, repeat HbA1c in 3 months.',
  },
  {
    chiefComplaint: 'Follow-up for high blood pressure',
    diagnosis: 'Hypertension - well controlled',
    treatmentPlan: 'Continue Amlodipine 5mg, monitor BP weekly, low-salt diet.',
  },
  {
    chiefComplaint: 'Knee pain on stairs for 2 weeks',
    diagnosis: 'Osteoarthritis, mild',
    treatmentPlan: 'Diclofenac gel topically, physiotherapy referral.',
  },
  {
    chiefComplaint: 'Itchy skin rash on forearm',
    diagnosis: 'Contact dermatitis',
    treatmentPlan: 'Topical steroid cream, avoid the irritant, review in a week.',
  },
]

function randomVitals() {
  return {
    temperature: `${(97.5 + Math.random() * 3).toFixed(1)}°F`,
    bloodPressure: `${randomInt(110, 138)}/${randomInt(70, 90)}`,
    pulse: String(randomInt(66, 96)),
    respiratoryRate: String(randomInt(14, 20)),
    spo2: `${randomInt(96, 99)}%`,
    weight: `${randomInt(48, 88)} kg`,
    height: `${randomInt(150, 182)} cm`,
  }
}

// ---------------------------------------------------------------------------
// Safety + reset
// ---------------------------------------------------------------------------

function assertSafeToRun() {
  if (isProduction) {
    console.error('Refusing to run: NODE_ENV=production. This script wipes the database - never run it there.')
    process.exit(1)
  }
  if (/mongodb\.net/.test(env.mongodbUri) && !/seed|demo|dev/i.test(env.mongodbUri)) {
    // A best-effort second guard: an Atlas URI (mongodb+srv://...mongodb.net)
    // that doesn't look like a dev/demo/seed database name is far more
    // likely to be a real shared environment than a throwaway local Mongo -
    // NODE_ENV alone doesn't catch "someone pointed MONGODB_URI at staging".
    console.error(
      `Refusing to run against what looks like a non-local Atlas cluster (${env.mongodbUri}).\n` +
        'If this really is a disposable seed/demo database, rename it to include "seed"/"demo"/"dev".',
    )
    process.exit(1)
  }
}

async function clearDatabase() {
  console.log('Clearing existing data...')
  await Promise.all([
    Clinic.deleteMany({}),
    User.deleteMany({}),
    Patient.deleteMany({}),
    Appointment.deleteMany({}),
    Consultation.deleteMany({}),
    Prescription.deleteMany({}),
    Invoice.deleteMany({}),
    Payment.deleteMany({}),
    PatientDocument.deleteMany({}),
    AuditLog.deleteMany({}),
    Counter.deleteMany({}),
  ])
}

// ---------------------------------------------------------------------------
// Clinic + staff
// ---------------------------------------------------------------------------

async function seedClinicAndOwner() {
  const { clinic, user: owner } = await authService.registerClinic({
    clinicName: 'Sunrise Family Clinic',
    adminName: 'Rohan Kapoor',
    email: `owner@${DEMO_EMAIL_DOMAIN}`,
    password: DEMO_PASSWORD,
  })

  const workingHours = DAYS_OF_WEEK.map((day) => ({
    day,
    isOpen: day !== 'sunday',
    openTime: '09:00',
    closeTime: day === 'saturday' ? '14:00' : '18:00', // half-day Saturday
  }))

  const configuredClinic = await clinicService.updateClinicSettings(clinic._id, {
    address: '14, MG Road, Kothrud, Pune, Maharashtra 411038',
    phone: '02012345678',
    defaultConsultationFee: 500,
    workingHours,
  })

  return { clinic: configuredClinic, owner }
}

async function seedStaff(clinicId, ownerRole) {
  const doctor = await userService.createStaff(
    clinicId,
    { name: 'Dr. Kavita Nair', email: `doctor@${DEMO_EMAIL_DOMAIN}`, password: DEMO_PASSWORD, role: 'doctor' },
    ownerRole,
  )
  const receptionist = await userService.createStaff(
    clinicId,
    { name: 'Priya Iyer', email: `receptionist@${DEMO_EMAIL_DOMAIN}`, password: DEMO_PASSWORD, role: 'receptionist' },
    ownerRole,
  )
  return { doctor, receptionist }
}

// ---------------------------------------------------------------------------
// Patients
// ---------------------------------------------------------------------------

async function seedPatients(clinicId, createdByUserId, count) {
  const patients = []
  for (let i = 0; i < count; i++) {
    const gender = pick(['male', 'female'])
    const fullName = `${pick(FIRST_NAMES[gender])} ${pick(LAST_NAMES)}`
    const hasAllergy = Math.random() < 0.3
    const hasCondition = Math.random() < 0.25

    const patient = await patientService.createPatient(
      clinicId,
      {
        fullName,
        age: randomInt(6, 78),
        gender,
        phone: randomPhone(),
        address: `${randomInt(1, 400)}, ${pick(LOCALITIES)}, Pune`,
        bloodGroup: pick(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown']),
        allergies: hasAllergy ? [pick(ALLERGY_POOL)] : [],
        medicalConditions: hasCondition ? [pick(CONDITION_POOL)] : [],
      },
      createdByUserId,
    )
    patients.push(patient)
  }
  return patients
}

// ---------------------------------------------------------------------------
// Visits: a full past appointment -> consultation -> invoice -> payment cycle
// ---------------------------------------------------------------------------

async function seedPastVisit({ clinicId, doctor, receptionistId, patient, daysAgo, hour, clinic, withFollowUp }) {
  const scenario = pick(VISIT_SCENARIOS)

  let appointment = await appointmentService.createAppointment(
    clinicId,
    { patientId: patient._id, doctorId: doctor._id, scheduledAt: daysAgoAt(daysAgo, hour), durationMinutes: 15 },
    receptionistId,
  )
  appointment = await appointmentService.markArrived(clinicId, appointment._id)
  appointment = await appointmentService.callNextIntoConsultation(clinicId, appointment._id)
  appointment = await appointmentService.completeAppointment(clinicId, appointment._id)

  const consultation = await consultationService.createConsultation(
    clinicId,
    {
      patientId: patient._id,
      doctorId: doctor._id,
      appointmentId: appointment._id,
      chiefComplaint: scenario.chiefComplaint,
      vitals: randomVitals(),
      diagnosis: scenario.diagnosis,
      treatmentPlan: scenario.treatmentPlan,
      ...(withFollowUp
        ? { followUpDate: daysAgoAt(-5, 10), followUpInstructions: 'Review response to treatment and repeat vitals.' }
        : {}),
    },
    doctor._id,
  )

  // Extra line item on ~30% of bills, for variety (a lab test alongside the
  // standard consultation fee) - matches the Fee-Prefill Wiring default
  // (Clinic Settings' defaultConsultationFee) for the base item.
  const items = [{ description: 'Consultation Fee', quantity: 1, unitPrice: clinic.defaultConsultationFee }]
  if (Math.random() < 0.3) {
    items.push({ description: 'Lab Test - CBC', quantity: 1, unitPrice: 300 })
  }

  let invoice = await invoiceService.createInvoice(
    clinicId,
    { patientId: patient._id, doctorId: doctor._id, appointmentId: appointment._id, consultationId: consultation._id, items },
    receptionistId,
  )

  // Realistic mix of payment states: mostly paid in full, some partial,
  // some still outstanding.
  const paymentRoll = Math.random()
  if (paymentRoll < 0.6) {
    const result = await invoiceService.recordPayment(
      clinicId,
      invoice._id,
      { amount: invoice.total, method: pick(['CASH', 'UPI', 'CARD']) },
      receptionistId,
    )
    invoice = result.invoice
  } else if (paymentRoll < 0.8) {
    const partial = Math.round(invoice.total * 0.5 * 100) / 100
    const result = await invoiceService.recordPayment(clinicId, invoice._id, { amount: partial, method: 'CASH' }, receptionistId)
    invoice = result.invoice
  }
  // else: left PENDING, no payment recorded - a realistic outstanding bill.

  return { appointment, consultation, invoice }
}

async function seedTodayAppointment({ clinicId, doctor, receptionistId, patient, hour, targetStatus }) {
  let appointment = await appointmentService.createAppointment(
    clinicId,
    { patientId: patient._id, doctorId: doctor._id, scheduledAt: todayAt(hour), durationMinutes: 15 },
    receptionistId,
  )
  if (targetStatus === 'WAITING' || targetStatus === 'IN_CONSULTATION') {
    appointment = await appointmentService.markArrived(clinicId, appointment._id)
  }
  if (targetStatus === 'IN_CONSULTATION') {
    appointment = await appointmentService.callNextIntoConsultation(clinicId, appointment._id)
  }
  return appointment
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

async function main() {
  assertSafeToRun()

  await connectDB()
  console.log(`Connected to ${env.mongodbUri}`)

  await clearDatabase()

  const { clinic, owner } = await seedClinicAndOwner()
  const { doctor, receptionist } = await seedStaff(clinic._id, owner.role)
  console.log(`Created clinic "${clinic.name}" with Owner/Doctor/Receptionist.`)

  // 10 patients get one completed past visit each (2 of them get a second,
  // more recent one too - a realistic returning-patient history), 6 have an
  // appointment today in various queue states, and 2 are registered with no
  // visit yet - 18 total, spanning the whole "patient lifecycle".
  const patients = await seedPatients(clinic._id, receptionist._id, 18)
  const pastVisitPatients = patients.slice(0, 10)
  const todayPatients = patients.slice(10, 16)
  // patients.slice(16, 18) intentionally left with no appointment at all.

  console.log(`Registered ${patients.length} patients.`)

  // One doctor, so every past visit needs its own distinct day+hour slot -
  // 12 needed (10 initial + 2 returning-patient second visits), drawn from
  // a much larger shuffled pool so they're guaranteed not to collide.
  const pastSlots = shuffledSlots([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], [9, 10, 11, 13, 14, 15, 16])
  let slotIndex = 0
  let visitCount = 0

  for (const [index, patient] of pastVisitPatients.entries()) {
    const slot = pastSlots[slotIndex++]
    await seedPastVisit({
      clinicId: clinic._id,
      doctor,
      receptionistId: receptionist._id,
      patient,
      daysAgo: slot.daysAgo,
      hour: slot.hour,
      clinic,
      withFollowUp: index < 2,
    })
    visitCount += 1
  }
  // Two returning patients get a second, more recent visit.
  for (const patient of pastVisitPatients.slice(0, 2)) {
    const slot = pastSlots[slotIndex++]
    await seedPastVisit({
      clinicId: clinic._id,
      doctor,
      receptionistId: receptionist._id,
      patient,
      daysAgo: slot.daysAgo,
      hour: slot.hour,
      clinic,
      withFollowUp: false,
    })
    visitCount += 1
  }
  console.log(`Created ${visitCount} completed past visits (consultation + invoice + payment).`)

  const todayStatuses = ['BOOKED', 'BOOKED', 'WAITING', 'WAITING', 'IN_CONSULTATION', 'BOOKED']
  const todayHours = [9, 10, 11, 12, 13, 16]
  for (const [i, patient] of todayPatients.entries()) {
    await seedTodayAppointment({
      clinicId: clinic._id,
      doctor,
      receptionistId: receptionist._id,
      patient,
      hour: todayHours[i],
      targetStatus: todayStatuses[i],
    })
  }
  console.log(`Created ${todayPatients.length} appointments for today (queue: 1 in consultation, 2 waiting, 3 booked).`)

  console.log('\nSeed complete. Demo logins (password for all three: ' + DEMO_PASSWORD + '):')
  console.log(`  Owner:        owner@${DEMO_EMAIL_DOMAIN}`)
  console.log(`  Doctor:       doctor@${DEMO_EMAIL_DOMAIN}`)
  console.log(`  Receptionist: receptionist@${DEMO_EMAIL_DOMAIN}`)

  await disconnectDB()
  process.exit(0) // explicit, prompt exit - don't rely on the event loop draining on its own
}

main().catch(async (err) => {
  console.error('Seed failed:', err)
  await disconnectDB().catch(() => {})
  process.exit(1)
})
