import apiClient from './client.js'

export async function registerClinic(payload) {
  const { data } = await apiClient.post('/auth/register-clinic', payload)
  return data.data.user
}

export async function login(payload) {
  const { data } = await apiClient.post('/auth/login', payload)
  return data.data.user
}

export async function logout() {
  await apiClient.post('/auth/logout')
}

export async function getCurrentUser() {
  const { data } = await apiClient.get('/auth/me')
  return data.data.user
}
