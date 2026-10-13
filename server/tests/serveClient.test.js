import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { env } from '../src/config/env.js'
import { authCookieOptions } from '../src/utils/jwt.js'
import { inlineScriptHashes } from '../src/middleware/serveClient.js'

const INLINE_SCRIPT = "\n      document.documentElement.classList.add('dark')\n    "
const INDEX_HTML = `<!doctype html><html><head><script>${INLINE_SCRIPT}</script></head>
<body><div id="root"></div><script type="module" src="/assets/index-abc123.js"></script></body></html>`

let distDir
let app

beforeAll(() => {
  // A stand-in for `npm run build` output - no real Vite build needed.
  distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clinix-dist-'))
  fs.mkdirSync(path.join(distDir, 'assets'))
  fs.writeFileSync(path.join(distDir, 'index.html'), INDEX_HTML)
  fs.writeFileSync(path.join(distDir, 'assets', 'index-abc123.js'), 'console.log("app")')
  app = createApp({ serveClient: true, clientDistDir: distDir })
})

afterAll(() => {
  fs.rmSync(distDir, { recursive: true, force: true })
})

describe('serving the built client from the API server', () => {
  it('lets search engines index only the public pages', async () => {
    for (const page of ['/', '/login', '/register-clinic']) {
      const res = await request(app).get(page)
      expect(res.headers['x-robots-tag']).toBeUndefined()
    }
    for (const page of ['/dashboard', '/patients/123', '/q/sharma-clinic', '/platform', '/platform/clinics/1']) {
      const res = await request(app).get(page)
      expect(res.status).toBe(200)
      expect(res.headers['x-robots-tag']).toBe('noindex, nofollow')
    }
  })

  it('serves index.html at the root, never cached', async () => {
    const res = await request(app).get('/')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/html/)
    expect(res.text).toContain('<div id="root">')
    expect(res.headers['cache-control']).toBe('no-cache')
  })

  it('serves index.html for client-side routes, so a page refresh works', async () => {
    for (const route of ['/patients', '/patients/64f0c0ffee', '/q/sunrise-family-clinic', '/settings']) {
      const res = await request(app).get(route)
      expect(res.status).toBe(200)
      expect(res.text).toContain('<div id="root">')
    }
  })

  it('serves hashed assets with a long-lived immutable cache', async () => {
    const res = await request(app).get('/assets/index-abc123.js')
    expect(res.status).toBe(200)
    expect(res.text).toBe('console.log("app")')
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable')
  })

  it('keeps API routes and API 404s as JSON, not the SPA', async () => {
    const health = await request(app).get('/api/v1/health')
    expect(health.headers['content-type']).toMatch(/application\/json/)

    const missing = await request(app).get('/api/v1/does-not-exist')
    expect(missing.status).toBe(404)
    expect(missing.body.code).toBe('NOT_FOUND')
  })

  it('404s a missing asset instead of answering with index.html', async () => {
    const res = await request(app).get('/assets/index-old999.js')
    expect(res.status).toBe(404)
    expect(res.text).not.toContain('<div id="root">')
  })

  it('allows the inline theme script by hash and Cloudinary images in the CSP', async () => {
    const res = await request(app).get('/')
    const csp = res.headers['content-security-policy']
    const hash = crypto.createHash('sha256').update(INLINE_SCRIPT, 'utf8').digest('base64')

    expect(csp).toContain(`script-src 'self' 'sha256-${hash}'`)
    expect(csp).not.toContain("'unsafe-inline' 'sha256")
    expect(csp).toMatch(/img-src[^;]*https:\/\/res\.cloudinary\.com/)
  })

  it('does not send upgrade-insecure-requests outside production', async () => {
    // Over plain http Safari would upgrade the script requests to https and
    // show a blank page; production (always HTTPS) still sends it.
    const res = await request(app).get('/')
    expect(res.headers['content-security-policy']).not.toContain('upgrade-insecure-requests')
  })

  it('refuses to start when the client build is missing', () => {
    expect(() => createApp({ serveClient: true, clientDistDir: path.join(distDir, 'nope') })).toThrow(/npm run build/)
  })
})

describe('inlineScriptHashes', () => {
  it('hashes inline scripts only, not external ones', () => {
    const hashes = inlineScriptHashes('<script>a()</script><script src="/x.js"></script><script type="module">b()</script>')
    expect(hashes).toHaveLength(2)
    expect(hashes.every((h) => h.startsWith("'sha256-"))).toBe(true)
  })
})

describe('auth cookie SameSite in production', () => {
  const original = { nodeEnv: env.nodeEnv, serveClient: env.serveClient }
  afterEach(() => Object.assign(env, original))

  it('is Lax when the API serves the client (same origin)', () => {
    Object.assign(env, { nodeEnv: 'production', serveClient: true })
    expect(authCookieOptions()).toMatchObject({ sameSite: 'lax', secure: true, httpOnly: true })
  })

  it('stays None for the split deploy, where every call is cross-site', () => {
    Object.assign(env, { nodeEnv: 'production', serveClient: false })
    expect(authCookieOptions()).toMatchObject({ sameSite: 'none', secure: true })
  })
})
