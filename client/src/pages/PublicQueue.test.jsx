import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import App from '../App.jsx'
import PublicQueue from './PublicQueue.jsx'
import * as publicQueueApi from '../api/publicQueue.js'
import { renderWithProviders } from '../test/test-utils.jsx'

vi.mock('../api/publicQueue.js')

const QUEUE = {
  clinicName: 'Sharma Clinic',
  date: '2026-09-22',
  nowServing: [{ doctorName: 'Anita Rao', tokenNumber: 14 }],
  waitingCount: 3,
  upcoming: [
    { tokenNumber: 15, patientName: 'Priya S.' },
    { tokenNumber: 16, patientName: 'Rahul V.' },
  ],
  estimatedWaitMinutes: 45,
  isEstimate: true,
}

function renderPublicQueue(slug = 'sharma-clinic') {
  return renderWithProviders(
    <Routes>
      <Route path="/q/:slug" element={<PublicQueue />} />
    </Routes>,
    { route: `/q/${slug}` },
  )
}

describe('Public queue page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the clinic name, who is being served, and the wait estimate', async () => {
    publicQueueApi.getPublicQueue.mockResolvedValue(QUEUE)
    renderPublicQueue()

    expect(await screen.findByRole('heading', { name: 'Sharma Clinic' })).toBeInTheDocument()
    expect(screen.getByText('14')).toBeInTheDocument()
    expect(screen.getByText('Dr. Anita Rao')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('45')).toBeInTheDocument()
    // The estimate must always read as an estimate, never as a promise.
    expect(screen.getByText(/rough estimate/i)).toBeInTheDocument()

    expect(publicQueueApi.getPublicQueue).toHaveBeenCalledWith('sharma-clinic')
  })

  it('lists upcoming tokens with masked names only', async () => {
    publicQueueApi.getPublicQueue.mockResolvedValue(QUEUE)
    renderPublicQueue()

    expect(await screen.findByText('Priya S.')).toBeInTheDocument()
    expect(screen.getByText('Rahul V.')).toBeInTheDocument()
    expect(screen.queryByText(/Sharma$/)).not.toBeInTheDocument()
  })

  it('renders without any authenticated app chrome', async () => {
    publicQueueApi.getPublicQueue.mockResolvedValue(QUEUE)
    renderPublicQueue()

    await screen.findByRole('heading', { name: 'Sharma Clinic' })

    // The app shell's landmarks and links must not be present: this page is
    // reachable with no session, and rendering the sidebar here would both
    // leak the module list and offer links that 401.
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /patients/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sign out|log ?out/i })).not.toBeInTheDocument()
  })

  it('explains a bad link instead of showing a raw error', async () => {
    publicQueueApi.getPublicQueue.mockRejectedValue({ response: { status: 404 } })
    renderPublicQueue('nope')

    expect(await screen.findByRole('heading', { name: /queue not found/i })).toBeInTheDocument()
    expect(screen.getByText(/ask at the front desk/i)).toBeInTheDocument()
  })

  it('handles a server error separately from a bad link', async () => {
    publicQueueApi.getPublicQueue.mockRejectedValue({ response: { status: 500 } })
    renderPublicQueue()

    expect(await screen.findByRole('heading', { name: /can't load the queue/i })).toBeInTheDocument()
  })

  it('is routed outside the protected app shell', async () => {
    publicQueueApi.getPublicQueue.mockResolvedValue(QUEUE)
    // Rendering the whole App at /q/:slug: if the route were nested inside
    // ProtectedRoute, an unauthenticated render would redirect to /login
    // instead of showing the queue.
    renderWithProviders(<App />, { route: '/q/sharma-clinic' })

    expect(await screen.findByRole('heading', { name: 'Sharma Clinic' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()
  })
})
