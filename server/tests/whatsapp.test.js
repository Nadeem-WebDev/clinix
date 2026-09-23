import crypto from 'node:crypto'
import { jest } from '@jest/globals'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { connectTestDB, clearTestDB, disconnectTestDB } from './testDb.js'
import { registerClinicAgent, createStaffAgent } from './helpers.js'
import { env } from '../src/config/env.js'
import { Clinic } from '../src/models/Clinic.js'
import { Patient } from '../src/models/Patient.js'
import { WhatsappMessage } from '../src/models/WhatsappMessage.js'
import { whatsappClient } from '../src/services/whatsappClient.js'
import {
  sendTemplateMessage,
  flushWhatsappSends,
  buildPublicQueueUrl,
} from '../src/services/whatsapp.service.js'
import { isStopKeyword } from '../src/services/whatsappWebhook.service.js'

const app = createApp()

// env is a plain exported object and ES modules are singletons, so tests
// flip these the same way documents.test.js stubs cloudinaryClient - there
// is no other way to exercise the enabled path without real credentials.
const originalWhatsappEnv = { ...env.whatsapp }

beforeAll(async () => {
  await connectTestDB()
})

beforeEach(() => {
  Object.assign(env.whatsapp, originalWhatsappEnv)
})

afterEach(async () => {
  await clearTestDB()
  jest.restoreAllMocks()
  Object.assign(env.whatsapp, originalWhatsappEnv)
})

afterAll(async () => {
  await disconnectTestDB()
})

function mockSendOk(messageId = 'wamid.TEST123') {
  return jest
    .spyOn(whatsappClient, 'sendTemplate')
    .mockResolvedValue({ messages: [{ id: messageId }] })
}

function mockSendFailure(message = 'socket hang up') {
  return jest.spyOn(whatsappClient, 'sendTemplate').mockRejectedValue(new Error(message))
}

// Silences the service's intentional console output so a passing run isn't
// buried in expected warnings.
function muteLogs() {
  jest.spyOn(console, 'info').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
}

async function setupClinic({ whatsappEnabled = true } = {}) {
  const { agent: adminAgent, clinic } = await registerClinicAgent(app, {
    clinicName: 'Sharma Clinic',
  })
  const { agent: doctorAgent, email: doctorEmail } = await createStaffAgent(
    app,
    adminAgent,
    'doctor',
    { name: 'Anita Rao' },
  )
  const staffRes = await adminAgent.get('/api/v1/users')
  const doctor = staffRes.body.data.staff.find((u) => u.email === doctorEmail)

  await Clinic.updateOne({ _id: clinic._id }, { $set: { whatsappEnabled } })

  const patientRes = await adminAgent.post('/api/v1/patients').send({
    fullName: 'Priya Sharma',
    age: 31,
    gender: 'female',
    phone: '9876543210',
  })

  return { adminAgent, doctorAgent, clinic, doctor, patient: patientRes.body.data.patient }
}

function bookingPayload(doctor, patient) {
  const scheduledAt = new Date()
  scheduledAt.setUTCHours(10, 0, 0, 0)
  return { doctorId: doctor._id, patientId: patient._id, scheduledAt: scheduledAt.toISOString() }
}

describe('the WHATSAPP_ENABLED kill switch', () => {
  it('makes zero outbound network calls when off, and still logs the decision', async () => {
    muteLogs()
    env.whatsapp.enabled = false
    const { clinic, patient } = await setupClinic({ whatsappEnabled: true })

    // The strongest form of the assertion: nothing reaches fetch at all,
    // not merely nothing reaching our own client wrapper.
    const fetchSpy = jest.spyOn(globalThis, 'fetch')
    const clientSpy = jest.spyOn(whatsappClient, 'sendTemplate')

    await sendTemplateMessage({
      clinicId: clinic._id,
      patientId: patient._id,
      templateName: 'appointment_confirmation',
    })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(clientSpy).not.toHaveBeenCalled()

    const rows = await WhatsappMessage.find({})
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('QUEUED')
    expect(rows[0].errorMessage).toMatch(/disabled platform-wide/)
  })

  it('is off by default, from the environment as shipped', () => {
    // .env.example ships WHATSAPP_ENABLED=false, and anything other than
    // the exact string 'true' must read as off.
    expect(originalWhatsappEnv.enabled).toBe(false)
  })
})

describe('sendTemplateMessage', () => {
  it('sends and records the provider message id on success', async () => {
    muteLogs()
    env.whatsapp.enabled = true
    const { clinic, patient } = await setupClinic({ whatsappEnabled: true })
    const spy = mockSendOk('wamid.ABC')

    const row = await sendTemplateMessage({
      clinicId: clinic._id,
      patientId: patient._id,
      templateName: 'appointment_confirmation',
      relatedResourceType: 'Appointment',
    })

    expect(spy).toHaveBeenCalledTimes(1)
    // The stored national number is normalised to E.164 before it is sent.
    expect(spy.mock.calls[0][0].toPhone).toBe('919876543210')
    expect(row.status).toBe('SENT')
    expect(row.providerMessageId).toBe('wamid.ABC')
    expect(row.sentAt).toBeTruthy()
  })

  it('never throws when the Graph API fails, and records FAILED', async () => {
    muteLogs()
    env.whatsapp.enabled = true
    const { clinic, patient } = await setupClinic({ whatsappEnabled: true })
    mockSendFailure('socket hang up')

    await expect(
      sendTemplateMessage({
        clinicId: clinic._id,
        patientId: patient._id,
        templateName: 'appointment_confirmation',
      }),
    ).resolves.toBeTruthy()

    const rows = await WhatsappMessage.find({})
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('FAILED')
    expect(rows[0].errorMessage).toContain('socket hang up')
  })

  it('skips, without sending, when the clinic has WhatsApp off', async () => {
    muteLogs()
    env.whatsapp.enabled = true
    const { clinic, patient } = await setupClinic({ whatsappEnabled: false })
    const spy = jest.spyOn(whatsappClient, 'sendTemplate')

    await sendTemplateMessage({
      clinicId: clinic._id,
      patientId: patient._id,
      templateName: 'appointment_confirmation',
    })

    expect(spy).not.toHaveBeenCalled()
    const rows = await WhatsappMessage.find({})
    expect(rows[0].status).toBe('QUEUED')
    expect(rows[0].errorMessage).toMatch(/disabled for this clinic/)
  })

  it('skips, without sending, when the patient has opted out', async () => {
    muteLogs()
    env.whatsapp.enabled = true
    const { clinic, patient } = await setupClinic({ whatsappEnabled: true })
    await Patient.updateOne({ _id: patient._id }, { $set: { whatsappOptIn: false } })
    const spy = jest.spyOn(whatsappClient, 'sendTemplate')

    await sendTemplateMessage({
      clinicId: clinic._id,
      patientId: patient._id,
      templateName: 'appointment_confirmation',
    })

    expect(spy).not.toHaveBeenCalled()
    const rows = await WhatsappMessage.find({})
    expect(rows[0].status).toBe('QUEUED')
    expect(rows[0].errorMessage).toMatch(/opted out/)
  })

  it('records a row in every branch, so a non-send is always explainable', async () => {
    muteLogs()
    const { clinic, patient } = await setupClinic({ whatsappEnabled: true })

    env.whatsapp.enabled = false
    await sendTemplateMessage({ clinicId: clinic._id, patientId: patient._id, templateName: 't' })

    env.whatsapp.enabled = true
    await Clinic.updateOne({ _id: clinic._id }, { $set: { whatsappEnabled: false } })
    await sendTemplateMessage({ clinicId: clinic._id, patientId: patient._id, templateName: 't' })

    await Clinic.updateOne({ _id: clinic._id }, { $set: { whatsappEnabled: true } })
    await Patient.updateOne({ _id: patient._id }, { $set: { whatsappOptIn: false } })
    await sendTemplateMessage({ clinicId: clinic._id, patientId: patient._id, templateName: 't' })

    await Patient.updateOne({ _id: patient._id }, { $set: { whatsappOptIn: true } })
    mockSendFailure()
    await sendTemplateMessage({ clinicId: clinic._id, patientId: patient._id, templateName: 't' })

    expect(await WhatsappMessage.countDocuments({})).toBe(4)
  })

  it('builds the public queue link from the clinic slug', async () => {
    const { clinic } = await setupClinic()
    expect(buildPublicQueueUrl(clinic.slug)).toMatch(/\/q\/sharma-clinic$/)
  })
})

describe('trigger points never fail the primary action', () => {
  it('books the appointment even when the WhatsApp send blows up', async () => {
    muteLogs()
    env.whatsapp.enabled = true
    const { adminAgent, doctor, patient } = await setupClinic({ whatsappEnabled: true })
    mockSendFailure('Meta is on fire')

    const res = await adminAgent.post('/api/v1/appointments').send(bookingPayload(doctor, patient))

    expect(res.status).toBe(201)
    expect(res.body.data.appointment.tokenNumber).toBe(1)

    await flushWhatsappSends()
    const rows = await WhatsappMessage.find({ relatedResourceType: 'Appointment' })
    expect(rows[0].status).toBe('FAILED')
  })

  it('finalizes the prescription even when the WhatsApp send blows up', async () => {
    muteLogs()
    env.whatsapp.enabled = true
    const { doctorAgent, doctor, patient } = await setupClinic({ whatsappEnabled: true })
    mockSendFailure()

    const consultationRes = await doctorAgent.post('/api/v1/consultations').send({
      patientId: patient._id,
      doctorId: doctor._id,
      diagnosis: 'Common cold',
    })
    const prescriptionRes = await doctorAgent.post('/api/v1/prescriptions').send({
      doctorId: doctor._id,
      patientId: patient._id,
      consultationId: consultationRes.body.data.consultation._id,
      medicines: [{ name: 'Amoxicillin', dosage: '500mg', frequency: '1-0-1', duration: '5 days' }],
    })

    const res = await doctorAgent.post(
      `/api/v1/prescriptions/${prescriptionRes.body.data.prescription._id}/finalize`,
    )

    expect(res.status).toBe(200)
    expect(res.body.data.prescription.finalized).toBe(true)

    await flushWhatsappSends()
    const rows = await WhatsappMessage.find({ relatedResourceType: 'Prescription' })
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('FAILED')
  })

  it('records the payment even when the WhatsApp send blows up', async () => {
    muteLogs()
    env.whatsapp.enabled = true
    const { adminAgent, patient } = await setupClinic({ whatsappEnabled: true })
    mockSendFailure()

    const invoiceRes = await adminAgent.post('/api/v1/invoices').send({
      patientId: patient._id,
      items: [{ description: 'Consultation', quantity: 1, unitPrice: 500 }],
    })
    const invoiceId = invoiceRes.body.data.invoice._id

    const res = await adminAgent
      .post(`/api/v1/invoices/${invoiceId}/payments`)
      .send({ amount: 500, method: 'CASH' })

    expect(res.status).toBe(201)
    expect(res.body.data.invoice.paymentStatus).toBe('PAID')

    await flushWhatsappSends()
    const rows = await WhatsappMessage.find({ relatedResourceType: 'Invoice' })
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('FAILED')
  })

  it('messages the patient on arrival and on being called, but not on skip', async () => {
    muteLogs()
    env.whatsapp.enabled = true
    const { adminAgent, doctorAgent, doctor, patient } = await setupClinic({ whatsappEnabled: true })
    mockSendOk()

    const apptRes = await adminAgent.post('/api/v1/appointments').send(bookingPayload(doctor, patient))
    const apptId = apptRes.body.data.appointment._id
    await flushWhatsappSends()

    await adminAgent.post(`/api/v1/appointments/${apptId}/arrive`)
    await flushWhatsappSends()
    await doctorAgent.post(`/api/v1/appointments/${apptId}/skip`)
    await flushWhatsappSends()

    // One confirmation + one arrival update. The skip adds nothing: the
    // rest of the waiting room is not messaged when the queue shuffles.
    expect(await WhatsappMessage.countDocuments({})).toBe(2)

    await doctorAgent.post(`/api/v1/appointments/${apptId}/call`)
    await flushWhatsappSends()
    expect(await WhatsappMessage.countDocuments({})).toBe(3)
  })

  it('sends nothing at all on the same flows when the kill switch is off', async () => {
    muteLogs()
    env.whatsapp.enabled = false
    const { adminAgent, doctor, patient } = await setupClinic({ whatsappEnabled: true })
    const fetchSpy = jest.spyOn(globalThis, 'fetch')

    await adminAgent.post('/api/v1/appointments').send(bookingPayload(doctor, patient))
    await flushWhatsappSends()

    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('stop keywords', () => {
  it.each(['STOP', 'stop', ' Stop ', 'unsubscribe', 'BAND', 'बंद', 'थांबा'])(
    'treats %p as an opt-out',
    (text) => {
      expect(isStopKeyword(text)).toBe(true)
    },
  )

  it.each(['please stop the reminders', 'stopwatch', 'hello', ''])(
    'does not treat %p as an opt-out',
    (text) => {
      expect(isStopKeyword(text)).toBe(false)
    },
  )
})

describe('GET /api/v1/whatsapp/webhook (Meta handshake)', () => {
  it('echoes the challenge when the verify token matches', async () => {
    env.whatsapp.webhookVerifyToken = 'correct-horse'

    const res = await request(app).get('/api/v1/whatsapp/webhook').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'correct-horse',
      'hub.challenge': '1234567890',
    })

    expect(res.status).toBe(200)
    expect(res.text).toBe('1234567890')
  })

  it('refuses a wrong token without explaining why', async () => {
    env.whatsapp.webhookVerifyToken = 'correct-horse'

    const res = await request(app).get('/api/v1/whatsapp/webhook').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong',
      'hub.challenge': '1234567890',
    })

    expect(res.status).toBe(403)
    expect(res.text).not.toContain('correct-horse')
  })
})

describe('POST /api/v1/whatsapp/webhook', () => {
  function statusPayload(providerMessageId, status) {
    return {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '123',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                statuses: [
                  { id: providerMessageId, status, timestamp: '1700000000', recipient_id: '919876543210' },
                ],
              },
            },
          ],
        },
      ],
    }
  }

  function inboundPayload(from, body) {
    return {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '123',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                messages: [
                  { from, id: 'wamid.IN1', timestamp: '1700000000', type: 'text', text: { body } },
                ],
              },
            },
          ],
        },
      ],
    }
  }

  it('advances a message to DELIVERED on a delivery receipt', async () => {
    muteLogs()
    env.whatsapp.enabled = true
    const { clinic, patient } = await setupClinic({ whatsappEnabled: true })
    mockSendOk('wamid.DELIVER_ME')
    await sendTemplateMessage({
      clinicId: clinic._id,
      patientId: patient._id,
      templateName: 'appointment_confirmation',
    })

    const res = await request(app)
      .post('/api/v1/whatsapp/webhook')
      .send(statusPayload('wamid.DELIVER_ME', 'delivered'))

    expect(res.status).toBe(200)
    const row = await WhatsappMessage.findOne({ providerMessageId: 'wamid.DELIVER_ME' })
    expect(row.status).toBe('DELIVERED')
  })

  it('opts the patient out when they reply STOP', async () => {
    muteLogs()
    const { patient } = await setupClinic({ whatsappEnabled: true })

    // Meta reports the sender in E.164; the patient is stored with a bare
    // 10-digit national number.
    const res = await request(app)
      .post('/api/v1/whatsapp/webhook')
      .send(inboundPayload('919876543210', 'STOP'))

    expect(res.status).toBe(200)
    const updated = await Patient.findById(patient._id)
    expect(updated.whatsappOptIn).toBe(false)
    expect(updated.whatsappOptOutAt).toBeTruthy()
  })

  it('leaves an ordinary reply alone', async () => {
    muteLogs()
    const { patient } = await setupClinic({ whatsappEnabled: true })

    await request(app)
      .post('/api/v1/whatsapp/webhook')
      .send(inboundPayload('919876543210', 'thanks doctor'))

    const updated = await Patient.findById(patient._id)
    expect(updated.whatsappOptIn).toBe(true)
  })

  it('stops messaging a patient once they have opted out', async () => {
    muteLogs()
    env.whatsapp.enabled = true
    const { adminAgent, doctor, patient } = await setupClinic({ whatsappEnabled: true })
    const spy = mockSendOk()

    await request(app).post('/api/v1/whatsapp/webhook').send(inboundPayload('919876543210', 'STOP'))
    await adminAgent.post('/api/v1/appointments').send(bookingPayload(doctor, patient))
    await flushWhatsappSends()

    expect(spy).not.toHaveBeenCalled()
    const rows = await WhatsappMessage.find({})
    expect(rows[0].errorMessage).toMatch(/opted out/)
  })

  it('rejects a payload whose signature does not match', async () => {
    muteLogs()
    env.whatsapp.appSecret = 'super-secret'

    const res = await request(app)
      .post('/api/v1/whatsapp/webhook')
      .set('X-Hub-Signature-256', 'sha256=deadbeef')
      .send(statusPayload('wamid.X', 'delivered'))

    expect(res.status).toBe(403)
  })

  it('accepts a payload signed with the app secret', async () => {
    muteLogs()
    env.whatsapp.enabled = true
    env.whatsapp.appSecret = 'super-secret'
    const { clinic, patient } = await setupClinic({ whatsappEnabled: true })
    mockSendOk('wamid.SIGNED')
    await sendTemplateMessage({
      clinicId: clinic._id,
      patientId: patient._id,
      templateName: 'appointment_confirmation',
    })

    const payload = statusPayload('wamid.SIGNED', 'read')
    const raw = JSON.stringify(payload)
    const signature = `sha256=${crypto.createHmac('sha256', 'super-secret').update(raw).digest('hex')}`

    const res = await request(app)
      .post('/api/v1/whatsapp/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', signature)
      .send(raw)

    expect(res.status).toBe(200)
    const row = await WhatsappMessage.findOne({ providerMessageId: 'wamid.SIGNED' })
    expect(row.status).toBe('READ')
  })
})
