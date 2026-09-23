import apiClient from './client.js'

export async function getPatientReport(params = {}) {
  const { data } = await apiClient.get('/reports/patients', { params })
  return data.data
}

export async function getAppointmentReport(params = {}) {
  const { data } = await apiClient.get('/reports/appointments', { params })
  return data.data
}

export async function getRevenueReport(params = {}) {
  const { data } = await apiClient.get('/reports/revenue', { params })
  return data.data
}
