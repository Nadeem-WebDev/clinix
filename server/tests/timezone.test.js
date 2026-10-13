import { createApp } from '../src/app.js'
import { connectTestDB, clearTestDB, disconnectTestDB } from './testDb.js'
import { registerClinicAgent, createStaffAgent } from './helpers.js'
import { Patient } from '../src/models/Patient.js'
import {
  dateStrOf,
  dayRange,
  zonedTimeToUtc,
  calendarDateOf,
  localHourOf,
  isValidTimeZone,
  resolveDateRange,
} from '../src/utils/dateRange.js'

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

describe('day helpers', () => {
  it('puts an instant on the clinic\'s calendar day, not UTC\'s', () => {
    // 01:30 IST on 13 Oct is still 12 Oct in UTC - the case this fixes.
    expect(dateStrOf('2026-10-12T20:00:00.000Z', 'Asia/Kolkata')).toBe('2026-10-13')
    expect(dateStrOf('2026-10-12T20:00:00.000Z', 'UTC')).toBe('2026-10-12')
  })

  it('gives a clinic day from local midnight to local midnight', () => {
    const { start, end } = dayRange('2026-10-13', 'Asia/Kolkata')
    expect(start.toISOString()).toBe('2026-10-12T18:30:00.000Z')
    expect(end.toISOString()).toBe('2026-10-13T18:29:59.999Z')
    expect(zonedTimeToUtc('2026-10-13', '09:30', 'Asia/Kolkata').toISOString()).toBe('2026-10-13T04:00:00.000Z')
  })

  it('handles daylight-saving days (25 and 23 hours long)', () => {
    const hours = (dateStr) => {
      const { start, end } = dayRange(dateStr, 'America/New_York')
      return (end - start + 1) / 3600e3
    }
    expect(hours('2026-11-01')).toBe(25)
    expect(hours('2026-03-08')).toBe(23)
  })

  it('reads a date-only value as that calendar date in any zone', () => {
    // A follow-up date from the form is stored as midnight UTC.
    expect(calendarDateOf('2026-10-20T00:00:00.000Z', 'America/New_York')).toBe('2026-10-20')
    // A real timestamp still lands on the clinic's day.
    expect(calendarDateOf('2026-10-20T03:00:00.000Z', 'America/New_York')).toBe('2026-10-19')
  })

  it('reports the hour on the clinic\'s clock', () => {
    expect(localHourOf('2026-10-13T12:30:00.000Z', 'Asia/Kolkata')).toBe(18)
  })

  it('refuses to guess a zone', () => {
    expect(() => dateStrOf(new Date())).toThrow(/time zone is required/)
    expect(() => resolveDateRange({}, undefined)).toThrow(/time zone is required/)
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true)
    expect(isValidTimeZone('Mars/Base')).toBe(false)
  })
})

describe('clinic time zone in the app', () => {
  async function setup() {
    const { agent: ownerAgent, clinic } = await registerClinicAgent(app)
    const { email } = await createStaffAgent(app, ownerAgent, 'doctor')
    const doctor = (await ownerAgent.get('/api/v1/users')).body.data.staff.find((u) => u.email === email)
    const patient = (
      await ownerAgent.post('/api/v1/patients').send({ fullName: 'Rahul Sharma', age: 34, gender: 'male', phone: '9876543210' })
    ).body.data.patient
    const book = (scheduledAt) =>
      ownerAgent.post('/api/v1/appointments').send({ patientId: patient._id, doctorId: doctor._id, scheduledAt, durationMinutes: 15 })
    return { ownerAgent, clinic, doctor, patient, book }
  }

  it('defaults new clinics to Asia/Kolkata', async () => {
    const { ownerAgent } = await setup()
    const res = await ownerAgent.get('/api/v1/clinics/settings')
    expect(res.body.data.clinic.timezone).toBe('Asia/Kolkata')
  })

  it('treats an early-morning visit as the same clinic day for tokens and lists', async () => {
    const { ownerAgent, book } = await setup()

    // 01:30 IST and 10:30 IST on 13 Oct - different UTC days, same clinic day.
    const early = await book('2026-10-12T20:00:00.000Z')
    const later = await book('2026-10-13T05:00:00.000Z')

    expect(early.body.data.appointment.tokenNumber).toBe(1)
    expect(later.body.data.appointment.tokenNumber).toBe(2)

    const list = await ownerAgent.get('/api/v1/appointments?date=2026-10-13')
    expect(list.body.data.appointments).toHaveLength(2)
    expect((await ownerAgent.get('/api/v1/appointments?date=2026-10-12')).body.data.appointments).toHaveLength(0)
  })

  it('follows the clinic\'s setting when the owner changes the time zone', async () => {
    const { ownerAgent, book } = await setup()

    const changed = await ownerAgent.patch('/api/v1/clinics/settings').send({ timezone: 'America/New_York' })
    expect(changed.status).toBe(200)
    expect(changed.body.data.clinic.timezone).toBe('America/New_York')

    // 23:00 on 12 Oct in New York (03:00 UTC on 13 Oct).
    await book('2026-10-13T03:00:00.000Z')

    expect((await ownerAgent.get('/api/v1/appointments?date=2026-10-12')).body.data.appointments).toHaveLength(1)
    expect((await ownerAgent.get('/api/v1/appointments?date=2026-10-13')).body.data.appointments).toHaveLength(0)
  })

  it('rejects a time zone that does not exist', async () => {
    const { ownerAgent } = await setup()
    const res = await ownerAgent.patch('/api/v1/clinics/settings').send({ timezone: 'Mars/Base' })
    expect(res.status).toBe(400)
  })

  it('groups report days by the clinic\'s calendar', async () => {
    const { ownerAgent, clinic } = await setup()
    // Registered at 01:30 IST on 3 Mar (2 Mar in UTC). A past window, so
    // the patient setup() registers today isn't in it.
    await Patient.create({
      clinicId: clinic._id,
      patientId: 'P-TZ1',
      fullName: 'Late Night',
      gender: 'female',
      phone: '9000000001',
      createdAt: new Date('2026-03-02T20:00:00.000Z'),
    })

    const res = await ownerAgent.get('/api/v1/reports/patients?from=2026-03-02&to=2026-03-03')

    expect(res.body.data.newPatientsByDate).toEqual([{ date: '2026-03-03', count: 1 }])
  })

  it('keeps a follow-up on its calendar date for a clinic behind UTC', async () => {
    const { ownerAgent, doctor, patient } = await setup()
    await ownerAgent.patch('/api/v1/clinics/settings').send({ timezone: 'America/New_York' })
    const nyToday = dateStrOf(new Date(), 'America/New_York')
    await ownerAgent
      .post('/api/v1/consultations')
      .send({ patientId: patient._id, doctorId: doctor._id, diagnosis: 'Cough', followUpDate: nyToday })

    const due = await ownerAgent.get('/api/v1/consultations/follow-ups')
    expect(due.body.data.followUps).toHaveLength(1)

    const history = await ownerAgent.get(`/api/v1/patients/${patient._id}/follow-ups`)
    expect(history.body.data.followUps[0].status).toBe('due_today')
  })
})
