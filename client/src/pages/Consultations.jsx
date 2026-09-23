import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { listConsultations } from '../api/consultations.js'
import { listStaff } from '../api/staff.js'
import Button from '../components/Button.jsx'
import Pagination from '../components/Pagination.jsx'
import LoadingState from '../components/LoadingState.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ErrorState from '../components/ErrorState.jsx'

export default function Consultations() {
  const [doctorId, setDoctorId] = useState('')
  const [page, setPage] = useState(1)

  const { data: staff } = useQuery({ queryKey: ['staff'], queryFn: listStaff })
  const doctors = (staff ?? []).filter((u) => u.role === 'doctor')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['consultations', { doctorId, page }],
    queryFn: () => listConsultations({ doctorId: doctorId || undefined, page, limit: 20 }),
    placeholderData: (prev) => prev,
  })

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Consultations</h1>
        <Link to="/consultations/new">
          <Button>
            <Plus size={16} aria-hidden="true" />
            New Consultation
          </Button>
        </Link>
      </div>

      <div className="mb-4">
        <select
          value={doctorId}
          onChange={(e) => {
            setDoctorId(e.target.value)
            setPage(1)
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="">All doctors</option>
          {doctors.map((d) => (
            <option key={d._id} value={d._id}>
              Dr. {d.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <LoadingState label="Loading consultations…" />}
      {isError && <ErrorState onRetry={refetch} />}

      {!isLoading && !isError && data.consultations.length === 0 && (
        <EmptyState title="No consultations yet" description="Consultations you record will appear here." />
      )}

      {!isLoading && !isError && data.consultations.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Patient</th>
                <th className="px-4 py-2 font-medium">Doctor</th>
                <th className="px-4 py-2 font-medium">Diagnosis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.consultations.map((c) => (
                <tr key={c._id} className="hover:bg-gray-50 dark:hover:bg-gray-900">
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">
                    {new Date(c.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </td>
                  <td className="px-4 py-2.5">
                    <Link to={`/consultations/${c._id}`} className="text-gray-900 hover:underline dark:text-gray-100">
                      {c.patientId?.fullName}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">Dr. {c.doctorId?.name}</td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">
                    {c.diagnosis || '—'}
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
