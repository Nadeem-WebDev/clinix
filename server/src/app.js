import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'
import { env, isProduction } from './config/env.js'
import apiRouter from './routes/index.js'
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js'

export function createApp() {
  const app = express()

  // Every deployment target in the README (Render/Railway/AWS) sits behind
  // a reverse proxy/load balancer. Without this, req.ip resolves to the
  // proxy's own address for every request - silently recording the wrong
  // actor on every audit log entry (ipAddress: req.ip, used across every
  // controller) and collapsing authRateLimiter's per-IP brute-force
  // protection into one shared bucket for everyone behind that proxy.
  // Trusting exactly one hop (the proxy itself) reads the real client IP
  // from X-Forwarded-For without blindly trusting an arbitrary chain of
  // forwarded values a client could otherwise spoof.
  if (isProduction) {
    app.set('trust proxy', 1)
  }

  app.use(helmet())
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
    }),
  )
  app.use(
    express.json({
      limit: '1mb',
      // Meta signs the webhook body byte-for-byte, so verifying
      // X-Hub-Signature-256 needs the bytes as received - re-serializing
      // the parsed object would produce a different signature. Captured
      // only for the webhook path, so no other request pays the memory.
      verify: (req, res, buf) => {
        if (req.originalUrl?.startsWith('/api/v1/whatsapp/webhook')) {
          req.rawBody = buf
        }
      },
    }),
  )
  app.use(cookieParser())
  // Request logging without sensitive data: 'combined'/'dev' formats log
  // method/path/status/timing, never headers or body.
  app.use(morgan(isProduction ? 'combined' : 'dev'))

  app.use('/api/v1', apiRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
