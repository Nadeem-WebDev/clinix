import { Router } from 'express'
import {
  createInvoiceHandler,
  listInvoicesHandler,
  getInvoiceHandler,
  updateInvoiceHandler,
  recordPaymentHandler,
  listPaymentsHandler,
  refundInvoiceHandler,
  getReceiptPdfHandler,
} from '../controllers/invoice.controller.js'
import { authenticate } from '../middleware/authenticate.js'
import { authorize } from '../middleware/authorize.js'
import { validateBody, validateQuery } from '../middleware/validate.js'
import {
  createInvoiceSchema,
  updateInvoiceSchema,
  recordPaymentSchema,
  listInvoicesQuerySchema,
} from '../validators/invoice.validators.js'

const router = Router()

// Billing is front-desk/admin territory, not clinical data - matches the
// Sidebar's existing role gate (owner/admin/receptionist), unlike
// Consultations/Prescriptions which are owner/admin/doctor only.
router.use(authenticate, authorize('owner', 'admin', 'receptionist'))

router.post('/', validateBody(createInvoiceSchema), createInvoiceHandler)
router.get('/', validateQuery(listInvoicesQuerySchema), listInvoicesHandler)
router.get('/:id', getInvoiceHandler)
router.get('/:id/receipt/pdf', getReceiptPdfHandler)
router.patch('/:id', validateBody(updateInvoiceSchema), updateInvoiceHandler)
router.post('/:id/payments', validateBody(recordPaymentSchema), recordPaymentHandler)
router.get('/:id/payments', listPaymentsHandler)
router.post('/:id/refund', refundInvoiceHandler)

export default router
