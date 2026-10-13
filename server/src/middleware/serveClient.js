import express from 'express'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

// CSP hashes for every inline (non-src) <script> in the built index.html -
// today just the theme bootstrap that sets dark/light before first paint.
// Hashing the exact bytes allows that script without 'unsafe-inline', and
// computing it from the built file means editing the script can't silently
// break the policy.
export function inlineScriptHashes(html) {
  const hashes = []
  for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    const digest = crypto.createHash('sha256').update(match[1], 'utf8').digest('base64')
    hashes.push(`'sha256-${digest}'`)
  }
  return hashes
}

export function readClientIndex(distDir) {
  const indexPath = path.join(distDir, 'index.html')
  if (!fs.existsSync(indexPath)) {
    throw new Error(`SERVE_CLIENT is on but ${indexPath} does not exist - run \`npm run build\` first`)
  }
  return { indexPath, html: fs.readFileSync(indexPath, 'utf8') }
}

// Keep in step with PUBLIC_PAGES in client/vite.config.js (plus the root).
const INDEXABLE_PATHS = new Set(['/', '/login', '/register-clinic'])

// Serves the built React app from the same origin as the API. Mounted after
// /api/v1, so API routes always win, and an unknown /api or /assets path
// still falls through to the JSON 404 handler instead of getting the SPA.
export function mountClient(app, { distDir, indexPath }) {
  // Vite content-hashes everything under /assets, so it can be cached
  // forever; a new build produces new file names.
  app.use('/assets', express.static(path.join(distDir, 'assets'), { immutable: true, maxAge: '1y' }))
  app.use(express.static(distDir, { index: false, maxAge: '1h' }))

  // Client-side routes (/patients/123, /q/<slug>, ...) all load index.html,
  // which must never be cached - it is what points at the current assets.
  // Only the public pages may appear in search results; the signed-in app,
  // patient queue screens and the admin panel are marked noindex (robots.txt,
  // built by client/vite.config.js, also keeps crawlers out of them).
  app.get(/^\/(?!api\/|assets\/).*/, (req, res) => {
    res.set('Cache-Control', 'no-cache')
    if (!INDEXABLE_PATHS.has(req.path.replace(/\/+$/, '') || '/')) res.set('X-Robots-Tag', 'noindex, nofollow')
    res.sendFile(indexPath)
  })
}
