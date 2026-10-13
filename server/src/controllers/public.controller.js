import * as clinicService from '../services/clinic.service.js'
import * as publicQueueService from '../services/publicQueue.service.js'
import { unsubscribeFromEmail } from '../services/email.service.js'
import { sendSuccess } from '../utils/ApiResponse.js'
import { ApiError } from '../utils/ApiError.js'

// The only controller in this codebase whose handlers run without an
// authenticated session, so there is no req.user / req.clinicId here - the
// tenant comes from the :slug path segment instead, and nothing downstream
// may read a clinicId from anywhere else in the request.
export async function getPublicQueueHandler(req, res, next) {
  try {
    const { slug } = req.validatedParams

    const clinic = await clinicService.getActiveClinicBySlug(slug)
    if (!clinic) {
      // Same generic message for "no such slug" and "clinic deactivated",
      // and no hint about near-misses: this endpoint is enumerable by
      // anyone, so it must not confirm which clinic names exist.
      throw ApiError.notFound('Queue not found')
    }

    const queue = await publicQueueService.getPublicQueue(clinic._id, {
      date: req.validatedQuery?.date,
    })

    // No audit log here on purpose: writeAuditLog needs a userId, and a
    // polled public read would flood the audit trail with anonymous rows.
    return sendSuccess(res, { data: queue })
  } catch (err) {
    return next(err)
  }
}

// The unsubscribe link in every notification email. No session: the
// patient has no account. What authorizes it is the HMAC signature in the
// link, checked in unsubscribeFromEmail; an invalid or forged link gets the
// same generic 404 as an unknown patient, and the response carries only the
// clinic's name.
export async function emailUnsubscribeHandler(req, res, next) {
  try {
    const result = await unsubscribeFromEmail(req.body.p, req.body.t)
    if (!result) throw ApiError.notFound('This unsubscribe link is not valid')
    return sendSuccess(res, { message: 'Unsubscribed', data: { clinicName: result.clinicName } })
  } catch (err) {
    return next(err)
  }
}
