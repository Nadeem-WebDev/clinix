import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import PlatformLayout from './PlatformLayout.jsx'
import PlatformClinics from './PlatformClinics.jsx'
import PlatformClinicDetail from './PlatformClinicDetail.jsx'
import * as platformApi from '../../api/platform.js'
import { renderWithProviders } from '../../test/test-utils.jsx'

vi.mock('../../api/platform.js')

function renderPlatform(route) {
  return renderWithProviders(
    <Routes>
      <Route path="/platform/login" element={<p>Platform login page</p>} />
      <Route path="/platform" element={<PlatformLayout />}>
        <Route index element={<PlatformClinics />} />
        <Route path="clinics/:id" element={<PlatformClinicDetail />} />
      </Route>
    </Routes>,
    { route },
  )
}

const OVERVIEW = {
  clinics: 2,
  suspended: 1,
  newClinics7d: 1,
  newClinics30d: 2,
  activeClinics7d: 1,
  patients: 40,
  appointments30d: 120,
}

const CLINIC_ROW = {
  _id: 'c1',
  name: 'Sunrise Family Clinic',
  slug: 'sunrise',
  active: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  owner: { _id: 'u1', name: 'Rohan Kapoor', email: 'rohan@sunrise.test' },
  staffCount: 3,
  patientCount: 40,
  appointments30d: 120,
  lastActivityAt: new Date().toISOString(),
}

const DETAIL = {
  clinic: {
    _id: 'c1',
    name: 'Sunrise Family Clinic',
    slug: 'sunrise',
    active: true,
    timezone: 'Asia/Kolkata',
    createdAt: '2026-09-01T00:00:00.000Z',
  },
  staff: [
    {
      _id: 'u2',
      name: 'Kavita Nair',
      email: 'kavita@sunrise.test',
      role: 'doctor',
      active: true,
      createdAt: '2026-09-02T00:00:00.000Z',
    },
  ],
  usage: {
    patients: 40,
    appointments: 300,
    appointments30d: 120,
    consultations: 200,
    prescriptions: 150,
    invoices: 180,
  },
  activity: [],
  platformActions: [],
}

describe('platform panel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    platformApi.getPlatformMe.mockResolvedValue({
      _id: 'a1',
      name: 'Nadeem',
      email: 'ops@clinix.test',
    })
    platformApi.getPlatformOverview.mockResolvedValue(OVERVIEW)
    platformApi.listPlatformClinics.mockResolvedValue({
      clinics: [CLINIC_ROW],
      pagination: { page: 1, pages: 1, total: 1 },
    })
    platformApi.getPlatformClinic.mockResolvedValue(DETAIL)
  })

  it('sends anyone without a platform session to the platform login', async () => {
    platformApi.getPlatformMe.mockRejectedValue({ response: { status: 401 } })
    renderPlatform('/platform')
    expect(await screen.findByText('Platform login page')).toBeInTheDocument()
  })

  it('shows the overview and the clinic list', async () => {
    renderPlatform('/platform')

    expect(
      await screen.findByRole('link', { name: 'Sunrise Family Clinic' }),
    ).toHaveAttribute('href', '/platform/clinics/c1')
    expect(screen.getByText('rohan@sunrise.test')).toBeInTheDocument()
    expect(
      screen.getByText('Appointments, 30 days').closest('div').parentElement,
    ).toHaveTextContent('120')
  })

  it('searches and filters by status', async () => {
    const user = userEvent.setup()
    renderPlatform('/platform')
    await screen.findByRole('link', { name: 'Sunrise Family Clinic' })

    await user.type(screen.getByRole('searchbox'), 'kavita@')
    await waitFor(() =>
      expect(platformApi.listPlatformClinics).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'kavita@', page: 1 }),
      ),
    )
    await user.click(
      within(screen.getByRole('group', { name: 'Status' })).getByRole(
        'button',
        { name: 'Suspended' },
      ),
    )
    await waitFor(() =>
      expect(platformApi.listPlatformClinics).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'suspended' }),
      ),
    )
  })

  it('suspends a clinic only with a reason', async () => {
    platformApi.suspendClinic.mockResolvedValue({
      ...DETAIL.clinic,
      active: false,
    })
    const user = userEvent.setup()
    renderPlatform('/platform/clinics/c1')

    await user.click(await screen.findByRole('button', { name: /suspend/i }))
    const dialog = screen.getByRole('dialog', { name: 'Suspend clinic?' })
    const confirm = within(dialog).getByRole('button', {
      name: 'Suspend clinic',
    })
    expect(confirm).toBeDisabled()

    await user.type(
      within(dialog).getByLabelText(/reason/i),
      'Unpaid for two months',
    )
    await user.click(confirm)

    expect(platformApi.suspendClinic).toHaveBeenCalledWith(
      'c1',
      'Unpaid for two months',
    )
  })

  it('resets a staff password and shows the temporary one once', async () => {
    platformApi.resetStaffPassword.mockResolvedValue({
      user: { _id: 'u2', name: 'Kavita Nair', email: 'kavita@sunrise.test' },
      temporaryPassword: 'Abc23defGh45',
    })
    const user = userEvent.setup()
    renderPlatform('/platform/clinics/c1')

    await user.click(
      await screen.findByRole('button', {
        name: 'Reset password for Kavita Nair',
      }),
    )
    await user.click(
      within(screen.getByRole('dialog', { name: 'Reset password?' })).getByRole(
        'button',
        { name: 'Reset password' },
      ),
    )

    expect(platformApi.resetStaffPassword).toHaveBeenCalledWith('c1', 'u2')
    const result = await screen.findByRole('dialog', {
      name: 'Temporary password',
    })
    expect(within(result).getByText('Abc23defGh45')).toBeInTheDocument()
    expect(within(result).getByText(/shown only once/i)).toBeInTheDocument()

    await user.click(within(result).getByRole('button', { name: 'Done' }))
    expect(screen.queryByText('Abc23defGh45')).not.toBeInTheDocument()
  })
})
