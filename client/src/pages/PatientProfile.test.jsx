import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import PatientProfile from './PatientProfile.jsx'
import * as patientsApi from '../api/patients.js'
import { useAuth } from '../context/AuthContext.jsx'
import { renderWithProviders } from '../test/test-utils.jsx'

vi.mock('../api/patients.js')
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }))

const PATIENT = { _id: 'p1', fullName: 'Nisha Patel', patientId: 'P-10018', age: 69, gender: 'female', phone: '9091660536' }

function renderAs(role) {
  useAuth.mockReturnValue({ user: { role } })
  renderWithProviders(
    <Routes>
      <Route path="/patients/:id" element={<PatientProfile />} />
    </Routes>,
    { route: '/patients/p1' },
  )
}

const openTab = async (user, name) => user.click(await screen.findByRole('tab', { name }))

describe('Patient profile - Visits tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    patientsApi.getPatient.mockResolvedValue(PATIENT)
  })

  it('shows each visit with its consultation, prescription and bill', async () => {
    patientsApi.getPatientVisits.mockResolvedValue([
      {
        key: 'appointment-a1',
        date: '2026-09-01T09:00:00.000Z',
        doctor: { name: 'Kavita Nair' },
        status: 'COMPLETED',
        isWalkIn: true,
        tokenNumber: 4,
        consultation: { id: 'c1', diagnosis: 'Viral fever' },
        prescriptions: [{ id: 'rx1', finalized: true, medicineCount: 2 }],
        invoices: [{ id: 'inv1', invoiceNumber: 'INV-1012', total: 800, paymentStatus: 'PAID' }],
      },
    ])
    const user = userEvent.setup()
    renderAs('owner')
    await openTab(user, 'Visits')

    expect(await screen.findByRole('link', { name: /viral fever/i })).toHaveAttribute('href', '/consultations/c1')
    expect(screen.getByRole('link', { name: /prescription · 2 medicines · finalized/i })).toHaveAttribute('href', '/prescriptions/rx1')
    expect(screen.getByRole('link', { name: /INV-1012/ })).toHaveAttribute('href', '/billing/inv1')
    expect(screen.getByText('Walk-in')).toBeInTheDocument()
    expect(screen.getByText(/Dr\. Kavita Nair · Token 4/)).toBeInTheDocument()
    expect(screen.queryByText(/not available yet|once that module is built/i)).not.toBeInTheDocument()
  })

  it('shows the front desk that a consultation happened, without opening it', async () => {
    patientsApi.getPatientVisits.mockResolvedValue([
      {
        key: 'appointment-a1',
        date: '2026-09-01T09:00:00.000Z',
        doctor: { name: 'Kavita Nair' },
        status: 'COMPLETED',
        isWalkIn: false,
        tokenNumber: 4,
        consultation: { recorded: true },
        prescriptions: [],
        invoices: [],
      },
    ])
    const user = userEvent.setup()
    renderAs('receptionist')
    await openTab(user, 'Visits')

    expect(await screen.findByText('Consultation recorded')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /consultation/i })).not.toBeInTheDocument()
  })

  it('says so when there are no visits yet', async () => {
    patientsApi.getPatientVisits.mockResolvedValue([])
    const user = userEvent.setup()
    renderAs('nurse')
    await openTab(user, 'Visits')

    expect(await screen.findByText('No visits yet')).toBeInTheDocument()
  })
})

describe('Patient profile - Follow-ups tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    patientsApi.getPatient.mockResolvedValue(PATIENT)
  })

  it('lists follow-ups with their status and the doctor\'s instructions', async () => {
    patientsApi.getPatientFollowUps.mockResolvedValue([
      {
        key: 'c2',
        followUpDate: '2026-10-12T00:00:00.000Z',
        setOn: '2026-10-05T10:00:00.000Z',
        doctor: { name: 'Kavita Nair' },
        status: 'due_today',
        consultationId: 'c2',
        instructions: 'Review blood report',
      },
      {
        key: 'c1',
        followUpDate: '2026-09-08T00:00:00.000Z',
        setOn: '2026-09-01T10:00:00.000Z',
        doctor: { name: 'Kavita Nair' },
        status: 'done',
        consultationId: 'c1',
        instructions: null,
      },
    ])
    const user = userEvent.setup()
    renderAs('doctor')
    await openTab(user, 'Follow-ups')

    expect(await screen.findByText('Due today')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.getByText('Review blood report')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /review blood report/i })).toHaveAttribute('href', '/consultations/c2')
  })

  it('shows receptionists the dates without linking to the consultation', async () => {
    patientsApi.getPatientFollowUps.mockResolvedValue([
      { key: 'c2', followUpDate: '2026-10-20T00:00:00.000Z', setOn: '2026-10-05T10:00:00.000Z', doctor: { name: 'Kavita Nair' }, status: 'upcoming' },
    ])
    const user = userEvent.setup()
    renderAs('receptionist')
    await openTab(user, 'Follow-ups')

    expect(await screen.findByText('Upcoming')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /upcoming/i })).not.toBeInTheDocument()
  })

  it('is restricted for nurses and never calls the API', async () => {
    const user = userEvent.setup()
    renderAs('nurse')
    await openTab(user, 'Follow-ups')

    expect(await screen.findByText('Restricted')).toBeInTheDocument()
    expect(patientsApi.getPatientFollowUps).not.toHaveBeenCalled()
  })
})
