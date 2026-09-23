import apiClient from './client.js'

// The one endpoint in this app that needs no session. It still goes
// through apiClient so the base URL stays in one place - the auth cookie
// it would send is simply irrelevant here (a waiting-room TV has none).
export async function getPublicQueue(slug, params = {}) {
  const { data } = await apiClient.get(`/public/clinics/${encodeURIComponent(slug)}/queue`, { params })
  return data.data // { clinicName, date, nowServing, waitingCount, upcoming, estimatedWaitMinutes, isEstimate }
}
