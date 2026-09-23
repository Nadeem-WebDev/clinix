import apiClient from './client.js'

export async function listPrescriptions(params = {}) {
  const { data } = await apiClient.get('/prescriptions', { params })
  return data.data // { prescriptions, pagination }
}

export async function getPrescription(id) {
  const { data } = await apiClient.get(`/prescriptions/${id}`)
  return data.data.prescription
}

export async function createPrescription(payload) {
  const { data } = await apiClient.post('/prescriptions', payload)
  return data.data.prescription
}

export async function updatePrescription(id, payload) {
  const { data } = await apiClient.patch(`/prescriptions/${id}`, payload)
  return data.data.prescription
}

export async function finalizePrescription(id) {
  const { data } = await apiClient.post(`/prescriptions/${id}/finalize`)
  return data.data.prescription
}

export function prescriptionPdfUrl(id) {
  const base = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'
  return `${base}/prescriptions/${id}/pdf`
}
