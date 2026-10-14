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

  describe("the doctor's working hours", () => {
    // 2026-09-01 is a Tuesday, 2026-09-06 a Sunday.
    const HOURS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => ({
      day,
      isAvailable: day !== 'sunday',
      sessions: day === 'sunday' ? [] : [{ start: '10:00', end: '13:00' }, { start: '17:00', end: '20:00' }],
    }))

    beforeEach(() => {
      staffApi.listStaff.mockResolvedValue([
        { _id: 'doc-1', name: 'Priya Verma', role: 'doctor', active: true, doctorProfile: { workingHours: HOURS } },
      ])
    })

    async function fillIn(user, date, time) {
      await user.click(await screen.findByRole('button', { name: /select rahul sharma/i }))
      await user.selectOptions(screen.getByLabelText(/doctor/i), 'doc-1')
      await user.clear(screen.getByLabelText(/^date$/i))
      await user.type(screen.getByLabelText(/^date$/i), date)
      if (time) await user.type(screen.getByLabelText(/^time$/i), time)
    }

    it("shows the doctor's hours for the chosen day and flags a time outside them", async () => {
      const user = userEvent.setup()
      renderAppointmentNew()

      await fillIn(user, '2026-09-01', '14:00')
      expect(screen.getByText('Dr. Priya Verma sees patients 10:00 AM-1:00 PM and 5:00 PM-8:00 PM on Tuesdays.')).toBeInTheDocument()
      expect(screen.getByText(/outside dr\. priya verma's hours/i)).toBeInTheDocument()

      await user.clear(screen.getByLabelText(/^date$/i))
      await user.type(screen.getByLabelText(/^date$/i), '2026-09-06')
      expect(screen.getByText("Dr. Priya Verma doesn't see patients on Sundays.")).toBeInTheDocument()
    })

    it('asks before booking outside the hours, then books with the override', async () => {
      const message = "That time is outside Dr. Priya Verma's hours. On Tuesdays they see patients 10:00 AM-1:00 PM and 5:00 PM-8:00 PM."
      appointmentsApi.createAppointment
        .mockRejectedValueOnce({ response: { status: 409, data: { code: 'OUTSIDE_WORKING_HOURS', message } } })
        .mockResolvedValueOnce({ _id: 'appt-1' })
      const user = userEvent.setup()
      renderAppointmentNew()

      await fillIn(user, '2026-09-01', '14:00')
      await user.click(screen.getByRole('button', { name: /book appointment/i }))

      const dialog = await screen.findByRole('dialog', { name: 'Book outside working hours?' })
      expect(dialog).toHaveTextContent(message)
      expect(navigateMock).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: 'Book anyway' }))
      await waitFor(() => expect(appointmentsApi.createAppointment).toHaveBeenCalledTimes(2))
      expect(appointmentsApi.createAppointment.mock.calls[1][0]).toMatchObject({ doctorId: 'doc-1', allowOutsideHours: true })
      await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/appointments', { replace: true }))
    })

    it('books nothing when the user cancels', async () => {
      appointmentsApi.createAppointment.mockRejectedValueOnce({
        response: { status: 409, data: { code: 'OUTSIDE_WORKING_HOURS', message: 'Outside hours.' } },
      })
      const user = userEvent.setup()
      renderAppointmentNew()

      await fillIn(user, '2026-09-06', '11:00')
      await user.click(screen.getByRole('button', { name: /book appointment/i }))
      await user.click(await screen.findByRole('button', { name: 'Cancel' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(appointmentsApi.createAppointment).toHaveBeenCalledTimes(1)
    })
  })
})
