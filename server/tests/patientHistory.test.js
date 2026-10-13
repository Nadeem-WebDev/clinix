import { createApp } from '../src/app.js'
import { connectTestDB, clearTestDB, disconnectTestDB } from './testDb.js'
import { registerClinicAgent, createStaffAgent } from './helpers.js'
import { dateStrOf } from '../src/utils/dateRange.js'

const app = createApp()

beforeAll(async () => {
  await connectTestDB()
})

afterEach(async () => {
  await clearTestDB()
})

afterAll(async () => {
  await disconnectTestDB()
})

// The clinic's today (new clinics default to Asia/Kolkata), not UTC's -
// they differ for 5.5 hours every evening.
const TODAY = dateStrOf(new Date(), 'Asia/Kolkata')
let phoneCounter = 0

async function setupClinic() {
  const { agent: ownerAgent } = await registerClinicAgent(app)
  const { agent: doctorAgent, email: doctorEmail } = await createStaffAgent(app, ownerAgent, 'doctor')
  const { agent: receptionistAgent } = await createStaffAgent(app, ownerAgent, 'receptionist')
  const { agent: nurseAgent } = await createStaffAgent(app, ownerAgent, 'nurse')
  const doctor = (await ownerAgent.get('/api/v1/users')).body.data.staff.find((u) => u.email === doctorEmail)
  const newPatient = async (fullName = 'Rahul Sharma') =>
    (
      await ownerAgent.post('/api/v1/patients').send({ fullName, age: 34, gender: 'male', phone: `98765${String(++phoneCounter).padStart(5, '0')}` })
    ).body.data.patient
  return { ownerAgent, doctorAgent, receptionistAgent, nurseAgent, doctor, newPatient }
}

// A full visit the way the app records one: booked, arrived, called in,
// consulted (with a follow-up), prescribed, completed, billed against it.
async function fullVisit({ ownerAgent, doctorAgent, doctor }, patient, { scheduledAt, followUpDate }) {
  const appt = (
    await ownerAgent.post('/api/v1/appointments').send({ patientId: patient._id, doctorId: doctor._id, scheduledAt })
  ).body.data.appointment
  await ownerAgent.post(`/api/v1/appointments/${appt._id}/arrive`)
  await doctorAgent.post(`/api/v1/appointments/${appt._id}/call`)
  const consultation = (
    await doctorAgent.post('/api/v1/consultations').send({
      patientId: patient._id,
      doctorId: doctor._id,
      appointmentId: appt._id,
      diagnosis: 'Viral fever',
      followUpDate,
      followUpInstructions: 'Review blood report',
    })
  ).body.data.consultation
  await doctorAgent.post('/api/v1/prescriptions').send({
    doctorId: doctor._id,
    patientId: patient._id,
    consultationId: consultation._id,
    medicines: [{ name: 'Paracetamol', dosage: '500mg', frequency: '1-0-1', duration: '3 days' }],
  })
  await doctorAgent.post(`/api/v1/appointments/${appt._id}/complete`)
  const invoice = (
    await ownerAgent.post('/api/v1/invoices').send({
      patientId: patient._id,
      appointmentId: appt._id,
      items: [{ description: 'Consultation fee', quantity: 1, unitPrice: 500 }],
    })
  ).body.data.invoice
  return { appt, consultation, invoice }
}

async function standaloneConsultation({ doctorAgent, doctor }, patient, extra = {}) {
  return (
    await doctorAgent.post('/api/v1/consultations').send({ patientId: patient._id, doctorId: doctor._id, diagnosis: 'Cough', ...extra })
  ).body.data.consultation
}

describe('patient visits timeline', () => {
  it('gives clinical staff one entry per visit with diagnosis and prescription, newest first', async () => {
    const ctx = await setupClinic()
    const patient = await ctx.newPatient()
    const { appt } = await fullVisit(ctx, patient, { scheduledAt: '2026-09-01T09:00:00.000Z', followUpDate: '2026-09-08' })
    // A future booking is an appointment, not a visit.
    await ctx.ownerAgent.post('/api/v1/appointments').send({ patientId: patient._id, doctorId: ctx.doctor._id, scheduledAt: '2099-01-01T09:00:00.000Z' })
    await standaloneConsultation(ctx, patient)

    const res = await ctx.doctorAgent.get(`/api/v1/patients/${patient._id}/visits`)

    expect(res.status).toBe(200)
    const visits = res.body.data.visits
    expect(visits).toHaveLength(2)
    // Newest first: today's consultation without an appointment, then the September visit.
    expect(visits[0].status).toBeNull()
    expect(visits[0].consultation.diagnosis).toBe('Cough')
    expect(visits[1].key).toBe(`appointment-${appt._id}`)
    expect(visits[1].status).toBe('COMPLETED')
    expect(visits[1].consultation.diagnosis).toBe('Viral fever')
    expect(visits[1].prescriptions).toEqual([expect.objectContaining({ finalized: false, medicineCount: 1 })])
    // Doctors don't get billing, same as the Billing tab.
    expect(visits.every((v) => v.invoices.length === 0)).toBe(true)
  })

  it('gives the front desk bills but no clinical detail, matching unlinked bills by day', async () => {
    const ctx = await setupClinic()
    const patient = await ctx.newPatient()
    const { invoice: linked } = await fullVisit(ctx, patient, { scheduledAt: '2026-09-01T09:00:00.000Z' })
    await standaloneConsultation(ctx, patient)
    // Raised from the Billing page: no appointment/consultation link.
    const unlinked = (
      await ctx.ownerAgent.post('/api/v1/invoices').send({ patientId: patient._id, items: [{ description: 'Dressing', quantity: 1, unitPrice: 100 }] })
    ).body.data.invoice

    const res = await ctx.receptionistAgent.get(`/api/v1/patients/${patient._id}/visits`)

    const [today, september] = res.body.data.visits
    expect(september.invoices.map((i) => i.id)).toEqual([linked._id])
    expect(today.invoices.map((i) => i.id)).toEqual([unlinked._id])
    for (const visit of res.body.data.visits) {
      expect(visit.consultation).toEqual({ recorded: true })
      expect(visit.prescriptions).toEqual([])
    }
    expect(JSON.stringify(res.body)).not.toContain('Viral fever')
  })

  it('shows a bill with no visit that day as its own entry', async () => {
    const ctx = await setupClinic()
    const patient = await ctx.newPatient()
    await ctx.ownerAgent.post('/api/v1/invoices').send({ patientId: patient._id, items: [{ description: 'Dressing', quantity: 1, unitPrice: 100 }] })

    const res = await ctx.receptionistAgent.get(`/api/v1/patients/${patient._id}/visits`)

    expect(res.body.data.visits).toHaveLength(1)
    expect(res.body.data.visits[0]).toMatchObject({ billOnly: true, doctor: null })
  })

  it('lets nurses see the timeline without clinical or billing detail', async () => {
    const ctx = await setupClinic()
    const patient = await ctx.newPatient()
    await fullVisit(ctx, patient, { scheduledAt: '2026-09-01T09:00:00.000Z' })

    const res = await ctx.nurseAgent.get(`/api/v1/patients/${patient._id}/visits`)

    expect(res.status).toBe(200)
    const [visit] = res.body.data.visits
    expect(visit.consultation).toEqual({ recorded: true })
    expect(visit.prescriptions).toEqual([])
    expect(visit.invoices).toEqual([])
  })

  it('404s for a patient from another clinic', async () => {
    const ctx = await setupClinic()
    const other = await setupClinic()
    const theirPatient = await other.newPatient()

    expect((await ctx.ownerAgent.get(`/api/v1/patients/${theirPatient._id}/visits`)).status).toBe(404)
    expect((await ctx.ownerAgent.get(`/api/v1/patients/${theirPatient._id}/follow-ups`)).status).toBe(404)
  })
})

describe('patient follow-ups', () => {
  it('marks each follow-up overdue, due today, upcoming or done', async () => {
    const ctx = await setupClinic()
    const overdue = await ctx.newPatient('Overdue Patient')
    const dueToday = await ctx.newPatient('Due Today')
    const upcoming = await ctx.newPatient('Upcoming Patient')
    const seenAgain = await ctx.newPatient('Seen Again')
    await standaloneConsultation(ctx, overdue, { followUpDate: '2026-01-05' })
    await standaloneConsultation(ctx, dueToday, { followUpDate: TODAY })
    await standaloneConsultation(ctx, upcoming, { followUpDate: '2099-01-05', followUpInstructions: 'Bring X-ray' })
    await standaloneConsultation(ctx, seenAgain, { followUpDate: '2026-01-05' })
    await standaloneConsultation(ctx, seenAgain) // a later visit

    const statusFor = async (p) => (await ctx.doctorAgent.get(`/api/v1/patients/${p._id}/follow-ups`)).body.data.followUps
    expect((await statusFor(overdue))[0].status).toBe('overdue')
    expect((await statusFor(dueToday))[0].status).toBe('due_today')
    const [up] = await statusFor(upcoming)
    expect(up).toMatchObject({ status: 'upcoming', instructions: 'Bring X-ray', doctor: { name: expect.any(String) } })
    expect(up.consultationId).toBeTruthy()
    expect((await statusFor(seenAgain))[0].status).toBe('done')
  })

  it('judges "seen again" by visit date, not by when notes were written', async () => {
    const ctx = await setupClinic()
    const patient = await ctx.newPatient()
    // The October visit's notes (with a follow-up) are entered first...
    const { consultation } = await fullVisit(ctx, patient, { scheduledAt: '2026-10-09T09:00:00.000Z', followUpDate: '2099-01-05' })
    // ...then an older September visit is written up afterwards.
    await fullVisit(ctx, patient, { scheduledAt: '2026-09-01T09:00:00.000Z' })

    const res = await ctx.doctorAgent.get(`/api/v1/patients/${patient._id}/follow-ups`)

    const october = res.body.data.followUps.find((f) => f.consultationId === consultation._id)
    expect(october.status).toBe('upcoming')
    expect(october.setOn).toBe('2026-10-09T09:00:00.000Z')
  })

  it('lists open follow-ups before done ones', async () => {
    const ctx = await setupClinic()
    const patient = await ctx.newPatient()
    await standaloneConsultation(ctx, patient, { followUpDate: '2026-01-05' }) // done: a later consultation follows
    await standaloneConsultation(ctx, patient, { followUpDate: '2099-01-05' }) // upcoming

    const res = await ctx.doctorAgent.get(`/api/v1/patients/${patient._id}/follow-ups`)

    expect(res.body.data.followUps.map((f) => f.status)).toEqual(['upcoming', 'done'])
  })

  it('gives receptionists the dates only, and nurses nothing', async () => {
    const ctx = await setupClinic()
    const patient = await ctx.newPatient()
    await standaloneConsultation(ctx, patient, { followUpDate: '2099-01-05', followUpInstructions: 'Bring X-ray' })

    const reception = await ctx.receptionistAgent.get(`/api/v1/patients/${patient._id}/follow-ups`)
    expect(reception.status).toBe(200)
    const [f] = reception.body.data.followUps
    expect(f).toMatchObject({ status: 'upcoming' })
    expect(f).not.toHaveProperty('instructions')
    expect(f).not.toHaveProperty('consultationId')
    expect(JSON.stringify(reception.body)).not.toContain('Bring X-ray')

    expect((await ctx.nurseAgent.get(`/api/v1/patients/${patient._id}/follow-ups`)).status).toBe(403)
  })
})
