import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Settings from './Settings.jsx'
import * as clinicApi from '../api/clinic.js'
import { renderWithProviders } from '../test/test-utils.jsx'

vi.mock('../api/clinic.js')

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

function clinicFixture(overrides = {}) {
  return {
    _id: 'c1',
    name: 'Sharma Clinic',
    phone: '02212345678',
    address: '12 MG Road',
    defaultConsultationFee: 500,
    whatsappEnabled: false,
    workingHours: DAYS.map((day) => ({ day, isOpen: day !== 'sunday', openTime: '09:00', closeTime: '18:00' })),
    ...overrides,
  }
}

describe('Clinic Settings - WhatsApp notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reflects the clinic\'s current WhatsApp setting', async () => {
    clinicApi.getClinicSettings.mockResolvedValue(clinicFixture({ whatsappEnabled: true }))
    renderWithProviders(<Settings />)

    const toggle = await screen.findByLabelText(/send appointment and queue updates/i)
    await waitFor(() => expect(toggle).toBeChecked())
  })

  it('saves the toggle back to the API', async () => {
    clinicApi.getClinicSettings.mockResolvedValue(clinicFixture({ whatsappEnabled: false }))
    clinicApi.updateClinicSettings.mockResolvedValue(clinicFixture({ whatsappEnabled: true }))
    const user = userEvent.setup()
    renderWithProviders(<Settings />)

    const toggle = await screen.findByLabelText(/send appointment and queue updates/i)
    await waitFor(() => expect(toggle).not.toBeChecked())
    await user.click(toggle)
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(clinicApi.updateClinicSettings).toHaveBeenCalledWith(
        expect.objectContaining({ whatsappEnabled: true }),
        expect.anything(),
      )
    })
  })

  it('does not offer per-clinic Meta credential fields', async () => {
    clinicApi.getClinicSettings.mockResolvedValue(clinicFixture())
    renderWithProviders(<Settings />)

    await screen.findByLabelText(/send appointment and queue updates/i)

    // Meta credentials and template approval are platform-level. Offering
    // inputs here would imply a clinic can self-configure them.
    expect(screen.queryByLabelText(/access token/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/phone number id/i)).not.toBeInTheDocument()
    expect(screen.getByText(/configured and approved\s+centrally/i)).toBeInTheDocument()
  })
})
