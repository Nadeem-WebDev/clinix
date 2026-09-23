import * as reportService from '../services/report.service.js'
import { sendSuccess } from '../utils/ApiResponse.js'

export async function getPatientReportHandler(req, res, next) {
  try {
    const data = await reportService.getPatientReport(req.clinicId, req.validatedQuery)
    return sendSuccess(res, { data })
  } catch (err) {
    return next(err)
  }
}

export async function getAppointmentReportHandler(req, res, next) {
  try {
    const data = await reportService.getAppointmentReport(req.clinicId, req.validatedQuery)
    return sendSuccess(res, { data })
  } catch (err) {
    return next(err)
  }
}

export async function getRevenueReportHandler(req, res, next) {
  try {
    const data = await reportService.getRevenueReport(req.clinicId, req.validatedQuery)
    return sendSuccess(res, { data })
  } catch (err) {
    return next(err)
  }
}
