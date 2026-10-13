import apiClient from './client.js'

export async function listStaff() {
  const { data } = await apiClient.get('/users')
  return data.data.staff
}

export async function createStaff(payload) {
  const { data } = await apiClient.post('/users', payload)
  return data.data.user
}

export async function setStaffActive(id, active) {
  const { data } = await apiClient.patch(`/users/${id}/active`, { active })
  return data.data.user
}

export async function updateDoctorProfile(id, profile) {
  const { data } = await apiClient.patch(`/users/${id}/doctor-profile`, profile)
  return data.data.user
}

export async function uploadDoctorSignature(id, file) {
  const formData = new FormData()
  formData.append('signature', file)
  const { data } = await apiClient.put(`/users/${id}/signature`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data.data.user
}

export async function removeDoctorSignature(id) {
  const { data } = await apiClient.delete(`/users/${id}/signature`)
  return data.data.user
}

// The signature image itself, as a Blob, for the profile form's preview.
// Fetched through apiClient rather than used as a plain <img src>: when the
// app and the API are on different origins (the local two-server dev setup,
// the Vercel + Render split) the browser refuses a cross-origin <img> of it,
// because Helmet sends Cross-Origin-Resource-Policy: same-origin. An API
// request (CORS with credentials, already allowed) works on every setup.
// `version` (the upload time) busts the browser cache after a change.
export async function fetchDoctorSignature(id, version) {
  const { data } = await apiClient.get(`/users/${id}/signature`, {
    params: { v: version ?? '' },
    responseType: 'blob',
  })
  return data
}
