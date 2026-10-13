import { jest } from '@jest/globals'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { connectTestDB, clearTestDB, disconnectTestDB } from './testDb.js'
import { registerClinicAgent, createStaffAgent } from './helpers.js'
import { cloudinaryClient } from '../src/services/cloudinaryClient.js'

const app = createApp()

beforeAll(async () => {
  await connectTestDB()
})

afterEach(async () => {
  await clearTestDB()
  jest.restoreAllMocks()
})

afterAll(async () => {
  await disconnectTestDB()
})

// No real Cloudinary account in tests - cloudinaryClient is a plain mutable
// object, so its methods are stubbed directly (same approach as documents).
function mockCloudinary(publicId = 'clinic-crm/test/branding/logo-1') {
  jest.spyOn(cloudinaryClient, 'uploadPublicImage').mockResolvedValue({
    public_id: publicId,
    secure_url: `https://res.cloudinary.test/${publicId}.png`,
  })
  jest.spyOn(cloudinaryClient, 'destroyPublicImage').mockResolvedValue({ result: 'ok' })
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function uploadLogo(agent, { buffer = PNG, filename = 'logo.png', contentType = 'image/png' } = {}) {
  return agent.post('/api/v1/clinics/settings/logo').attach('logo', buffer, { filename, contentType })
}

describe('uploading a clinic logo', () => {
  it('lets the owner upload a logo and returns it on the clinic', async () => {
    const { agent } = await registerClinicAgent(app)
    mockCloudinary()

    const res = await uploadLogo(agent)

    expect(res.status).toBe(200)
    expect(res.body.data.clinic.logoUrl).toBe('https://res.cloudinary.test/clinic-crm/test/branding/logo-1.png')
    expect(cloudinaryClient.uploadPublicImage).toHaveBeenCalledTimes(1)

    const settings = await agent.get('/api/v1/clinics/settings')
    expect(settings.body.data.clinic.logoUrl).toBe(res.body.data.clinic.logoUrl)
  })

  it('stores the upload under the clinic\'s own branding folder', async () => {
    const { agent, clinic } = await registerClinicAgent(app)
    mockCloudinary()

    await uploadLogo(agent)

    expect(cloudinaryClient.uploadPublicImage).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ folder: `clinic-crm/${clinic._id}/branding` }),
    )
  })

  it('deletes the previous image after a replacement is saved', async () => {
    const { agent } = await registerClinicAgent(app)
    mockCloudinary('clinic-crm/test/branding/old')
    await uploadLogo(agent)

    cloudinaryClient.uploadPublicImage.mockResolvedValue({
      public_id: 'clinic-crm/test/branding/new',
      secure_url: 'https://res.cloudinary.test/new.png',
    })
    const res = await uploadLogo(agent)

    expect(res.body.data.clinic.logoUrl).toBe('https://res.cloudinary.test/new.png')
    expect(cloudinaryClient.destroyPublicImage).toHaveBeenCalledWith('clinic-crm/test/branding/old')
  })

  it('still saves the new logo if deleting the old image fails', async () => {
    const { agent } = await registerClinicAgent(app)
    mockCloudinary('clinic-crm/test/branding/old')
    await uploadLogo(agent)

    cloudinaryClient.uploadPublicImage.mockResolvedValue({
      public_id: 'clinic-crm/test/branding/new',
      secure_url: 'https://res.cloudinary.test/new.png',
    })
    cloudinaryClient.destroyPublicImage.mockRejectedValue(new Error('cloudinary down'))
    jest.spyOn(console, 'error').mockImplementation(() => {})

    const res = await uploadLogo(agent)

    expect(res.status).toBe(200)
    expect(res.body.data.clinic.logoUrl).toBe('https://res.cloudinary.test/new.png')
  })

  it('rejects anything that is not a PNG, JPG or WebP image', async () => {
    const { agent } = await registerClinicAgent(app)
    mockCloudinary()

    const svg = await uploadLogo(agent, {
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      filename: 'logo.svg',
      contentType: 'image/svg+xml',
    })
    expect(svg.status).toBe(400)
    expect(svg.body.code).toBe('UNSUPPORTED_FILE_TYPE')

    const pdf = await uploadLogo(agent, { buffer: Buffer.from('%PDF-1.4'), filename: 'logo.pdf', contentType: 'application/pdf' })
    expect(pdf.status).toBe(400)
    expect(cloudinaryClient.uploadPublicImage).not.toHaveBeenCalled()
  })

  it('rejects images over 2MB', async () => {
    const { agent } = await registerClinicAgent(app)
    mockCloudinary()

    const res = await uploadLogo(agent, { buffer: Buffer.alloc(2 * 1024 * 1024 + 1) })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('FILE_TOO_LARGE')
    expect(cloudinaryClient.uploadPublicImage).not.toHaveBeenCalled()
  })

  it('returns 400 when no file is attached', async () => {
    const { agent } = await registerClinicAgent(app)
    mockCloudinary()

    const res = await agent.post('/api/v1/clinics/settings/logo')

    expect(res.status).toBe(400)
  })

  it('is owner-only, like the rest of Clinic Settings', async () => {
    const { agent: ownerAgent } = await registerClinicAgent(app)
    const { agent: adminAgent } = await createStaffAgent(app, ownerAgent, 'admin')
    const { agent: doctorAgent } = await createStaffAgent(app, ownerAgent, 'doctor')
    mockCloudinary()

    expect((await uploadLogo(adminAgent)).status).toBe(403)
    expect((await uploadLogo(doctorAgent)).status).toBe(403)
    expect((await adminAgent.delete('/api/v1/clinics/settings/logo')).status).toBe(403)
    expect(cloudinaryClient.uploadPublicImage).not.toHaveBeenCalled()
  })

  it('cannot be set through the ordinary settings update', async () => {
    const { agent } = await registerClinicAgent(app)

    const res = await agent
      .patch('/api/v1/clinics/settings')
      .send({ logoUrl: 'https://evil.example/logo.png', logoPublicId: 'x' })

    expect(res.status).toBe(200)
    expect(res.body.data.clinic.logoUrl).toBeUndefined()
  })
})

describe('removing a clinic logo', () => {
  it('clears the logo and deletes the image', async () => {
    const { agent } = await registerClinicAgent(app)
    mockCloudinary('clinic-crm/test/branding/logo-1')
    await uploadLogo(agent)

    const res = await agent.delete('/api/v1/clinics/settings/logo')

    expect(res.status).toBe(200)
    expect(res.body.data.clinic.logoUrl).toBeUndefined()
    expect(cloudinaryClient.destroyPublicImage).toHaveBeenCalledWith('clinic-crm/test/branding/logo-1')
  })
})

describe('logo on the public queue page', () => {
  it('is null until uploaded, then the public URL', async () => {
    const { agent, clinic } = await registerClinicAgent(app)

    const before = await request(app).get(`/api/v1/public/clinics/${clinic.slug}/queue`)
    expect(before.body.data.clinicLogoUrl).toBeNull()

    mockCloudinary()
    await uploadLogo(agent)

    const after = await request(app).get(`/api/v1/public/clinics/${clinic.slug}/queue`)
    expect(after.body.data.clinicLogoUrl).toBe('https://res.cloudinary.test/clinic-crm/test/branding/logo-1.png')
  })
})
