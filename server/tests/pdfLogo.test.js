import { jest } from '@jest/globals'
import { createApp } from '../src/app.js'
import { connectTestDB, clearTestDB, disconnectTestDB } from './testDb.js'
import { registerClinicAgent, createStaffAgent } from './helpers.js'
import { Clinic } from '../src/models/Clinic.js'
import { cloudinaryClient } from '../src/services/cloudinaryClient.js'
import { clearPdfLogoCache } from '../src/services/pdf/clinicLogo.js'

const app = createApp()

beforeAll(async () => {
  await connectTestDB()
})

afterEach(async () => {
  await clearTestDB()
  clearPdfLogoCache()
  jest.restoreAllMocks()
})

afterAll(async () => {
  await disconnectTestDB()
})

// A real 1x1 PNG - pdfkit decodes the bytes, so a fake buffer won't embed.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const LOGO_URL = 'https://res.cloudinary.test/image/upload/c_limit,h_240,w_240/logo.png'

// An embedded image shows up as an image XObject in the PDF's object
// dictionaries, which pdfkit does not compress.
const hasImage = (pdf) => pdf.toString('latin1').includes('/Subtype /Image')

function mockLogoFetch(response = () => new Response(PNG_1X1, { status: 200, headers: { 'Content-Type': 'image/png' } })) {
  jest.spyOn(cloudinaryClient, 'pdfLogoUrl').mockReturnValue(LOGO_URL)
  return jest.spyOn(globalThis, 'fetch').mockImplementation(async () => response())
}

async function setup({ withLogo = true } = {}) {
  const { agent: ownerAgent, clinic } = await registerClinicAgent(app)
  const { agent: doctorAgent, email: doctorEmail } = await createStaffAgent(app, ownerAgent, 'doctor')
  const doctor = (await ownerAgent.get('/api/v1/users')).body.data.staff.find((u) => u.email === doctorEmail)
  const patient = (
    await ownerAgent.post('/api/v1/patients').send({ fullName: 'Rahul Sharma', age: 34, gender: 'male', phone: '9876543210' })
  ).body.data.patient

  if (withLogo) {
    await Clinic.updateOne({ _id: clinic._id }, { logoUrl: LOGO_URL, logoPublicId: 'clinic-crm/test/branding/logo-a' })
  }
  return { ownerAgent, doctorAgent, doctor, patient }
}

async function prescriptionPdf({ doctorAgent, doctor, patient }) {
  const consultation = (
    await doctorAgent.post('/api/v1/consultations').send({ patientId: patient._id, doctorId: doctor._id, diagnosis: 'Common cold' })
  ).body.data.consultation
  const prescription = (
    await doctorAgent.post('/api/v1/prescriptions').send({
      doctorId: doctor._id,
      patientId: patient._id,
      consultationId: consultation._id,
      medicines: [{ name: 'Paracetamol', dosage: '500mg', frequency: '1-0-1', duration: '3 days' }],
    })
  ).body.data.prescription
  return doctorAgent.get(`/api/v1/prescriptions/${prescription._id}/pdf`)
}

async function receiptPdf({ ownerAgent, patient }) {
  const invoice = (
    await ownerAgent.post('/api/v1/invoices').send({
      patientId: patient._id,
      items: [{ description: 'Consultation fee', quantity: 1, unitPrice: 500 }],
    })
  ).body.data.invoice
  return ownerAgent.get(`/api/v1/invoices/${invoice._id}/receipt/pdf`)
}

describe('clinic logo in generated PDFs', () => {
  it('embeds the logo in a prescription PDF', async () => {
    const ctx = await setup()
    const fetchSpy = mockLogoFetch()

    const res = await prescriptionPdf(ctx)

    expect(res.status).toBe(200)
    expect(res.body.slice(0, 4).toString()).toBe('%PDF')
    expect(hasImage(res.body)).toBe(true)
    expect(cloudinaryClient.pdfLogoUrl).toHaveBeenCalledWith('clinic-crm/test/branding/logo-a')
    expect(fetchSpy).toHaveBeenCalledWith(LOGO_URL, expect.anything())
  })

  it('embeds the logo in a receipt PDF', async () => {
    const ctx = await setup()
    mockLogoFetch()

    const res = await receiptPdf(ctx)

    expect(res.status).toBe(200)
    expect(hasImage(res.body)).toBe(true)
  })

  it('does not fetch anything when the clinic has no logo', async () => {
    const ctx = await setup({ withLogo: false })
    const fetchSpy = mockLogoFetch()

    const res = await receiptPdf(ctx)

    expect(res.status).toBe(200)
    expect(hasImage(res.body)).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('still produces the PDF, without a logo, when the logo fetch fails', async () => {
    const ctx = await setup()
    mockLogoFetch(() => {
      throw new Error('network down')
    })
    jest.spyOn(console, 'error').mockImplementation(() => {})

    const res = await prescriptionPdf(ctx)

    expect(res.status).toBe(200)
    expect(res.body.slice(0, 4).toString()).toBe('%PDF')
    expect(hasImage(res.body)).toBe(false)
  })

  it('still produces the PDF when Cloudinary answers with an error', async () => {
    const ctx = await setup()
    mockLogoFetch(() => new Response('not found', { status: 404 }))
    jest.spyOn(console, 'error').mockImplementation(() => {})

    const res = await receiptPdf(ctx)

    expect(res.status).toBe(200)
    expect(hasImage(res.body)).toBe(false)
  })

  it('still produces the PDF when the bytes are not a usable image', async () => {
    const ctx = await setup()
    mockLogoFetch(() => new Response('definitely not a png', { status: 200 }))
    jest.spyOn(console, 'error').mockImplementation(() => {})

    const res = await receiptPdf(ctx)

    expect(res.status).toBe(200)
    expect(res.body.slice(0, 4).toString()).toBe('%PDF')
    expect(hasImage(res.body)).toBe(false)
  })

  it('reuses a fetched logo for the next PDF instead of downloading it again', async () => {
    const ctx = await setup()
    const fetchSpy = mockLogoFetch()

    await receiptPdf(ctx)
    await receiptPdf(ctx)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
