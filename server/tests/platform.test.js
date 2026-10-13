import request from 'supertest'
import { createApp } from '../src/app.js'
import { connectTestDB, clearTestDB, disconnectTestDB } from './testDb.js'
import { registerClinicAgent, createStaffAgent } from './helpers.js'
import { PlatformAdmin } from '../src/models/PlatformAdmin.js'
import { PlatformAuditLog } from '../src/models/PlatformAuditLog.js'
import { AuditLog } from '../src/models/AuditLog.js'

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

const ADMIN = { email: 'ops@clinix.test', password: 'platform-pass-1' }

async function platformAgent() {
  await PlatformAdmin.create({
    name: 'Ops',
    email: ADMIN.email,
    passwordHash: await PlatformAdmin.hashPassword(ADMIN.password),
  })
  const agent = request.agent(app)
  const res = await agent.post('/api/v1/platform/auth/login').send(ADMIN)
  expect(res.status).toBe(200)
  return agent
}

// A clinic with an owner, a doctor and a patient, plus the owner's agent.
async function clinicWithData(name = 'Sunrise Clinic') {
  const { agent: owner, clinic, email } = await registerClinicAgent(app, { clinicName: name })
  const { agent: doctor, email: doctorEmail } = await createStaffAgent(app, owner, 'doctor')
  const patient = await owner.post('/api/v1/patients').send({
    fullName: 'Rahul Sharma',
    age: 34,
    gender: 'male',
    phone: '9876543210',
    allergies: ['Penicillin'],
  })
  expect(patient.status).toBe(201)
  return { owner, doctor, clinic, ownerEmail: email, doctorEmail }
}

describe('platform login', () => {
  it('logs in, scopes its cookie to the platform API, and logs out', async () => {
    await PlatformAdmin.create({
      name: 'Ops',
      email: ADMIN.email,
      passwordHash: await PlatformAdmin.hashPassword(ADMIN.password),
    })
    const agent = request.agent(app)

    const res = await agent.post('/api/v1/platform/auth/login').send(ADMIN)
    expect(res.status).toBe(200)
    expect(res.body.data.admin.passwordHash).toBeUndefined()
    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('clinix_platform_token='))
    expect(cookie).toMatch(/Path=\/api\/v1\/platform/)
    expect(cookie).toMatch(/HttpOnly/)

    expect((await agent.get('/api/v1/platform/auth/me')).body.data.admin.email).toBe(ADMIN.email)
    await agent.post('/api/v1/platform/auth/logout')
    expect((await agent.get('/api/v1/platform/auth/me')).status).toBe(401)
  })

  it('refuses a wrong password', async () => {
    await PlatformAdmin.create({
      name: 'Ops',
      email: ADMIN.email,
      passwordHash: await PlatformAdmin.hashPassword(ADMIN.password),
    })
    const res = await request(app).post('/api/v1/platform/auth/login').send({ ...ADMIN, password: 'nope' })
    expect(res.status).toBe(401)
  })

  it('never lets a clinic session in, even an owner', async () => {
    const { owner } = await clinicWithData()
    expect((await owner.get('/api/v1/platform/overview')).status).toBe(401)
    expect((await owner.get('/api/v1/platform/clinics')).status).toBe(401)
  })

  it('a platform session is not a clinic session', async () => {
    const agent = await platformAgent()
    // Even sent to a clinic route, the platform token is not accepted.
    const token = (await agent.post('/api/v1/platform/auth/login').send(ADMIN)).headers['set-cookie']
      .find((c) => c.startsWith('clinix_platform_token='))
      .split(';')[0]
      .split('=')[1]
    const res = await request(app).get('/api/v1/patients').set('Cookie', `clinic_crm_token=${token}`)
    expect(res.status).toBe(401)
  })
})

describe('platform overview and clinics', () => {
  it('counts clinics, patients and recent activity', async () => {
    await clinicWithData('Sunrise Clinic')
    await clinicWithData('Moonlight Clinic')
    const agent = await platformAgent()

    const res = await agent.get('/api/v1/platform/overview')

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ clinics: 2, suspended: 0, newClinics7d: 2, activeClinics7d: 2, patients: 2 })
  })

  it('lists clinics with owner and counts, and finds one by a staff email', async () => {
    const { doctorEmail } = await clinicWithData('Sunrise Clinic')
    await clinicWithData('Moonlight Clinic')
    const agent = await platformAgent()

    const all = (await agent.get('/api/v1/platform/clinics')).body.data
    expect(all.pagination.total).toBe(2)
    const sunrise = all.clinics.find((c) => c.name === 'Sunrise Clinic')
    expect(sunrise).toMatchObject({ staffCount: 2, patientCount: 1, active: true })
    expect(sunrise.owner.email).toBeTruthy()
    expect(sunrise.lastActivityAt).toBeTruthy()

    const found = (await agent.get(`/api/v1/platform/clinics?search=${encodeURIComponent(doctorEmail)}`)).body.data
    expect(found.clinics.map((c) => c.name)).toEqual(['Sunrise Clinic'])
    // Regex characters in a search are literal, not a pattern.
    expect((await agent.get('/api/v1/platform/clinics?search=.*')).body.data.clinics).toHaveLength(0)
  })

  it('shows a clinic with usage and staff, but no patient data', async () => {
    const { clinic } = await clinicWithData()
    const agent = await platformAgent()

    const res = await agent.get(`/api/v1/platform/clinics/${clinic._id}`)

    expect(res.status).toBe(200)
    expect(res.body.data.usage.patients).toBe(1)
    expect(res.body.data.staff.map((s) => s.role).sort()).toEqual(['doctor', 'owner'])
    const body = JSON.stringify(res.body)
    expect(body).not.toContain('Rahul Sharma')
    expect(body).not.toContain('Penicillin')
    expect(body).not.toContain('9876543210')
    expect(body).not.toContain('passwordHash')
  })

  it('404s an unknown clinic', async () => {
    const agent = await platformAgent()
    expect((await agent.get('/api/v1/platform/clinics/507f1f77bcf86cd799439011')).status).toBe(404)
    expect((await agent.get('/api/v1/platform/clinics/not-an-id')).status).toBe(400)
  })
})

describe('suspending a clinic', () => {
  it('blocks login, ends sessions, hides the public queue, and is reversible', async () => {
    const { owner, doctor, clinic, ownerEmail } = await clinicWithData()
    const agent = await platformAgent()
    expect((await request(app).get(`/api/v1/public/clinics/${clinic.slug}/queue`)).status).toBe(200)

    const res = await agent.post(`/api/v1/platform/clinics/${clinic._id}/suspend`).send({ reason: 'Unpaid invoice' })
    expect(res.status).toBe(200)

    const me = await doctor.get('/api/v1/auth/me')
    expect(me.status).toBe(401)
    expect(me.body.code).toBe('CLINIC_SUSPENDED')
    expect((await owner.get('/api/v1/patients')).status).toBe(401)
    const login = await request(app).post('/api/v1/auth/login').send({ email: ownerEmail, password: 'supersecret123' })
    expect(login.status).toBe(403)
    expect(login.body.code).toBe('CLINIC_SUSPENDED')
    expect((await request(app).get(`/api/v1/public/clinics/${clinic.slug}/queue`)).status).toBe(404)

    const detail = (await agent.get(`/api/v1/platform/clinics/${clinic._id}`)).body.data
    expect(detail.clinic).toMatchObject({ active: false, suspendedReason: 'Unpaid invoice' })
    expect(detail.platformActions[0].action).toBe('CLINIC_SUSPENDED')

    await agent.post(`/api/v1/platform/clinics/${clinic._id}/unsuspend`)
    expect((await doctor.get('/api/v1/auth/me')).status).toBe(200)
    expect((await request(app).post('/api/v1/auth/login').send({ email: ownerEmail, password: 'supersecret123' })).status).toBe(200)
  })

  it('needs a reason', async () => {
    const { clinic } = await clinicWithData()
    const agent = await platformAgent()
    expect((await agent.post(`/api/v1/platform/clinics/${clinic._id}/suspend`).send({})).status).toBe(400)
  })

  it('a wrong password on a suspended clinic still says only "invalid"', async () => {
    const { clinic, ownerEmail } = await clinicWithData()
    const agent = await platformAgent()
    await agent.post(`/api/v1/platform/clinics/${clinic._id}/suspend`).send({ reason: 'Testing' })
    const res = await request(app).post('/api/v1/auth/login').send({ email: ownerEmail, password: 'wrong' })
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('INVALID_CREDENTIALS')
  })
})

describe('resetting a staff password', () => {
  it('returns a one-time password that works, and signs the person out everywhere', async () => {
    const { clinic, doctor, doctorEmail } = await clinicWithData()
    const agent = await platformAgent()
    const detail = (await agent.get(`/api/v1/platform/clinics/${clinic._id}`)).body.data
    const target = detail.staff.find((s) => s.email === doctorEmail)

    const res = await agent.post(`/api/v1/platform/clinics/${clinic._id}/staff/${target._id}/reset-password`)

    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    const { temporaryPassword } = res.body.data
    expect(temporaryPassword).toMatch(/^[A-Za-z2-9]{12}$/)
    expect((await doctor.get('/api/v1/auth/me')).status).toBe(401)
    expect((await request(app).post('/api/v1/auth/login').send({ email: doctorEmail, password: 'supersecret123' })).status).toBe(401)
    expect((await request(app).post('/api/v1/auth/login').send({ email: doctorEmail, password: temporaryPassword })).status).toBe(200)

    // Recorded for the platform and in the clinic's own audit log.
    expect(await PlatformAuditLog.countDocuments({ action: 'STAFF_PASSWORD_RESET' })).toBe(1)
    expect(await AuditLog.countDocuments({ clinicId: clinic._id, action: 'PASSWORD_RESET_BY_SUPPORT' })).toBe(1)
  })

  it('only reaches staff of that clinic', async () => {
    const { clinic } = await clinicWithData('Sunrise Clinic')
    const other = await clinicWithData('Moonlight Clinic')
    const agent = await platformAgent()
    const otherStaff = (await agent.get(`/api/v1/platform/clinics/${other.clinic._id}`)).body.data.staff[0]

    const res = await agent.post(`/api/v1/platform/clinics/${clinic._id}/staff/${otherStaff._id}/reset-password`)
    expect(res.status).toBe(404)
  })
})
