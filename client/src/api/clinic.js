import apiClient from './client.js'

export async function getClinicSettings() {
  const { data } = await apiClient.get('/clinics/settings')
  return data.data.clinic
}

export async function updateClinicSettings(payload) {
  const { data } = await apiClient.patch('/clinics/settings', payload)
  return data.data.clinic
}
