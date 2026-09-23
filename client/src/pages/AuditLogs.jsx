import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listAuditLogs } from '../api/auditLogs.js'
import DateRangeFilter from '../components/DateRangeFilter.jsx'
import Pagination from '../components/Pagination.jsx'
import LoadingState from '../components/LoadingState.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ErrorState from '../components/ErrorState.jsx'

// Every action string the app currently writes to the audit log, across
// all modules - kept here as the filter's option list. Add to this
// whenever a new action is introduced elsewhere.
const ACTIONS = [
  'CLINIC_REGISTERED',
  'LOGIN',
  'LOGOUT',
  'USER_CREATED',
  'USER_ENABLED',
  'USER_DISABLED',
  'PATIENT_CREATED',
  'PATIENT_UPDATED',
  'APPOINTMENT_CREATED',
  'APPOINTMENT_RESCHEDULED',
  'APPOINTMENT_ARRIVED',
  'APPOINTMENT_CANCELLED',
  'APPOINTMENT_NO_SHOW',
  'APPOINTMENT_CALLED',
  'APPOINTMENT_COMPLETED',
  'APPOINTMENT_SKIPPED',
  'CONSULTATION_CREATED',
  'CONSULTATION_UPDATED',
  'PRESCRIPTION_CREATED',
  'PRESCRIPTION_UPDATED',
  'PRESCRIPTION_FINALIZED',
  'PRESCRIPTION_PDF_VIEWED',
  'INVOICE_CREATED',
  'INVOICE_UPDATED',
  'PAYMENT_RECORDED',
  'INVOICE_REFUNDED',
  'RECEIPT_PDF_VIEWED',
  'DOCUMENT_UPLOADED',
  'DOCUMENT_VIEWED',
  'DOCUMENT_DELETED',
]

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}
function daysAgoIso(days) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - (days - 1))
  return d.toISOString().slice(0, 10)
}

export default function AuditLogs() {
  const [range, setRange] = useState({ from: daysAgoIso(30), to: todayIso() })
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['auditLogs', { ...range, action, page }],
    queryFn: () => listAuditLogs({ ...range, action: action || undefined, page, limit: 50 }),
    placeholderData: (prev) => prev,
  })

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100">Audit Logs</h1>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <DateRangeFilter
          from={range.from}
          to={range.to}
          onChange={(r) => {
            setRange(r)
            setPage(1)
          }}
        />
        <select
          value={action}
          onChange={(e) => {
            setAction(e.target.value)
            setPage(1)
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="">Any action</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <LoadingState label="Loading audit logs…" />}
      {isError && <ErrorState onRetry={refetch} />}

      {!isLoading && !isError && data.logs.length === 0 && (
        <EmptyState title="No activity in this range" />
      )}

      {!isLoading && !isError && data.logs.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <tr>
                <th className="px-4 py-2 font-medium">Time</th>
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Resource</th>
                <th className="px-4 py-2 font-medium">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.logs.map((log) => (
                <tr key={log._id}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-gray-500 dark:text-gray-400">
                    {new Date(log.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' })}
                  </td>
                  <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100">
                    {log.userId?.name ?? '—'}
                    {log.userId?.role && (
                      <span className="ml-1 text-xs text-gray-400">({log.userId.role})</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <code className="text-xs text-gray-700 dark:text-gray-300">{log.action}</code>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">
                    {log.resourceType}
                    {log.resourceId && (
                      <span className="ml-1 font-mono text-xs">{String(log.resourceId).slice(-6)}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-400 dark:text-gray-500">{log.ipAddress ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={data.pagination.page}
            pages={data.pagination.pages}
            total={data.pagination.total}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  )
}
