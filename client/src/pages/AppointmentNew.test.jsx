import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { render } from '@testing-library/react'
import AppointmentNew from './AppointmentNew.jsx'
import * as staffApi from '../api/staff.js'
import * as appointmentsApi from '../api/appointments.js'
import { createTestQueryClient } from '../test/test-utils.jsx'
import { todayDateStr } from '../schemas/appointment.js'

const navigateMock = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('../api/staff.js')
vi.mock('../api/appointments.js')

// PatientPicker is a search-as-you-type widget with its own debounce and API
// call - out of scope here. Stand it up as a single button that fires the
// same onChange(id, patient) shape the real component would on selection.
vi.mock('../components/PatientPicker.jsx', () => ({
  default: ({ onChange }) => (
    <button type="button" onClick={() => onChange('patient-1', { fullName: 'Rahul Sharma', patientId: 'P-001' })}>
      Select Rahul Sharma
    </button>
  ),
}))

function renderAppointmentNew() {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/appointments/new']}>
        <AppointmentNew />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Appointment creation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    staffApi.listStaff.mockResolvedValue([
      { _id: 'doc-1', name: 'Priya Verma', role: 'doctor', active: true },
    ])
  })

  it('books an appointment with the selected patient, doctor, date and time', async () => {
    appointmentsApi.createAppointment.mockResolvedValue({ _id: 'appt-1' })
    const user = userEvent.setup()
    renderAppointmentNew()

    await user.click(await screen.findByRole('button', { name: /select rahul sharma/i }))
    await user.selectOptions(screen.getByLabelText(/doctor/i), 'doc-1')
    await user.type(screen.getByLabelText(/^time$/i), '10:30')
    await user.click(screen.getByRole('button', { name: /book appointment/i }))

    await waitFor(() => expect(appointmentsApi.createAppointment).toHaveBeenCalledTimes(1))
    const payload = appointmentsApi.createAppointment.mock.calls[0][0]
    expect(payload).toMatchObject({ patientId: 'patient-1', doctorId: 'doc-1' })
    // Local date+time is converted to a UTC ISO string, so compare against
    // the same conversion rather than assuming a timezone offset of zero.
    expect(payload.scheduledAt).toBe(new Date(`${todayDateStr()}T10:30:00`).toISOString())
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/appointments', { replace: true }))
  })

  it('blocks submission when no patient or doctor has been picked', async () => {
    const user = userEvent.setup()
    renderAppointmentNew()

    await user.click(screen.getByRole('button', { name: /book appointment/i }))

    expect(await screen.findByText(/select a patient/i)).toBeInTheDocument()
    expect(appointmentsApi.createAppointment).not.toHaveBeenCalled()
  })
})
