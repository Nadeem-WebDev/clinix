import { Router } from 'express'
import {
  getClinicSettingsHandler,
  updateClinicSettingsHandler,
  uploadClinicLogoHandler,
  removeClinicLogoHandler,
} from '../controllers/clinic.controller.js'
import { authenticate } from '../middleware/authenticate.js'
import { authorize } from '../middleware/authorize.js'
import { validateBody } from '../middleware/validate.js'
import { uploadSingleImage } from '../middleware/upload.js'
import { updateClinicSettingsSchema } from '../validators/clinic.validators.js'

const router = Router()

router.use(authenticate)

// Any authenticated clinic user can view clinic settings (working hours,
// contact info, default fee) - but only the clinic's Owner can change them.
// Unlike every other admin-gated module, admin does NOT get this one: Owner
// is intentionally the one role above admin, and Clinic Settings is its
// one exclusive surface (see auth.service.js - the clinic's registering
// user is always created with role 'owner').
router.get('/settings', getClinicSettingsHandler)
router.patch('/settings', authorize('owner'), validateBody(updateClinicSettingsSchema), updateClinicSettingsHandler)

// Logo is part of Clinic Settings, so it carries the same Owner-only rule.
// multipart/form-data with the image in a `logo` field.
router.post('/settings/logo', authorize('owner'), uploadSingleImage('logo'), uploadClinicLogoHandler)
router.delete('/settings/logo', authorize('owner'), removeClinicLogoHandler)

export default router
