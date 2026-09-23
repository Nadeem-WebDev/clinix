import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { render } from '@testing-library/react'
import Login from './Login.jsx'
import { AuthProvider } from '../context/AuthContext.jsx'
import { ThemeProvider } from '../context/ThemeContext.jsx'
import * as authApi from '../api/auth.js'
import { createTestQueryClient } from '../test/test-utils.jsx'

const navigateMock = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('../api/auth.js')

function renderLogin() {
  const queryClient = createTestQueryClient()
  return render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/login']}>
            <Login />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  )
}

describe('Login flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Not authenticated yet, same as a fresh page load.
    authApi.getCurrentUser.mockRejectedValue({ response: { status: 401 } })
  })

  it('logs in with valid credentials and navigates to the dashboard', async () => {
    authApi.login.mockResolvedValue({ _id: '1', name: 'Ada Admin', role: 'admin' })
    const user = userEvent.setup()
    renderLogin()

    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeEnabled())
    await user.type(screen.getByLabelText(/email/i), 'admin@abc.test')
    await user.type(screen.getByLabelText(/password/i), 'supersecret123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      // React Query v5 calls mutationFn with a second context arg
      // ({ client, meta, mutationKey }) that the real login() ignores -
      // match on the credentials only.
      expect(authApi.login).toHaveBeenCalledWith(
        { email: 'admin@abc.test', password: 'supersecret123' },
        expect.anything(),
      )
    })
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/dashboard', { replace: true }))
  })

  it('shows the server error message when login fails', async () => {
    authApi.login.mockRejectedValue({ response: { data: { message: 'Invalid email or password' } } })
    const user = userEvent.setup()
    renderLogin()

    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeEnabled())
    await user.type(screen.getByLabelText(/email/i), 'admin@abc.test')
    await user.type(screen.getByLabelText(/password/i), 'wrongpassword')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid email before ever calling the API', async () => {
    const user = userEvent.setup()
    renderLogin()

    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeEnabled())
    await user.type(screen.getByLabelText(/email/i), 'not-an-email')
    await user.type(screen.getByLabelText(/password/i), 'supersecret123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText(/valid email/i)).toBeInTheDocument()
    expect(authApi.login).not.toHaveBeenCalled()
  })
})
