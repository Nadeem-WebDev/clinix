import apiClient from './client.js'

export async function listAuditLogs(params = {}) {
  const { data } = await apiClient.get('/audit-logs', { params })
  return data.data // { logs, pagination }
}
