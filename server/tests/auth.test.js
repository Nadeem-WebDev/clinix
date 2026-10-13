import request from 'supertest'
import { createApp } from '../src/app.js'
import { connectTestDB, clearTestDB, disconnectTestDB } from './testDb.js'
import { User } from '../src/models/User.js'
import { createStaffAgent } from './helpers.js'

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

describe('change password', () => {
  async function owner() {
    const agent = request.agent(app)
    await registerClinic(agent, { email: 'changer@abc-clinic.test' })
    return agent
  }
  const change = (agent, body) => agent.post('/api/v1/auth/change-password').send(body)

  it('changes the password, keeps this session, and only the new password logs in', async () => {
    const agent = await owner()

    const res = await change(agent, { currentPassword: 'supersecret123', newPassword: 'brand-new-pass1' })
    expect(res.status).toBe(200)

    // Still signed in on the device that made the change.
    expect((await agent.get('/api/v1/auth/me')).status).toBe(200)

    const oldLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'changer@abc-clinic.test', password: 'supersecret123' })
    expect(oldLogin.status).toBe(401)
    const newLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'changer@abc-clinic.test', password: 'brand-new-pass1' })
    expect(newLogin.status).toBe(200)
  })

  it('signs out every other device', async () => {
    const agent = await owner()
    const otherDevice = request.agent(app)
    await otherDevice.post('/api/v1/auth/login').send({ email: 'changer@abc-clinic.test', password: 'supersecret123' })
    expect((await otherDevice.get('/api/v1/auth/me')).status).toBe(200)

    await change(agent, { currentPassword: 'supersecret123', newPassword: 'brand-new-pass1' })

    const after = await otherDevice.get('/api/v1/auth/me')
    expect(after.status).toBe(401)
    expect(after.body.code).toBe('PASSWORD_CHANGED')
    expect((await agent.get('/api/v1/auth/me')).status).toBe(200)
  })

  it('refuses a wrong current password without signing the user out', async () => {
    const agent = await owner()

    const res = await change(agent, { currentPassword: 'not-it', newPassword: 'brand-new-pass1' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('WRONG_PASSWORD')
    expect((await agent.get('/api/v1/auth/me')).status).toBe(200)
  })

  it('rejects a short new password, or one the same as the current one', async () => {
    const agent = await owner()

    expect((await change(agent, { currentPassword: 'supersecret123', newPassword: 'short' })).status).toBe(400)
    expect((await change(agent, { currentPassword: 'supersecret123', newPassword: 'supersecret123' })).status).toBe(400)
  })

  it('needs a signed-in user', async () => {
    const res = await change(request(app), { currentPassword: 'supersecret123', newPassword: 'brand-new-pass1' })
    expect(res.status).toBe(401)
  })

  it('works for every role, and is written to the audit log', async () => {
    const agent = await owner()
    const { agent: receptionist } = await createStaffAgent(app, agent, 'receptionist')

    const res = await change(receptionist, { currentPassword: 'supersecret123', newPassword: 'brand-new-pass1' })
    expect(res.status).toBe(200)

    const logs = await agent.get('/api/v1/audit-logs?action=PASSWORD_CHANGED')
    expect(logs.body.data.logs).toHaveLength(1)
  })
})
