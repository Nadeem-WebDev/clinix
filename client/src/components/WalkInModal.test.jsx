import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WalkInModal from './WalkInModal.jsx'
import * as staffApi from '../api/staff.js'
import * as patientsApi from '../api/patients.js'
import * as appointmentsApi from '../api/appointments.js'
import { renderWithProviders } from '../test/test-utils.jsx'

vi.mock('../api/staff.js')
vi.mock('../api/patients.js')
vi.mock('../api/appointments.js')

// Same stand-in as AppointmentNew.test: the real picker's debounced search is
// out of scope here; this fires the onChange(id, patient) it would.
vi.mock('./PatientPicker.jsx', () => ({
  default: ({ onChange }) => (
    <button type="button" onClick={() => onChange('patient-1', { fullName: 'Rahul Sharma', patientId: 'P-001' })}>
      Select Rahul Sharma
    </button>
  ),
}))

const DOCTORS = [
  { _id: 'doc-1', name: 'Kavita Nair', role: 'doctor', active: true },
  { _id: 'doc-2', name: 'Anil Rao', role: 'doctor', active: true },
]

function renderModal(props = {}) {
  const onClose = vi.fn()
  const onAdded = vi.fn()
  renderWithProviders(<WalkInModal open onClose={onClose} onAdded={onAdded} {...props} />)
  return { onClose, onAdded }
}

describe('Add walk-in to queue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    staffApi.listStaff.mockResolvedValue(DOCTORS)
    appointmentsApi.addWalkIn.mockResolvedValue({ _id: 'appt-9', tokenNumber: 7, patientId: { fullName: 'Rahul Sharma' } })
  })

  it('adds an existing patient to the queue with no date or time to fill in', async () => {
    const user = userEvent.setup()
    const { onAdded, onClose } = renderModal()

    await user.click(screen.getByRole('button', { name: /select rahul sharma/i }))
    await user.selectOptions(await screen.findByLabelText('Doctor'), 'doc-2')
    await user.click(screen.getByRole('button', { name: /add to queue/i }))

    await waitFor(() => expect(appointmentsApi.addWalkIn).toHaveBeenCalledWith({ patientId: 'patient-1', doctorId: 'doc-2' }))
    expect(onAdded).toHaveBeenCalledWith(expect.objectContaining({ tokenNumber: 7 }))
    expect(onClose).toHaveBeenCalled()
    expect(screen.queryByLabelText(/date/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/time/i)).not.toBeInTheDocument()
  })

  it('registers a new patient on the spot, then queues them', async () => {
    patientsApi.createPatient.mockResolvedValue({ _id: 'new-1', fullName: 'Ravi Kumar', patientId: 'P-019' })
    const user = userEvent.setup()
    renderModal({ defaultDoctorId: 'doc-1' })

    await user.click(screen.getByRole('button', { name: 'New patient' }))
    await user.type(screen.getByLabelText('Full name'), 'Ravi Kumar')
    await user.type(screen.getByLabelText('Phone'), '9876500011')
    await user.type(screen.getByLabelText('Age'), '42')
    await user.selectOptions(screen.getByLabelText('Gender'), 'male')
    await user.click(screen.getByRole('button', { name: /add to queue/i }))

    await waitFor(() =>
      expect(patientsApi.createPatient).toHaveBeenCalledWith({
        fullName: 'Ravi Kumar',
        phone: '9876500011',
        age: 42,
        gender: 'male',
      }),
    )
    await waitFor(() => expect(appointmentsApi.addWalkIn).toHaveBeenCalledWith({ patientId: 'new-1', doctorId: 'doc-1' }))
  })

  it("saves the new patient's email when one is given", async () => {
    patientsApi.createPatient.mockResolvedValue({ _id: 'new-1', fullName: 'Ravi Kumar', patientId: 'P-019' })
    const user = userEvent.setup()
    renderModal({ defaultDoctorId: 'doc-1' })

    await user.click(screen.getByRole('button', { name: 'New patient' }))
    await user.type(screen.getByLabelText('Full name'), 'Ravi Kumar')
    await user.type(screen.getByLabelText('Phone'), '9876500011')
    await user.type(screen.getByLabelText(/email/i), 'ravi@example.com')
    await user.type(screen.getByLabelText('Age'), '42')
    await user.selectOptions(screen.getByLabelText('Gender'), 'male')
    await user.click(screen.getByRole('button', { name: /add to queue/i }))

    await waitFor(() =>
      expect(patientsApi.createPatient).toHaveBeenCalledWith({
        fullName: 'Ravi Kumar',
        phone: '9876500011',
        email: 'ravi@example.com',
        age: 42,
        gender: 'male',
      }),
    )
  })

  it('stops a mistyped email, but never requires one', async () => {
    const user = userEvent.setup()
    renderModal({ defaultDoctorId: 'doc-1' })

    await user.click(screen.getByRole('button', { name: 'New patient' }))
    expect(screen.getByLabelText(/email/i)).toHaveAccessibleName('Email (optional)')
    await user.type(screen.getByLabelText('Full name'), 'Ravi Kumar')
    await user.type(screen.getByLabelText('Phone'), '9876500011')
    await user.type(screen.getByLabelText(/email/i), 'ravi@example')
    await user.type(screen.getByLabelText('Age'), '42')
    await user.selectOptions(screen.getByLabelText('Gender'), 'male')
    await user.click(screen.getByRole('button', { name: /add to queue/i }))

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(patientsApi.createPatient).not.toHaveBeenCalled()
  })

  it('asks for the new patient\'s details before calling the API', async () => {
    const user = userEvent.setup()
    renderModal({ defaultDoctorId: 'doc-1' })

    await user.click(screen.getByRole('button', { name: 'New patient' }))
    await user.click(screen.getByRole('button', { name: /add to queue/i }))

    expect(await screen.findByText('Full name is required')).toBeInTheDocument()
    expect(screen.getByText('A valid phone number is required')).toBeInTheDocument()
    expect(screen.getByText('Enter an age in years')).toBeInTheDocument()
    expect(patientsApi.createPatient).not.toHaveBeenCalled()
    expect(appointmentsApi.addWalkIn).not.toHaveBeenCalled()
  })

  it('does not register the same new patient twice when the queue step fails', async () => {
    patientsApi.createPatient.mockResolvedValue({ _id: 'new-1', fullName: 'Ravi Kumar', patientId: 'P-019' })
    appointmentsApi.addWalkIn
      .mockRejectedValueOnce({ response: { data: { message: 'Doctor not found in this clinic' } } })
      .mockResolvedValueOnce({ _id: 'appt-9', tokenNumber: 3, patientId: { fullName: 'Ravi Kumar' } })
    const user = userEvent.setup()
    renderModal({ defaultDoctorId: 'doc-1' })

    await user.click(screen.getByRole('button', { name: 'New patient' }))
    await user.type(screen.getByLabelText('Full name'), 'Ravi Kumar')
    await user.type(screen.getByLabelText('Phone'), '9876500011')
    await user.type(screen.getByLabelText('Age'), '42')
    await user.selectOptions(screen.getByLabelText('Gender'), 'male')
    await user.click(screen.getByRole('button', { name: /add to queue/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Doctor not found in this clinic')

    await user.click(screen.getByRole('button', { name: /add to queue/i }))

    await waitFor(() => expect(appointmentsApi.addWalkIn).toHaveBeenCalledTimes(2))
    expect(patientsApi.createPatient).toHaveBeenCalledTimes(1)
    expect(appointmentsApi.addWalkIn).toHaveBeenLastCalledWith({ patientId: 'new-1', doctorId: 'doc-1' })
  })

  it('offers to mark an existing booking arrived instead of duplicating it', async () => {
    appointmentsApi.addWalkIn.mockRejectedValue({
      response: {
        data: {
          code: 'BOOKED_TODAY',
          message: 'This patient already has a booking today with this doctor - mark it arrived instead',
          details: { appointmentId: 'booked-1' },
        },
      },
    })
    appointmentsApi.markArrived.mockResolvedValue({ _id: 'booked-1', tokenNumber: 2, patientId: { fullName: 'Rahul Sharma' } })
    const user = userEvent.setup()
    const { onAdded } = renderModal({ defaultDoctorId: 'doc-1' })

    await user.click(screen.getByRole('button', { name: /select rahul sharma/i }))
    await user.click(screen.getByRole('button', { name: /add to queue/i }))
    await user.click(await screen.findByRole('button', { name: /mark arrived instead/i }))

    await waitFor(() => expect(appointmentsApi.markArrived).toHaveBeenCalledWith('booked-1', expect.anything()))
    expect(onAdded).toHaveBeenCalledWith(expect.objectContaining({ _id: 'booked-1' }))
  })

  it('picks the doctor automatically when the clinic has only one', async () => {
    staffApi.listStaff.mockResolvedValue([DOCTORS[0]])
    renderModal()

    await waitFor(() => expect(screen.getByLabelText('Doctor')).toHaveValue('doc-1'))
  })
})
