import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Reports from './Reports.jsx'
import * as reportsApi from '../api/reports.js'
import { renderWithProviders } from '../test/test-utils.jsx'

vi.mock('../api/reports.js')

const toFile = vi.fn().mockResolvedValue(undefined)
const writeXlsxFile = vi.fn(() => ({ toFile }))
vi.mock('write-excel-file/browser', () => ({ default: (...args) => writeXlsxFile(...args) }))

// jsdom has no ResizeObserver; recharts' ResponsiveContainer needs one.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

const range = { from: '2026-09-13', to: '2026-10-12' }

function card(title) {
  return screen.getByRole('heading', { name: title }).closest('section')
}

describe('Reports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    reportsApi.getPatientReport.mockResolvedValue({
      range,
      totalPatients: 43,
      newPatients: 0,
      returningPatients: 0,
      newPatientsByDate: [],
    })
    reportsApi.getAppointmentReport.mockResolvedValue({
      range,
      total: 200,
      completed: 150,
      cancelled: 30,
      noShow: 20,
      byDoctor: [
        { doctorId: 'd1', doctorName: 'Venkataraghavan Subramaniam', count: 120 },
        { doctorId: 'd2', doctorName: 'Ananya Sen', count: 80 },
      ],
    })
    reportsApi.getRevenueReport.mockResolvedValue({
      range,
      groupBy: 'day',
      total: 300000,
      series: [{ period: '2026-10-01', total: 300000 }],
      byMethod: [
        { method: 'UPI', total: 200000 },
        { method: 'CASH', total: 100000 },
      ],
      byDoctor: [{ doctorId: 'd1', doctorName: 'Venkataraghavan Subramaniam', total: 300000 }],
    })
  })

  it('lists appointments by status with their share of the total', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Reports />)
    await user.click(await screen.findByRole('tab', { name: 'Appointments' }))

    const status = within(await screen.findByRole('heading', { name: 'By status' }).then((h) => h.closest('section')))
    expect(status.getByText('Completed').closest('li')).toHaveTextContent('15075%')
    expect(status.getByText('No-show').closest('li')).toHaveTextContent('2010%')
  })

  it('shows long doctor names in full', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Reports />)
    await user.click(await screen.findByRole('tab', { name: 'Appointments' }))
    await screen.findByRole('heading', { name: 'By doctor' })

    const doctors = within(card('By doctor'))
    expect(doctors.getByText('Dr. Venkataraghavan Subramaniam').closest('li')).toHaveTextContent('12060%')
    expect(doctors.getByText('Dr. Ananya Sen')).toBeInTheDocument()
  })

  it('shows revenue by payment method with readable names, and a daily average', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Reports />)
    await user.click(await screen.findByRole('tab', { name: 'Revenue' }))
    await screen.findByRole('heading', { name: 'By payment method' })

    const methods = within(card('By payment method'))
    expect(methods.getByText('UPI').closest('li')).toHaveTextContent(/67%/)
    expect(methods.getByText('Cash')).toBeInTheDocument()
    // ₹3,00,000 over 30 days.
    expect(screen.getByText('Daily average').parentElement.parentElement).toHaveTextContent(/₹10,000/)
  })

  it('shows a method that refunds took below zero as a minus amount with no bar', async () => {
    reportsApi.getRevenueReport.mockResolvedValue({
      range,
      groupBy: 'day',
      total: 1500,
      series: [{ period: '2026-10-01', total: 1500 }],
      byMethod: [
        { method: 'UPI', total: 2000 },
        { method: 'CASH', total: -500 },
      ],
      byDoctor: [],
    })
    const user = userEvent.setup()
    renderWithProviders(<Reports />)
    await user.click(await screen.findByRole('tab', { name: 'Revenue' }))
    await screen.findByRole('heading', { name: 'By payment method' })

    const cash = within(card('By payment method')).getByText('Cash').closest('li')
    expect(cash).toHaveTextContent('−₹500')
    expect(cash.querySelector('[aria-hidden="true"] > div').style.width).toBe('0%')
  })

  it('asks the server for weekly revenue from the chart\'s own grouping control', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Reports />)
    await user.click(await screen.findByRole('tab', { name: 'Revenue' }))

    await user.selectOptions(await screen.findByLabelText('Group revenue by'), 'week')

    expect(reportsApi.getRevenueReport).toHaveBeenLastCalledWith(expect.objectContaining({ groupBy: 'week' }))
  })

  it('says so when there were no new patients', async () => {
    renderWithProviders(<Reports />)
    expect(await screen.findByText('No new patients in this range')).toBeInTheDocument()
  })

  it('exports revenue as an Excel file with real dates, amounts and column widths', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Reports />)
    await user.click(await screen.findByRole('tab', { name: 'Revenue' }))
    await user.click(await screen.findByRole('button', { name: /export excel/i }))

    await waitFor(() => expect(toFile).toHaveBeenCalledWith('revenue-by-day.xlsx'))
    const [rows, options] = writeXlsxFile.mock.calls[0]
    expect(rows[0].map((c) => c.value)).toEqual(['Date', 'Revenue'])
    // Every day of the range, not just the days that had payments.
    expect(rows).toHaveLength(1 + 30)
    const oct1 = rows.slice(1).find((r) => r[0].value.toISOString().startsWith('2026-10-01'))
    expect(oct1[0]).toMatchObject({ type: Date, format: 'dd mmm yyyy' })
    expect(oct1[1]).toMatchObject({ value: 300000, type: Number })
    expect(options.columns.every((c) => c.width >= 14)).toBe(true)
  })

  it('exports appointments by status with each share as a percentage', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Reports />)
    await user.click(await screen.findByRole('tab', { name: 'Appointments' }))
    await user.click(await screen.findByRole('button', { name: /export excel/i }))

    await waitFor(() => expect(toFile).toHaveBeenCalledWith('appointments-by-status.xlsx'))
    const [rows] = writeXlsxFile.mock.calls[0]
    expect(rows.map((r) => r.map((c) => c.value))).toEqual([
      ['Status', 'Appointments', 'Share of all'],
      ['Completed', 150, 0.75],
      ['Cancelled', 30, 0.15],
      ['No-show', 20, 0.1],
    ])
  })
})
