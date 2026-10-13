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
    slug: 'sharma-clinic',
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

    const toggle = await screen.findByLabelText(/updates to patients on whatsapp/i)
    await waitFor(() => expect(toggle).toBeChecked())
  })

  it('saves the toggle back to the API', async () => {
    clinicApi.getClinicSettings.mockResolvedValue(clinicFixture({ whatsappEnabled: false }))
    clinicApi.updateClinicSettings.mockResolvedValue(clinicFixture({ whatsappEnabled: true }))
    const user = userEvent.setup()
    renderWithProviders(<Settings />)

    const toggle = await screen.findByLabelText(/updates to patients on whatsapp/i)
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

    await screen.findByLabelText(/updates to patients on whatsapp/i)

    // Meta credentials and template approval are platform-level. Offering
    // inputs here would imply a clinic can self-configure them.
    expect(screen.queryByLabelText(/access token/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/phone number id/i)).not.toBeInTheDocument()
    expect(screen.getByText(/configured and approved\s+centrally/i)).toBeInTheDocument()
  })
})

describe('Clinic Settings - email notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('saves the email toggle and the clinic\'s contact email', async () => {
    clinicApi.getClinicSettings.mockResolvedValue(clinicFixture({ emailEnabled: false }))
    clinicApi.updateClinicSettings.mockResolvedValue(clinicFixture({ emailEnabled: true, email: 'desk@sharma.in' }))
    const user = userEvent.setup()
    renderWithProviders(<Settings />)

    const toggle = await screen.findByLabelText(/updates to patients by email/i)
    await waitFor(() => expect(toggle).not.toBeChecked())
    await user.click(toggle)
    await user.type(screen.getByLabelText('Contact email'), 'desk@sharma.in')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(clinicApi.updateClinicSettings).toHaveBeenCalledWith(
        expect.objectContaining({ emailEnabled: true, email: 'desk@sharma.in' }),
        expect.anything(),
      )
    })
  })

  it('refuses a contact email that is not an address', async () => {
    clinicApi.getClinicSettings.mockResolvedValue(clinicFixture())
    const user = userEvent.setup()
    renderWithProviders(<Settings />)

    await user.type(await screen.findByLabelText('Contact email'), 'not-an-email')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(clinicApi.updateClinicSettings).not.toHaveBeenCalled()
  })
})

describe('Clinic Settings - working hours', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows open days with labelled times and closed days as "Closed"', async () => {
    clinicApi.getClinicSettings.mockResolvedValue(clinicFixture())
    renderWithProviders(<Settings />)

    const monday = await screen.findByRole('switch', { name: 'Monday' })
    await waitFor(() => expect(monday).toBeChecked())
    expect(screen.getByLabelText('Monday opening time')).toHaveValue('09:00')
    expect(screen.getByLabelText('Monday closing time')).toHaveValue('18:00')

    expect(screen.getByRole('switch', { name: 'Sunday' })).not.toBeChecked()
    expect(screen.queryByLabelText('Sunday opening time')).not.toBeInTheDocument()
    expect(screen.getByText('Closed')).toBeInTheDocument()
  })

  it('opening a closed day reveals its times and saves them', async () => {
    clinicApi.getClinicSettings.mockResolvedValue(clinicFixture())
    clinicApi.updateClinicSettings.mockResolvedValue(clinicFixture())
    const user = userEvent.setup()
    renderWithProviders(<Settings />)

    const sunday = await screen.findByRole('switch', { name: 'Sunday' })
    await waitFor(() => expect(sunday).not.toBeChecked())
    await user.click(sunday)
    expect(screen.getByLabelText('Sunday opening time')).toHaveValue('09:00')
    expect(screen.queryByText('Closed')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => {
      const payload = clinicApi.updateClinicSettings.mock.calls[0][0]
      expect(payload.workingHours[6]).toEqual({ day: 'sunday', isOpen: true, openTime: '09:00', closeTime: '18:00' })
    })
  })

  it('keeps a day\'s hours when it is closed and reopened', async () => {
    clinicApi.getClinicSettings.mockResolvedValue(
      clinicFixture({
        workingHours: DAYS.map((day) => ({ day, isOpen: true, openTime: '10:30', closeTime: '14:00' })),
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<Settings />)

    const saturday = await screen.findByRole('switch', { name: 'Saturday' })
    await waitFor(() => expect(saturday).toBeChecked())
    await user.click(saturday)
    expect(screen.queryByLabelText('Saturday opening time')).not.toBeInTheDocument()
    await user.click(saturday)
    expect(screen.getByLabelText('Saturday opening time')).toHaveValue('10:30')
    expect(screen.getByLabelText('Saturday closing time')).toHaveValue('14:00')
  })

  it('rejects a closing time before the opening time', async () => {
    clinicApi.getClinicSettings.mockResolvedValue(clinicFixture())
    const user = userEvent.setup()
    renderWithProviders(<Settings />)

    const close = await screen.findByLabelText('Monday closing time')
    await user.clear(close)
    await user.type(close, '08:00')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByText('Opening time must be before closing time')).toBeInTheDocument()
    expect(clinicApi.updateClinicSettings).not.toHaveBeenCalled()
  })
})

describe('Clinic Settings - time zone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the saved time zone, defaulting to Asia/Kolkata', async () => {
    clinicApi.getClinicSettings.mockResolvedValue(clinicFixture())
    renderWithProviders(<Settings />)

    const select = await screen.findByLabelText('Time zone')
    await waitFor(() => expect(select).toHaveValue('Asia/Kolkata'))
    expect(screen.getByText(/decides which day counts as "today"/i)).toBeInTheDocument()
  })

  it('saves a changed time zone', async () => {
    clinicApi.getClinicSettings.mockResolvedValue(clinicFixture({ timezone: 'Asia/Kolkata' }))
    clinicApi.updateClinicSettings.mockResolvedValue(clinicFixture({ timezone: 'Asia/Dubai' }))
    const user = userEvent.setup()
    renderWithProviders(<Settings />)

    const select = await screen.findByLabelText('Time zone')
    await waitFor(() => expect(select).toHaveValue('Asia/Kolkata'))
    await user.selectOptions(select, 'Asia/Dubai')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() =>
      expect(clinicApi.updateClinicSettings).toHaveBeenCalledWith(
        expect.objectContaining({ timezone: 'Asia/Dubai' }),
        expect.anything(),
      ),
    )
  })
})

describe('Clinic Settings - patient queue link', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
  })

  it('shows and copies the clinic public queue URL', async () => {
    clinicApi.getClinicSettings.mockResolvedValue(clinicFixture())
    const user = userEvent.setup()
    renderWithProviders(<Settings />)

    const link = await screen.findByRole('textbox', { name: 'Patient queue link' })
    expect(link).toHaveValue(`${window.location.origin}/q/sharma-clinic`)
    expect(screen.getByRole('link', { name: /open patient queue link/i })).toHaveAttribute(
      'href',
      `${window.location.origin}/q/sharma-clinic`,
    )

    await user.click(screen.getByRole('button', { name: /copy link/i }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${window.location.origin}/q/sharma-clinic`)
    expect(screen.getByRole('status')).toHaveTextContent('Link copied.')
  })
})

describe('Clinic Settings - clinic logo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const pngFile = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'logo.png', { type: 'image/png' })

  it('uploads a chosen image straight away and shows it', async () => {
    clinicApi.getClinicSettings.mockResolvedValue(clinicFixture())
    clinicApi.uploadClinicLogo.mockResolvedValue(clinicFixture({ logoUrl: 'https://cdn.test/logo.png' }))
    const user = userEvent.setup()
    renderWithProviders(<Settings />)

    await user.upload(await screen.findByLabelText('Clinic logo file'), pngFile())

    expect(clinicApi.uploadClinicLogo).toHaveBeenCalledWith(expect.any(File), expect.anything())
    expect(await screen.findByAltText('Sharma Clinic logo')).toHaveAttribute('src', 'https://cdn.test/logo.png')
    expect(screen.getByRole('button', { name: /change logo/i })).toBeInTheDocument()
  })

  it('rejects a file that is not a PNG, JPG or WebP before uploading', async () => {
    clinicApi.getClinicSettings.mockResolvedValue(clinicFixture())
    const user = userEvent.setup({ applyAccept: false })
    renderWithProviders(<Settings />)

    const svg = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })
    await user.upload(await screen.findByLabelText('Clinic logo file'), svg)

    expect(await screen.findByRole('alert')).toHaveTextContent('Only PNG, JPG, and WebP images are allowed.')
    expect(clinicApi.uploadClinicLogo).not.toHaveBeenCalled()
  })

  it('rejects an image over 2MB before uploading', async () => {
    clinicApi.getClinicSettings.mockResolvedValue(clinicFixture())
    const user = userEvent.setup()
    renderWithProviders(<Settings />)

    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' })
    await user.upload(await screen.findByLabelText('Clinic logo file'), big)

    expect(await screen.findByRole('alert')).toHaveTextContent(/over 2MB/)
    expect(clinicApi.uploadClinicLogo).not.toHaveBeenCalled()
  })

  it('removes the logo', async () => {
    clinicApi.getClinicSettings.mockResolvedValue(clinicFixture({ logoUrl: 'https://cdn.test/logo.png' }))
    clinicApi.removeClinicLogo.mockResolvedValue(clinicFixture())
    const user = userEvent.setup()
    renderWithProviders(<Settings />)

    await user.click(await screen.findByRole('button', { name: /remove/i }))

    expect(clinicApi.removeClinicLogo).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByAltText('Sharma Clinic logo')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /upload logo/i })).toBeInTheDocument()
  })

  it('keeps unsaved edits in the form when a logo is uploaded', async () => {
    clinicApi.getClinicSettings.mockResolvedValue(clinicFixture())
    clinicApi.uploadClinicLogo.mockResolvedValue(clinicFixture({ logoUrl: 'https://cdn.test/logo.png' }))
    const user = userEvent.setup()
    renderWithProviders(<Settings />)

    const name = await screen.findByLabelText('Clinic name')
    await waitFor(() => expect(name).toHaveValue('Sharma Clinic'))
    await user.clear(name)
    await user.type(name, 'Sharma Family Clinic')

    await user.upload(screen.getByLabelText('Clinic logo file'), pngFile())
    await screen.findByRole('button', { name: /change logo/i })

    expect(screen.getByLabelText('Clinic name')).toHaveValue('Sharma Family Clinic')
  })
})
