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
