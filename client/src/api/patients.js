import apiClient from './client.js'

export async function listPatients({ search, page = 1, limit = 20 } = {}) {
  const { data } = await apiClient.get('/patients', { params: { search, page, limit } })
  return data.data // { patients, pagination }
}

export async function getPatient(id) {
  const { data } = await apiClient.get(`/patients/${id}`)
  return data.data.patient
}

export async function createPatient(payload) {
  const { data } = await apiClient.post('/patients', payload)
  return data.data.patient
}

export async function updatePatient(id, payload) {
  const { data } = await apiClient.patch(`/patients/${id}`, payload)
  return data.data.patient
}
