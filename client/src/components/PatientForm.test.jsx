import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@testing-library/react'
import PatientForm from './PatientForm.jsx'

describe('PatientForm (patient creation)', () => {
  it('requires either a date of birth or an age', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<PatientForm onSubmit={onSubmit} submitLabel="Register Patient" />)

    await user.type(screen.getByLabelText(/full name/i), 'Rahul Sharma')
    await user.type(screen.getByLabelText(/^phone$/i), '9876543210')
    await user.click(screen.getByRole('button', { name: /register patient/i }))

    expect(await screen.findByText(/date of birth or an age/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits with the values the receptionist entered', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<PatientForm onSubmit={onSubmit} submitLabel="Register Patient" />)

    await user.type(screen.getByLabelText(/full name/i), 'Rahul Sharma')
    await user.type(screen.getByLabelText(/^phone$/i), '9876543210')
    await user.type(screen.getByLabelText(/age/i), '34')
    await user.selectOptions(screen.getByLabelText(/gender/i), 'male')
    await user.type(screen.getByLabelText(/allergies/i), 'Penicillin, Peanuts')
    await user.click(screen.getByRole('button', { name: /register patient/i }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const submitted = onSubmit.mock.calls[0][0]
    expect(submitted).toMatchObject({
      fullName: 'Rahul Sharma',
      phone: '9876543210',
      age: '34',
      gender: 'male',
      allergies: 'Penicillin, Peanuts',
    })
  })

  it('shows a server error and does not clear the form on failure', async () => {
    const onSubmit = vi.fn()
    render(<PatientForm onSubmit={onSubmit} submitLabel="Register Patient" serverError="Something went wrong." />)

    expect(screen.getByText('Something went wrong.')).toBeInTheDocument()
  })
})
