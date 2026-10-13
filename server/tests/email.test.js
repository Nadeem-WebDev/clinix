import { jest } from '@jest/globals'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { connectTestDB, clearTestDB, disconnectTestDB } from './testDb.js'
import { registerClinicAgent, createStaffAgent } from './helpers.js'
import { env } from '../src/config/env.js'
import { Clinic } from '../src/models/Clinic.js'
import { Patient } from '../src/models/Patient.js'
import { EmailMessage } from '../src/models/EmailMessage.js'
import { emailClient } from '../src/services/emailClient.js'
import { flushEmailSends, buildUnsubscribeUrl } from '../src/services/email.service.js'
import { escapeHtml } from '../src/services/emailTemplates.js'
import { sendTomorrowsReminders } from '../src/jobs/appointmentReminder.job.js'
import { flushWhatsappSends } from '../src/services/whatsapp.service.js'
import { todayDateStr, addDaysToDateStr, zonedTimeToUtc } from '../src/utils/dateRange.js'

const app = createApp()

// env is a plain exported object (ES modules are singletons), so tests flip
// the email switch and credentials directly, as whatsapp.test.js does.
const originalEmailEnv = { ...env.email }

function configureEmail() {
  Object.assign(env.email, { enabled: true, brevoApiKey: 'xkeysib-test', fromAddress: 'noreply@clinix.test', fromName: 'Clinix' })
}

beforeAll(async () => {
  await connectTestDB()
})

beforeEach(() => {
  Object.assign(env.email, originalEmailEnv)
  jest.spyOn(console, 'info').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(async () => {
  await flushEmailSends()
  await flushWhatsappSends()
  await clearTestDB()
  jest.restoreAllMocks()
  Object.assign(env.email, originalEmailEnv)
})

afterAll(async () => {
  await disconnectTestDB()
})

function mockSendOk() {
  return jest.spyOn(emailClient, 'sendEmail').mockResolvedValue({ messageId: '<test@brevo>' })
}

async function setupClinic({ emailEnabled = true, clinicEmail = 'desk@sharmaclinic.in', patientEmail = 'priya@example.com' } = {}) {
  const { agent: adminAgent, clinic } = await registerClinicAgent(app, { clinicName: 'Sharma Clinic' })
  const { agent: doctorAgent, email: doctorEmail } = await createStaffAgent(app, adminAgent, 'doctor', { name: 'Anita Rao' })
  const doctor = (await adminAgent.get('/api/v1/users')).body.data.staff.find((u) => u.email === doctorEmail)
  await Clinic.updateOne({ _id: clinic._id }, { $set: { emailEnabled, email: clinicEmail, phone: '+91 98220 12345' } })
  const patient = (
    await adminAgent.post('/api/v1/patients').send({
      fullName: 'Priya Sharma',
      age: 31,
      gender: 'female',
      phone: '9876543210',
      ...(patientEmail ? { email: patientEmail } : {}),
    })
  ).body.data.patient
  return { adminAgent, doctorAgent, clinic, doctor, patient }
}

// 11:00 on the clinic's (default India) calendar day, `dayOffset` days from
// today - "tomorrow" must be the clinic's tomorrow, not UTC's.
function bookingPayload(doctor, patient, dayOffset = 0) {
  const day = addDaysToDateStr(todayDateStr('Asia/Kolkata'), dayOffset)
  const scheduledAt = zonedTimeToUtc(day, '11:00', 'Asia/Kolkata')
  return { doctorId: doctor._id, patientId: patient._id, scheduledAt: scheduledAt.toISOString() }
}

describe('the EMAIL_ENABLED kill switch', () => {
  it('sends nothing when off, and still records why', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch')
    const { adminAgent, doctor, patient } = await setupClinic()

    await adminAgent.post('/api/v1/appointments').send(bookingPayload(doctor, patient))
    await flushEmailSends()

    expect(fetchSpy).not.toHaveBeenCalled()
    const row = await EmailMessage.findOne({ kind: 'APPOINTMENT_CONFIRMATION' })
    expect(row.status).toBe('QUEUED')
    expect(row.errorMessage).toMatch(/EMAIL_ENABLED/)
  })

  it('is off by default, as shipped', () => {
    expect(originalEmailEnv.enabled).toBe(false)
  })
})

describe('sending', () => {
  it('emails a booking confirmation in the clinic\'s name, with replies going to the clinic', async () => {
    configureEmail()
    const spy = mockSendOk()
    const { adminAgent, doctor, patient } = await setupClinic()

    const res = await adminAgent.post('/api/v1/appointments').send(bookingPayload(doctor, patient))
    await flushEmailSends()

    expect(spy).toHaveBeenCalledTimes(1)
    const sent = spy.mock.calls[0][0]
    expect(sent.to).toEqual({ email: 'priya@example.com', name: 'Priya Sharma' })
    expect(sent.sender).toEqual({ name: 'Sharma Clinic via Clinix', email: 'noreply@clinix.test' })
    expect(sent.replyTo).toEqual({ email: 'desk@sharmaclinic.in', name: 'Sharma Clinic' })
    expect(sent.subject).toMatch(/^Appointment confirmed - Sharma Clinic/)
    expect(sent.text).toContain(`Token number: ${res.body.data.appointment.tokenNumber}`)
    expect(sent.text).toContain('+91 98220 12345')
    expect(sent.text).toContain(buildUnsubscribeUrl(patient._id))
    expect(sent.html).toContain('Unsubscribe from these emails')

    const row = await EmailMessage.findOne({ kind: 'APPOINTMENT_CONFIRMATION' })
    expect(row.status).toBe('SENT')
    expect(row.providerMessageId).toBe('<test@brevo>')
  })

  it('skips without sending when the clinic has email off, or the patient has no address', async () => {
    configureEmail()
    const spy = mockSendOk()
    const off = await setupClinic({ emailEnabled: false })
    await off.adminAgent.post('/api/v1/appointments').send(bookingPayload(off.doctor, off.patient))
    await flushEmailSends()
    expect((await EmailMessage.findOne({ clinicId: off.clinic._id })).errorMessage).toMatch(/disabled for this clinic/)

    await clearTestDB()
    const noAddress = await setupClinic({ patientEmail: null })
    await noAddress.adminAgent.post('/api/v1/appointments').send(bookingPayload(noAddress.doctor, noAddress.patient))
    await flushEmailSends()
    expect((await EmailMessage.findOne({ clinicId: noAddress.clinic._id })).errorMessage).toMatch(/no email address/)

    expect(spy).not.toHaveBeenCalled()
  })

  it('records FAILED, without a network call, when Brevo is not configured', async () => {
    configureEmail()
    env.email.brevoApiKey = undefined
    const spy = mockSendOk()
    const { adminAgent, doctor, patient } = await setupClinic()

    await adminAgent.post('/api/v1/appointments').send(bookingPayload(doctor, patient))
    await flushEmailSends()

    expect(spy).not.toHaveBeenCalled()
    const row = await EmailMessage.findOne({})
    expect(row.status).toBe('FAILED')
    expect(row.errorMessage).toMatch(/BREVO_API_KEY/)
  })

  it('leaves Reply-To off when the clinic has no email of its own', async () => {
    configureEmail()
    const spy = mockSendOk()
    const { adminAgent, doctor, patient } = await setupClinic({ clinicEmail: '' })

    await adminAgent.post('/api/v1/appointments').send(bookingPayload(doctor, patient))
    await flushEmailSends()

    expect(spy.mock.calls[0][0].replyTo).toBeNull()
    expect(spy.mock.calls[0][0].text).not.toContain('reply to this email')
  })

  it('escapes names in the HTML, so a patient name cannot inject markup', () => {
    expect(escapeHtml('<b>Ravi</b> & "Sons"')).toBe('&lt;b&gt;Ravi&lt;/b&gt; &amp; &quot;Sons&quot;')
  })
})

describe('trigger points', () => {
  it('sends at the same moments as WhatsApp: booked, arrived, called, prescription, receipt', async () => {
    configureEmail()
    const spy = mockSendOk()
    const { adminAgent, doctorAgent, doctor, patient } = await setupClinic()

    const appt = (await adminAgent.post('/api/v1/appointments').send(bookingPayload(doctor, patient))).body.data.appointment
    await adminAgent.post(`/api/v1/appointments/${appt._id}/arrive`)
    await doctorAgent.post(`/api/v1/appointments/${appt._id}/skip`)
    await doctorAgent.post(`/api/v1/appointments/${appt._id}/call`)

    const consultation = (
      await doctorAgent.post('/api/v1/consultations').send({ patientId: patient._id, doctorId: doctor._id, appointmentId: appt._id })
    ).body.data.consultation
    const prescription = (
      await doctorAgent.post('/api/v1/prescriptions').send({
        patientId: patient._id,
        doctorId: doctor._id,
        consultationId: consultation._id,
        medicines: [{ name: 'Paracetamol', dosage: '500mg', frequency: '1-0-1', duration: '3 days' }],
      })
    ).body.data.prescription
    await doctorAgent.post(`/api/v1/prescriptions/${prescription._id}/finalize`)

    const invoice = (
      await adminAgent.post('/api/v1/invoices').send({ patientId: patient._id, items: [{ description: 'Fee', quantity: 1, unitPrice: 500 }] })
    ).body.data.invoice
    await adminAgent.post(`/api/v1/invoices/${invoice._id}/payments`).send({ amount: 200, method: 'CASH' })
    await adminAgent.post(`/api/v1/invoices/${invoice._id}/payments`).send({ amount: 300, method: 'UPI' })
    await flushEmailSends()

    // Skip and the part payment add nothing; the receipt goes once, when paid in full.
    const kinds = (await EmailMessage.find({}).sort({ createdAt: 1 })).map((r) => r.kind)
    expect(kinds).toEqual([
      'APPOINTMENT_CONFIRMATION',
      'QUEUE_UPDATE',
      'QUEUE_UPDATE',
      'DOCUMENT_READY',
      'DOCUMENT_READY',
    ])
    expect(spy.mock.calls.map((c) => c[0].subject).slice(-2)).toEqual([
      'Your prescription from Sharma Clinic is ready',
      'Your receipt from Sharma Clinic is ready',
    ])
  })

  it('never fails the booking when Brevo is down', async () => {
    configureEmail()
    jest.spyOn(emailClient, 'sendEmail').mockRejectedValue(new Error('Brevo is on fire'))
    const { adminAgent, doctor, patient } = await setupClinic()

    const res = await adminAgent.post('/api/v1/appointments').send(bookingPayload(doctor, patient))
    expect(res.status).toBe(201)

    await flushEmailSends()
    const row = await EmailMessage.findOne({})
    expect(row.status).toBe('FAILED')
    expect(row.errorMessage).toMatch(/Brevo is on fire/)
  })

  it('emails tomorrow\'s reminders from the evening sweep, for clinics with only email on', async () => {
    configureEmail()
    const spy = mockSendOk()
    const { adminAgent, doctor, patient } = await setupClinic()
    await adminAgent.post('/api/v1/appointments').send(bookingPayload(doctor, patient, 1))
    await flushEmailSends()
    spy.mockClear()

    const summary = await sendTomorrowsReminders()

    expect(summary.appointments).toBe(1)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0].subject).toMatch(/^Reminder: your appointment at Sharma Clinic tomorrow/)
  })
})

describe('unsubscribing', () => {
  function linkParams(url) {
    const { searchParams } = new URL(url)
    return { p: searchParams.get('p'), t: searchParams.get('t') }
  }

  it('turns email off for that patient from the link in the email, with no login', async () => {
    configureEmail()
    const spy = mockSendOk()
    const { adminAgent, doctor, patient } = await setupClinic()

    const res = await request(app)
      .post('/api/v1/public/email/unsubscribe')
      .send(linkParams(buildUnsubscribeUrl(patient._id)))
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ clinicName: 'Sharma Clinic' })
    expect((await Patient.findById(patient._id)).emailOptIn).toBe(false)

    await adminAgent.post('/api/v1/appointments').send(bookingPayload(doctor, patient))
    await flushEmailSends()
    expect(spy).not.toHaveBeenCalled()
    expect((await EmailMessage.findOne({})).errorMessage).toMatch(/unsubscribed/)
  })

  it('refuses a forged or tampered link', async () => {
    const { patient } = await setupClinic()
    const other = await setupClinic({ patientEmail: 'other@example.com' })
    // Patient A's id with patient B's signature.
    const forged = { p: patient._id, t: linkParams(buildUnsubscribeUrl(other.patient._id)).t }
    const res = await request(app).post('/api/v1/public/email/unsubscribe').send(forged)
    expect(res.status).toBe(404)
    expect(res.body.data).toBeUndefined()

    const garbage = await request(app).post('/api/v1/public/email/unsubscribe').send({ p: 'not-an-id', t: 'x' })
    expect(garbage.status).toBe(400)

    expect((await Patient.findById(patient._id)).emailOptIn).toBe(true)
  })
})

describe('clinic settings', () => {
  it('lets the owner turn email on and set the clinic\'s contact email', async () => {
    const { agent } = await registerClinicAgent(app)
    const res = await agent.patch('/api/v1/clinics/settings').send({ emailEnabled: true, email: 'Desk@Clinic.in' })
    expect(res.status).toBe(200)
    expect(res.body.data.clinic.emailEnabled).toBe(true)
    expect(res.body.data.clinic.email).toBe('desk@clinic.in')

    const bad = await agent.patch('/api/v1/clinics/settings').send({ email: 'not-an-email' })
    expect(bad.status).toBe(400)
  })
})
