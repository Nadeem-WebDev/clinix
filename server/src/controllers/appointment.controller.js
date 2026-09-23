import * as appointmentService from '../services/appointment.service.js'
import { sendSuccess } from '../utils/ApiResponse.js'
import { writeAuditLog } from '../utils/audit.js'

function audit(req, appointment, action) {
  return writeAuditLog({
    clinicId: req.clinicId,
    userId: req.user._id,
    action,
    resourceType: 'Appointment',
    resourceId: appointment._id,
    ipAddress: req.ip,
  })
}

export async function createAppointmentHandler(req, res, next) {
  try {
    const appointment = await appointmentService.createAppointment(req.clinicId, req.body, req.user._id)
    await audit(req, appointment, 'APPOINTMENT_CREATED')
    return sendSuccess(res, {
      status: 201,
      message: 'Appointment booked',
      data: { appointment },
    })
  } catch (err) {
    return next(err)
  }
}

export async function listAppointmentsHandler(req, res, next) {
  try {
    const result = await appointmentService.listAppointments(req.clinicId, req.validatedQuery)
    return sendSuccess(res, { data: result })
  } catch (err) {
    return next(err)
  }
}

export async function getAppointmentHandler(req, res, next) {
  try {
    const appointment = await appointmentService.getAppointmentById(req.clinicId, req.params.id)
    return sendSuccess(res, { data: { appointment } })
  } catch (err) {
    return next(err)
  }
}

export async function rescheduleAppointmentHandler(req, res, next) {
  try {
    const appointment = await appointmentService.rescheduleAppointment(req.clinicId, req.params.id, req.body)
    await audit(req, appointment, 'APPOINTMENT_RESCHEDULED')
    return sendSuccess(res, { message: 'Appointment updated', data: { appointment } })
  } catch (err) {
    return next(err)
  }
}

function makeActionHandler(serviceFn, action, message) {
  return async (req, res, next) => {
    try {
      const appointment = await serviceFn(req.clinicId, req.params.id)
      await audit(req, appointment, action)
      return sendSuccess(res, { message, data: { appointment } })
    } catch (err) {
      return next(err)
    }
  }
}

export const cancelAppointmentHandler = makeActionHandler(
  appointmentService.cancelAppointment,
  'APPOINTMENT_CANCELLED',
  'Appointment cancelled',
)
export const markArrivedHandler = makeActionHandler(
  appointmentService.markArrived,
  'APPOINTMENT_ARRIVED',
  'Patient marked as arrived',
)
export const markNoShowHandler = makeActionHandler(
  appointmentService.markNoShow,
  'APPOINTMENT_NO_SHOW',
  'Marked as no-show',
)
export const callNextHandler = makeActionHandler(
  appointmentService.callNextIntoConsultation,
  'APPOINTMENT_CALLED',
  'Patient called in for consultation',
)
export const completeAppointmentHandler = makeActionHandler(
  appointmentService.completeAppointment,
  'APPOINTMENT_COMPLETED',
  'Consultation marked complete',
)
export const skipAppointmentHandler = makeActionHandler(
  appointmentService.skipAppointment,
  'APPOINTMENT_SKIPPED',
  'Patient skipped',
)

export async function getQueueHandler(req, res, next) {
  try {
    const result = await appointmentService.getQueue(req.clinicId, req.validatedQuery)
    return sendSuccess(res, { data: result })
  } catch (err) {
    return next(err)
  }
}
