import { createApp } from '../src/app.js'
import { connectTestDB, clearTestDB, disconnectTestDB } from './testDb.js'
import { registerClinicAgent, createStaffAgent } from './helpers.js'

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

async function setupClinic(overrides = {}) {
  const { agent: adminAgent } = await registerClinicAgent(app, overrides)
  const { agent: doctorAgent } = await createStaffAgent(app, adminAgent, 'doctor')
  const { agent: nurseAgent } = await createStaffAgent(app, adminAgent, 'nurse')

  const patientRes = await adminAgent.post('/api/v1/patients').send({
    fullName: 'Rahul Sharma',
    age: 34,
    gender: 'male',
    phone: '9876543210',
  })
  const patient = patientRes.body.data.patient

  return { adminAgent, doctorAgent, nurseAgent, patient }
}

function basePayload(patient, overrides = {}) {
  return {
    patientId: patient._id,
    items: [
      { description: 'Consultation fee', quantity: 1, unitPrice: 500 },
      { description: 'Dressing', quantity: 2, unitPrice: 100 },
    ],
    ...overrides,
  }
}

describe('creating invoices', () => {
  it('computes subtotal/total server-side from items, discount, and tax', async () => {
    const { adminAgent, patient } = await setupClinic()

    const res = await adminAgent
      .post('/api/v1/invoices')
      .send(basePayload(patient, { discount: 50, tax: 20 }))

    expect(res.status).toBe(201)
    const inv = res.body.data.invoice
    expect(inv.invoiceNumber).toBe('INV-1001')
    expect(inv.items[0].amount).toBe(500)
    expect(inv.items[1].amount).toBe(200)
    expect(inv.subtotal).toBe(700)
    expect(inv.total).toBe(700 - 50 + 20)
    expect(inv.paymentStatus).toBe('PENDING')
  })

  it('ignores any client-sent total/subtotal/amount and recomputes them', async () => {
    const { adminAgent, patient } = await setupClinic()

    const res = await adminAgent.post('/api/v1/invoices').send({
      ...basePayload(patient),
      total: 999999,
      subtotal: 999999,
      items: [{ description: 'Fee', quantity: 1, unitPrice: 500, amount: 999999 }],
    })

    expect(res.status).toBe(201)
    expect(res.body.data.invoice.total).toBe(500)
    expect(res.body.data.invoice.items[0].amount).toBe(500)
  })

  it('rejects an empty items list', async () => {
    const { adminAgent, patient } = await setupClinic()
    const res = await adminAgent.post('/api/v1/invoices').send(basePayload(patient, { items: [] }))
    expect(res.status).toBe(400)
  })

  it('rejects a doctorId that is not actually a doctor', async () => {
    const { adminAgent, patient } = await setupClinic()
    const nurseUser = (await adminAgent.get('/api/v1/users')).body.data.staff.find((u) => u.role === 'nurse')

    const res = await adminAgent
      .post('/api/v1/invoices')
      .send(basePayload(patient, { doctorId: nurseUser._id }))

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('DOCTOR_NOT_FOUND')
  })

  it('forbids doctors and nurses from creating or viewing invoices', async () => {
    const { doctorAgent, nurseAgent, patient } = await setupClinic()
    const createRes = await doctorAgent.post('/api/v1/invoices').send(basePayload(patient))
    const listRes = await nurseAgent.get('/api/v1/invoices')

    expect(createRes.status).toBe(403)
    expect(listRes.status).toBe(403)
  })
})

describe('tenant isolation', () => {
  it('404s for an invoice belonging to another clinic', async () => {
    const clinicA = await setupClinic({ email: 'admin-a@iso.test' })
    const clinicB = await setupClinic({ email: 'admin-b@iso.test' })

    const created = await clinicA.adminAgent.post('/api/v1/invoices').send(basePayload(clinicA.patient))
    const res = await clinicB.adminAgent.get(`/api/v1/invoices/${created.body.data.invoice._id}`)
    expect(res.status).toBe(404)
  })
})

describe('editing', () => {
  it('allows edits before any payment, blocks edits once a payment is recorded', async () => {
    const { adminAgent, patient } = await setupClinic()
    const created = await adminAgent.post('/api/v1/invoices').send(basePayload(patient))
    const id = created.body.data.invoice._id

    const editRes = await adminAgent
      .patch(`/api/v1/invoices/${id}`)
      .send({ items: [{ description: 'Revised fee', quantity: 1, unitPrice: 300 }] })
    expect(editRes.status).toBe(200)
    expect(editRes.body.data.invoice.total).toBe(300)

    await adminAgent.post(`/api/v1/invoices/${id}/payments`).send({ amount: 100, method: 'CASH' })

    const editAfterPayment = await adminAgent
      .patch(`/api/v1/invoices/${id}`)
      .send({ discount: 10 })
    expect(editAfterPayment.status).toBe(400)
    expect(editAfterPayment.body.code).toBe('INVOICE_HAS_PAYMENTS')
  })
})

describe('recording payments', () => {
  it('rejects a payment that exceeds the remaining balance', async () => {
    const { adminAgent, patient } = await setupClinic()
    const created = await adminAgent
      .post('/api/v1/invoices')
      .send(basePayload(patient, { items: [{ description: 'Fee', quantity: 1, unitPrice: 500 }] }))
    const id = created.body.data.invoice._id

    const res = await adminAgent.post(`/api/v1/invoices/${id}/payments`).send({ amount: 600, method: 'CASH' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('PAYMENT_EXCEEDS_BALANCE')
  })

  it('moves PENDING -> PARTIAL -> PAID as payments are recorded', async () => {
    const { adminAgent, patient } = await setupClinic()
    const created = await adminAgent
      .post('/api/v1/invoices')
      .send(basePayload(patient, { items: [{ description: 'Fee', quantity: 1, unitPrice: 500 }] }))
    const id = created.body.data.invoice._id

    const partial = await adminAgent.post(`/api/v1/invoices/${id}/payments`).send({ amount: 200, method: 'UPI' })
    expect(partial.body.data.invoice.paymentStatus).toBe('PARTIAL')
    expect(partial.body.data.invoice.amountPaid).toBe(200)

    const full = await adminAgent.post(`/api/v1/invoices/${id}/payments`).send({ amount: 300, method: 'CASH' })
    expect(full.body.data.invoice.paymentStatus).toBe('PAID')
    expect(full.body.data.invoice.amountPaid).toBe(500)

    const payments = await adminAgent.get(`/api/v1/invoices/${id}/payments`)
    expect(payments.body.data.payments).toHaveLength(2)
  })
})

describe('refunds', () => {
  it('refunds an invoice and blocks further payments or re-refunding', async () => {
    const { adminAgent, patient } = await setupClinic()
    const created = await adminAgent.post('/api/v1/invoices').send(basePayload(patient))
    const id = created.body.data.invoice._id

    const refundRes = await adminAgent.post(`/api/v1/invoices/${id}/refund`)
    expect(refundRes.body.data.invoice.paymentStatus).toBe('REFUNDED')

    const paymentAfterRefund = await adminAgent
      .post(`/api/v1/invoices/${id}/payments`)
      .send({ amount: 10, method: 'CASH' })
    expect(paymentAfterRefund.status).toBe(400)
    expect(paymentAfterRefund.body.code).toBe('INVOICE_REFUNDED')

    const secondRefund = await adminAgent.post(`/api/v1/invoices/${id}/refund`)
    expect(secondRefund.status).toBe(400)
  })
})

describe('receipt PDF', () => {
  it('streams a real PDF for an invoice', async () => {
    const { adminAgent, patient } = await setupClinic()
    const created = await adminAgent.post('/api/v1/invoices').send(basePayload(patient))
    await adminAgent.post(`/api/v1/invoices/${created.body.data.invoice._id}/payments`).send({
      amount: 100,
      method: 'CASH',
    })

    const res = await adminAgent.get(`/api/v1/invoices/${created.body.data.invoice._id}/receipt/pdf`)

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('application/pdf')
    expect(Buffer.isBuffer(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThan(500)
    expect(res.body.slice(0, 4).toString()).toBe('%PDF')
  })
})

describe('listing', () => {
  it('filters by status and paginates', async () => {
    const { adminAgent, patient } = await setupClinic()
    const first = await adminAgent.post('/api/v1/invoices').send(basePayload(patient))
    await adminAgent.post('/api/v1/invoices').send(basePayload(patient))
    await adminAgent
      .post(`/api/v1/invoices/${first.body.data.invoice._id}/payments`)
      .send({ amount: 700, method: 'CASH' })

    const paidOnly = await adminAgent.get('/api/v1/invoices').query({ status: 'PAID' })
    expect(paidOnly.body.data.invoices).toHaveLength(1)

    const paged = await adminAgent.get('/api/v1/invoices').query({ limit: 1, page: 1 })
    expect(paged.body.data.invoices).toHaveLength(1)
    expect(paged.body.data.pagination.total).toBe(2)
  })
})
