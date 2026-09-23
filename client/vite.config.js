import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/ - vitest/config re-exports Vite's own
// defineConfig with the `test` key added, so this one file configures
// both the dev/build tool and the test runner.
export default defineConfig({
  plugins: [react()],
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
})
