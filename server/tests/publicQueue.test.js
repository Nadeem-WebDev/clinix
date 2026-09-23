import request from 'supertest'
import { createApp } from '../src/app.js'
import { connectTestDB, clearTestDB, disconnectTestDB } from './testDb.js'
import { registerClinicAgent, createStaffAgent } from './helpers.js'
import { Clinic } from '../src/models/Clinic.js'
import { maskPatientName } from '../src/services/publicQueue.service.js'

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

// Builds a clinic with one doctor and `count` patients booked for today,
// returning the owner agent plus the appointments in token order.
async function setupClinicWithQueue({ count = 3, clinicName = 'Sharma Clinic' } = {}) {
  const { agent: adminAgent, clinic } = await registerClinicAgent(app, { clinicName })
  const { agent: doctorAgent, email: doctorEmail } = await createStaffAgent(
    app,
    adminAgent,
    'doctor',
    { name: 'Anita Rao' },
  )

  const staffRes = await adminAgent.get('/api/v1/users')
  const doctor = staffRes.body.data.staff.find((u) => u.email === doctorEmail)

  const names = ['Priya Sharma', 'Rahul Verma', 'Kabir Singh', 'Meera Iyer', 'Arjun Nair', 'Sana Khan']
  const appointments = []
  for (let i = 0; i < count; i += 1) {
    const patientRes = await adminAgent.post('/api/v1/patients').send({
      fullName: names[i],
      age: 30 + i,
      gender: 'female',
      phone: `98765432${10 + i}`,
    })
    const scheduledAt = new Date()
    scheduledAt.setUTCHours(9 + i, 0, 0, 0)
    const apptRes = await adminAgent.post('/api/v1/appointments').send({
      patientId: patientRes.body.data.patient._id,
      doctorId: doctor._id,
      scheduledAt: scheduledAt.toISOString(),
    })
    appointments.push(apptRes.body.data.appointment)
  }

  return { adminAgent, doctorAgent, clinic, doctor, appointments }
}

describe('clinic slug', () => {
  it('is generated from the clinic name at registration', async () => {
    const { clinic } = await registerClinicAgent(app, { clinicName: 'Sharma Clinic' })
    expect(clinic.slug).toBe('sharma-clinic')
  })

  it('appends a suffix rather than colliding when the name is taken', async () => {
    const first = await registerClinicAgent(app, { clinicName: 'Sharma Clinic' })
    const second = await registerClinicAgent(app, { clinicName: 'Sharma Clinic' })

    expect(first.clinic.slug).toBe('sharma-clinic')
    expect(second.clinic.slug).not.toBe('sharma-clinic')
    expect(second.clinic.slug).toMatch(/^sharma-clinic-[a-z0-9]{4}$/)
  })

  it('is never taken from client input', async () => {
    // A registrant trying to squat on another clinic's public URL.
    const { clinic } = await registerClinicAgent(app, {
      clinicName: 'Evil Clinic',
      slug: 'sharma-clinic',
    })
    expect(clinic.slug).toBe('evil-clinic')
  })
})

describe('masking patient names for a public screen', () => {
  it.each([
    ['Priya Sharma', 'Priya S.'],
    ['Priya Kumari Sharma', 'Priya S.'],
    ['  Priya   Sharma  ', 'Priya S.'],
    ['Priya', 'Priya'],
    ['', 'Patient'],
    [undefined, 'Patient'],
  ])('masks %p as %p', (input, expected) => {
    expect(maskPatientName(input)).toBe(expected)
  })
})

describe('GET /api/v1/public/clinics/:slug/queue', () => {
  it('succeeds with no authentication at all', async () => {
    const { clinic } = await setupClinicWithQueue()

    // request(app) rather than an agent - no cookie jar, nothing to send.
    const res = await request(app).get(`/api/v1/public/clinics/${clinic.slug}/queue`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.clinicName).toBe('Sharma Clinic')
  })

  it('returns only allow-listed fields, and never patient PII', async () => {
    const { clinic, adminAgent, appointments } = await setupClinicWithQueue({ count: 2 })
    await adminAgent.post(`/api/v1/appointments/${appointments[0]._id}/arrive`)

    const res = await request(app).get(`/api/v1/public/clinics/${clinic.slug}/queue`)
    const { data } = res.body

    // Exact key set, not a subset check: a new field added to the service
    // must fail this test until someone has decided it is safe to publish.
    expect(Object.keys(data).sort()).toEqual(
      [
        'clinicName',
        'date',
        'estimatedWaitMinutes',
        'isEstimate',
        'nowServing',
        'upcoming',
        'waitingCount',
      ].sort(),
    )
    expect(Object.keys(data.upcoming[0]).sort()).toEqual(['patientName', 'tokenNumber'])

    // The blunt check: no field anywhere in the payload carries the
    // patient's full name, phone, or id, however it got there.
    const serialized = JSON.stringify(data)
    expect(serialized).not.toContain('Priya Sharma')
    expect(serialized).not.toContain('9876543210')
    expect(serialized).not.toContain(appointments[0].patientId._id)
    expect(serialized).toContain('Priya S.')
  })

  it('reports who is being seen, how many are waiting, and an estimate', async () => {
    const { clinic, adminAgent, doctorAgent, appointments } = await setupClinicWithQueue({ count: 3 })

    for (const appt of appointments) {
      await adminAgent.post(`/api/v1/appointments/${appt._id}/arrive`)
    }
    await doctorAgent.post(`/api/v1/appointments/${appointments[0]._id}/call`)

    const res = await request(app).get(`/api/v1/public/clinics/${clinic.slug}/queue`)
    const { data } = res.body

    expect(data.nowServing).toEqual([
      { doctorName: 'Anita Rao', tokenNumber: appointments[0].tokenNumber },
    ])
    expect(data.waitingCount).toBe(2)
    expect(data.upcoming).toHaveLength(2)
    // Default slot length is 15 minutes (Clinic.defaultAppointmentDurationMinutes).
    expect(data.estimatedWaitMinutes).toBe(30)
    expect(data.isEstimate).toBe(true)
  })

  it('caps the upcoming list rather than listing the whole waiting room', async () => {
    const { clinic, adminAgent, appointments } = await setupClinicWithQueue({ count: 6 })
    for (const appt of appointments) {
      await adminAgent.post(`/api/v1/appointments/${appt._id}/arrive`)
    }

    const res = await request(app).get(`/api/v1/public/clinics/${clinic.slug}/queue`)

    expect(res.body.data.waitingCount).toBe(6)
    expect(res.body.data.upcoming).toHaveLength(5)
  })

  it('404s on an unknown slug, with no hint that it nearly matched', async () => {
    await setupClinicWithQueue()

    const res = await request(app).get('/api/v1/public/clinics/sharma-clinicc/queue')

    expect(res.status).toBe(404)
    expect(res.body.message).toBe('Queue not found')
    expect(JSON.stringify(res.body)).not.toContain('Sharma')
  })

  it('404s for a deactivated clinic', async () => {
    const { clinic } = await setupClinicWithQueue()
    await Clinic.updateOne({ _id: clinic._id }, { $set: { active: false } })

    const res = await request(app).get(`/api/v1/public/clinics/${clinic.slug}/queue`)

    expect(res.status).toBe(404)
  })

  it('rejects a malformed slug before it reaches the database', async () => {
    const res = await request(app).get('/api/v1/public/clinics/Not_A_Slug/queue')

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  it('never leaks another clinic\'s queue through the slug lookup', async () => {
    const a = await setupClinicWithQueue({ count: 2, clinicName: 'Alpha Clinic' })
    const b = await setupClinicWithQueue({ count: 3, clinicName: 'Beta Clinic' })
    for (const appt of b.appointments) {
      await b.adminAgent.post(`/api/v1/appointments/${appt._id}/arrive`)
    }

    const res = await request(app).get(`/api/v1/public/clinics/${a.clinic.slug}/queue`)

    expect(res.body.data.clinicName).toBe('Alpha Clinic')
    expect(res.body.data.waitingCount).toBe(0)
  })
})
