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

async function setupConsultation(overrides = {}) {
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

  const consultationRes = await doctorAgent.post('/api/v1/consultations').send({
    patientId: patient._id,
    doctorId: doctor._id,
    diagnosis: 'Common cold',
  })
  const consultation = consultationRes.body.data.consultation

  return { adminAgent, doctorAgent, receptionistAgent, nurseAgent, doctor, patient, consultation }
}

function basePayload(doctor, patient, consultation, overrides = {}) {
  return {
    doctorId: doctor._id,
    patientId: patient._id,
    consultationId: consultation._id,
    medicines: [
      { name: 'Paracetamol', dosage: '500mg', frequency: '1-0-1', timing: 'After food', duration: '3 days' },
    ],
    ...overrides,
  }
}

describe('creating prescriptions', () => {
  it('creates a prescription with medicines', async () => {
    const { doctorAgent, doctor, patient, consultation } = await setupConsultation()

    const res = await doctorAgent
      .post('/api/v1/prescriptions')
      .send(basePayload(doctor, patient, consultation))

    expect(res.status).toBe(201)
    expect(res.body.data.prescription.medicines).toHaveLength(1)
    expect(res.body.data.prescription.medicines[0].name).toBe('Paracetamol')
    expect(res.body.data.prescription.finalized).toBe(false)
  })

  it('rejects an empty medicines list', async () => {
    const { doctorAgent, doctor, patient, consultation } = await setupConsultation()

    const res = await doctorAgent
      .post('/api/v1/prescriptions')
      .send(basePayload(doctor, patient, consultation, { medicines: [] }))

    expect(res.status).toBe(400)
  })

  it('rejects a consultationId belonging to a different patient', async () => {
    const { adminAgent, doctorAgent, doctor, consultation } = await setupConsultation()
    const otherPatientRes = await adminAgent.post('/api/v1/patients').send({
      fullName: 'Someone Else',
      age: 40,
      gender: 'female',
      phone: '9999999999',
    })

    const res = await doctorAgent
      .post('/api/v1/prescriptions')
      .send(basePayload(doctor, otherPatientRes.body.data.patient, consultation))

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('CONSULTATION_MISMATCH')
  })

  it('forbids receptionists and nurses from creating or viewing prescriptions', async () => {
    const { receptionistAgent, nurseAgent, doctor, patient, consultation } = await setupConsultation()

    const createRes = await receptionistAgent
      .post('/api/v1/prescriptions')
      .send(basePayload(doctor, patient, consultation))
    const listRes = await nurseAgent.get('/api/v1/prescriptions')

    expect(createRes.status).toBe(403)
    expect(listRes.status).toBe(403)
  })
})

describe('tenant isolation', () => {
  it('404s for a prescription belonging to another clinic', async () => {
    const clinicA = await setupConsultation({ email: 'admin-a@iso.test' })
    const clinicB = await setupConsultation({ email: 'admin-b@iso.test' })

    const created = await clinicA.doctorAgent
      .post('/api/v1/prescriptions')
      .send(basePayload(clinicA.doctor, clinicA.patient, clinicA.consultation))

    const res = await clinicB.doctorAgent.get(`/api/v1/prescriptions/${created.body.data.prescription._id}`)
    expect(res.status).toBe(404)
  })
})

describe('editing and finalization', () => {
  it('allows edits before finalizing, blocks edits and re-finalizing after', async () => {
    const { doctorAgent, doctor, patient, consultation } = await setupConsultation()
    const created = await doctorAgent
      .post('/api/v1/prescriptions')
      .send(basePayload(doctor, patient, consultation))
    const id = created.body.data.prescription._id

    const editRes = await doctorAgent
      .patch(`/api/v1/prescriptions/${id}`)
      .send({ medicines: [{ name: 'Ibuprofen', dosage: '200mg' }] })
    expect(editRes.status).toBe(200)
    expect(editRes.body.data.prescription.medicines[0].name).toBe('Ibuprofen')

    const finalizeRes = await doctorAgent.post(`/api/v1/prescriptions/${id}/finalize`)
    expect(finalizeRes.status).toBe(200)
    expect(finalizeRes.body.data.prescription.finalized).toBe(true)

    const editAfterFinalize = await doctorAgent
      .patch(`/api/v1/prescriptions/${id}`)
      .send({ notes: 'too late' })
    expect(editAfterFinalize.status).toBe(400)
    expect(editAfterFinalize.body.code).toBe('PRESCRIPTION_FINALIZED')

    const secondFinalize = await doctorAgent.post(`/api/v1/prescriptions/${id}/finalize`)
    expect(secondFinalize.status).toBe(400)
  })
})

describe('PDF generation', () => {
  it('streams a PDF for a prescription', async () => {
    const { doctorAgent, doctor, patient, consultation } = await setupConsultation()
    const created = await doctorAgent
      .post('/api/v1/prescriptions')
      .send(basePayload(doctor, patient, consultation))

    const res = await doctorAgent.get(`/api/v1/prescriptions/${created.body.data.prescription._id}/pdf`)

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('application/pdf')
    // superagent buffers an unrecognized binary content-type straight into
    // res.body as a Buffer (nothing lands in res.text for this one).
    expect(Buffer.isBuffer(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThan(500)
    expect(res.body.slice(0, 4).toString()).toBe('%PDF')
  })
})

describe('listing', () => {
  it('filters by patient and paginates', async () => {
    const { doctorAgent, doctor, patient, consultation } = await setupConsultation()
    await doctorAgent.post('/api/v1/prescriptions').send(basePayload(doctor, patient, consultation))
    await doctorAgent.post('/api/v1/prescriptions').send(basePayload(doctor, patient, consultation))

    const res = await doctorAgent.get('/api/v1/prescriptions').query({ patientId: patient._id, limit: 1 })

    expect(res.body.data.prescriptions).toHaveLength(1)
    expect(res.body.data.pagination.total).toBe(2)
  })
})
