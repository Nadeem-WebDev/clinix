import apiClient, { API_BASE_URL } from './client.js'

export async function listInvoices(params = {}) {
  const { data } = await apiClient.get('/invoices', { params })
  return data.data // { invoices, pagination }
}

// Today's completed visits nobody has billed yet (listReadyToBill on the server).
export async function listReadyToBill() {
  const { data } = await apiClient.get('/invoices/ready-to-bill')
  return data.data.visits
}

export async function getInvoice(id) {
  const { data } = await apiClient.get(`/invoices/${id}`)
  return data.data.invoice
}

export async function createInvoice(payload) {
  const { data } = await apiClient.post('/invoices', payload)
  return data.data.invoice
}

export async function updateInvoice(id, payload) {
  const { data } = await apiClient.patch(`/invoices/${id}`, payload)
  return data.data.invoice
}

export async function recordPayment(id, payload) {
  const { data } = await apiClient.post(`/invoices/${id}/payments`, payload)
  return data.data // { invoice, payment }
}

export async function listPayments(id) {
  const { data } = await apiClient.get(`/invoices/${id}/payments`)
  return data.data.payments
}

export async function refundInvoice(id) {
  const { data } = await apiClient.post(`/invoices/${id}/refund`)
  return data.data.invoice
}

export function receiptPdfUrl(id) {
  return `${API_BASE_URL}/invoices/${id}/receipt/pdf`
}
