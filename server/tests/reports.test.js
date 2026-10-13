import mongoose from 'mongoose'
import { createApp } from '../src/app.js'
import { connectTestDB, clearTestDB, disconnectTestDB } from './testDb.js'
import { registerClinicAgent, createStaffAgent } from './helpers.js'
import { Patient } from '../src/models/Patient.js'
import { Payment } from '../src/models/Payment.js'
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

async function makePatient(agent, overrides = {}) {
  const res = await agent.post('/api/v1/patients').send({
    fullName: 'Rahul Sharma',
    age: 34,
    gender: 'male',
    phone: '9876543210',
    ...overrides,
  })
  return res.body.data.patient
}

describe('patient report', () => {
  it('counts total/new/returning patients over the default range', async () => {
    const { agent: adminAgent } = await registerClinicAgent(app)
    await makePatient(adminAgent, { phone: '9111111111' })
    const oldPatient = await makePatient(adminAgent, { phone: '9222222222', fullName: 'Old Timer' })
    // Beyond the default 30-day report window, so this one only shows up
    // via a fresh appointment below, not as a "new" registration - that's
    // what should make them count as "returning". Mongoose's timestamps
    // plugin treats createdAt as write-once and strips it from any update
    // query, so this has to go through the raw driver collection.
    await Patient.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(oldPatient._id) },
      { $set: { createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) } },
    )

    const { email: doctorEmail } = await createStaffAgent(app, adminAgent, 'doctor')
    const doctor = (await adminAgent.get('/api/v1/users')).body.data.staff.find((u) => u.email === doctorEmail)
    // The old patient shows up in this range via a fresh appointment, not
    // a fresh registration - that's what makes them "returning".
    await adminAgent.post('/api/v1/appointments').send({
      doctorId: doctor._id,
      patientId: oldPatient._id,
      scheduledAt: new Date().toISOString(),
      durationMinutes: 15,
    })

    const res = await adminAgent.get('/api/v1/reports/patients')
    expect(res.status).toBe(200)
    expect(res.body.data.totalPatients).toBe(2)
    expect(res.body.data.newPatients).toBe(1) // only doctorPatient registered within the window
    expect(res.body.data.returningPatients).toBe(1) // oldPatient: pre-existing, but active in-window
  })
})

describe('appointment report', () => {
  it('breaks down totals by status and by doctor', async () => {
    const { agent: adminAgent } = await registerClinicAgent(app)
    const { email: doctorEmail } = await createStaffAgent(app, adminAgent, 'doctor')
    const doctor = (await adminAgent.get('/api/v1/users')).body.data.staff.find((u) => u.email === doctorEmail)
    const patient = await makePatient(adminAgent)

    const a = await adminAgent.post('/api/v1/appointments').send({
      doctorId: doctor._id,
      patientId: patient._id,
      scheduledAt: new Date().toISOString(),
      durationMinutes: 15,
    })
    const b = await adminAgent.post('/api/v1/appointments').send({
      doctorId: doctor._id,
      patientId: patient._id,
      scheduledAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      durationMinutes: 15,
    })
    await adminAgent.post(`/api/v1/appointments/${a.body.data.appointment._id}/cancel`)
    await adminAgent.post(`/api/v1/appointments/${b.body.data.appointment._id}/no-show`)

    const res = await adminAgent.get('/api/v1/reports/appointments')
    expect(res.body.data.total).toBe(2)
    expect(res.body.data.cancelled).toBe(1)
    expect(res.body.data.noShow).toBe(1)
    expect(res.body.data.byDoctor).toHaveLength(1)
    expect(res.body.data.byDoctor[0].count).toBe(2)
  })
})

describe('revenue report', () => {
  it('aggregates total, series, by-method, and by-doctor revenue', async () => {
    const { agent: adminAgent } = await registerClinicAgent(app)
    const { email: doctorEmail } = await createStaffAgent(app, adminAgent, 'doctor')
    const doctor = (await adminAgent.get('/api/v1/users')).body.data.staff.find((u) => u.email === doctorEmail)
    const patient = await makePatient(adminAgent)

    const invoice = await adminAgent.post('/api/v1/invoices').send({
      patientId: patient._id,
      doctorId: doctor._id,
      items: [{ description: 'Fee', quantity: 1, unitPrice: 500 }],
    })
    await adminAgent
      .post(`/api/v1/invoices/${invoice.body.data.invoice._id}/payments`)
      .send({ amount: 300, method: 'CASH' })
    await adminAgent
      .post(`/api/v1/invoices/${invoice.body.data.invoice._id}/payments`)
      .send({ amount: 200, method: 'UPI' })

    const res = await adminAgent.get('/api/v1/reports/revenue')
    expect(res.body.data.total).toBe(500)
    expect(res.body.data.series.reduce((s, p) => s + p.total, 0)).toBe(500)
    expect(res.body.data.byMethod.sort((a, b) => a.method.localeCompare(b.method))).toEqual([
      { method: 'CASH', total: 300 },
      { method: 'UPI', total: 200 },
    ])
    expect(res.body.data.byDoctor).toEqual([
      { doctorId: doctor._id, doctorName: doctor.name, total: 500 },
    ])
  })
})

// The clinic's calendar date (default zone Asia/Kolkata) for an instant.
const clinicDate = (date) => dateStrOf(date, 'Asia/Kolkata')

describe('refunds in the revenue report', () => {
  async function paidInvoice(agent, patient, doctor, payments) {
    const invoice = await agent.post('/api/v1/invoices').send({
      patientId: patient._id,
      doctorId: doctor._id,
      items: [{ description: 'Fee', quantity: 1, unitPrice: payments.reduce((s, p) => s + p.amount, 0) }],
    })
    const id = invoice.body.data.invoice._id
    for (const p of payments) await agent.post(`/api/v1/invoices/${id}/payments`).send(p)
    return id
  }

  it('nets a same-day refund out of the total, series, methods and doctors', async () => {
    const { agent: adminAgent } = await registerClinicAgent(app)
    const { email: doctorEmail } = await createStaffAgent(app, adminAgent, 'doctor')
    const doctor = (await adminAgent.get('/api/v1/users')).body.data.staff.find((u) => u.email === doctorEmail)
    const patient = await makePatient(adminAgent)

    await paidInvoice(adminAgent, patient, doctor, [{ amount: 400, method: 'CARD' }])
    const refunded = await paidInvoice(adminAgent, patient, doctor, [
      { amount: 300, method: 'CASH' },
      { amount: 200, method: 'UPI' },
    ])
    await adminAgent.post(`/api/v1/invoices/${refunded}/refund`)

    const res = await adminAgent.get('/api/v1/reports/revenue')
    expect(res.body.data.total).toBe(400)
    expect(res.body.data.series.reduce((s, p) => s + p.total, 0)).toBe(400)
    // CASH and UPI were fully given back, so they drop out rather than show 0.
    expect(res.body.data.byMethod).toEqual([{ method: 'CARD', total: 400 }])
    expect(res.body.data.byDoctor).toEqual([{ doctorId: doctor._id, doctorName: doctor.name, total: 400 }])
  })

  it('subtracts a refund on the day it happens, leaving the day of payment as it was', async () => {
    const { agent: adminAgent } = await registerClinicAgent(app)
    const { email: doctorEmail } = await createStaffAgent(app, adminAgent, 'doctor')
    const doctor = (await adminAgent.get('/api/v1/users')).body.data.staff.find((u) => u.email === doctorEmail)
    const patient = await makePatient(adminAgent)

    const id = await paidInvoice(adminAgent, patient, doctor, [{ amount: 500, method: 'CASH' }])
    // Paid three days ago, refunded today. paidAt is moved through the raw
    // driver, as the API always stamps a payment with the current time.
    const paidAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    await Payment.collection.updateOne(
      { invoiceId: new mongoose.Types.ObjectId(id) },
      { $set: { paidAt } },
    )
    await adminAgent.post(`/api/v1/invoices/${id}/refund`)

    const paidDay = clinicDate(paidAt)
    const today = clinicDate(new Date())

    const thatDay = await adminAgent.get(`/api/v1/reports/revenue?from=${paidDay}&to=${paidDay}`)
    expect(thatDay.body.data.total).toBe(500)

    const todayOnly = await adminAgent.get(`/api/v1/reports/revenue?from=${today}&to=${today}`)
    expect(todayOnly.body.data.total).toBe(-500)
    expect(todayOnly.body.data.byMethod).toEqual([{ method: 'CASH', total: -500 }])

    const both = await adminAgent.get(`/api/v1/reports/revenue?from=${paidDay}&to=${today}`)
    expect(both.body.data.total).toBe(0)
    expect(both.body.data.series).toEqual([
      { period: paidDay, total: 500 },
      { period: today, total: -500 },
    ])
  })
})

describe('role authorization and tenant isolation', () => {
  it('forbids non-admins from viewing any report', async () => {
    const { agent: adminAgent } = await registerClinicAgent(app)
    const { agent: receptionistAgent } = await createStaffAgent(app, adminAgent, 'receptionist')
    const { agent: doctorAgent } = await createStaffAgent(app, adminAgent, 'doctor')

    const r1 = await receptionistAgent.get('/api/v1/reports/patients')
    const r2 = await doctorAgent.get('/api/v1/reports/revenue')
    expect(r1.status).toBe(403)
    expect(r2.status).toBe(403)
  })

  it('never includes another clinic\'s revenue', async () => {
    const clinicA = await registerClinicAgent(app, { email: 'admin-a@iso.test' })
    const clinicB = await registerClinicAgent(app, { email: 'admin-b@iso.test' })

    const patientA = await makePatient(clinicA.agent)
    const invoice = await clinicA.agent.post('/api/v1/invoices').send({
      patientId: patientA._id,
      items: [{ description: 'Fee', quantity: 1, unitPrice: 999 }],
    })
    await clinicA.agent
      .post(`/api/v1/invoices/${invoice.body.data.invoice._id}/payments`)
      .send({ amount: 999, method: 'CASH' })

    const res = await clinicB.agent.get('/api/v1/reports/revenue')
    expect(res.body.data.total).toBe(0)
  })
})
