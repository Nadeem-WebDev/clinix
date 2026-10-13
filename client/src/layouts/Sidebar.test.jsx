import { describe, it, expect, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Sidebar from './Sidebar.jsx'
import { useAuth } from '../context/AuthContext.jsx'

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: vi.fn(),
}))

function renderAs(role) {
  useAuth.mockReturnValue({ user: { role } })
  return render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>,
  )
}

describe('Sidebar role-based navigation', () => {
  it('shows every module to the owner, including Settings', () => {
    renderAs('owner')
    ;['Dashboard', 'Patients', 'Appointments', 'Queue', 'Consultations', 'Prescriptions', 'Billing', 'Reports', 'Documents', 'Staff', 'Settings', 'Audit Logs'].forEach(
      (label) => {
        expect(screen.getByText(label)).toBeInTheDocument()
      },
    )
  })

  it('shows admin every module except the owner-exclusive Settings', () => {
    renderAs('admin')
    ;['Dashboard', 'Patients', 'Appointments', 'Queue', 'Consultations', 'Prescriptions', 'Billing', 'Reports', 'Documents', 'Staff', 'Audit Logs'].forEach(
      (label) => {
        expect(screen.getByText(label)).toBeInTheDocument()
      },
    )
    expect(screen.queryByText('Settings')).not.toBeInTheDocument()
  })

  it('hides clinical, billing, and admin-only modules from a doctor', () => {
    renderAs('doctor')
    expect(screen.getByText('Consultations')).toBeInTheDocument()
    expect(screen.getByText('Prescriptions')).toBeInTheDocument()
    expect(screen.queryByText('Billing')).not.toBeInTheDocument()
    expect(screen.queryByText('Staff')).not.toBeInTheDocument()
    expect(screen.queryByText('Reports')).not.toBeInTheDocument()
    expect(screen.queryByText('Audit Logs')).not.toBeInTheDocument()
  })

  it('hides clinical and admin-only modules from a receptionist, but shows billing', () => {
    renderAs('receptionist')
    expect(screen.getByText('Billing')).toBeInTheDocument()
    expect(screen.getByText('Appointments')).toBeInTheDocument()
    expect(screen.queryByText('Consultations')).not.toBeInTheDocument()
    expect(screen.queryByText('Prescriptions')).not.toBeInTheDocument()
    expect(screen.queryByText('Documents')).not.toBeInTheDocument()
    expect(screen.queryByText('Reports')).not.toBeInTheDocument()
    expect(screen.queryByText('Audit Logs')).not.toBeInTheDocument()
  })

  it('gives a nurse only the shared front-desk-adjacent modules', () => {
    renderAs('nurse')
    expect(screen.getByText('Patients')).toBeInTheDocument()
    expect(screen.getByText('Appointments')).toBeInTheDocument()
    expect(screen.queryByText('Consultations')).not.toBeInTheDocument()
    expect(screen.queryByText('Billing')).not.toBeInTheDocument()
    expect(screen.queryByText('Staff')).not.toBeInTheDocument()
  })
})

describe('Sidebar mobile drawer', () => {
  function renderDrawer(role, { open = true } = {}) {
    useAuth.mockReturnValue({ user: { role } })
    const onMobileClose = vi.fn()
    render(
      <MemoryRouter>
        <Sidebar mobileOpen={open} onMobileClose={onMobileClose} />
      </MemoryRouter>,
    )
    return { onMobileClose }
  }

  it('does not render the drawer while closed', () => {
    renderDrawer('owner', { open: false })
    expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument()
  })

  it('renders the same role-filtered links inside the drawer when open', () => {
    renderDrawer('doctor')
    const drawer = within(screen.getByRole('dialog', { name: 'Navigation' }))
    expect(drawer.getByText('Consultations')).toBeInTheDocument()
    expect(drawer.queryByText('Billing')).not.toBeInTheDocument()
  })

  it('closes when a link is tapped', async () => {
    const { onMobileClose } = renderDrawer('owner')
    const drawer = within(screen.getByRole('dialog', { name: 'Navigation' }))
    await userEvent.click(drawer.getByText('Patients'))
    expect(onMobileClose).toHaveBeenCalled()
  })

  it('closes from the close button and from Escape', async () => {
    const { onMobileClose } = renderDrawer('owner')
    await userEvent.click(screen.getByRole('button', { name: 'Close menu' }))
    await userEvent.keyboard('{Escape}')
    expect(onMobileClose).toHaveBeenCalledTimes(2)
  })
})

describe('Sidebar clinic branding', () => {
  function renderWithClinic(clinic) {
    useAuth.mockReturnValue({ user: { role: 'owner' } })
    render(
      <MemoryRouter>
        <Sidebar clinic={clinic} />
      </MemoryRouter>,
    )
  }

  it('shows the clinic name and logo', () => {
    renderWithClinic({ name: 'Sunrise Family Clinic', logoUrl: 'https://cdn.test/logo.png' })
    expect(screen.getByText('Sunrise Family Clinic')).toBeInTheDocument()
    expect(document.querySelector('aside img')).toHaveAttribute('src', 'https://cdn.test/logo.png')
  })

  it('shows a monogram when the clinic has no logo', () => {
    renderWithClinic({ name: 'Sunrise Family Clinic' })
    expect(screen.getByText('Sunrise Family Clinic')).toBeInTheDocument()
    expect(screen.getByText('S')).toBeInTheDocument()
    expect(document.querySelector('aside img')).toBeNull()
  })

  it('falls back to the product name before the clinic has loaded', () => {
    renderWithClinic(undefined)
    expect(screen.getByText('Clinix')).toBeInTheDocument()
  })
})
