import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReadyToBill from './ReadyToBill.jsx'
import * as invoicesApi from '../api/invoices.js'
import * as clinicApi from '../api/clinic.js'
import { renderWithProviders } from '../test/test-utils.jsx'

vi.mock('../api/invoices.js')
vi.mock('../api/clinic.js')

const VISIT = {
  appointmentId: 'a1',
  tokenNumber: 7,
  isWalkIn: true,
  completedAt: '2026-10-13T06:30:00.000Z',
  patient: { _id: 'p1', fullName: 'Nisha Patel', patientId: 'P-10018' },
  doctor: { _id: 'd1', name: 'Kavita Nair' },
  consultationId: 'c1',
}

describe('Ready to bill', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clinicApi.getClinicSettings.mockResolvedValue({ defaultConsultationFee: 400 })
  })

  it('shows nothing when no visit is waiting to be billed', async () => {
    invoicesApi.listReadyToBill.mockResolvedValue([])
    const { container } = renderWithProviders(<ReadyToBill />)
    await vi.waitFor(() => expect(invoicesApi.listReadyToBill).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('bills a completed visit linked to its appointment, consultation and doctor', async () => {
    invoicesApi.listReadyToBill.mockResolvedValue([VISIT])
    invoicesApi.createInvoice.mockResolvedValue({ _id: 'inv1' })
    const user = userEvent.setup()
    renderWithProviders(<ReadyToBill />)

    const row = (await screen.findByText('Nisha Patel')).closest('li')
    expect(screen.getByRole('heading', { name: 'Ready to bill (1)' })).toBeInTheDocument()
    expect(row).toHaveTextContent('Dr. Kavita Nair')
    expect(row).toHaveTextContent('Walk-in')

    await user.click(within(row).getByRole('button', { name: /generate bill/i }))
    const dialog = await screen.findByRole('dialog')
    // The clinic's default fee is filled in.
    expect(await within(dialog).findByDisplayValue('400')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Create Invoice' }))

    await vi.waitFor(() => expect(invoicesApi.createInvoice).toHaveBeenCalled())
    expect(invoicesApi.createInvoice.mock.calls[0][0]).toMatchObject({
      patientId: 'p1',
      doctorId: 'd1',
      appointmentId: 'a1',
      consultationId: 'c1',
    })
  })
})
