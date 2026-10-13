import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChangePasswordModal from './ChangePasswordModal.jsx'
import * as authApi from '../api/auth.js'
import { renderWithProviders } from '../test/test-utils.jsx'

vi.mock('../api/auth.js')

async function fill(
  user,
  { current = 'old-password', next = 'new-password1', confirm = next } = {},
) {
  await user.type(screen.getByLabelText('Current password'), current)
  await user.type(screen.getByLabelText('New password'), next)
  await user.type(screen.getByLabelText('Confirm new password'), confirm)
  await user.click(screen.getByRole('button', { name: 'Change password' }))
}

describe('ChangePasswordModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('changes the password and says other devices were signed out', async () => {
    authApi.changePassword.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<ChangePasswordModal open onClose={() => {}} />)

    await fill(user)

    expect(authApi.changePassword).toHaveBeenCalledWith(
      expect.objectContaining({
        currentPassword: 'old-password',
        newPassword: 'new-password1',
      }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      /other device .* signed out/i,
    )
  })

  it('catches a mismatched confirmation before calling the server', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ChangePasswordModal open onClose={() => {}} />)

    await fill(user, { confirm: 'something-else' })

    expect(
      await screen.findByText('Passwords do not match'),
    ).toBeInTheDocument()
    expect(authApi.changePassword).not.toHaveBeenCalled()
  })

  it('asks for at least 8 characters', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ChangePasswordModal open onClose={() => {}} />)

    await fill(user, { next: 'short' })

    expect(
      await screen.findByText('Password must be at least 8 characters'),
    ).toBeInTheDocument()
    expect(authApi.changePassword).not.toHaveBeenCalled()
  })

  it('shows a wrong current password under that field', async () => {
    authApi.changePassword.mockRejectedValue({
      response: { data: { code: 'WRONG_PASSWORD', message: 'x' } },
    })
    const user = userEvent.setup()
    renderWithProviders(<ChangePasswordModal open onClose={() => {}} />)

    await fill(user)

    expect(
      await screen.findByText('Current password is incorrect'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Current password')).toHaveFocus()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
