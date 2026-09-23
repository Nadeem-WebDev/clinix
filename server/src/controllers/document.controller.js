import * as documentService from '../services/document.service.js'
import { sendSuccess } from '../utils/ApiResponse.js'
import { writeAuditLog } from '../utils/audit.js'
import { ApiError } from '../utils/ApiError.js'

function audit(req, resourceId, action, metadata) {
  return writeAuditLog({
    clinicId: req.clinicId,
    userId: req.user._id,
    action,
    resourceType: 'PatientDocument',
    resourceId,
    metadata,
    ipAddress: req.ip,
  })
}

export async function uploadDocumentHandler(req, res, next) {
  try {
    if (!req.file) {
      throw ApiError.badRequest('A file is required', 'FILE_REQUIRED')
    }
    const document = await documentService.uploadDocument(
      req.clinicId,
      { ...req.body, file: req.file },
      req.user._id,
    )
    await audit(req, document._id, 'DOCUMENT_UPLOADED', { documentType: document.documentType })
    return sendSuccess(res, { status: 201, message: 'Document uploaded', data: { document } })
  } catch (err) {
    return next(err)
  }
}

export async function listDocumentsHandler(req, res, next) {
  try {
    const documents = await documentService.listDocuments(req.clinicId, req.validatedQuery)
    return sendSuccess(res, { data: { documents } })
  } catch (err) {
    return next(err)
  }
}

export async function getDocumentUrlHandler(req, res, next) {
  try {
    const { url, document } = await documentService.getSignedUrl(req.clinicId, req.params.id)
    await audit(req, document._id, 'DOCUMENT_VIEWED')
    return sendSuccess(res, { data: { url } })
  } catch (err) {
    return next(err)
  }
}

export async function deleteDocumentHandler(req, res, next) {
  try {
    const document = await documentService.deleteDocument(req.clinicId, req.params.id)
    await audit(req, document._id, 'DOCUMENT_DELETED')
    return sendSuccess(res, { message: 'Document deleted' })
  } catch (err) {
    return next(err)
  }
}
