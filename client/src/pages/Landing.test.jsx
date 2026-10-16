import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, fireEvent, screen, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import Landing from './Landing.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { renderWithProviders } from '../test/test-utils.jsx'

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }))

function renderLanding({ signedIn = false } = {}) {
  useAuth.mockReturnValue({ isAuthenticated: signedIn, user: signedIn ? { role: 'owner' } : null })
  renderWithProviders(
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/dashboard" element={<p>Dashboard page</p>} />
    </Routes>,
  )
}

describe('Landing page', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('introduces Clinix and sends visitors to sign up or sign in', () => {
    renderLanding()

    expect(screen.getByRole('heading', { level: 1, name: /run your whole clinic from one screen/i })).toBeInTheDocument()
    const header = screen.getByRole('banner')
    expect(within(header).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    expect(within(header).getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/register-clinic')
    expect(screen.getAllByRole('link', { name: /create your clinic/i })[0]).toHaveAttribute('href', '/register-clinic')
  })

  it('lists the main features and the three plans', () => {
    renderLanding()

    for (const feature of ['Patients', 'OPD queue & walk-ins', 'Prescriptions', 'Billing & receipts', 'WhatsApp & email']) {
      expect(screen.getByRole('heading', { name: feature })).toBeInTheDocument()
    }
    const pricing = screen.getByRole('heading', { name: 'Simple pricing' }).closest('section')
    for (const plan of ['Starter', 'Clinic', 'Multi-doctor']) {
      expect(within(pricing).getByRole('heading', { name: plan })).toBeInTheDocument()
    }
    expect(within(pricing).getByText('Most popular')).toBeInTheDocument()
  })

  it('shows WhatsApp and email contact buttons from the build settings', () => {
    vi.stubEnv('VITE_CONTACT_EMAIL', 'hello@clinix.in')
    vi.stubEnv('VITE_CONTACT_WHATSAPP', '+91 98220 12345')
    renderLanding()

    const whatsapp = screen.getByRole('link', { name: /chat on whatsapp/i })
    expect(whatsapp.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/919822012345\?text=/)
    expect(screen.getByRole('link', { name: /hello@clinix\.in/ }).getAttribute('href')).toMatch(/^mailto:hello@clinix\.in\?subject=/)
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '#contact')
  })

  it('hides contact buttons that are not configured', () => {
    vi.stubEnv('VITE_CONTACT_EMAIL', '')
    vi.stubEnv('VITE_CONTACT_WHATSAPP', '')
    renderLanding()

    expect(screen.queryByRole('link', { name: /whatsapp/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /@/ })).not.toBeInTheDocument()
    expect(within(screen.getByRole('banner')).queryByRole('link', { name: 'Contact' })).not.toBeInTheDocument()
  })

  it('takes signed-in staff straight to their dashboard', () => {
    renderLanding({ signedIn: true })
    expect(screen.getByText('Dashboard page')).toBeInTheDocument()
  })

  describe('motion', () => {
    afterEach(() => {
      vi.useRealTimers()
      window.scrollY = 0
    })

    it('scrolls smoothly on this page only, and offers a way back to the top', () => {
      const { unmount } = renderWithProviders(<LandingOnly />)
      expect(document.documentElement).toHaveClass('motion-safe:scroll-smooth')
      expect(screen.queryByRole('button', { name: 'Back to top' })).not.toBeInTheDocument()

      window.scrollTo = vi.fn()
      window.scrollY = 900
      fireEvent.scroll(window)
      fireEvent.click(screen.getByRole('button', { name: 'Back to top' }))
      expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })

      unmount()
      expect(document.documentElement).not.toHaveClass('motion-safe:scroll-smooth')
    })

    it('moves the preview queue along like a real OPD', () => {
      vi.useFakeTimers()
      renderWithProviders(<LandingOnly />)
      const preview = () => document.querySelector('[aria-hidden="true"] ul').textContent

      expect(preview()).toMatch(/7Priya S\.With doctor8Rahul M\.Waiting9Anita K\.Waiting/)
      act(() => vi.advanceTimersByTime(2800))
      expect(preview()).toMatch(/8Rahul M\.With doctor9Anita K\.Waiting10Imran A\.Waiting/)
    })

    it('keeps the preview still for visitors who ask for reduced motion', () => {
      vi.useFakeTimers()
      const original = window.matchMedia
      window.matchMedia = (query) => ({ ...original(query), matches: query === '(prefers-reduced-motion: reduce)' })
      try {
        renderWithProviders(<LandingOnly />)
        act(() => vi.advanceTimersByTime(10000))
        expect(document.querySelector('[aria-hidden="true"] ul').textContent).toMatch(/^7Priya S\.With doctor/)
      } finally {
        window.matchMedia = original
      }
    })
  })
})

// The page on its own, for tests that drive timers and scrolling.
function LandingOnly() {
  useAuth.mockReturnValue({ isAuthenticated: false, user: null })
  return <Landing />
}
