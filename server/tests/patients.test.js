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

const validPatient = {
  fullName: 'Rahul Sharma',
  age: 34,
  gender: 'male',
  phone: '9876543210',
}

describe('creating patients', () => {
  it('generates sequential, clinic-scoped human-friendly patient IDs', async () => {
    const { agent } = await registerClinicAgent(app)

    const first = await agent.post('/api/v1/patients').send(validPatient)
    const second = await agent
      .post('/api/v1/patients')
      .send({ ...validPatient, fullName: 'Ayesha Khan', phone: '9876500000' })

    expect(first.status).toBe(201)
    expect(first.body.data.patient.patientId).toBe('P-10001')
    expect(second.body.data.patient.patientId).toBe('P-10002')
  })

  it('starts a fresh sequence for a different clinic', async () => {
    const { agent: agentA } = await registerClinicAgent(app)
    const { agent: agentB } = await registerClinicAgent(app)

    const resA = await agentA.post('/api/v1/patients').send(validPatient)
    const resB = await agentB
      .post('/api/v1/patients')
      .send({ ...validPatient, phone: '9999999999' })

    expect(resA.body.data.patient.patientId).toBe('P-10001')
    expect(resB.body.data.patient.patientId).toBe('P-10001')
  })

  it('rejects a patient with no dob and no age', async () => {
    const { agent } = await registerClinicAgent(app)
    // eslint-disable-next-line no-unused-vars
    const { age, ...withoutAge } = validPatient

    const res = await agent.post('/api/v1/patients').send(withoutAge)

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  it('rejects missing required fields', async () => {
    const { agent } = await registerClinicAgent(app)

    const res = await agent.post('/api/v1/patients').send({ fullName: 'No Phone Or Gender' })

    expect(res.status).toBe(400)
  })

  it('forbids a doctor from registering a patient (read-only role)', async () => {
    const { agent: adminAgent } = await registerClinicAgent(app)
    const { agent: doctorAgent } = await createStaffAgent(app, adminAgent, 'doctor')

    const res = await doctorAgent.post('/api/v1/patients').send(validPatient)

    expect(res.status).toBe(403)
  })
})

describe('listing and searching patients', () => {
  it('supports search by patient ID, name, and phone - scoped to one clinic', async () => {
    const { agent: agentA } = await registerClinicAgent(app)
    const { agent: agentB } = await registerClinicAgent(app)

    await agentA.post('/api/v1/patients').send(validPatient) // P-10001, Rahul Sharma
    await agentA
      .post('/api/v1/patients')
      .send({ ...validPatient, fullName: 'Ayesha Khan', phone: '9876500000' }) // P-10002
    await agentB
      .post('/api/v1/patients')
      .send({ ...validPatient, fullName: 'Rahul Sharma', phone: '9876543210' }) // clinic B's own P-10001

    const byName = await agentA.get('/api/v1/patients').query({ search: 'ayesha' })
    expect(byName.body.data.patients).toHaveLength(1)
    expect(byName.body.data.patients[0].fullName).toBe('Ayesha Khan')

    const byPhone = await agentA.get('/api/v1/patients').query({ search: '9876543210' })
    expect(byPhone.body.data.patients).toHaveLength(1)
    expect(byPhone.body.data.patients[0].fullName).toBe('Rahul Sharma')

    const byPatientId = await agentA.get('/api/v1/patients').query({ search: 'P-10002' })
    expect(byPatientId.body.data.patients).toHaveLength(1)

    // Clinic A never sees clinic B's identically-named patient.
    const all = await agentA.get('/api/v1/patients')
    expect(all.body.data.patients).toHaveLength(2)
    expect(all.body.data.pagination.total).toBe(2)
  })

  it('paginates results', async () => {
    const { agent } = await registerClinicAgent(app)
    for (let i = 0; i < 5; i += 1) {
      await agent.post('/api/v1/patients').send({ ...validPatient, phone: `900000000${i}` })
    }

    const res = await agent.get('/api/v1/patients').query({ page: 2, limit: 2 })

    expect(res.body.data.patients).toHaveLength(2)
    expect(res.body.data.pagination).toEqual({ page: 2, limit: 2, total: 5, pages: 3 })
  })
})

describe('reading and updating a single patient', () => {
  it('404s for a patient belonging to a different clinic', async () => {
    const { agent: agentA } = await registerClinicAgent(app)
    const { agent: agentB } = await registerClinicAgent(app)

    const created = await agentA.post('/api/v1/patients').send(validPatient)
    const patientId = created.body.data.patient._id

    const res = await agentB.get(`/api/v1/patients/${patientId}`)

    expect(res.status).toBe(404)
  })

  it('allows a nurse to update basic info but not create patients', async () => {
    const { agent: adminAgent } = await registerClinicAgent(app)
    const { agent: nurseAgent } = await createStaffAgent(app, adminAgent, 'nurse')

    const created = await adminAgent.post('/api/v1/patients').send(validPatient)
    const patientId = created.body.data.patient._id

    const createAttempt = await nurseAgent.post('/api/v1/patients').send(validPatient)
    expect(createAttempt.status).toBe(403)

    const updateRes = await nurseAgent
      .patch(`/api/v1/patients/${patientId}`)
      .send({ phone: '9111111111' })
    expect(updateRes.status).toBe(200)
    expect(updateRes.body.data.patient.phone).toBe('9111111111')
  })
})
