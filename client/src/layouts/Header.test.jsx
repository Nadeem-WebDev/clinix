import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useNavigate } from 'react-router-dom'
import Header from './Header.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { renderWithProviders } from '../test/test-utils.jsx'

vi.mock('../api/staff.js', () => ({ listStaff: vi.fn(() => new Promise(() => {})) }))
vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: vi.fn(),
}))

let navigateTo
function NavigateProbe() {
  navigateTo = useNavigate()
  return null
}

function renderHeader() {
  renderWithProviders(
    <>
      <Header clinic={{ name: 'Sunrise Family Clinic' }} />
      <NavigateProbe />
      <p>Page content</p>
    </>,
    { route: '/dashboard' },
  )
}

const menuButton = () => screen.getByRole('button', { name: 'Account menu' })
const logoutItem = () => screen.queryByRole('button', { name: /log out/i })

describe('Header account menu', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ user: { name: 'Rohan Kapoor', role: 'owner' }, logout: vi.fn() })
  })

  it('opens and closes with the account button', async () => {
    const user = userEvent.setup()
    renderHeader()

    await user.click(menuButton())
    expect(logoutItem()).toBeInTheDocument()
    expect(menuButton()).toHaveAttribute('aria-expanded', 'true')

    await user.click(menuButton())
    expect(logoutItem()).not.toBeInTheDocument()
  })

  it('closes when the user clicks or taps anywhere outside it', async () => {
    const user = userEvent.setup()
    renderHeader()

    await user.click(menuButton())
    await user.click(screen.getByText('Page content'))

    expect(logoutItem()).not.toBeInTheDocument()
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
  })

  it('stays open when using the theme switch inside it', async () => {
    const user = userEvent.setup()
    renderHeader()

    await user.click(menuButton())
    // The header has a second (desktop) theme switch; the one in the menu is the last.
    const darkButtons = screen.getAllByRole('button', { name: 'Dark theme' })
    await user.click(darkButtons[darkButtons.length - 1])

    expect(logoutItem()).toBeInTheDocument()
  })

  it('closes on Escape and returns focus to the account button', async () => {
    const user = userEvent.setup()
    renderHeader()

    await user.click(menuButton())
    await user.keyboard('{Escape}')

    expect(logoutItem()).not.toBeInTheDocument()
    expect(menuButton()).toHaveFocus()
  })

  it('closes when the page changes', async () => {
    const user = userEvent.setup()
    renderHeader()

    await user.click(menuButton())
    act(() => navigateTo('/patients'))

    expect(logoutItem()).not.toBeInTheDocument()
  })

  it('opens the change-password dialog from the account menu, and closes the menu', async () => {
    const user = userEvent.setup()
    renderHeader()

    await user.click(menuButton())
    await user.click(screen.getByRole('button', { name: /change password/i }))

    expect(screen.getByRole('dialog', { name: 'Change password' })).toBeInTheDocument()
    expect(logoutItem()).not.toBeInTheDocument()
  })

  it('offers "My doctor profile" to doctors only', async () => {
    const user = userEvent.setup()
    renderHeader()
    await user.click(menuButton())
    expect(screen.queryByRole('button', { name: /my doctor profile/i })).not.toBeInTheDocument()
  })

  it('opens the doctor profile from the menu for a doctor', async () => {
    useAuth.mockReturnValue({ user: { _id: 'd1', name: 'Kavita Nair', role: 'doctor' }, logout: vi.fn() })
    const user = userEvent.setup()
    renderHeader()

    await user.click(menuButton())
    await user.click(screen.getByRole('button', { name: /my doctor profile/i }))

    expect(screen.getByRole('dialog', { name: 'Doctor profile' })).toBeInTheDocument()
  })
})
