import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
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
import EmptyState from '../components/EmptyState.jsx'
import { downloadCsv } from '../utils/csv.js'

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

function money(n) {
  return `₹${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}
function daysAgoIso(days) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - (days - 1))
  return d.toISOString().slice(0, 10)
}

const TABS = [
  { key: 'patients', label: 'Patients' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'revenue', label: 'Revenue' },
]

function ChartTooltip({ palette }) {
  return { contentStyle: { background: palette.tooltipBg, color: palette.tooltipText, border: 'none', borderRadius: 8, fontSize: 13 } }
}

function PatientsReport({ range, palette }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reports', 'patients', range],
    queryFn: () => getPatientReport(range),
  })

  if (isLoading) return <LoadingState label="Loading report…" />
  if (isError) return <ErrorState onRetry={refetch} />

  const chartData = data.newPatientsByDate.map((d) => ({ date: d.date.slice(5), count: d.count }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Total patients" value={data.totalPatients} />
        <StatCard label="New patients" value={data.newPatients} />
        <StatCard label="Returning patients" value={data.returningPatients} />
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">New patients by day</h3>
        <Button
          variant="ghost"
          onClick={() => downloadCsv('patients-by-day.csv', data.newPatientsByDate)}
        >
          <Download size={14} aria-hidden="true" />
          Export CSV
        </Button>
      </div>

      {chartData.length === 0 ? (
        <EmptyState title="No new patients in this range" />
      ) : (
        <div className="h-64 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid stroke={palette.grid} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: palette.axisText, fontSize: 12 }} axisLine={{ stroke: palette.grid }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: palette.axisText, fontSize: 12 }} axisLine={{ stroke: palette.grid }} tickLine={false} width={30} />
              <Tooltip {...ChartTooltip({ palette })} />
              <Line type="monotone" dataKey="count" stroke={palette.sequential} strokeWidth={2} dot={{ r: 4, fill: palette.sequential }} name="New patients" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
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
  const byDoctor = data.byDoctor.map((d) => ({ name: `Dr. ${d.doctorName}`, count: d.count }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total appointments" value={data.total} />
        <StatCard label="Completed" value={data.completed} />
        <StatCard label="Cancelled" value={data.cancelled} />
        <StatCard label="No-show" value={data.noShow} />
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">By status</h3>
        <Button variant="ghost" onClick={() => downloadCsv('appointments-by-status.csv', statusData.map(({ name, value }) => ({ status: name, count: value })))}>
          <Download size={14} aria-hidden="true" />
          Export CSV
        </Button>
      </div>
      <div className="h-56 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={statusData}>
            <CartesianGrid stroke={palette.grid} vertical={false} />
            <XAxis dataKey="name" tick={{ fill: palette.axisText, fontSize: 12 }} axisLine={{ stroke: palette.grid }} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: palette.axisText, fontSize: 12 }} axisLine={{ stroke: palette.grid }} tickLine={false} width={30} />
            <Tooltip {...ChartTooltip({ palette })} />
            <Bar dataKey="value" maxBarSize={48} radius={[4, 4, 0, 0]}>
              {statusData.map((entry) => (
                <Cell key={entry.key} fill={palette.status[entry.key]} />
              ))}
              <LabelList dataKey="value" position="top" fill={palette.tooltipText} fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">By doctor</h3>
      {byDoctor.length === 0 ? (
        <EmptyState title="No appointments in this range" />
      ) : (
        <div className="h-56 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byDoctor}>
              <CartesianGrid stroke={palette.grid} vertical={false} />
              <XAxis dataKey="name" tick={{ fill: palette.axisText, fontSize: 12 }} axisLine={{ stroke: palette.grid }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: palette.axisText, fontSize: 12 }} axisLine={{ stroke: palette.grid }} tickLine={false} width={30} />
              <Tooltip {...ChartTooltip({ palette })} />
              <Bar dataKey="count" fill={palette.sequential} maxBarSize={40} radius={[4, 4, 0, 0]}>
                <LabelList dataKey="count" position="top" fill={palette.tooltipText} fontSize={12} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
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

  const byDoctor = data.byDoctor.map((d) => ({ name: `Dr. ${d.doctorName}`, total: d.total }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <StatCard label="Total revenue" value={money(data.total)} />
        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value)}
          className="h-fit rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="day">Daily</option>
          <option value="week">Weekly</option>
          <option value="month">Monthly</option>
        </select>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Revenue over time</h3>
        <Button variant="ghost" onClick={() => downloadCsv('revenue-series.csv', data.series)}>
          <Download size={14} aria-hidden="true" />
          Export CSV
        </Button>
      </div>
      {data.series.length === 0 ? (
        <EmptyState title="No revenue in this range" />
      ) : (
        <div className="h-64 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.series}>
              <CartesianGrid stroke={palette.grid} vertical={false} />
              <XAxis dataKey="period" tick={{ fill: palette.axisText, fontSize: 12 }} axisLine={{ stroke: palette.grid }} tickLine={false} />
              <YAxis tick={{ fill: palette.axisText, fontSize: 12 }} axisLine={{ stroke: palette.grid }} tickLine={false} width={50} />
              <Tooltip {...ChartTooltip({ palette })} formatter={(v) => money(v)} />
              <Line type="monotone" dataKey="total" stroke={palette.sequential} strokeWidth={2} dot={{ r: 4, fill: palette.sequential }} name="Revenue" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">By payment method</h3>
      {data.byMethod.length === 0 ? (
        <EmptyState title="No payments in this range" />
      ) : (
        <div className="h-56 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.byMethod}>
              <CartesianGrid stroke={palette.grid} vertical={false} />
              <XAxis dataKey="method" tick={{ fill: palette.axisText, fontSize: 12 }} axisLine={{ stroke: palette.grid }} tickLine={false} />
              <YAxis tick={{ fill: palette.axisText, fontSize: 12 }} axisLine={{ stroke: palette.grid }} tickLine={false} width={50} />
              <Tooltip {...ChartTooltip({ palette })} formatter={(v) => money(v)} />
              <Bar dataKey="total" maxBarSize={40} radius={[4, 4, 0, 0]}>
                {data.byMethod.map((entry, i) => (
                  <Cell key={entry.method} fill={palette.categorical[i % palette.categorical.length]} />
                ))}
                <LabelList dataKey="total" position="top" formatter={money} fill={palette.tooltipText} fontSize={12} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">By doctor</h3>
      {byDoctor.length === 0 ? (
        <EmptyState title="No doctor-linked revenue in this range" />
      ) : (
        <div className="h-56 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byDoctor}>
              <CartesianGrid stroke={palette.grid} vertical={false} />
              <XAxis dataKey="name" tick={{ fill: palette.axisText, fontSize: 12 }} axisLine={{ stroke: palette.grid }} tickLine={false} />
              <YAxis tick={{ fill: palette.axisText, fontSize: 12 }} axisLine={{ stroke: palette.grid }} tickLine={false} width={50} />
              <Tooltip {...ChartTooltip({ palette })} formatter={(v) => money(v)} />
              <Bar dataKey="total" fill={palette.sequential} maxBarSize={40} radius={[4, 4, 0, 0]}>
                <LabelList dataKey="total" position="top" formatter={money} fill={palette.tooltipText} fontSize={12} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

export default function Reports() {
  const [tab, setTab] = useState('patients')
  const [range, setRange] = useState({ from: daysAgoIso(30), to: todayIso() })
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
