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
  const { agent: adminAgent } = await registerClinicAgent(app, overrides)
  const { agent: doctorAgent, email: doctorEmail } = await createStaffAgent(app, adminAgent, 'doctor')
  const { agent: receptionistAgent } = await createStaffAgent(app, adminAgent, 'receptionist')
  const { agent: nurseAgent } = await createStaffAgent(app, adminAgent, 'nurse')

  const doctor = (await adminAgent.get('/api/v1/users')).body.data.staff.find((u) => u.email === doctorEmail)

  const patientRes = await adminAgent.post('/api/v1/patients').send({
    fullName: 'Rahul Sharma',
    age: 34,
    gender: 'male',
    phone: '9876543210',
  })
  const patient = patientRes.body.data.patient

  return { adminAgent, doctorAgent, receptionistAgent, nurseAgent, doctor, patient }
}

function basePayload(doctor, patient, overrides = {}) {
  return {
    doctorId: doctor._id,
    patientId: patient._id,
    chiefComplaint: 'Fever and cough',
    vitals: { temperature: '99.5F', bloodPressure: '120/80', pulse: '78' },
    diagnosis: 'Common cold',
    ...overrides,
  }
}

describe('creating consultations', () => {
  it('creates a consultation with vitals and clinical fields (no appointment)', async () => {
    const { doctorAgent, doctor, patient } = await setupClinic()

    const res = await doctorAgent.post('/api/v1/consultations').send(basePayload(doctor, patient))

    expect(res.status).toBe(201)
    expect(res.body.data.consultation.diagnosis).toBe('Common cold')
    expect(res.body.data.consultation.vitals.bloodPressure).toBe('120/80')
  })

  it('links to a matching appointment when appointmentId is given', async () => {
    const { adminAgent, doctorAgent, doctor, patient } = await setupClinic()
    const appt = await adminAgent.post('/api/v1/appointments').send({
      doctorId: doctor._id,
      patientId: patient._id,
      scheduledAt: '2026-09-01T09:00:00.000Z',
      durationMinutes: 15,
    })

    const res = await doctorAgent
      .post('/api/v1/consultations')
      .send(basePayload(doctor, patient, { appointmentId: appt.body.data.appointment._id }))

    expect(res.status).toBe(201)
    expect(res.body.data.consultation.appointmentId).toBe(appt.body.data.appointment._id)
  })

  it('rejects an appointmentId that belongs to a different patient', async () => {
    const { adminAgent, doctorAgent, doctor, patient } = await setupClinic()
    const otherPatientRes = await adminAgent.post('/api/v1/patients').send({
      fullName: 'Someone Else',
      age: 40,
      gender: 'female',
      phone: '9999999999',
    })
    const appt = await adminAgent.post('/api/v1/appointments').send({
      doctorId: doctor._id,
      patientId: otherPatientRes.body.data.patient._id,
      scheduledAt: '2026-09-01T09:00:00.000Z',
      durationMinutes: 15,
    })

    const res = await doctorAgent
      .post('/api/v1/consultations')
      .send(basePayload(doctor, patient, { appointmentId: appt.body.data.appointment._id }))

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('APPOINTMENT_MISMATCH')
  })

  it('rejects a doctorId that is not actually a doctor', async () => {
    const { adminAgent, doctorAgent, patient } = await setupClinic()
    const receptionistUser = (await adminAgent.get('/api/v1/users')).body.data.staff.find(
      (u) => u.role === 'receptionist',
    )

    const res = await doctorAgent
      .post('/api/v1/consultations')
      .send(basePayload({ _id: receptionistUser._id }, patient))

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('DOCTOR_NOT_FOUND')
  })

  it('forbids receptionists and nurses from creating or viewing consultations', async () => {
    const { receptionistAgent, nurseAgent, doctor, patient } = await setupClinic()

    const receptionistRes = await receptionistAgent
      .post('/api/v1/consultations')
      .send(basePayload(doctor, patient))
    const nurseListRes = await nurseAgent.get('/api/v1/consultations')

    expect(receptionistRes.status).toBe(403)
    expect(nurseListRes.status).toBe(403)
  })
})

describe('tenant isolation', () => {
  it('404s for a consultation belonging to another clinic', async () => {
    const clinicA = await setupClinic({ email: 'admin-a@iso.test' })
    const clinicB = await setupClinic({ email: 'admin-b@iso.test' })

    const created = await clinicA.doctorAgent
      .post('/api/v1/consultations')
      .send(basePayload(clinicA.doctor, clinicA.patient))

    const res = await clinicB.doctorAgent.get(`/api/v1/consultations/${created.body.data.consultation._id}`)
    expect(res.status).toBe(404)
  })
})

describe('editing and finalization', () => {
  it('allows edits while the linked appointment is not completed', async () => {
    const { adminAgent, doctorAgent, doctor, patient } = await setupClinic()
    const appt = await adminAgent.post('/api/v1/appointments').send({
      doctorId: doctor._id,
      patientId: patient._id,
      scheduledAt: '2026-09-01T09:00:00.000Z',
      durationMinutes: 15,
    })
    const created = await doctorAgent
      .post('/api/v1/consultations')
      .send(basePayload(doctor, patient, { appointmentId: appt.body.data.appointment._id }))

    const res = await doctorAgent
      .patch(`/api/v1/consultations/${created.body.data.consultation._id}`)
      .send({ diagnosis: 'Updated diagnosis' })

    expect(res.status).toBe(200)
    expect(res.body.data.consultation.diagnosis).toBe('Updated diagnosis')
  })

  it('blocks edits once the linked appointment is completed', async () => {
    const { adminAgent, doctorAgent, doctor, patient } = await setupClinic()
    const appt = await adminAgent.post('/api/v1/appointments').send({
      doctorId: doctor._id,
      patientId: patient._id,
      scheduledAt: '2026-09-01T09:00:00.000Z',
      durationMinutes: 15,
    })
    const appointmentId = appt.body.data.appointment._id
    const created = await doctorAgent
      .post('/api/v1/consultations')
      .send(basePayload(doctor, patient, { appointmentId }))

    await adminAgent.post(`/api/v1/appointments/${appointmentId}/arrive`)
    await doctorAgent.post(`/api/v1/appointments/${appointmentId}/call`)
    await doctorAgent.post(`/api/v1/appointments/${appointmentId}/complete`)

    const res = await doctorAgent
      .patch(`/api/v1/consultations/${created.body.data.consultation._id}`)
      .send({ diagnosis: 'Too late' })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('CONSULTATION_FINALIZED')
  })
})

describe('listing', () => {
  it('filters by patient and paginates', async () => {
    const { doctorAgent, doctor, patient } = await setupClinic()
    await doctorAgent.post('/api/v1/consultations').send(basePayload(doctor, patient))
    await doctorAgent.post('/api/v1/consultations').send(basePayload(doctor, patient))

    const res = await doctorAgent.get('/api/v1/consultations').query({ patientId: patient._id, limit: 1 })

    expect(res.body.data.consultations).toHaveLength(1)
    expect(res.body.data.pagination.total).toBe(2)
  })
})
