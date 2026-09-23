import apiClient from './client.js'

export async function listDocuments(params = {}) {
  const { data } = await apiClient.get('/documents', { params })
  return data.data.documents
}

export async function uploadDocument({ patientId, documentType, file }) {
  const formData = new FormData()
  formData.append('patientId', patientId)
  formData.append('documentType', documentType)
  formData.append('file', file)
  const { data } = await apiClient.post('/documents', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data.data.document
}

export async function getDocumentUrl(id) {
  const { data } = await apiClient.get(`/documents/${id}/url`)
  return data.data.url
}

export async function deleteDocument(id) {
  await apiClient.delete(`/documents/${id}`)
}
