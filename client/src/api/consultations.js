import apiClient from './client.js'

export async function listConsultations(params = {}) {
  const { data } = await apiClient.get('/consultations', { params })
  return data.data // { consultations, pagination }
}

export async function getConsultation(id) {
  const { data } = await apiClient.get(`/consultations/${id}`)
  return data.data.consultation
}

export async function getFollowUpsDue() {
  const { data } = await apiClient.get('/consultations/follow-ups')
  return data.data.followUps
}

export async function createConsultation(payload) {
  const { data } = await apiClient.post('/consultations', payload)
  return data.data.consultation
}

export async function updateConsultation(id, payload) {
  const { data } = await apiClient.patch(`/consultations/${id}`, payload)
  return data.data.consultation
}
