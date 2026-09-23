import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConsultationForm from './ConsultationForm.jsx'

describe('Consultation workflow', () => {
  it('submits the vitals, notes, and follow-up the doctor entered', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<ConsultationForm defaultValues={{}} onSubmit={onSubmit} submitLabel="Save Consultation" />)

    await user.type(screen.getByLabelText(/chief complaint/i), 'Fever and cough for 3 days')
    await user.type(screen.getByLabelText(/temperature/i), '99.5')
    await user.type(screen.getByLabelText(/diagnosis/i), 'Viral fever')
    await user.type(screen.getByLabelText(/treatment plan/i), 'Rest, fluids, paracetamol')
    await user.click(screen.getByRole('button', { name: /save consultation/i }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const submitted = onSubmit.mock.calls[0][0]
    expect(submitted).toMatchObject({
      chiefComplaint: 'Fever and cough for 3 days',
      temperature: '99.5',
      diagnosis: 'Viral fever',
      treatmentPlan: 'Rest, fluids, paracetamol',
    })
  })

  it('locks every field and hides the submit button once the consultation is finalized', () => {
    render(
      <ConsultationForm
        defaultValues={{ chiefComplaint: 'Follow-up visit', diagnosis: 'Resolved' }}
        onSubmit={vi.fn()}
        submitLabel="Save Consultation"
        readOnly
      />,
    )

    expect(
      screen.getByText(/finalized.*can no longer be edited/i),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/chief complaint/i)).toBeDisabled()
    expect(screen.getByLabelText(/diagnosis/i)).toBeDisabled()
    expect(screen.queryByRole('button', { name: /save consultation/i })).not.toBeInTheDocument()
  })
})
