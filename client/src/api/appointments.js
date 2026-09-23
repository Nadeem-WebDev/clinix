import apiClient from './client.js'

export async function listAppointments(params = {}) {
  const { data } = await apiClient.get('/appointments', { params })
  return data.data // { appointments, pagination }
}

export async function getAppointment(id) {
  const { data } = await apiClient.get(`/appointments/${id}`)
  return data.data.appointment
}

export async function createAppointment(payload) {
  const { data } = await apiClient.post('/appointments', payload)
  return data.data.appointment
}

export async function rescheduleAppointment(id, payload) {
  const { data } = await apiClient.patch(`/appointments/${id}`, payload)
  return data.data.appointment
}

async function action(id, path) {
  const { data } = await apiClient.post(`/appointments/${id}/${path}`)
  return data.data.appointment
}

export const cancelAppointment = (id) => action(id, 'cancel')
export const markNoShow = (id) => action(id, 'no-show')
export const markArrived = (id) => action(id, 'arrive')
export const callNext = (id) => action(id, 'call')
export const completeAppointment = (id) => action(id, 'complete')
export const skipAppointment = (id) => action(id, 'skip')

export async function getQueue(params = {}) {
  const { data } = await apiClient.get('/appointments/queue', { params })
  return data.data // { date, appointments }
}
