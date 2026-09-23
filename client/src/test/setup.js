import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// With `globals: false` in vite.config.js, Testing Library's automatic
// afterEach(cleanup) never registers (it only wires itself up when it can
// see a global `afterEach`), so unmounted trees from a previous test would
// otherwise stay in the DOM and leak into the next one. Do it explicitly.
afterEach(() => {
  cleanup()
})

// jsdom doesn't implement matchMedia. ThemeProvider calls it to resolve the
// 'system' theme, so stub a minimal version (always reports "light").
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}
