import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The only pages worth a search result: everything else is the signed-in
// app, a clinic's patient queue screen, or the Clinix admin panel. The
// server sends `X-Robots-Tag: noindex` for those too (serveClient.js).
const PUBLIC_PAGES = ['/login', '/register-clinic']

function robotsTxt(siteUrl) {
  return [
    '# Only the sign-in and sign-up pages are public. Everything else needs a login,',
    "# is a clinic's patient queue screen, or is the Clinix admin panel.",
    'User-agent: *',
    'Allow: /$',
    ...PUBLIC_PAGES.map((page) => `Allow: ${page}$`),
    // Crawlers need the scripts/styles to render the pages above, and the
    // icons/preview image for search results and link previews.
    'Allow: /assets/',
    'Allow: /favicon',
    'Allow: /apple-touch-icon.png',
    'Allow: /icon-',
    'Allow: /og-image.png',
    'Allow: /site.webmanifest',
    'Disallow: /',
    ...(siteUrl ? ['', `Sitemap: ${siteUrl}/sitemap.xml`] : []),
    '',
  ].join('\n')
}

function sitemapXml(siteUrl) {
  const urls = PUBLIC_PAGES.map((page) => `  <url><loc>${siteUrl}${page}</loc></url>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

// Link-preview tags and sitemaps need absolute URLs, which only the deploy
// knows: VITE_SITE_URL if set, else the URL Render gives the service
// (RENDER_EXTERNAL_URL, available during its build). Without either (local
// builds), og:url is dropped and og:image falls back to a relative path.
function siteMeta(siteUrl) {
  const base = (siteUrl || '').replace(/\/+$/, '')
  return {
    name: 'clinix-site-meta',
    transformIndexHtml(html) {
      const out = base ? html : html.replace(/^\s*<meta property="og:url"[^>]*>\n/m, '')
      return out.replaceAll('__SITE_URL__', base)
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsTxt(base) })
      if (base) this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapXml(base) })
    },
  }
}

// https://vitejs.dev/config/ - vitest/config re-exports Vite's own
// defineConfig with the `test` key added, so this one file configures
// both the dev/build tool and the test runner.
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    siteMeta(loadEnv(mode, path.resolve(__dirname, '..'), 'VITE_').VITE_SITE_URL || process.env.RENDER_EXTERNAL_URL),
  ],
  // Share the single repo-root .env / .env.example with the server.
  // Vite only ever exposes VITE_-prefixed vars to client code, so
  // server-only secrets in that file are never bundled into the browser.
  envDir: path.resolve(__dirname, '..'),
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: false,
    css: false,
  },
}))
