import { createApp } from '../src/app.js'
import { connectTestDB, clearTestDB, disconnectTestDB } from './testDb.js'
import { registerClinicAgent, createStaffAgent } from './helpers.js'
import { Appointment } from '../src/models/Appointment.js'

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
  it('assigns sequential per-day tokens', async () => {
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

describe('walk-ins', () => {
  const inMinutes = (m) => new Date(Date.now() + m * 60 * 1000).toISOString()

  it('puts a walk-in straight into today\'s queue as WAITING', async () => {
    const { receptionistAgent, adminAgent, doctor, patient } = await setupClinic()

    const res = await receptionistAgent
      .post('/api/v1/appointments/walk-in')
      .send({ patientId: patient._id, doctorId: doctor._id })

    expect(res.status).toBe(201)
    const appt = res.body.data.appointment
    expect(appt.status).toBe('WAITING')
    expect(appt.isWalkIn).toBe(true)
    expect(appt.arrivedAt).toBeTruthy()
    expect(appt.tokenNumber).toBe(1)

    const queue = await adminAgent.get(`/api/v1/appointments/queue?doctorId=${doctor._id}`)
    expect(queue.body.data.appointments.map((a) => a._id)).toContain(appt._id)
  })

  it('is not blocked by another patient booked in the current slot', async () => {
    const { adminAgent, doctor, patient } = await setupClinic()
    const other = (
      await adminAgent.post('/api/v1/patients').send({ fullName: 'Priya Shah', age: 29, gender: 'female', phone: '9876500001' })
    ).body.data.patient
    await adminAgent
      .post('/api/v1/appointments')
      .send(bookingPayload(doctor, other, { scheduledAt: inMinutes(1), durationMinutes: 30 }))

    const res = await adminAgent.post('/api/v1/appointments/walk-in').send({ patientId: patient._id, doctorId: doctor._id })

    expect(res.status).toBe(201)
    // One sequence for the day: the booking holds 1, the walk-in gets 2.
    expect(res.body.data.appointment.tokenNumber).toBe(2)
  })

  it('refuses to add the same patient to the queue twice', async () => {
    const { adminAgent, doctor, patient } = await setupClinic()
    const body = { patientId: patient._id, doctorId: doctor._id }

    await adminAgent.post('/api/v1/appointments/walk-in').send(body)
    const again = await adminAgent.post('/api/v1/appointments/walk-in').send(body)

    expect(again.status).toBe(409)
    expect(again.body.code).toBe('ALREADY_IN_QUEUE')
  })

  it('points at the existing booking when the patient is already booked today', async () => {
    const { adminAgent, doctor, patient } = await setupClinic()
    const booking = (
      await adminAgent.post('/api/v1/appointments').send(bookingPayload(doctor, patient, { scheduledAt: inMinutes(5) }))
    ).body.data.appointment

    const res = await adminAgent.post('/api/v1/appointments/walk-in').send({ patientId: patient._id, doctorId: doctor._id })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('BOOKED_TODAY')
    expect(res.body.details.appointmentId).toBe(booking._id)

    const arrived = await adminAgent.post(`/api/v1/appointments/${booking._id}/arrive`)
    expect(arrived.body.data.appointment.status).toBe('WAITING')
  })

  it('is a front-desk action: doctors and nurses cannot add walk-ins', async () => {
    const { adminAgent, doctorAgent, doctor, patient } = await setupClinic()
    const { agent: nurseAgent } = await createStaffAgent(app, adminAgent, 'nurse')
    const body = { patientId: patient._id, doctorId: doctor._id }

    expect((await doctorAgent.post('/api/v1/appointments/walk-in').send(body)).status).toBe(403)
    expect((await nurseAgent.post('/api/v1/appointments/walk-in').send(body)).status).toBe(403)
  })

  it('no longer lets an ordinary booking claim to be a walk-in', async () => {
    const { adminAgent, doctor, patient } = await setupClinic()

    const res = await adminAgent.post('/api/v1/appointments').send(bookingPayload(doctor, patient, { isWalkIn: true }))

    expect(res.status).toBe(201)
    expect(res.body.data.appointment.isWalkIn).toBe(false)
    expect(res.body.data.appointment.status).toBe('BOOKED')
  })
})

describe('token numbers', () => {
  async function secondDoctor(adminAgent) {
    const { email } = await createStaffAgent(app, adminAgent, 'doctor')
    return (await adminAgent.get('/api/v1/users')).body.data.staff.find((u) => u.email === email)
  }

  it('never gives two patients the same token on a day, even with different doctors', async () => {
    const { adminAgent, doctor, patient } = await setupClinic()
    const doctorB = await secondDoctor(adminAgent)
    const other = (
      await adminAgent.post('/api/v1/patients').send({ fullName: 'Priya Shah', age: 29, gender: 'female', phone: '9876500002' })
    ).body.data.patient

    // The reported case: a booking with one doctor, then walk-ins with each.
    const booked = await adminAgent.post('/api/v1/appointments').send(
      bookingPayload(doctor, patient, { scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() }),
    )
    const walkInB = await adminAgent.post('/api/v1/appointments/walk-in').send({ patientId: patient._id, doctorId: doctorB._id })
    const walkInA = await adminAgent.post('/api/v1/appointments/walk-in').send({ patientId: other._id, doctorId: doctor._id })

    const tokens = [booked, walkInB, walkInA].map((r) => r.body.data.appointment.tokenNumber)
    expect(tokens).toEqual([1, 2, 3])
  })

  it('starts again at 1 on a new day', async () => {
    const { adminAgent, doctor, patient } = await setupClinic()

    const day1 = await adminAgent.post('/api/v1/appointments').send(bookingPayload(doctor, patient))
    const day2 = await adminAgent
      .post('/api/v1/appointments')
      .send(bookingPayload(doctor, patient, { scheduledAt: '2026-09-02T09:00:00.000Z' }))

    expect(day1.body.data.appointment.tokenNumber).toBe(1)
    expect(day2.body.data.appointment.tokenNumber).toBe(1)
  })

  it('carries on after tokens already issued that day, so switching over never repeats one', async () => {
    const { adminAgent, clinic, doctor, patient } = await setupClinic()
    const doctorB = await secondDoctor(adminAgent)
    // Tokens issued under the old per-doctor numbering: both doctors had a 1.
    const base = { clinicId: clinic._id, patientId: patient._id, durationMinutes: 15, status: 'BOOKED' }
    await Appointment.create([
      { ...base, doctorId: doctor._id, scheduledAt: new Date('2026-09-01T08:00:00.000Z'), tokenNumber: 1 },
      { ...base, doctorId: doctorB._id, scheduledAt: new Date('2026-09-01T08:15:00.000Z'), tokenNumber: 1 },
      { ...base, doctorId: doctorB._id, scheduledAt: new Date('2026-09-01T08:30:00.000Z'), tokenNumber: 2 },
    ])

    const res = await adminAgent.post('/api/v1/appointments').send(bookingPayload(doctor, patient))

    expect(res.body.data.appointment.tokenNumber).toBe(3)
  })

  it('hands out distinct tokens to simultaneous bookings', async () => {
    const { adminAgent, doctor } = await setupClinic()
    const patients = await Promise.all(
      [0, 1, 2, 3, 4].map(async (i) =>
        (
          await adminAgent.post('/api/v1/patients').send({ fullName: `Patient ${i}`, age: 30, gender: 'male', phone: `98765100${i}0` })
        ).body.data.patient,
      ),
    )

    const results = await Promise.all(
      patients.map((p) => adminAgent.post('/api/v1/appointments/walk-in').send({ patientId: p._id, doctorId: doctor._id })),
    )

    const tokens = results.map((r) => r.body.data.appointment.tokenNumber).sort((a, b) => a - b)
    expect(tokens).toEqual([1, 2, 3, 4, 5])
  })

  it('gives a rescheduled appointment a token from its new day', async () => {
    const { adminAgent, doctor, patient } = await setupClinic()
    await adminAgent.post('/api/v1/appointments').send(bookingPayload(doctor, patient, { scheduledAt: '2026-09-02T09:00:00.000Z' }))
    const moving = (await adminAgent.post('/api/v1/appointments').send(bookingPayload(doctor, patient))).body.data.appointment

    const res = await adminAgent.patch(`/api/v1/appointments/${moving._id}`).send({ scheduledAt: '2026-09-02T10:00:00.000Z' })

    expect(res.body.data.appointment.tokenNumber).toBe(2)
  })
})
