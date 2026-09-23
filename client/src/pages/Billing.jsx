import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { listInvoices } from '../api/invoices.js'
import Button from '../components/Button.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import Pagination from '../components/Pagination.jsx'
import LoadingState from '../components/LoadingState.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ErrorState from '../components/ErrorState.jsx'

const STATUSES = ['PENDING', 'PARTIAL', 'PAID', 'REFUNDED']

function money(n) {
  return (Number(n) || 0).toFixed(2)
}

export default function Billing() {
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['invoices', { status, page }],
    queryFn: () => listInvoices({ status: status || undefined, page, limit: 20 }),
    placeholderData: (prev) => prev,
  })

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Billing</h1>
        <Link to="/billing/new">
          <Button>
            <Plus size={16} aria-hidden="true" />
            Create Bill
          </Button>
        </Link>
      </div>

      <div className="mb-4">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <LoadingState label="Loading invoices…" />}
      {isError && <ErrorState onRetry={refetch} />}

      {!isLoading && !isError && data.invoices.length === 0 && (
        <EmptyState
          title="No invoices yet"
          description="Create a bill to get started."
          action={
            <Link to="/billing/new">
              <Button variant="secondary">
                <Plus size={16} aria-hidden="true" />
                Create Bill
              </Button>
            </Link>
          }
        />
      )}

      {!isLoading && !isError && data.invoices.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <tr>
                <th className="px-4 py-2 font-medium">Invoice</th>
                <th className="px-4 py-2 font-medium">Patient</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Total</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.invoices.map((inv) => (
                <tr key={inv._id} className="hover:bg-gray-50 dark:hover:bg-gray-900">
                  <td className="px-4 py-2.5">
                    <Link
                      to={`/billing/${inv._id}`}
                      className="text-gray-900 hover:underline dark:text-gray-100"
                    >
                      {inv.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">
                    {inv.patientId?.fullName}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">
                    {new Date(inv.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100">{money(inv.total)}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={inv.paymentStatus} />
                  </td>
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
