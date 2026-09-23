import apiClient from './client.js'

export async function getDashboard() {
  const { data } = await apiClient.get('/dashboard')
  return data.data
}
