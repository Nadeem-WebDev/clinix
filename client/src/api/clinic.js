import apiClient from './client.js'

export async function getClinicSettings() {
  const { data } = await apiClient.get('/clinics/settings')
  return data.data.clinic
}

export async function updateClinicSettings(payload) {
  const { data } = await apiClient.patch('/clinics/settings', payload)
  return data.data.clinic
}

export async function uploadClinicLogo(file) {
  const formData = new FormData()
  formData.append('logo', file)
  const { data } = await apiClient.post('/clinics/settings/logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data.data.clinic
}

export async function removeClinicLogo() {
  const { data } = await apiClient.delete('/clinics/settings/logo')
  return data.data.clinic
}
