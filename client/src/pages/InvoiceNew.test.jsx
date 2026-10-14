import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import InvoiceNew from './InvoiceNew.jsx'
import * as staffApi from '../api/staff.js'
import * as clinicApi from '../api/clinic.js'
import { renderWithProviders } from '../test/test-utils.jsx'

vi.mock('../api/staff.js')
vi.mock('../api/clinic.js')
vi.mock('../api/invoices.js')
// Search-as-you-type with its own API call - not what this tests.
vi.mock('../components/PatientPicker.jsx', () => ({ default: () => null }))

describe('Create Bill', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clinicApi.getClinicSettings.mockResolvedValue({
      defaultConsultationFee: 400,
    })
    staffApi.listStaff.mockResolvedValue([
      {
        _id: 'd1',
        name: 'Kavita Nair',
        role: 'doctor',
        active: true,
        doctorProfile: { consultationFee: 700 },
      },
      { _id: 'd2', name: 'Arjun Rao', role: 'doctor', active: true },
    ])
  })

  const price = () =>
    screen
      .getAllByRole('spinbutton')
      .find((el) => el.name === 'items.0.unitPrice')

  it("follows the chosen doctor's fee, falling back to the clinic's", async () => {
    const user = userEvent.setup()
    renderWithProviders(<InvoiceNew />)

    await screen.findByDisplayValue('400')
    await user.selectOptions(screen.getByLabelText('Doctor (optional)'), 'd1')
    expect(price()).toHaveValue(700)
    await user.selectOptions(screen.getByLabelText('Doctor (optional)'), 'd2')
    expect(price()).toHaveValue(400)
  })

  it('keeps a price someone typed when the doctor changes', async () => {
    const user = userEvent.setup()
    renderWithProviders(<InvoiceNew />)

    await screen.findByDisplayValue('400')
    await user.clear(price())
    await user.type(price(), '250')
    await user.selectOptions(screen.getByLabelText('Doctor (optional)'), 'd1')
    expect(price()).toHaveValue(250)
  })
})
