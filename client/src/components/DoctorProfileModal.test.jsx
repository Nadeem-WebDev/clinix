import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DoctorProfileModal from './DoctorProfileModal.jsx'
import * as staffApi from '../api/staff.js'
import * as clinicApi from '../api/clinic.js'
import { useAuth } from '../context/AuthContext.jsx'
import { renderWithProviders } from '../test/test-utils.jsx'

vi.mock('../api/staff.js')
vi.mock('../api/clinic.js')
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }))

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const CLINIC = {
  defaultConsultationFee: 500,
  workingHours: DAYS.map((day) => ({ day, isOpen: day !== 'sunday', openTime: '09:00', closeTime: '18:00' })),
}

function doctorFixture(profile) {
  return {
    _id: 'd1',
    name: 'Kavita Nair',
    email: 'kavita@test.local',
    role: 'doctor',
    active: true,
    doctorProfile: profile,
  }
}

const PROFILE = {
  qualifications: 'MBBS, MD',
  specialization: 'General Physician',
  registrationNumber: 'MMC-123456',
  registrationCouncil: 'Maharashtra Medical Council',
}

const png = () =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'sign.png', {
    type: 'image/png',
  })

describe('DoctorProfileModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // The preview is loaded through the API as a Blob and shown via a
    // blob: URL; jsdom has no createObjectURL, so stub it.
    staffApi.fetchDoctorSignature.mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
    clinicApi.getClinicSettings.mockResolvedValue(CLINIC)
    useAuth.mockReturnValue({ user: { _id: 'o1', role: 'owner' } })
    URL.createObjectURL = vi.fn(() => 'blob:signature-preview')
    URL.revokeObjectURL = vi.fn()
  })

  it('shows the saved details and saves changes', async () => {
    staffApi.listStaff.mockResolvedValue([doctorFixture(PROFILE)])
    staffApi.updateDoctorProfile.mockResolvedValue(
      doctorFixture({ ...PROFILE, specialization: 'Paediatrician' }),
    )
    const user = userEvent.setup()
    renderWithProviders(
      <DoctorProfileModal open doctorId="d1" onClose={() => {}} />,
    )

    const specialization = await screen.findByLabelText('Specialisation')
    await waitFor(() => expect(specialization).toHaveValue('General Physician'))
    expect(screen.getByLabelText('Registration number')).toHaveValue(
      'MMC-123456',
    )

    await user.clear(specialization)
    await user.type(specialization, 'Paediatrician')
    await user.click(screen.getByRole('button', { name: 'Save details' }))

    expect(staffApi.updateDoctorProfile).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({
        specialization: 'Paediatrician',
        registrationNumber: 'MMC-123456',
      }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Saved')
  })

  it('starts empty for a doctor with no profile yet, with Save disabled until something changes', async () => {
    staffApi.listStaff.mockResolvedValue([doctorFixture(undefined)])
    renderWithProviders(
      <DoctorProfileModal open doctorId="d1" onClose={() => {}} />,
    )

    expect(await screen.findByLabelText('Qualifications')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Save details' })).toBeDisabled()
    expect(screen.getByText('No signature yet')).toBeInTheDocument()
  })

  it('uploads a signature straight away and shows it', async () => {
    staffApi.listStaff.mockResolvedValue([doctorFixture(PROFILE)])
    staffApi.uploadDoctorSignature.mockResolvedValue(
      doctorFixture({
        ...PROFILE,
        signature: {
          contentType: 'image/png',
          updatedAt: '2026-10-12T10:00:00.000Z',
        },
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(
      <DoctorProfileModal open doctorId="d1" onClose={() => {}} />,
    )

    await user.upload(
      await screen.findByLabelText('Signature image file'),
      png(),
    )

    expect(staffApi.uploadDoctorSignature).toHaveBeenCalledWith(
      'd1',
      expect.any(File),
    )
    expect(
      await screen.findByAltText('Signature of Dr. Kavita Nair'),
    ).toHaveAttribute('src', 'blob:signature-preview')
    expect(staffApi.fetchDoctorSignature).toHaveBeenCalledWith(
      'd1',
      '2026-10-12T10:00:00.000Z',
    )
    expect(
      screen.getByRole('button', { name: /change signature/i }),
    ).toBeInTheDocument()
  })

  it('says so, instead of a broken image, when the preview cannot be loaded', async () => {
    staffApi.fetchDoctorSignature.mockRejectedValue(new Error('Network Error'))
    staffApi.listStaff.mockResolvedValue([
      doctorFixture({
        ...PROFILE,
        signature: { contentType: 'image/png', updatedAt: '2026-10-12T10:00:00.000Z' },
      }),
    ])
    renderWithProviders(
      <DoctorProfileModal open doctorId="d1" onClose={() => {}} />,
    )

    expect(
      await screen.findByText('Signature saved, but the preview could not be loaded'),
    ).toBeInTheDocument()
    expect(screen.queryByAltText('Signature of Dr. Kavita Nair')).not.toBeInTheDocument()
  })

  it('refuses a WebP or an image over 1MB before uploading', async () => {
    staffApi.listStaff.mockResolvedValue([doctorFixture(PROFILE)])
    const user = userEvent.setup({ applyAccept: false })
    renderWithProviders(
      <DoctorProfileModal open doctorId="d1" onClose={() => {}} />,
    )

    const input = await screen.findByLabelText('Signature image file')
    await user.upload(
      input,
      new File(['x'], 'sign.webp', { type: 'image/webp' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only PNG and JPG images are allowed.',
    )

    await user.upload(
      input,
      new File([new Uint8Array(1024 * 1024 + 1)], 'big.png', {
        type: 'image/png',
      }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(/over 1MB/)
    expect(staffApi.uploadDoctorSignature).not.toHaveBeenCalled()
  })

  it('keeps unsaved typing when a signature is uploaded', async () => {
    staffApi.listStaff.mockResolvedValue([doctorFixture(PROFILE)])
    staffApi.uploadDoctorSignature.mockResolvedValue(
      doctorFixture({
        ...PROFILE,
        signature: {
          contentType: 'image/png',
          updatedAt: '2026-10-12T10:00:00.000Z',
        },
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(
      <DoctorProfileModal open doctorId="d1" onClose={() => {}} />,
    )

    const council = await screen.findByLabelText('Medical council')
    await waitFor(() =>
      expect(council).toHaveValue('Maharashtra Medical Council'),
    )
    await user.clear(council)
    await user.type(council, 'National Medical Commission')
    await user.upload(screen.getByLabelText('Signature image file'), png())
    await screen.findByRole('button', { name: /change signature/i })

    expect(screen.getByLabelText('Medical council')).toHaveValue(
      'National Medical Commission',
    )
  })

  it('removes the signature', async () => {
    staffApi.listStaff.mockResolvedValue([
      doctorFixture({
        ...PROFILE,
        signature: {
          contentType: 'image/png',
          updatedAt: '2026-10-12T10:00:00.000Z',
        },
      }),
    ])
    staffApi.removeDoctorSignature.mockResolvedValue(doctorFixture(PROFILE))
    const user = userEvent.setup()
    renderWithProviders(
      <DoctorProfileModal open doctorId="d1" onClose={() => {}} />,
    )

    await user.click(await screen.findByRole('button', { name: /remove/i }))

    expect(staffApi.removeDoctorSignature).toHaveBeenCalledWith('d1')
    expect(await screen.findByText('No signature yet')).toBeInTheDocument()
  })

  describe('fee and working hours', () => {
    const renderModal = () => renderWithProviders(<DoctorProfileModal open doctorId="d1" onClose={() => {}} />)

    it("lets an owner set the fee and a weekly timetable with a second session", async () => {
      staffApi.listStaff.mockResolvedValue([doctorFixture(PROFILE)])
      staffApi.updateDoctorProfile.mockResolvedValue(doctorFixture(PROFILE))
      const user = userEvent.setup()
      renderModal()

      const fee = await screen.findByLabelText('Consultation fee (₹)')
      expect(screen.getByText(/leave blank to use the clinic's fee \(₹500\)/i)).toBeInTheDocument()
      expect(screen.getByText(/can be booked at any time/i)).toBeInTheDocument()
      await user.type(fee, '650')

      await user.click(screen.getByRole('switch', { name: 'Fixed weekly hours' }))
      // Starts from the clinic's hours: Monday-Saturday 9-6, Sunday off.
      expect(screen.getByLabelText('Monday start time')).toHaveValue('09:00')
      expect(screen.getByRole('switch', { name: 'Sunday' })).not.toBeChecked()

      await user.clear(screen.getByLabelText('Monday end time'))
      await user.type(screen.getByLabelText('Monday end time'), '13:00')
      await user.click(screen.getByRole('button', { name: 'Add a second session on Monday' }))
      expect(screen.getByLabelText('Monday second session start time')).toHaveValue('17:00')
      await user.click(screen.getByRole('switch', { name: 'Saturday' }))
      await user.click(screen.getByRole('button', { name: 'Save details' }))

      await waitFor(() => expect(staffApi.updateDoctorProfile).toHaveBeenCalled())
      const [, payload] = staffApi.updateDoctorProfile.mock.calls[0]
      expect(payload.consultationFee).toBe(650)
      expect(payload.workingHours).toHaveLength(7)
      expect(payload.workingHours[0]).toEqual({
        day: 'monday',
        isAvailable: true,
        sessions: [
          { start: '09:00', end: '13:00' },
          { start: '17:00', end: '20:00' },
        ],
      })
      expect(payload.workingHours[1].sessions).toEqual([{ start: '09:00', end: '18:00' }])
      expect(payload.workingHours[5]).toEqual({ day: 'saturday', isAvailable: false, sessions: [] })
    })

    it('shows saved hours, and turning them off sends null', async () => {
      const hours = DAYS.map((day) => ({
        day,
        isAvailable: day === 'tuesday',
        sessions: day === 'tuesday' ? [{ start: '10:00', end: '13:00' }, { start: '18:00', end: '21:00' }] : [],
      }))
      staffApi.listStaff.mockResolvedValue([doctorFixture({ ...PROFILE, consultationFee: 800, workingHours: hours })])
      staffApi.updateDoctorProfile.mockResolvedValue(doctorFixture(PROFILE))
      const user = userEvent.setup()
      renderModal()

      expect(await screen.findByLabelText('Consultation fee (₹)')).toHaveValue(800)
      expect(screen.getByRole('switch', { name: 'Fixed weekly hours' })).toBeChecked()
      expect(screen.getByLabelText('Tuesday second session end time')).toHaveValue('21:00')
      expect(screen.getByRole('switch', { name: 'Monday' })).not.toBeChecked()

      await user.click(screen.getByRole('switch', { name: 'Fixed weekly hours' }))
      await user.clear(screen.getByLabelText('Consultation fee (₹)'))
      await user.click(screen.getByRole('button', { name: 'Save details' }))

      await waitFor(() => expect(staffApi.updateDoctorProfile).toHaveBeenCalled())
      expect(staffApi.updateDoctorProfile.mock.calls[0][1]).toMatchObject({ consultationFee: null, workingHours: null })
    })

    it('stops a session that ends before it starts', async () => {
      staffApi.listStaff.mockResolvedValue([doctorFixture(PROFILE)])
      const user = userEvent.setup()
      renderModal()

      await user.click(await screen.findByRole('switch', { name: 'Fixed weekly hours' }))
      await user.clear(screen.getByLabelText('Wednesday end time'))
      await user.type(screen.getByLabelText('Wednesday end time'), '08:00')
      await user.click(screen.getByRole('button', { name: 'Save details' }))

      expect(await screen.findByText('End time must be after start time')).toBeInTheDocument()
      expect(staffApi.updateDoctorProfile).not.toHaveBeenCalled()
    })

    it("shows a doctor their fee but doesn't let them change it", async () => {
      useAuth.mockReturnValue({ user: { _id: 'd1', role: 'doctor' } })
      staffApi.listStaff.mockResolvedValue([doctorFixture({ ...PROFILE, consultationFee: 800 })])
      staffApi.updateDoctorProfile.mockResolvedValue(doctorFixture(PROFILE))
      const user = userEvent.setup()
      renderModal()

      const fee = await screen.findByLabelText('Consultation fee (₹)')
      expect(fee).toHaveValue(800)
      expect(fee).toHaveAttribute('readonly')
      expect(screen.getByText(/set by the clinic's owner or admin/i)).toBeInTheDocument()

      await user.click(screen.getByRole('switch', { name: 'Fixed weekly hours' }))
      await user.click(screen.getByRole('button', { name: 'Save details' }))

      await waitFor(() => expect(staffApi.updateDoctorProfile).toHaveBeenCalled())
      const [, payload] = staffApi.updateDoctorProfile.mock.calls[0]
      expect(payload).not.toHaveProperty('consultationFee')
      expect(payload.workingHours).toHaveLength(7)
    })
  })
})
