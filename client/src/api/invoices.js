import apiClient from './client.js'

export async function listInvoices(params = {}) {
  const { data } = await apiClient.get('/invoices', { params })
  return data.data // { invoices, pagination }
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
  const base = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'
  return `${base}/invoices/${id}/receipt/pdf`
}
