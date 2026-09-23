import axios from 'axios'

// Auth is via an httpOnly cookie set by the server (see server/src/utils/jwt.js) -
// the browser attaches it automatically on every request to the API origin,
// so there is no token to read/attach here, and none is reachable from JS
// (which is the point: it can't be stolen via an XSS payload).
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1',
  withCredentials: true,
})

export default apiClient
