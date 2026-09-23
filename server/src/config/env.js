import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Single .env file lives at the repo root (see /.env.example) and is shared
// by client (VITE_-prefixed vars only) and server. Server-only secrets here
// are never exposed to the browser bundle.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

function required(name, fallback) {
  const value = process.env[name] ?? fallback
  // A blank string (e.g. a var declared but left empty on the hosting
  // platform's dashboard) must fail exactly like a missing one - `??` alone
  // only catches null/undefined, not "".
  if (value === undefined || (typeof value === 'string' && value.trim() === '')) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  // Render assigns this dynamically at runtime - never hardcode a port,
  // always defer to whatever the platform sets. The fallback is dev-only.
  port: Number(process.env.PORT) || 5000,
  // Comma-separated list of allowed frontend origins (e.g. a Vercel
  // production domain plus a custom domain) - the `cors` package accepts
  // an array of origins natively, so a single value behaves the same as a
  // plain string would.
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  mongodbUri:
    process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/clinic-crm-dev',
  jwt: {
    // Only enforced strictly in production; dev falls back to a clearly
    // non-secret placeholder so the app boots without extra setup.
    secret:
      process.env.NODE_ENV === 'production'
        ? required('JWT_SECRET')
        : process.env.JWT_SECRET || 'dev-only-insecure-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  whatsapp: {
    // Hard global kill switch. Compared against the literal string 'true'
    // so that every other value - unset, '', 'false', '0', 'yes' - is off.
    // Defaulting to off is deliberate: the failure mode of getting this
    // wrong is messaging real patients from a dev box.
    enabled: process.env.WHATSAPP_ENABLED === 'true',
    baseUrl: process.env.WHATSAPP_CLOUD_API_BASE_URL || 'https://graph.facebook.com/v20.0',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    appSecret: process.env.WHATSAPP_APP_SECRET,
    // Meta rejects a send whose template name or variable count doesn't
    // match an approved template exactly, and approval happens outside
    // this repo - so these are configuration, not constants.
    templates: {
      appointmentConfirmation:
        process.env.WHATSAPP_TEMPLATE_APPOINTMENT_CONFIRMATION || 'appointment_confirmation',
      appointmentReminder:
        process.env.WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER || 'appointment_reminder',
      queueUpdate: process.env.WHATSAPP_TEMPLATE_QUEUE_UPDATE || 'queue_now_serving',
      documentReady: process.env.WHATSAPP_TEMPLATE_DOCUMENT_READY || 'document_ready',
    },
  },
}

// Where the frontend is served from, used to build the public queue link
// that goes into WhatsApp messages. CORS_ORIGIN already lists the allowed
// frontend origins, so fall back to the first of those rather than making
// this a second thing to remember to set on every deploy.
export const publicAppUrl = (
  process.env.PUBLIC_APP_URL ||
  env.corsOrigins[0] ||
  'http://localhost:5173'
).replace(/\/+$/, '')

export const isProduction = env.nodeEnv === 'production'
