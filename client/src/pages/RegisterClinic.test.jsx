import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import RegisterClinic from './RegisterClinic.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { renderWithProviders } from '../test/test-utils.jsx'

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }))

describe('Register clinic page', () => {
  it('links the logo back to the landing page', () => {
    useAuth.mockReturnValue({ isAuthenticated: false })
    renderWithProviders(<RegisterClinic />, { route: '/register-clinic' })

    expect(
      screen.getByRole('heading', { name: 'Set up your clinic' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Clinix home' })).toHaveAttribute(
      'href',
      '/',
    )
  })
})
