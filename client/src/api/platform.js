import apiClient from './client.js'

// Clinix's own admin panel. Its session cookie is scoped to /api/v1/platform
// on the server, so these calls never carry a clinic session and the clinic
// API never sees a platform one.

export async function platformLogin(payload) {
  const { data } = await apiClient.post('/platform/auth/login', payload)
  return data.data.admin
}

export async function platformLogout() {
  await apiClient.post('/platform/auth/logout')
}

export async function getPlatformMe() {
  const { data } = await apiClient.get('/platform/auth/me')
  return data.data.admin
}

export async function getPlatformOverview() {
  const { data } = await apiClient.get('/platform/overview')
  return data.data
}

export async function listPlatformClinics(params) {
  const { data } = await apiClient.get('/platform/clinics', { params })
  return data.data
}

export async function getPlatformClinic(id) {
  const { data } = await apiClient.get(`/platform/clinics/${id}`)
  return data.data
}

export async function suspendClinic(id, reason) {
  const { data } = await apiClient.post(`/platform/clinics/${id}/suspend`, {
    reason,
  })
  return data.data.clinic
}

export async function unsuspendClinic(id) {
  const { data } = await apiClient.post(`/platform/clinics/${id}/unsuspend`)
  return data.data.clinic
}

export async function resetStaffPassword(clinicId, userId) {
  const { data } = await apiClient.post(
    `/platform/clinics/${clinicId}/staff/${userId}/reset-password`,
  )
  return data.data
}
