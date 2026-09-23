import { jest } from '@jest/globals'
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

async function setupClinic(overrides = {}) {
  const { agent: adminAgent } = await registerClinicAgent(app, overrides)
  const { agent: receptionistAgent } = await createStaffAgent(app, adminAgent, 'receptionist')
  const patientRes = await adminAgent.post('/api/v1/patients').send({
    fullName: 'Rahul Sharma',
    age: 34,
    gender: 'male',
    phone: '9876543210',
  })
  return { adminAgent, receptionistAgent, patient: patientRes.body.data.patient }
}

// This environment has no real Cloudinary credentials to test against -
// cloudinaryClient is a plain mutable object specifically so tests can
// stub its methods directly (ESM modules are singletons, so this affects
// every importer, including document.service.js).
function mockCloudinaryUpload() {
  jest
    .spyOn(cloudinaryClient, 'upload')
    .mockResolvedValue({ public_id: 'clinic-crm/test/mock-id', secure_url: 'https://res.cloudinary.test/mock' })
}

describe('uploading documents', () => {
  it('accepts a PDF and records it against the patient', async () => {
    const { adminAgent, patient } = await setupClinic()
    mockCloudinaryUpload()

    const res = await adminAgent
      .post('/api/v1/documents')
      .field('patientId', patient._id)
      .field('documentType', 'Blood report')
      .attach('file', Buffer.from('%PDF-1.4 fake pdf content'), {
        filename: 'blood-report.pdf',
        contentType: 'application/pdf',
      })

    expect(res.status).toBe(201)
    expect(res.body.data.document.documentType).toBe('Blood report')
    expect(res.body.data.document.cloudinaryResourceType).toBe('raw')
    expect(res.body.data.document.cloudinaryPublicId).toBe('clinic-crm/test/mock-id')
    expect(cloudinaryClient.upload).toHaveBeenCalledTimes(1)
  })

  it('accepts a JPEG and categorizes it as an image resource', async () => {
    const { adminAgent, patient } = await setupClinic()
    mockCloudinaryUpload()

    const res = await adminAgent
      .post('/api/v1/documents')
      .field('patientId', patient._id)
      .field('documentType', 'X-ray')
      .attach('file', Buffer.from([0xff, 0xd8, 0xff, 0xdb]), {
        filename: 'xray.jpg',
        contentType: 'image/jpeg',
      })

    expect(res.status).toBe(201)
    expect(res.body.data.document.cloudinaryResourceType).toBe('image')
  })

  it('rejects an unsupported file type without ever calling Cloudinary', async () => {
    const { adminAgent, patient } = await setupClinic()
    mockCloudinaryUpload()

    const res = await adminAgent
      .post('/api/v1/documents')
      .field('patientId', patient._id)
      .field('documentType', 'Something')
      .attach('file', Buffer.from('MZ fake exe'), {
        filename: 'malware.exe',
        contentType: 'application/x-msdownload',
      })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('UNSUPPORTED_FILE_TYPE')
    expect(cloudinaryClient.upload).not.toHaveBeenCalled()
  })

  it('rejects a file over the 10MB limit', async () => {
    const { adminAgent, patient } = await setupClinic()
    mockCloudinaryUpload()

    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 1)
    const res = await adminAgent
      .post('/api/v1/documents')
      .field('patientId', patient._id)
      .field('documentType', 'Big scan')
      .attach('file', oversized, { filename: 'big.png', contentType: 'image/png' })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('FILE_TOO_LARGE')
  }, 15000)

  it('rejects a patientId from a different clinic', async () => {
    const clinicA = await setupClinic({ email: 'admin-a@iso.test' })
    const clinicB = await setupClinic({ email: 'admin-b@iso.test' })
    mockCloudinaryUpload()

    const res = await clinicA.adminAgent
      .post('/api/v1/documents')
      .field('patientId', clinicB.patient._id)
      .field('documentType', 'Blood report')
      .attach('file', Buffer.from('%PDF fake'), { filename: 'r.pdf', contentType: 'application/pdf' })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('PATIENT_NOT_FOUND')
  })

  it('forbids receptionists from uploading or listing documents', async () => {
    const { receptionistAgent, patient } = await setupClinic()
    mockCloudinaryUpload()

    const uploadRes = await receptionistAgent
      .post('/api/v1/documents')
      .field('patientId', patient._id)
      .field('documentType', 'Blood report')
      .attach('file', Buffer.from('%PDF fake'), { filename: 'r.pdf', contentType: 'application/pdf' })
    const listRes = await receptionistAgent.get('/api/v1/documents')

    expect(uploadRes.status).toBe(403)
    expect(listRes.status).toBe(403)
  })
})

describe('tenant isolation', () => {
  it('never lists or serves another clinic\'s documents', async () => {
    const clinicA = await setupClinic({ email: 'admin-a2@iso.test' })
    const clinicB = await setupClinic({ email: 'admin-b2@iso.test' })
    mockCloudinaryUpload()

    const created = await clinicA.adminAgent
      .post('/api/v1/documents')
      .field('patientId', clinicA.patient._id)
      .field('documentType', 'Blood report')
      .attach('file', Buffer.from('%PDF fake'), { filename: 'r.pdf', contentType: 'application/pdf' })
    const documentId = created.body.data.document._id

    const listRes = await clinicB.adminAgent.get('/api/v1/documents')
    expect(listRes.body.data.documents).toHaveLength(0)

    const urlRes = await clinicB.adminAgent.get(`/api/v1/documents/${documentId}/url`)
    expect(urlRes.status).toBe(404)
  })
})

describe('viewing and deleting', () => {
  it('generates a signed URL without ever returning a permanent public link', async () => {
    const { adminAgent, patient } = await setupClinic()
    mockCloudinaryUpload()
    jest.spyOn(cloudinaryClient, 'signedUrl').mockReturnValue('https://res.cloudinary.test/signed?sig=abc&expires=123')

    const created = await adminAgent
      .post('/api/v1/documents')
      .field('patientId', patient._id)
      .field('documentType', 'Blood report')
      .attach('file', Buffer.from('%PDF fake'), { filename: 'r.pdf', contentType: 'application/pdf' })

    const res = await adminAgent.get(`/api/v1/documents/${created.body.data.document._id}/url`)
    expect(res.status).toBe(200)
    expect(res.body.data.url).toContain('signed')
    // document.service.js relies on signedUrl's own default expiry rather
    // than passing it explicitly - only assert the args it actually passes.
    expect(cloudinaryClient.signedUrl).toHaveBeenCalledWith('clinic-crm/test/mock-id', 'raw')
  })

  it('deletes both the Cloudinary asset and the database record', async () => {
    const { adminAgent, patient } = await setupClinic()
    mockCloudinaryUpload()
    jest.spyOn(cloudinaryClient, 'destroy').mockResolvedValue({ result: 'ok' })

    const created = await adminAgent
      .post('/api/v1/documents')
      .field('patientId', patient._id)
      .field('documentType', 'Blood report')
      .attach('file', Buffer.from('%PDF fake'), { filename: 'r.pdf', contentType: 'application/pdf' })
    const id = created.body.data.document._id

    const deleteRes = await adminAgent.delete(`/api/v1/documents/${id}`)
    expect(deleteRes.status).toBe(200)
    expect(cloudinaryClient.destroy).toHaveBeenCalledWith('clinic-crm/test/mock-id', 'raw')

    const listRes = await adminAgent.get('/api/v1/documents')
    expect(listRes.body.data.documents).toHaveLength(0)
  })
})

describe('listing', () => {
  it('filters by patient', async () => {
    const { adminAgent, patient } = await setupClinic()
    mockCloudinaryUpload()
    const otherPatientRes = await adminAgent.post('/api/v1/patients').send({
      fullName: 'Someone Else',
      age: 40,
      gender: 'female',
      phone: '9999999999',
    })

    await adminAgent
      .post('/api/v1/documents')
      .field('patientId', patient._id)
      .field('documentType', 'Blood report')
      .attach('file', Buffer.from('%PDF fake'), { filename: 'r.pdf', contentType: 'application/pdf' })
    await adminAgent
      .post('/api/v1/documents')
      .field('patientId', otherPatientRes.body.data.patient._id)
      .field('documentType', 'X-ray')
      .attach('file', Buffer.from('%PDF fake'), { filename: 'r2.pdf', contentType: 'application/pdf' })

    const res = await adminAgent.get('/api/v1/documents').query({ patientId: patient._id })
    expect(res.body.data.documents).toHaveLength(1)
    expect(res.body.data.documents[0].documentType).toBe('Blood report')
  })
})
