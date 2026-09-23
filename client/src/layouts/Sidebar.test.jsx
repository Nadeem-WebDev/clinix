import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { render } from '@testing-library/react'
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
