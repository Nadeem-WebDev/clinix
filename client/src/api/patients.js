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

// Profile history tabs - assembled server-side and already trimmed to what
// the signed-in role may see (see patientHistory.service.js).
export async function getPatientVisits(id) {
  const { data } = await apiClient.get(`/patients/${id}/visits`)
  return data.data.visits
}

export async function getPatientFollowUps(id) {
  const { data } = await apiClient.get(`/patients/${id}/follow-ups`)
  return data.data.followUps
}
