import { useId, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { Download } from 'lucide-react'
import { getPatientReport, getAppointmentReport, getRevenueReport } from '../api/reports.js'
import { useTheme } from '../context/ThemeContext.jsx'
import DateRangeFilter from '../components/DateRangeFilter.jsx'
import Tabs from '../components/Tabs.jsx'
import StatCard from '../components/StatCard.jsx'
import Button from '../components/Button.jsx'
import LoadingState from '../components/LoadingState.jsx'
import ErrorState from '../components/ErrorState.jsx'
import { downloadSpreadsheet, DATE_FORMAT, MONTH_FORMAT, MONEY_FORMAT, PERCENT_FORMAT } from '../utils/spreadsheet.js'
import { localDateStr, localDaysAgo } from '../utils/date.js'
import { fillSeries, daysInRange, compactNumber } from '../utils/reportSeries.js'

// Validated palette (see the dataviz skill: references/palette.md) - fixed
// hue order for categorical identity, one hue for magnitude/sequential,
// and the reserved status colors for state (never reused for a plain
// series). Light/dark variants are the same steps re-tuned for each
// surface, not a separate palette.
function usePalette() {
  const { effectiveTheme } = useTheme()
  const dark = effectiveTheme === 'dark'
  return {
    sequential: dark ? '#3987e5' : '#2a78d6',
    categorical: dark
      ? ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181']
      : ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'],
    status: {
      COMPLETED: '#0ca30c',
      CANCELLED: '#ec835a',
      NO_SHOW: '#d03b3b',
    },
    grid: dark ? '#2c2c2a' : '#e1e0d9',
    axisText: '#898781', // muted - same in both modes
    tooltipBg: dark ? '#1a1a19' : '#fcfcfb',
    tooltipText: dark ? '#ffffff' : '#0b0b0b',
  }
}

// Revenue nets out refunds, so a day (or method) can be negative; the sign
// goes before the rupee symbol ("−₹500", not "₹-500").
function money(n) {
  const v = Number(n) || 0
  return `${v < 0 ? '−' : ''}₹${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

const PERIOD_HEADERS = { day: 'Date', week: 'Week starting', month: 'Month' }

const METHOD_LABELS = { CASH: 'Cash', UPI: 'UPI', CARD: 'Card', ONLINE: 'Online', OTHER: 'Other' }

const TABS = [
  { key: 'patients', label: 'Patients' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'revenue', label: 'Revenue' },
]

// One card per chart: title + optional one-line summary, actions (export,
// grouping) in the header so they sit with the chart they act on.
function ChartCard({ title, subtitle, actions, children }) {
  return (
    <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

function ExportButton({ onClick }) {
  return (
    <Button variant="ghost" onClick={onClick}>
      <Download size={14} aria-hidden="true" />
      Export Excel
    </Button>
  )
}

function NoData({ children }) {
  return <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">{children}</p>
}

// Ranked horizontal bars in plain HTML rather than an SVG chart: a name of
// any length wraps instead of being clipped by the axis, and the value sits
// in its own column, so nothing overlaps at 320px. Bar length is relative
// to the largest row; the percentage is the row's share of shareOf.
function BarList({ rows, format = (v) => v.toLocaleString(), shareOf }) {
  const max = Math.max(...rows.map((r) => r.value), 0)
  const total = shareOf ?? rows.reduce((sum, r) => sum + r.value, 0)
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 break-words text-gray-700 dark:text-gray-300">{r.label}</span>
            <span className="shrink-0 tabular-nums font-medium text-gray-900 dark:text-gray-100">
              {format(r.value)}
              <span className="ml-1.5 text-xs font-normal text-gray-500 dark:text-gray-400">
                {total ? Math.round((r.value / total) * 100) : 0}%
              </span>
            </span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-gray-100 dark:bg-gray-800" aria-hidden="true">
            <div
              className="h-2 rounded-full"
              style={{
                // A negative row (refunds outweighing payments) gets no bar - a
                // negative CSS width is invalid and would draw full-width.
                width: `${max && r.value > 0 ? (r.value / max) * 100 : 0}%`,
                minWidth: r.value > 0 ? 4 : 0,
                background: r.color,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

// Daily/weekly/monthly series. Ticks are thinned (minTickGap) so they never
// overlap, and the right margin leaves room for the last tick's label.
function TimeSeriesChart({ data, palette, kind, name, format, compactFormat }) {
  const gradientId = useId()
  const axis = { tick: { fill: palette.axisText, fontSize: 12 }, axisLine: { stroke: palette.grid }, tickLine: false }
  const xAxis = <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={20} tickMargin={6} />
  const yAxis = <YAxis {...axis} allowDecimals={false} tickFormatter={compactFormat} width={48} />
  const tooltip = (
    <Tooltip
      contentStyle={{ background: palette.tooltipBg, color: palette.tooltipText, border: 'none', borderRadius: 8, fontSize: 13 }}
      cursor={kind === 'bar' ? { fill: palette.grid, opacity: 0.5 } : { stroke: palette.grid }}
      labelFormatter={(_, payload) => payload?.[0]?.payload.fullLabel}
      formatter={(v) => [format(v), name]}
    />
  )
  const margin = { top: 8, right: 16, bottom: 0, left: 0 }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        {kind === 'bar' ? (
          <BarChart data={data} margin={margin}>
            <CartesianGrid stroke={palette.grid} vertical={false} />
            {xAxis}
            {yAxis}
            {tooltip}
            <Bar dataKey="value" name={name} fill={palette.sequential} maxBarSize={32} radius={[3, 3, 0, 0]} />
          </BarChart>
        ) : (
          <AreaChart data={data} margin={margin}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={palette.sequential} stopOpacity={0.3} />
                <stop offset="100%" stopColor={palette.sequential} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={palette.grid} vertical={false} />
            {xAxis}
            {yAxis}
            {tooltip}
            <Area
              type="monotone"
              dataKey="value"
              name={name}
              stroke={palette.sequential}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={data.length <= 16 ? { r: 3, fill: palette.sequential } : false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

const count = (v) => (Number(v) || 0).toLocaleString()
const moneyTick = (v) => `${v < 0 ? '−' : ''}₹${compactNumber(Math.abs(v))}`

function PatientsReport({ range, palette }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reports', 'patients', range],
    queryFn: () => getPatientReport(range),
  })

  if (isLoading) return <LoadingState label="Loading report…" />
  if (isError) return <ErrorState onRetry={refetch} />

  const series = fillSeries(data.newPatientsByDate, { ...data.range, keyField: 'date', valueField: 'count' })

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Total patients" value={data.totalPatients} />
        <StatCard label="New patients" value={data.newPatients} />
        <div className="col-span-2 sm:col-span-1">
          <StatCard label="Returning patients" value={data.returningPatients} />
        </div>
      </div>

      <ChartCard
        title="New patients by day"
        actions={
          <ExportButton
            onClick={() =>
              downloadSpreadsheet(
                'new-patients-by-day.xlsx',
                [
                  { header: 'Date', value: (p) => p.start, type: Date, format: DATE_FORMAT, width: 14 },
                  { header: 'New patients', value: (p) => p.value, type: Number, width: 14 },
                ],
                series,
              )
            }
          />
        }
      >
        {data.newPatients === 0 ? (
          <NoData>No new patients in this range</NoData>
        ) : (
          <TimeSeriesChart data={series} palette={palette} kind="bar" name="New patients" format={count} compactFormat={compactNumber} />
        )}
      </ChartCard>
    </div>
  )
}

function AppointmentsReport({ range, palette }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reports', 'appointments', range],
    queryFn: () => getAppointmentReport(range),
  })

  if (isLoading) return <LoadingState label="Loading report…" />
  if (isError) return <ErrorState onRetry={refetch} />

  const statusData = [
    { name: 'Completed', value: data.completed, key: 'COMPLETED' },
    { name: 'Cancelled', value: data.cancelled, key: 'CANCELLED' },
    { name: 'No-show', value: data.noShow, key: 'NO_SHOW' },
  ]
  const byDoctor = data.byDoctor.map((d) => ({
    key: String(d.doctorId),
    label: `Dr. ${d.doctorName}`,
    value: d.count,
    color: palette.sequential,
  }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total appointments" value={data.total} />
        <StatCard label="Completed" value={data.completed} />
        <StatCard label="Cancelled" value={data.cancelled} />
        <StatCard label="No-show" value={data.noShow} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="By status"
          subtitle="Share of all appointments in this range"
          actions={
            <ExportButton
              onClick={() =>
                downloadSpreadsheet(
                  'appointments-by-status.xlsx',
                  [
                    { header: 'Status', value: (s) => s.name, type: String, width: 14 },
                    { header: 'Appointments', value: (s) => s.value, type: Number, width: 14 },
                    {
                      header: 'Share of all',
                      value: (s) => (data.total ? s.value / data.total : 0),
                      type: Number,
                      format: PERCENT_FORMAT,
                      width: 14,
                    },
                  ],
                  statusData,
                )
              }
            />
          }
        >
          {data.total === 0 ? (
            <NoData>No appointments in this range</NoData>
          ) : (
            <BarList
              rows={statusData.map((s) => ({ key: s.key, label: s.name, value: s.value, color: palette.status[s.key] }))}
              shareOf={data.total}
            />
          )}
        </ChartCard>

        <ChartCard title="By doctor">
          {byDoctor.length === 0 ? <NoData>No appointments in this range</NoData> : <BarList rows={byDoctor} />}
        </ChartCard>
      </div>
    </div>
  )
}

function RevenueReport({ range, palette }) {
  const [groupBy, setGroupBy] = useState('day')
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reports', 'revenue', range, groupBy],
    queryFn: () => getRevenueReport({ ...range, groupBy }),
  })

  if (isLoading) return <LoadingState label="Loading report…" />
  if (isError) return <ErrorState onRetry={refetch} />

  const series = fillSeries(data.series, { ...data.range, groupBy: data.groupBy, keyField: 'period', valueField: 'total' })
  const byMethod = data.byMethod.map((m, i) => ({
    key: m.method,
    label: METHOD_LABELS[m.method] ?? m.method,
    value: m.total,
    color: palette.categorical[i % palette.categorical.length],
  }))
  const byDoctor = data.byDoctor.map((d) => ({
    key: String(d.doctorId),
    label: `Dr. ${d.doctorName}`,
    value: d.total,
    color: palette.sequential,
  }))

  return (
    <div className="space-y-6">
      {/* One per row on a phone: a full rupee amount (₹18,42,064) is too
          wide for a half-width card at 320px. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total revenue" value={money(data.total)} />
        <StatCard label="Daily average" value={money(data.total / daysInRange(data.range.from, data.range.to))} />
      </div>

      <ChartCard
        title="Revenue over time"
        actions={
          <>
            <select
              aria-label="Group revenue by"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="day">Daily</option>
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
            </select>
            <ExportButton
              onClick={() =>
                downloadSpreadsheet(
                  `revenue-by-${data.groupBy}.xlsx`,
                  [
                    {
                      header: PERIOD_HEADERS[data.groupBy] ?? 'Date',
                      value: (p) => p.start,
                      type: Date,
                      format: data.groupBy === 'month' ? MONTH_FORMAT : DATE_FORMAT,
                      width: 16,
                    },
                    { header: 'Revenue', value: (p) => p.value, type: Number, format: MONEY_FORMAT, width: 16 },
                  ],
                  series,
                )
              }
            />
          </>
        }
      >
        {data.total === 0 ? (
          <NoData>No revenue in this range</NoData>
        ) : (
          <TimeSeriesChart data={series} palette={palette} kind="area" name="Revenue" format={money} compactFormat={moneyTick} />
        )}
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="By payment method">
          {byMethod.length === 0 ? <NoData>No payments in this range</NoData> : <BarList rows={byMethod} format={money} />}
        </ChartCard>
        <ChartCard title="By doctor" subtitle="Payments on invoices linked to a doctor">
          {byDoctor.length === 0 ? (
            <NoData>No doctor-linked revenue in this range</NoData>
          ) : (
            <BarList rows={byDoctor} format={money} />
          )}
        </ChartCard>
      </div>
    </div>
  )
}

export default function Reports() {
  const [tab, setTab] = useState('patients')
  const [range, setRange] = useState({ from: localDaysAgo(30), to: localDateStr() })
  const palette = usePalette()
  const stableRange = useMemo(() => range, [range])

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100">Reports</h1>
      <div className="mb-4">
        <DateRangeFilter from={range.from} to={range.to} onChange={setRange} />
      </div>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      <div className="pt-4">
        {tab === 'patients' && <PatientsReport range={stableRange} palette={palette} />}
        {tab === 'appointments' && <AppointmentsReport range={stableRange} palette={palette} />}
        {tab === 'revenue' && <RevenueReport range={stableRange} palette={palette} />}
      </div>
    </div>
  )
}
