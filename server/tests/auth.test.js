import request from 'supertest'
import { createApp } from '../src/app.js'
import { connectTestDB, clearTestDB, disconnectTestDB } from './testDb.js'
import { User } from '../src/models/User.js'

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

async function registerClinic(agent, overrides = {}) {
  return agent.post('/api/v1/auth/register-clinic').send({
    clinicName: 'ABC Family Clinic',
    adminName: 'Ada Admin',
    email: 'admin@abc-clinic.test',
    password: 'supersecret123',
    ...overrides,
  })
}

describe('full auth flow', () => {
  it('registers a clinic, logs in the session, exposes /me, and logs out', async () => {
    const agent = request.agent(app)

    const registerRes = await registerClinic(agent)
    expect(registerRes.status).toBe(201)
    expect(registerRes.body.success).toBe(true)
    expect(registerRes.body.data.user.role).toBe('owner')
    // Password must never be echoed back in any API response.
    expect(registerRes.body.data.user.passwordHash).toBeUndefined()

    const meRes = await agent.get('/api/v1/auth/me')
    expect(meRes.status).toBe(200)
    expect(meRes.body.data.user.email).toBe('admin@abc-clinic.test')

    const logoutRes = await agent.post('/api/v1/auth/logout')
    expect(logoutRes.status).toBe(200)

    const meAfterLogout = await agent.get('/api/v1/auth/me')
    expect(meAfterLogout.status).toBe(401)
  })

  it('rejects login with the wrong password', async () => {
    const agent = request.agent(app)
    await registerClinic(agent, { email: 'wrongpass@abc-clinic.test' })
    await agent.post('/api/v1/auth/logout')

    const res = await agent
      .post('/api/v1/auth/login')
      .send({ email: 'wrongpass@abc-clinic.test', password: 'not-the-password' })

    expect(res.status).toBe(401)
    expect(res.body.code).toBe('INVALID_CREDENTIALS')
  })

  it('never stores the password in plain text', async () => {
    const agent = request.agent(app)
    await registerClinic(agent, { email: 'plaintext-check@abc-clinic.test', password: 'supersecret123' })

    const user = await User.findOne({ email: 'plaintext-check@abc-clinic.test' }).select('+passwordHash')
    expect(user.passwordHash).not.toBe('supersecret123')
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/) // bcrypt hash format
  })
})

describe('tenant isolation on staff listing', () => {
  it('never returns another clinic\'s staff', async () => {
    const clinicAAgent = request.agent(app)
    await registerClinic(clinicAAgent, { email: 'admin-a@clinic-a.test' })
    await clinicAAgent.post('/api/v1/users').send({
      name: 'Dr. A',
      email: 'doctor-a@clinic-a.test',
      password: 'supersecret123',
      role: 'doctor',
    })

    const clinicBAgent = request.agent(app)
    await registerClinic(clinicBAgent, { email: 'admin-b@clinic-b.test' })

    const listRes = await clinicBAgent.get('/api/v1/users')
    expect(listRes.status).toBe(200)
    const emails = listRes.body.data.staff.map((u) => u.email)
    expect(emails).not.toContain('doctor-a@clinic-a.test')
    expect(emails).not.toContain('admin-a@clinic-a.test')
    expect(emails).toEqual(['admin-b@clinic-b.test'])
  })
})

describe('role authorization on staff creation', () => {
  it('forbids a non-owner/admin from creating staff', async () => {
    const ownerAgent = request.agent(app)
    await registerClinic(ownerAgent, { email: 'owner-role-test@clinic.test' })
    await ownerAgent.post('/api/v1/users').send({
      name: 'Rita Receptionist',
      email: 'reception-role-test@clinic.test',
      password: 'supersecret123',
      role: 'receptionist',
    })

    const receptionistAgent = request.agent(app)
    await receptionistAgent
      .post('/api/v1/auth/login')
      .send({ email: 'reception-role-test@clinic.test', password: 'supersecret123' })

    const res = await receptionistAgent.post('/api/v1/users').send({
      name: 'Should Not Be Created',
      email: 'nope@clinic.test',
      password: 'supersecret123',
      role: 'nurse',
    })

    expect(res.status).toBe(403)
  })

  it('lets an owner create an admin, but forbids an admin from creating an admin or owner', async () => {
    const ownerAgent = request.agent(app)
    await registerClinic(ownerAgent, { email: 'owner-escalation-test@clinic.test' })

    const createAdminRes = await ownerAgent.post('/api/v1/users').send({
      name: 'Alan Admin',
      email: 'admin-escalation-test@clinic.test',
      password: 'supersecret123',
      role: 'admin',
    })
    expect(createAdminRes.status).toBe(201)
    expect(createAdminRes.body.data.user.role).toBe('admin')

    const adminAgent = request.agent(app)
    await adminAgent
      .post('/api/v1/auth/login')
      .send({ email: 'admin-escalation-test@clinic.test', password: 'supersecret123' })

    const adminCreatesAdmin = await adminAgent.post('/api/v1/users').send({
      name: 'Should Not Be Created',
      email: 'nope-admin@clinic.test',
      password: 'supersecret123',
      role: 'admin',
    })
    expect(adminCreatesAdmin.status).toBe(403)

    const adminCreatesOwner = await adminAgent.post('/api/v1/users').send({
      name: 'Should Not Be Created Either',
      email: 'nope-owner@clinic.test',
      password: 'supersecret123',
      role: 'owner',
    })
    expect(adminCreatesOwner.status).toBe(403)
  })
})
