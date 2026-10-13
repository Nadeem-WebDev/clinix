import axios from 'axios'

// Auth is via an httpOnly cookie set by the server (see server/src/utils/jwt.js) -
// the browser attaches it automatically on every request to the API origin,
// so there is no token to read/attach here, and none is reachable from JS
// (which is the point: it can't be stolen via an XSS payload).
// A production build defaults to the same origin, which is what the
// single-service Render deploy serves; set VITE_API_URL only when the API
// lives elsewhere (the Vercel + Render split). Dev talks to the local API.
export const API_BASE_URL =
  import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api/v1' : 'http://localhost:5000/api/v1')

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
})

export default apiClient
