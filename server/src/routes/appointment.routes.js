import { Router } from 'express'
import {
  createAppointmentHandler,
  listAppointmentsHandler,
  getAppointmentHandler,
  rescheduleAppointmentHandler,
  cancelAppointmentHandler,
  markArrivedHandler,
  markNoShowHandler,
  callNextHandler,
  completeAppointmentHandler,
  skipAppointmentHandler,
  getQueueHandler,
} from '../controllers/appointment.controller.js'
import { authenticate } from '../middleware/authenticate.js'
import { authorize } from '../middleware/authorize.js'
import { validateBody, validateQuery } from '../middleware/validate.js'
import {
  createAppointmentSchema,
  rescheduleAppointmentSchema,
  listAppointmentsQuerySchema,
  queueQuerySchema,
} from '../validators/appointment.validators.js'

const router = Router()

router.use(authenticate)

// Front-desk lifecycle: booking, rescheduling, arrival, cancel, no-show.
router.post('/', authorize('owner', 'admin', 'receptionist'), validateBody(createAppointmentSchema), createAppointmentHandler)

// Static path - must come before "/:id" or Express would treat "queue" as an id.
router.get('/queue', validateQuery(queueQuerySchema), getQueueHandler)

router.get('/', validateQuery(listAppointmentsQuerySchema), listAppointmentsHandler)
router.get('/:id', getAppointmentHandler)
router.patch(
  '/:id',
  authorize('owner', 'admin', 'receptionist'),
  validateBody(rescheduleAppointmentSchema),
  rescheduleAppointmentHandler,
)
router.post('/:id/cancel', authorize('owner', 'admin', 'receptionist'), cancelAppointmentHandler)
router.post('/:id/no-show', authorize('owner', 'admin', 'receptionist'), markNoShowHandler)
router.post('/:id/arrive', authorize('owner', 'admin', 'receptionist'), markArrivedHandler)

// Queue lifecycle: the doctor (or owner/admin) drives calling/completing/skipping.
router.post('/:id/call', authorize('owner', 'admin', 'doctor'), callNextHandler)
router.post('/:id/complete', authorize('owner', 'admin', 'doctor'), completeAppointmentHandler)
router.post('/:id/skip', authorize('owner', 'admin', 'doctor'), skipAppointmentHandler)

export default router
