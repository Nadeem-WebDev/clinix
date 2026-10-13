import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import PrescriptionNew from './PrescriptionNew.jsx'
import * as consultationsApi from '../api/consultations.js'
import { renderWithProviders } from '../test/test-utils.jsx'

vi.mock('../api/consultations.js')
vi.mock('../api/prescriptions.js')

function renderAt(route) {
  renderWithProviders(
    <Routes>
      <Route path="/prescriptions/new" element={<PrescriptionNew />} />
    </Routes>,
    { route },
  )
}

describe('New prescription', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    consultationsApi.getConsultation.mockResolvedValue({
      _id: 'c1',
      patientId: { _id: 'p1', fullName: 'Nisha Patel' },
      doctorId: { _id: 'd1', name: 'Kavita Nair' },
      diagnosis: 'Viral fever',
    })
  })

  it('right after a consultation is saved, says so and offers to skip to the patient', async () => {
    renderAt('/prescriptions/new?consultationId=c1&afterConsultation=1')
    expect(await screen.findByText('Consultation saved. Add the prescription next.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Skip, no prescription' })).toHaveAttribute('href', '/patients/p1')
  })

  it('opened from a consultation page, shows no skip banner', async () => {
    renderAt('/prescriptions/new?consultationId=c1')
    expect(await screen.findByRole('heading', { name: 'New Prescription' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Skip, no prescription' })).not.toBeInTheDocument()
  })
})
