// Consistent success envelope, per the API design spec:
// { success: true, data: {...}, message: '...' }
export function sendSuccess(res, { data = {}, message = 'OK', status = 200 } = {}) {
  return res.status(status).json({ success: true, data, message })
}
