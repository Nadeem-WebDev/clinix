import mongoose from 'mongoose'
import { createApp } from '../src/app.js'
import { connectTestDB, clearTestDB, disconnectTestDB } from './testDb.js'
import { registerClinicAgent, createStaffAgent } from './helpers.js'
import { Patient } from '../src/models/Patient.js'

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

describe('admin dashboard', () => {
  it('reflects today\'s appointments, patients, waiting count, and pending payments', async () => {
    const { agent: adminAgent } = await registerClinicAgent(app)
    const { email: doctorEmail } = await createStaffAgent(app, adminAgent, 'doctor')
    const doctor = (await adminAgent.get('/api/v1/users')).body.data.staff.find((u) => u.email === doctorEmail)

    const newPatient = await makePatient(adminAgent, { phone: '9111111111' })
    // Backdate this one so it counts as "returning" rather than "new" -
    // there's no API to set createdAt directly (by design), so the test
    // reaches into the model directly for this one setup step. Mongoose's
    // timestamps plugin treats createdAt as write-once and silently strips
    // it from any update query, so this has to go through the raw driver
    // collection to actually bypass that.
    const returningPatient = await makePatient(adminAgent, { phone: '9222222222', fullName: 'Old Timer' })
    await Patient.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(returningPatient._id) },
      { $set: { createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) } },
    )

    const now = new Date().toISOString()
    await adminAgent.post('/api/v1/appointments').send({
      doctorId: doctor._id,
      patientId: newPatient._id,
      scheduledAt: now,
      durationMinutes: 15,
    })
    const apptB = await adminAgent.post('/api/v1/appointments').send({
      doctorId: doctor._id,
      patientId: returningPatient._id,
      scheduledAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
      durationMinutes: 15,
    })
    await adminAgent.post(`/api/v1/appointments/${apptB.body.data.appointment._id}/arrive`)

    const invoice = await adminAgent.post('/api/v1/invoices').send({
      patientId: newPatient._id,
      items: [{ description: 'Fee', quantity: 1, unitPrice: 500 }],
    })
    await adminAgent
      .post(`/api/v1/invoices/${invoice.body.data.invoice._id}/payments`)
      .send({ amount: 200, method: 'CASH' })

    const res = await adminAgent.get('/api/v1/dashboard')
    const dash = res.body.data

    expect(dash.role).toBe('admin')
    expect(dash.todayAppointments).toBe(2)
    expect(dash.todayPatients).toBe(2)
    expect(dash.newPatients).toBe(1)
    expect(dash.returningPatients).toBe(1)
    expect(dash.waitingPatients).toBe(1)
    expect(dash.todayRevenue).toBe(200)
    expect(dash.pendingPayments.count).toBe(1)
    expect(dash.pendingPayments.amount).toBe(300)
  })
})

describe('doctor dashboard', () => {
  it('only reflects that doctor\'s own queue, not other doctors\'', async () => {
    const { agent: adminAgent } = await registerClinicAgent(app)
    const { agent: doctorAAgent, email: doctorAEmail } = await createStaffAgent(app, adminAgent, 'doctor')
    const { email: doctorBEmail } = await createStaffAgent(app, adminAgent, 'doctor')
    const staff = (await adminAgent.get('/api/v1/users')).body.data.staff
    const doctorA = staff.find((u) => u.email === doctorAEmail)
    const doctorB = staff.find((u) => u.email === doctorBEmail)

    const patient = await makePatient(adminAgent)
    const apptA = await adminAgent.post('/api/v1/appointments').send({
      doctorId: doctorA._id,
      patientId: patient._id,
      scheduledAt: new Date().toISOString(),
      durationMinutes: 15,
    })
    await adminAgent.post(`/api/v1/appointments/${apptA.body.data.appointment._id}/arrive`)

    await adminAgent.post('/api/v1/appointments').send({
      doctorId: doctorB._id,
      patientId: patient._id,
      scheduledAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      durationMinutes: 15,
    })

    const res = await doctorAAgent.get('/api/v1/dashboard')
    expect(res.body.data.role).toBe('doctor')
    expect(res.body.data.todayAppointments).toBe(1)
    expect(res.body.data.waitingPatients).toBe(1)
    expect(res.body.data.nextPatient.patientId.fullName).toBe('Rahul Sharma')
  })
})

describe('receptionist dashboard', () => {
  it('returns a front-desk snapshot without revenue fields', async () => {
    const { agent: adminAgent } = await registerClinicAgent(app)
    const { agent: receptionistAgent } = await createStaffAgent(app, adminAgent, 'receptionist')

    const res = await receptionistAgent.get('/api/v1/dashboard')
    expect(res.body.data.role).toBe('receptionist')
    expect(res.body.data).not.toHaveProperty('todayRevenue')
    expect(res.body.data).toHaveProperty('todayAppointmentsList')
  })
})

describe('tenant isolation', () => {
  it('never mixes another clinic\'s activity into the dashboard', async () => {
    const clinicA = await registerClinicAgent(app, { email: 'admin-a@iso.test' })
    const clinicB = await registerClinicAgent(app, { email: 'admin-b@iso.test' })

    const { email: doctorEmailA } = await createStaffAgent(app, clinicA.agent, 'doctor')
    const doctorA = (await clinicA.agent.get('/api/v1/users')).body.data.staff.find(
      (u) => u.email === doctorEmailA,
    )
    const patientA = await makePatient(clinicA.agent)
    await clinicA.agent.post('/api/v1/appointments').send({
      doctorId: doctorA._id,
      patientId: patientA._id,
      scheduledAt: new Date().toISOString(),
      durationMinutes: 15,
    })

    const res = await clinicB.agent.get('/api/v1/dashboard')
    expect(res.body.data.todayAppointments).toBe(0)
    expect(res.body.data.todayPatients).toBe(0)
  })
})
