import zlib from 'node:zlib'
import { createApp } from '../src/app.js'
import { connectTestDB, clearTestDB, disconnectTestDB } from './testDb.js'
import { registerClinicAgent, createStaffAgent } from './helpers.js'
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

// A real 1x1 PNG - pdfkit decodes the bytes, so a fake buffer won't embed.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const hasImage = (pdf) => pdf.toString('latin1').includes('/Subtype /Image')

// The text drawn on a pdfkit PDF: inflate each content stream and join the
// hex strings of every TJ operator (kerning splits a word across several).
function pdfText(pdf) {
  const raw = pdf.toString('latin1')
  let text = ''
  for (const [, body] of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content
    try {
      content = zlib.inflateSync(Buffer.from(body, 'latin1')).toString('latin1')
    } catch {
      continue
    }
    for (const [, tj] of content.matchAll(/\[(.*?)\]\s*TJ/g)) {
      text += [...tj.matchAll(/<([0-9a-fA-F]*)>/g)].map(([, hex]) => Buffer.from(hex, 'hex').toString('latin1')).join('')
      text += '\n'
    }
  }
  return text
}

// PDF responses are binary; collect them into a Buffer.
const binary = (req) =>
  req.buffer(true).parse((res, cb) => {
    const chunks = []
    res.on('data', (c) => chunks.push(c))
    res.on('end', () => cb(null, Buffer.concat(chunks)))
  })

async function setup() {
  const { agent: ownerAgent } = await registerClinicAgent(app)
  const { agent: doctorAgent, email } = await createStaffAgent(app, ownerAgent, 'doctor')
  const { agent: receptionistAgent, email: receptionistEmail } = await createStaffAgent(app, ownerAgent, 'receptionist')
  const staff = (await ownerAgent.get('/api/v1/users')).body.data.staff
  const doctor = staff.find((u) => u.email === email)
  const receptionist = staff.find((u) => u.email === receptionistEmail)
  return { ownerAgent, doctorAgent, receptionistAgent, doctor, receptionist }
}

const PROFILE = {
  qualifications: 'MBBS, MD (General Medicine)',
  specialization: 'General Physician',
  registrationNumber: 'MMC-123456',
  registrationCouncil: 'Maharashtra Medical Council',
}

describe('doctor profile', () => {
  it('lets the doctor fill in their own profile, and shows it in the staff list', async () => {
    const { doctorAgent, ownerAgent, doctor } = await setup()

    const res = await doctorAgent.patch(`/api/v1/users/${doctor._id}/doctor-profile`).send(PROFILE)
    expect(res.status).toBe(200)
    expect(res.body.data.user.doctorProfile).toMatchObject(PROFILE)

    const listed = (await ownerAgent.get('/api/v1/users')).body.data.staff.find((u) => u._id === doctor._id)
    expect(listed.doctorProfile).toMatchObject(PROFILE)
  })

  it('lets an owner edit any doctor, and clears a field sent empty', async () => {
    const { ownerAgent, doctor } = await setup()
    await ownerAgent.patch(`/api/v1/users/${doctor._id}/doctor-profile`).send(PROFILE)

    const res = await ownerAgent.patch(`/api/v1/users/${doctor._id}/doctor-profile`).send({ specialization: '' })

    expect(res.status).toBe(200)
    expect(res.body.data.user.doctorProfile.specialization).toBeUndefined()
    expect(res.body.data.user.doctorProfile.registrationNumber).toBe('MMC-123456')
  })

  it("forbids other staff from editing a doctor's profile", async () => {
    const { receptionistAgent, doctor } = await setup()
    const res = await receptionistAgent.patch(`/api/v1/users/${doctor._id}/doctor-profile`).send(PROFILE)
    expect(res.status).toBe(403)
  })

  it('only doctors have one', async () => {
    const { ownerAgent, receptionist } = await setup()
    const res = await ownerAgent.patch(`/api/v1/users/${receptionist._id}/doctor-profile`).send(PROFILE)
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('NOT_A_DOCTOR')
  })

  it('cannot reach a doctor in another clinic', async () => {
    const { doctor } = await setup()
    const { agent: otherOwner } = await registerClinicAgent(app)
    const res = await otherOwner.patch(`/api/v1/users/${doctor._id}/doctor-profile`).send(PROFILE)
    expect(res.status).toBe(404)
  })

  it('rejects unknown fields and over-long values', async () => {
    const { ownerAgent, doctor } = await setup()
    const url = `/api/v1/users/${doctor._id}/doctor-profile`
    expect((await ownerAgent.patch(url).send({ role: 'owner' })).status).toBe(400)
    expect((await ownerAgent.patch(url).send({ registrationNumber: 'x'.repeat(51) })).status).toBe(400)
  })
})

describe('doctor signature', () => {
  it('stores the signature privately: the staff list never carries the image', async () => {
    const { doctorAgent, ownerAgent, doctor } = await setup()

    const res = await doctorAgent
      .put(`/api/v1/users/${doctor._id}/signature`)
      .attach('signature', PNG_1X1, { filename: 'sign.png', contentType: 'image/png' })
    expect(res.status).toBe(200)
    expect(res.body.data.user.doctorProfile.signature.updatedAt).toBeTruthy()
    expect(res.body.data.user.doctorProfile.signature.data).toBeUndefined()

    const listed = (await ownerAgent.get('/api/v1/users')).body.data.staff.find((u) => u._id === doctor._id)
    expect(listed.doctorProfile.signature.updatedAt).toBeTruthy()
    expect(listed.doctorProfile.signature.data).toBeUndefined()
    expect(JSON.stringify(listed)).not.toContain('iVBOR')
  })

  it('serves the image to the doctor and owner only', async () => {
    const { doctorAgent, ownerAgent, receptionistAgent, doctor } = await setup()
    await doctorAgent
      .put(`/api/v1/users/${doctor._id}/signature`)
      .attach('signature', PNG_1X1, { filename: 'sign.png', contentType: 'image/png' })

    const own = await binary(doctorAgent.get(`/api/v1/users/${doctor._id}/signature`))
    expect(own.status).toBe(200)
    expect(own.headers['content-type']).toBe('image/png')
    expect(own.headers['cache-control']).toContain('no-store')
    expect(Buffer.compare(own.body, PNG_1X1)).toBe(0)

    expect((await ownerAgent.get(`/api/v1/users/${doctor._id}/signature`)).status).toBe(200)
    expect((await receptionistAgent.get(`/api/v1/users/${doctor._id}/signature`)).status).toBe(403)
  })

  it('refuses a file that is not really a PNG or JPG', async () => {
    const { doctorAgent, doctor } = await setup()
    const res = await doctorAgent
      .put(`/api/v1/users/${doctor._id}/signature`)
      .attach('signature', Buffer.from('<svg/>'), { filename: 'sign.png', contentType: 'image/png' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('UNSUPPORTED_FILE_TYPE')

    const webp = await doctorAgent
      .put(`/api/v1/users/${doctor._id}/signature`)
      .attach('signature', PNG_1X1, { filename: 'sign.webp', contentType: 'image/webp' })
    expect(webp.status).toBe(400)
  })

  it('removes the signature', async () => {
    const { doctorAgent, doctor } = await setup()
    await doctorAgent
      .put(`/api/v1/users/${doctor._id}/signature`)
      .attach('signature', PNG_1X1, { filename: 'sign.png', contentType: 'image/png' })

    const res = await doctorAgent.delete(`/api/v1/users/${doctor._id}/signature`)
    expect(res.status).toBe(200)
    // Nothing else was on file, so the whole (now empty) profile is gone.
    expect(res.body.data.user.doctorProfile?.signature).toBeUndefined()
    expect((await doctorAgent.get(`/api/v1/users/${doctor._id}/signature`)).status).toBe(404)
    const stored = await User.findById(doctor._id).select('+doctorProfile.signature.data')
    expect(stored.doctorProfile?.signature?.data).toBeUndefined()
  })
})

describe('doctor details on the prescription PDF', () => {
  async function prescription({ ownerAgent, doctorAgent, doctor }, { finalize, consultationFields = {} }) {
    const patient = (
      await ownerAgent.post('/api/v1/patients').send({ fullName: 'Rahul Sharma', age: 34, gender: 'male', phone: '9876543210' })
    ).body.data.patient
    const consultation = (
      await doctorAgent
        .post('/api/v1/consultations')
        .send({ patientId: patient._id, doctorId: doctor._id, diagnosis: 'Common cold', ...consultationFields })
    ).body.data.consultation
    const created = (
      await doctorAgent.post('/api/v1/prescriptions').send({
        doctorId: doctor._id,
        patientId: patient._id,
        consultationId: consultation._id,
        medicines: [{ name: 'Paracetamol', dosage: '500mg', frequency: '1-0-1', duration: '3 days' }],
      })
    ).body.data.prescription
    if (finalize) await doctorAgent.post(`/api/v1/prescriptions/${created._id}/finalize`)
    const res = await binary(doctorAgent.get(`/api/v1/prescriptions/${created._id}/pdf`))
    expect(res.status).toBe(200)
    return res.body
  }

  async function withProfileAndSignature(ctx) {
    await ctx.doctorAgent.patch(`/api/v1/users/${ctx.doctor._id}/doctor-profile`).send(PROFILE)
    await ctx.doctorAgent
      .put(`/api/v1/users/${ctx.doctor._id}/signature`)
      .attach('signature', PNG_1X1, { filename: 'sign.png', contentType: 'image/png' })
  }

  it('prints qualifications, specialization and registration, and signs a finalized one', async () => {
    const ctx = await setup()
    await withProfileAndSignature(ctx)

    const pdf = await prescription(ctx, { finalize: true })
    const text = pdfText(pdf)

    expect(text).toContain('MBBS, MD (General Medicine)')
    expect(text).toContain('General Physician')
    expect(text).toContain('Reg. No. MMC-123456 (Maharashtra Medical Council)')
    expect(hasImage(pdf)).toBe(true)
    expect(text).not.toContain('Draft - not signed')
  })

  it('never puts the signature on a draft', async () => {
    const ctx = await setup()
    await withProfileAndSignature(ctx)

    const pdf = await prescription(ctx, { finalize: false })

    expect(hasImage(pdf)).toBe(false)
    expect(pdfText(pdf)).toContain('Draft - not signed')
  })

  it('prints the consultation\'s complaint, vitals and diagnosis above the medicines', async () => {
    const ctx = await setup()
    const text = pdfText(
      await prescription(ctx, {
        finalize: true,
        consultationFields: { chiefComplaint: 'Sore throat', vitals: { temperature: '99.1 F', bloodPressure: '118/76' } },
      }),
    )

    expect(text).toContain('Sore throat')
    expect(text).toContain('Temp 99.1 F')
    expect(text).toContain('BP 118/76')
    expect(text).toContain('Common cold')
  })

  it('leaves out whatever is not on file', async () => {
    const ctx = await setup()

    const text = pdfText(await prescription(ctx, { finalize: true }))

    expect(text).not.toContain('Reg. No.')
    expect(text).toContain('Paracetamol')
  })
})
