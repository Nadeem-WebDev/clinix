import * as invoiceService from '../services/invoice.service.js'
import { streamReceiptPdf } from '../services/pdf/receiptPdf.js'
import { Clinic } from '../models/Clinic.js'
import { sendSuccess } from '../utils/ApiResponse.js'
import { writeAuditLog } from '../utils/audit.js'
import { ApiError } from '../utils/ApiError.js'

function audit(req, resourceId, action, metadata) {
  return writeAuditLog({
    clinicId: req.clinicId,
    userId: req.user._id,
    action,
    resourceType: 'Invoice',
    resourceId,
    metadata,
    ipAddress: req.ip,
  })
}

export async function createInvoiceHandler(req, res, next) {
  try {
    const payload = { ...req.body }

    // Billing directly for a consultation with no line items given - prefill
    // a single "Consultation Fee" item from the clinic's configured default
    // (Clinic Settings). The caller can still send explicit items to
    // override this entirely (e.g. a bill covering more than the fee).
    if ((!payload.items || payload.items.length === 0) && payload.consultationId) {
      const clinic = await Clinic.findById(req.clinicId)
      payload.items = [
        { description: 'Consultation Fee', quantity: 1, unitPrice: clinic?.defaultConsultationFee ?? 0 },
      ]
    }

    const invoice = await invoiceService.createInvoice(req.clinicId, payload, req.user._id)
    await audit(req, invoice._id, 'INVOICE_CREATED')
    return sendSuccess(res, { status: 201, message: 'Invoice created', data: { invoice } })
  } catch (err) {
    return next(err)
  }
}

export async function listInvoicesHandler(req, res, next) {
  try {
    const result = await invoiceService.listInvoices(req.clinicId, req.validatedQuery)
    return sendSuccess(res, { data: result })
  } catch (err) {
    return next(err)
  }
}

export async function getInvoiceHandler(req, res, next) {
  try {
    const invoice = await invoiceService.getInvoiceById(req.clinicId, req.params.id)
    return sendSuccess(res, { data: { invoice } })
  } catch (err) {
    return next(err)
  }
}

export async function updateInvoiceHandler(req, res, next) {
  try {
    const invoice = await invoiceService.updateInvoice(req.clinicId, req.params.id, req.body)
    await audit(req, invoice._id, 'INVOICE_UPDATED')
    return sendSuccess(res, { message: 'Invoice updated', data: { invoice } })
  } catch (err) {
    return next(err)
  }
}

export async function recordPaymentHandler(req, res, next) {
  try {
    const { invoice, payment } = await invoiceService.recordPayment(
      req.clinicId,
      req.params.id,
      req.body,
      req.user._id,
    )
    await audit(req, invoice._id, 'PAYMENT_RECORDED', { method: payment.method })
    return sendSuccess(res, {
      status: 201,
      message: 'Payment recorded',
      data: { invoice, payment },
    })
  } catch (err) {
    return next(err)
  }
}

export async function listPaymentsHandler(req, res, next) {
  try {
    const payments = await invoiceService.listPayments(req.clinicId, req.params.id)
    return sendSuccess(res, { data: { payments } })
  } catch (err) {
    return next(err)
  }
}

export async function refundInvoiceHandler(req, res, next) {
  try {
    const invoice = await invoiceService.refundInvoice(req.clinicId, req.params.id)
    await audit(req, invoice._id, 'INVOICE_REFUNDED')
    return sendSuccess(res, { message: 'Invoice refunded', data: { invoice } })
  } catch (err) {
    return next(err)
  }
}

export async function getReceiptPdfHandler(req, res, next) {
  try {
    const invoice = await invoiceService.getInvoiceById(req.clinicId, req.params.id)
    const payments = await invoiceService.listPayments(req.clinicId, req.params.id)
    const clinic = await Clinic.findById(req.clinicId)
    if (!clinic) throw ApiError.notFound('Clinic not found')

    await audit(req, invoice._id, 'RECEIPT_PDF_VIEWED')

    streamReceiptPdf(res, { clinic, invoice, payments })
  } catch (err) {
    next(err)
  }
}
