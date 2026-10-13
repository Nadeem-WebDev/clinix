import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'
import { env, isProduction } from './config/env.js'
import apiRouter from './routes/index.js'
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js'
import { inlineScriptHashes, mountClient, readClientIndex } from './middleware/serveClient.js'

// options exist for tests; production reads SERVE_CLIENT / client/dist from env.
export function createApp({ serveClient = env.serveClient, clientDistDir = env.clientDistDir } = {}) {
  const app = express()
  // Read up front: a missing build should fail at boot with a clear message,
  // not on the first page request.
  const client = serveClient ? readClientIndex(clientDistDir) : null

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

  // Helmet's defaults, plus what the React app needs when served from here:
  // clinic logos and patient images come from Cloudinary, and index.html's
  // inline theme script is allowed by hash rather than 'unsafe-inline'.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          imgSrc: ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com'],
          scriptSrc: ["'self'", ...(client ? inlineScriptHashes(client.html) : [])],
          // Helmet adds upgrade-insecure-requests by default. Production is
          // always behind HTTPS, but over plain http (a local production
          // build, or a phone on the LAN at http://192.168.x.x) Safari obeys
          // it, requests the scripts over https, fails, and shows a blank
          // page - so it is only sent in production.
          upgradeInsecureRequests: isProduction ? [] : null,
        },
      },
    }),
  )
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
  // Keep-alive pings arrive every few minutes all day; logging each one
  // would bury the real requests.
  app.use(morgan(isProduction ? 'combined' : 'dev', { skip: (req) => req.originalUrl === '/api/v1/keep-alive' }))

  app.use('/api/v1', apiRouter)

  if (client) mountClient(app, { distDir: clientDistDir, indexPath: client.indexPath })

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
