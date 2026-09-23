import { createApp } from '../src/app.js'
import { connectTestDB, clearTestDB, disconnectTestDB } from './testDb.js'
import { registerClinicAgent, createStaffAgent } from './helpers.js'

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

async function setupClinic(overrides = {}) {
  const { agent: adminAgent, clinic } = await registerClinicAgent(app, overrides)
  const { agent: doctorAgent, email: doctorEmail } = await createStaffAgent(app, adminAgent, 'doctor')
  const { agent: receptionistAgent } = await createStaffAgent(app, adminAgent, 'receptionist')

  const doctorRes = await adminAgent.get('/api/v1/users')
  const doctor = doctorRes.body.data.staff.find((u) => u.email === doctorEmail)

  const patientRes = await adminAgent.post('/api/v1/patients').send({
    fullName: 'Rahul Sharma',
    age: 34,
    gender: 'male',
    phone: '9876543210',
  })
  const patient = patientRes.body.data.patient

  return { adminAgent, doctorAgent, receptionistAgent, clinic, doctor, patient }
}

function bookingPayload(doctor, patient, overrides = {}) {
  return {
    doctorId: doctor._id,
    patientId: patient._id,
    scheduledAt: '2026-09-01T09:00:00.000Z',
    durationMinutes: 15,
    ...overrides,
  }
}

describe('creating appointments', () => {
  it('assigns sequential per-doctor-per-day tokens', async () => {
    const { adminAgent, doctor, patient } = await setupClinic()

    const first = await adminAgent.post('/api/v1/appointments').send(bookingPayload(doctor, patient))
    const second = await adminAgent
      .post('/api/v1/appointments')
      .send(bookingPayload(doctor, patient, { scheduledAt: '2026-09-01T09:30:00.000Z' }))

    expect(first.status).toBe(201)
    expect(first.body.data.appointment.tokenNumber).toBe(1)
    expect(second.body.data.appointment.tokenNumber).toBe(2)
  })

  it('rejects an overlapping booking for the same doctor (double-booking)', async () => {
    const { adminAgent, doctor, patient } = await setupClinic()

    await adminAgent.post('/api/v1/appointments').send(bookingPayload(doctor, patient))
    const overlapping = await adminAgent.post('/api/v1/appointments').send(
      bookingPayload(doctor, patient, { scheduledAt: '2026-09-01T09:10:00.000Z' }),
    )

    expect(overlapping.status).toBe(409)
    expect(overlapping.body.code).toBe('DOUBLE_BOOKED')
  })

  it('allows back-to-back non-overlapping bookings', async () => {
    const { adminAgent, doctor, patient } = await setupClinic()

    await adminAgent.post('/api/v1/appointments').send(bookingPayload(doctor, patient))
    const backToBack = await adminAgent
      .post('/api/v1/appointments')
      .send(bookingPayload(doctor, patient, { scheduledAt: '2026-09-01T09:15:00.000Z' }))

    expect(backToBack.status).toBe(201)
  })

  it('rejects a doctorId that is not actually a doctor in this clinic', async () => {
    const { adminAgent, patient } = await setupClinic()
    const receptionistUser = (await adminAgent.get('/api/v1/users')).body.data.staff.find(
      (u) => u.role === 'receptionist',
    )

    const res = await adminAgent
      .post('/api/v1/appointments')
      .send(bookingPayload({ _id: receptionistUser._id }, patient))

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('DOCTOR_NOT_FOUND')
  })

  it('forbids a doctor from booking appointments (front-desk action only)', async () => {
    const { doctorAgent, doctor, patient } = await setupClinic()

    const res = await doctorAgent.post('/api/v1/appointments').send(bookingPayload(doctor, patient))

    expect(res.status).toBe(403)
  })
})

describe('tenant isolation', () => {
  it('404s when acting on another clinic\'s appointment', async () => {
    const clinicA = await setupClinic({ email: 'admin-a@iso.test' })
    const clinicB = await setupClinic({ email: 'admin-b@iso.test' })

    const created = await clinicA.adminAgent
      .post('/api/v1/appointments')
      .send(bookingPayload(clinicA.doctor, clinicA.patient))
    const id = created.body.data.appointment._id

    const res = await clinicB.adminAgent.get(`/api/v1/appointments/${id}`)
    expect(res.status).toBe(404)
  })

  it('rejects a patient from a different clinic', async () => {
    const clinicA = await setupClinic({ email: 'admin-a2@iso.test' })
    const clinicB = await setupClinic({ email: 'admin-b2@iso.test' })

    const res = await clinicA.adminAgent
      .post('/api/v1/appointments')
      .send(bookingPayload(clinicA.doctor, clinicB.patient))

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('PATIENT_NOT_FOUND')
  })
})

describe('status lifecycle', () => {
  it('walks BOOKED -> WAITING -> IN_CONSULTATION -> COMPLETED', async () => {
    const { adminAgent, doctorAgent, doctor, patient } = await setupClinic()
    const created = await adminAgent.post('/api/v1/appointments').send(bookingPayload(doctor, patient))
    const id = created.body.data.appointment._id

    const arrived = await adminAgent.post(`/api/v1/appointments/${id}/arrive`)
    expect(arrived.body.data.appointment.status).toBe('WAITING')

    const called = await doctorAgent.post(`/api/v1/appointments/${id}/call`)
    expect(called.body.data.appointment.status).toBe('IN_CONSULTATION')

    const completed = await doctorAgent.post(`/api/v1/appointments/${id}/complete`)
    expect(completed.body.data.appointment.status).toBe('COMPLETED')
  })

  it('rejects calling a patient in before they have arrived', async () => {
    const { doctorAgent, adminAgent, doctor, patient } = await setupClinic()
    const created = await adminAgent.post('/api/v1/appointments').send(bookingPayload(doctor, patient))
    const id = created.body.data.appointment._id

    const res = await doctorAgent.post(`/api/v1/appointments/${id}/call`)
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_TRANSITION')
  })

  it('forbids a receptionist from calling the next patient (doctor/admin action)', async () => {
    const { adminAgent, receptionistAgent, doctor, patient } = await setupClinic()
    const created = await adminAgent.post('/api/v1/appointments').send(bookingPayload(doctor, patient))
    const id = created.body.data.appointment._id
    await adminAgent.post(`/api/v1/appointments/${id}/arrive`)

    const res = await receptionistAgent.post(`/api/v1/appointments/${id}/call`)
    expect(res.status).toBe(403)
  })

  it('cannot cancel a completed appointment', async () => {
    const { adminAgent, doctorAgent, doctor, patient } = await setupClinic()
    const created = await adminAgent.post('/api/v1/appointments').send(bookingPayload(doctor, patient))
    const id = created.body.data.appointment._id
    await adminAgent.post(`/api/v1/appointments/${id}/arrive`)
    await doctorAgent.post(`/api/v1/appointments/${id}/call`)
    await doctorAgent.post(`/api/v1/appointments/${id}/complete`)

    const res = await adminAgent.post(`/api/v1/appointments/${id}/cancel`)
    expect(res.status).toBe(400)
  })
})

describe('OPD queue', () => {
  it('orders the queue by token, with skipped patients sorted last', async () => {
    const { adminAgent, doctor, patient } = await setupClinic()

    const first = await adminAgent.post('/api/v1/appointments').send(bookingPayload(doctor, patient))
    const second = await adminAgent
      .post('/api/v1/appointments')
      .send(bookingPayload(doctor, patient, { scheduledAt: '2026-09-01T09:30:00.000Z' }))
    const third = await adminAgent
      .post('/api/v1/appointments')
      .send(bookingPayload(doctor, patient, { scheduledAt: '2026-09-01T10:00:00.000Z' }))

    for (const created of [first, second, third]) {
      await adminAgent.post(`/api/v1/appointments/${created.body.data.appointment._id}/arrive`)
    }
    await adminAgent.post(`/api/v1/appointments/${first.body.data.appointment._id}/skip`)

    const queue = await adminAgent
      .get('/api/v1/appointments/queue')
      .query({ doctorId: doctor._id, date: '2026-09-01' })

    const tokens = queue.body.data.appointments.map((a) => a.tokenNumber)
    expect(tokens).toEqual([2, 3, 1]) // token 1 was skipped, sorts last
  })
})
