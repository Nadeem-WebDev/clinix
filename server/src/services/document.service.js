import mongoose from 'mongoose'
import { PatientDocument } from '../models/PatientDocument.js'
import { Patient } from '../models/Patient.js'
import { cloudinaryClient } from './cloudinaryClient.js'
import { ApiError } from '../utils/ApiError.js'

function assertValidId(id, label = 'id') {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.badRequest(`Invalid ${label}`, 'INVALID_ID')
  }
}

function resourceTypeFor(mimeType) {
  return mimeType === 'application/pdf' ? 'raw' : 'image'
}

export async function uploadDocument(clinicId, { patientId, documentType, file }, uploadedByUserId) {
  const patient = await Patient.findOne({ _id: patientId, clinicId })
  if (!patient) throw ApiError.badRequest('Patient not found in this clinic', 'PATIENT_NOT_FOUND')

  const resourceType = resourceTypeFor(file.mimetype)
  const uploaded = await cloudinaryClient.upload(file.buffer, {
    folder: `clinic-crm/${clinicId}/patients/${patientId}`,
    resourceType,
    filename: file.originalname,
  })

  return PatientDocument.create({
    clinicId,
    patientId,
    uploadedBy: uploadedByUserId,
    documentType,
    originalFilename: file.originalname,
    mimeType: file.mimetype,
    fileSize: file.size,
    cloudinaryPublicId: uploaded.public_id,
    cloudinaryResourceType: resourceType,
  })
}

export async function listDocuments(clinicId, { patientId }) {
  const filter = { clinicId }
  if (patientId) filter.patientId = patientId
  return PatientDocument.find(filter)
    .sort({ createdAt: -1 })
    .populate('uploadedBy', 'name')
    .populate('patientId', 'fullName patientId')
}

async function findOwned(clinicId, id) {
  assertValidId(id, 'document id')
  const doc = await PatientDocument.findOne({ _id: id, clinicId })
  if (!doc) throw ApiError.notFound('Document not found')
  return doc
}

export async function getSignedUrl(clinicId, id) {
  const doc = await findOwned(clinicId, id)
  const url = cloudinaryClient.signedUrl(doc.cloudinaryPublicId, doc.cloudinaryResourceType)
  return { url, document: doc }
}

export async function deleteDocument(clinicId, id) {
  const doc = await findOwned(clinicId, id)
  await cloudinaryClient.destroy(doc.cloudinaryPublicId, doc.cloudinaryResourceType)
  await doc.deleteOne()
  return doc
}
