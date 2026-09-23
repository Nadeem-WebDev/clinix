import { Router } from 'express'
import {
  uploadDocumentHandler,
  listDocumentsHandler,
  getDocumentUrlHandler,
  deleteDocumentHandler,
} from '../controllers/document.controller.js'
import { authenticate } from '../middleware/authenticate.js'
import { authorize } from '../middleware/authorize.js'
import { validateBody, validateQuery } from '../middleware/validate.js'
import { uploadSingleFile } from '../middleware/upload.js'
import { uploadDocumentSchema, listDocumentsQuerySchema } from '../validators/document.validators.js'

const router = Router()

// Same access model as Consultations - owner/admin/doctor only, matching the
// clinical nature of the example document types (blood report, X-ray, MRI,
// previous prescription).
router.use(authenticate, authorize('owner', 'admin', 'doctor'))

router.post('/', uploadSingleFile('file'), validateBody(uploadDocumentSchema), uploadDocumentHandler)
router.get('/', validateQuery(listDocumentsQuerySchema), listDocumentsHandler)
router.get('/:id/url', getDocumentUrlHandler)
router.delete('/:id', deleteDocumentHandler)

export default router
