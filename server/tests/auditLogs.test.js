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

describe('audit trail is actually being written', () => {
  it('records clinic registration, staff creation, and patient creation', async () => {
    const { agent: adminAgent } = await registerClinicAgent(app)
    await createStaffAgent(app, adminAgent, 'doctor')
    await adminAgent.post('/api/v1/patients').send({
      fullName: 'Rahul Sharma',
      age: 34,
      gender: 'male',
      phone: '9876543210',
    })

    const res = await adminAgent.get('/api/v1/audit-logs')
    expect(res.status).toBe(200)
    const actions = res.body.data.logs.map((l) => l.action)
    expect(actions).toEqual(
      expect.arrayContaining(['CLINIC_REGISTERED', 'USER_CREATED', 'PATIENT_CREATED']),
    )
    // Every entry carries a populated actor and a real timestamp - not
    // just a bare id and a string.
    const patientEntry = res.body.data.logs.find((l) => l.action === 'PATIENT_CREATED')
    expect(patientEntry.userId.name).toBe('Test Admin')
    expect(patientEntry.resourceType).toBe('Patient')
    expect(new Date(patientEntry.createdAt).getTime()).not.toBeNaN()
  })

  it('never logs clinical content in the metadata', async () => {
    const { agent: adminAgent } = await registerClinicAgent(app)
    const { agent: doctorAgent, email: doctorEmail } = await createStaffAgent(app, adminAgent, 'doctor')
    const doctor = (await adminAgent.get('/api/v1/users')).body.data.staff.find((u) => u.email === doctorEmail)
    const patientRes = await adminAgent.post('/api/v1/patients').send({
      fullName: 'Rahul Sharma',
      age: 34,
      gender: 'male',
      phone: '9876543210',
    })

    await doctorAgent.post('/api/v1/consultations').send({
      patientId: patientRes.body.data.patient._id,
      doctorId: doctor._id,
      diagnosis: 'A very private diagnosis nobody should see in a log',
    })

    const res = await adminAgent.get('/api/v1/audit-logs').query({ action: 'CONSULTATION_CREATED' })
    expect(res.body.data.logs).toHaveLength(1)
    const entry = res.body.data.logs[0]
    expect(JSON.stringify(entry)).not.toContain('very private diagnosis')
  })
})

describe('filtering and pagination', () => {
  it('filters by action and paginates', async () => {
    const { agent: adminAgent } = await registerClinicAgent(app)
    await adminAgent.post('/api/v1/patients').send({
      fullName: 'Patient One',
      age: 30,
      gender: 'male',
      phone: '9111111111',
    })
    await adminAgent.post('/api/v1/patients').send({
      fullName: 'Patient Two',
      age: 31,
      gender: 'female',
      phone: '9222222222',
    })

    const filtered = await adminAgent.get('/api/v1/audit-logs').query({ action: 'PATIENT_CREATED' })
    expect(filtered.body.data.logs).toHaveLength(2)
    expect(filtered.body.data.logs.every((l) => l.action === 'PATIENT_CREATED')).toBe(true)

    const paged = await adminAgent
      .get('/api/v1/audit-logs')
      .query({ action: 'PATIENT_CREATED', limit: 1, page: 1 })
    expect(paged.body.data.logs).toHaveLength(1)
    expect(paged.body.data.pagination.total).toBe(2)
  })
})

describe('role authorization and tenant isolation', () => {
  it('forbids non-admins from viewing audit logs', async () => {
    const { agent: adminAgent } = await registerClinicAgent(app)
    const { agent: receptionistAgent } = await createStaffAgent(app, adminAgent, 'receptionist')

    const res = await receptionistAgent.get('/api/v1/audit-logs')
    expect(res.status).toBe(403)
  })

  it('never mixes another clinic\'s audit trail into the results', async () => {
    const clinicA = await registerClinicAgent(app, { email: 'admin-a@iso.test' })
    const clinicB = await registerClinicAgent(app, { email: 'admin-b@iso.test' })

    await clinicA.agent.post('/api/v1/patients').send({
      fullName: 'Clinic A Patient',
      age: 30,
      gender: 'male',
      phone: '9333333333',
    })

    const res = await clinicB.agent.get('/api/v1/audit-logs').query({ action: 'PATIENT_CREATED' })
    expect(res.body.data.logs).toHaveLength(0)
  })
})
