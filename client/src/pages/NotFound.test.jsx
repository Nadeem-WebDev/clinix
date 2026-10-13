import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, Route, Routes } from 'react-router-dom'
import NotFound from './NotFound.jsx'
import { AuthProvider } from '../context/AuthContext.jsx'
import * as authApi from '../api/auth.js'
import { renderWithProviders } from '../test/test-utils.jsx'

vi.mock('../api/auth.js')

function renderAt(route) {
  return renderWithProviders(
    <AuthProvider>
      <Routes>
        <Route
          path="/start"
          element={<Link to="/no-such-page">broken link</Link>}
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>,
    { route },
  )
}

describe('404 page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authApi.getCurrentUser.mockRejectedValue({ response: { status: 401 } })
  })

  it('names the missing path and sends a signed-out visitor to sign in', async () => {
    renderAt('/no-such-page')

    expect(
      screen.getByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument()
    expect(screen.getByText('/no-such-page')).toBeInTheDocument()
    expect(
      await screen.findByRole('link', { name: 'Go to sign in' }),
    ).toHaveAttribute('href', '/login')
    // Opened directly, there's no earlier page to go back to.
    expect(
      screen.queryByRole('button', { name: /go back/i }),
    ).not.toBeInTheDocument()
    expect(document.title).toBe('Page not found – Clinix')
  })

  it('sends a signed-in user to the dashboard', async () => {
    authApi.getCurrentUser.mockResolvedValue({
      _id: 'u1',
      name: 'Asha',
      role: 'owner',
    })
    renderAt('/patients/oops/extra')

    expect(
      await screen.findByRole('link', { name: 'Go to dashboard' }),
    ).toHaveAttribute('href', '/dashboard')
  })

  it('keeps the platform panel within the panel', () => {
    renderAt('/platform/nothing-here')

    expect(
      screen.getByRole('link', { name: 'Go to admin panel' }),
    ).toHaveAttribute('href', '/platform')
  })

  it('offers "Go back" after following a broken link', async () => {
    const user = userEvent.setup()
    renderAt('/start')

    await user.click(screen.getByRole('link', { name: 'broken link' }))
    await user.click(screen.getByRole('button', { name: /go back/i }))

    expect(
      screen.getByRole('link', { name: 'broken link' }),
    ).toBeInTheDocument()
  })
})
