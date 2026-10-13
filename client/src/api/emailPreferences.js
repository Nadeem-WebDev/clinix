import apiClient from './client.js'

// The unsubscribe link in notification emails. Needs no session - the link
// itself carries the patient id (p) and a server signature (t).
export async function unsubscribeFromEmail({ p, t }) {
  const { data } = await apiClient.post('/public/email/unsubscribe', { p, t })
  return data.data // { clinicName }
}
