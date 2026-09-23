import { getDashboard } from '../services/dashboard.service.js'
import { sendSuccess } from '../utils/ApiResponse.js'

export async function getDashboardHandler(req, res, next) {
  try {
    const data = await getDashboard(req.clinicId, req.user)
    return sendSuccess(res, { data })
  } catch (err) {
    return next(err)
  }
}
