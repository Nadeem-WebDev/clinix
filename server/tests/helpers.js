import request from 'supertest'

let counter = 0
function unique(prefix) {
  counter += 1
  return `${prefix}${counter}@test.local`
}

// Registers a fresh clinic + owner and returns a logged-in supertest agent
// (cookie jar persists across requests) plus the owner's email.
export async function registerClinicAgent(app, overrides = {}) {
  const agent = request.agent(app)
  const email = overrides.email ?? unique('admin')
  const res = await agent.post('/api/v1/auth/register-clinic').send({
    clinicName: 'Test Clinic',
    adminName: 'Test Admin',
    email,
    password: 'supersecret123',
    ...overrides,
  })
  return { agent, email, clinic: res.body.data.clinic, user: res.body.data.user }
}

// Given an already-logged-in owner/admin agent, creates a staff member of
// the given role and returns a separate agent logged in as that staff member.
export async function createStaffAgent(app, adminAgent, role, overrides = {}) {
  const email = overrides.email ?? unique(role)
  const password = 'supersecret123'
  await adminAgent.post('/api/v1/users').send({
    name: overrides.name ?? `Test ${role}`,
    email,
    password,
    role,
  })

  const agent = request.agent(app)
  await agent.post('/api/v1/auth/login').send({ email, password })
  return { agent, email }
}
