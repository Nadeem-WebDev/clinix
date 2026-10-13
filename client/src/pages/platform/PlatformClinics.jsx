import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { Building2 } from 'lucide-react'
import StatCard from '../../components/StatCard.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import SearchInput from '../../components/SearchInput.jsx'
import Pagination from '../../components/Pagination.jsx'
import LoadingState from '../../components/LoadingState.jsx'
import ErrorState from '../../components/ErrorState.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import { getPlatformOverview, listPlatformClinics } from '../../api/platform.js'
import { timeAgo, formatDate } from './format.js'

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'suspended', label: 'Suspended' },
]

function Overview() {
  const { data, isLoading } = useQuery({
    queryKey: ['platform', 'overview'],
    queryFn: getPlatformOverview,
  })
  if (isLoading || !data) return null
  return (
    <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      <StatCard label="Clinics" value={data.clinics} />
      <StatCard label="Active, last 7 days" value={data.activeClinics7d} />
      <StatCard label="New, last 30 days" value={data.newClinics30d} />
      <StatCard label="Suspended" value={data.suspended} />
      <StatCard label="Patients" value={data.patients} />
      <StatCard label="Appointments, 30 days" value={data.appointments30d} />
    </div>
  )
}

export default function PlatformClinics() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [
      'platform',
      'clinics',
      { search: debouncedSearch, status, page },
    ],
    queryFn: () =>
      listPlatformClinics({
        search: debouncedSearch || undefined,
        status,
        page,
      }),
    placeholderData: keepPreviousData,
  })

  return (
    <div>
      <h1 className="mb-4 flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-gray-100">
        <Building2 size={22} aria-hidden="true" />
        Clinics
      </h1>

      <Overview />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:w-80">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search clinic, staff name or email"
          />
        </div>
        <div
          className="flex rounded-lg border border-gray-200 p-1 dark:border-gray-800"
          role="group"
          aria-label="Status"
        >
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={status === f.key}
              onClick={() => {
                setStatus(f.key)
                setPage(1)
              }}
              className={clsx(
                'flex-1 rounded-md px-3 py-1.5 text-sm font-medium sm:flex-none',
                status === f.key
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <LoadingState label="Loading clinics…" />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : data.clinics.length === 0 ? (
        <EmptyState
          title={
            debouncedSearch ? 'No clinics match that search' : 'No clinics yet'
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <table className="stack-table w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Clinic</th>
                  <th className="px-4 py-2 font-medium">Owner</th>
                  <th className="px-4 py-2 text-right font-medium">Staff</th>
                  <th className="px-4 py-2 text-right font-medium">Patients</th>
                  <th className="px-4 py-2 text-right font-medium">
                    Appts (30d)
                  </th>
                  <th className="px-4 py-2 font-medium">Last active</th>
                  <th className="px-4 py-2 font-medium">Joined</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {data.clinics.map((c) => (
                  <tr
                    key={c._id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <td data-cell="title" className="px-4 py-2.5">
                      <Link
                        to={`/platform/clinics/${c._id}`}
                        className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {c.name}
                      </Link>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">
                        /q/{c.slug}
                      </span>
                    </td>
                    <td
                      data-label="Owner"
                      data-cell="wide"
                      className="px-4 py-2.5 text-gray-700 dark:text-gray-300"
                    >
                      {c.owner ? (
                        <>
                          {c.owner.name}
                          <span className="block text-xs text-gray-500 dark:text-gray-400">
                            {c.owner.email}
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td
                      data-label="Staff"
                      className="px-4 py-2.5 text-right tabular-nums"
                    >
                      {c.staffCount}
                    </td>
                    <td
                      data-label="Patients"
                      className="px-4 py-2.5 text-right tabular-nums"
                    >
                      {c.patientCount}
                    </td>
                    <td
                      data-label="Appts (30d)"
                      className="px-4 py-2.5 text-right tabular-nums"
                    >
                      {c.appointments30d}
                    </td>
                    <td
                      data-label="Last active"
                      className="px-4 py-2.5 text-gray-500 dark:text-gray-400"
                    >
                      {c.lastActivityAt ? timeAgo(c.lastActivityAt) : 'Never'}
                    </td>
                    <td
                      data-label="Joined"
                      className="px-4 py-2.5 text-gray-500 dark:text-gray-400"
                    >
                      {formatDate(c.createdAt)}
                    </td>
                    <td data-cell="badge" className="px-4 py-2.5">
                      <StatusBadge status={c.active ? 'ACTIVE' : 'SUSPENDED'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={data.pagination.page}
            pages={data.pagination.pages}
            total={data.pagination.total}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  )
}
