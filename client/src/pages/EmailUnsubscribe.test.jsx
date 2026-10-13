import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import EmailUnsubscribe from './EmailUnsubscribe.jsx'
import * as emailApi from '../api/emailPreferences.js'
import { renderWithProviders } from '../test/test-utils.jsx'

vi.mock('../api/emailPreferences.js')

function renderAt(route) {
  renderWithProviders(
    <Routes>
      <Route path="/email/unsubscribe" element={<EmailUnsubscribe />} />
    </Routes>,
    { route },
  )
}

describe('Email unsubscribe page', () => {
  beforeEach(() => vi.clearAllMocks())

  it('asks first, then unsubscribes and names the clinic', async () => {
    emailApi.unsubscribeFromEmail.mockResolvedValue({ clinicName: 'Sharma Clinic' })
    const user = userEvent.setup()
    renderAt('/email/unsubscribe?p=abc123&t=signature')

    // Nothing happens just by opening the link.
    expect(screen.getByRole('heading', { name: 'Unsubscribe from clinic emails?' })).toBeInTheDocument()
    expect(emailApi.unsubscribeFromEmail).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Unsubscribe' }))
    expect(await screen.findByRole('heading', { name: "You've been unsubscribed" })).toBeInTheDocument()
    expect(screen.getByText(/emails from Sharma Clinic/)).toBeInTheDocument()
    expect(emailApi.unsubscribeFromEmail).toHaveBeenCalledWith({ p: 'abc123', t: 'signature' })
  })

  it('says so when the link is not valid', async () => {
    emailApi.unsubscribeFromEmail.mockRejectedValue({ response: { status: 404 } })
    const user = userEvent.setup()
    renderAt('/email/unsubscribe?p=abc123&t=forged')

    await user.click(screen.getByRole('button', { name: 'Unsubscribe' }))
    expect(await screen.findByRole('heading', { name: "This link isn't valid" })).toBeInTheDocument()
  })

  it('needs both parts of the link', () => {
    renderAt('/email/unsubscribe?p=abc123')
    expect(screen.getByRole('heading', { name: 'This link is incomplete' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Unsubscribe' })).not.toBeInTheDocument()
  })
})
