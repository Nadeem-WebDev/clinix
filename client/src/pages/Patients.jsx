import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { listPatients } from '../api/patients.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useDebouncedValue } from '../hooks/useDebouncedValue.js'
import SearchInput from '../components/SearchInput.jsx'
import Pagination from '../components/Pagination.jsx'
import PatientAvatar from '../components/PatientAvatar.jsx'
import Button from '../components/Button.jsx'
import LoadingState from '../components/LoadingState.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ErrorState from '../components/ErrorState.jsx'

const CAN_REGISTER = ['owner', 'admin', 'receptionist']

function calculateAge(patient) {
  if (patient.age != null) return patient.age
  if (!patient.dob) return null
  const diff = Date.now() - new Date(patient.dob).getTime()
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000))
}

export default function Patients() {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebouncedValue(search)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['patients', { search: debouncedSearch, page }],
    queryFn: () => listPatients({ search: debouncedSearch, page }),
    placeholderData: (prev) => prev,
  })

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Patients</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Search by patient ID, name, or phone.
          </p>
        </div>
        {CAN_REGISTER.includes(user?.role) && (
          <Link to="/patients/new">
            <Button>
              <Plus size={16} aria-hidden="true" />
              Register Patient
            </Button>
          </Link>
        )}
      </div>

      <div className="mb-4 max-w-sm">
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
          placeholder="Search patients…"
        />
      </div>

      {isLoading && <LoadingState label="Loading patients…" />}

      {isError && <ErrorState onRetry={refetch} />}

      {!isLoading && !isError && data.patients.length === 0 && (
        <EmptyState
          title={search ? 'No patients match your search' : 'No patients yet'}
          description={
            search
              ? 'Try a different name, phone number, or patient ID.'
              : 'Register your first patient to get started.'
          }
          action={
            !search &&
            CAN_REGISTER.includes(user?.role) && (
              <Link to="/patients/new">
                <Button variant="secondary">
                  <Plus size={16} aria-hidden="true" />
                  Register Patient
                </Button>
              </Link>
            )
          }
        />
      )}

      {!isLoading && !isError && data.patients.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <tr>
                <th className="px-4 py-2 font-medium">Patient</th>
                <th className="px-4 py-2 font-medium">ID</th>
                <th className="px-4 py-2 font-medium">Age / Gender</th>
                <th className="px-4 py-2 font-medium">Phone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.patients.map((patient) => (
                <tr
                  key={patient._id}
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      to={`/patients/${patient._id}`}
                      className="flex items-center gap-3 text-gray-900 dark:text-gray-100"
                    >
                      <PatientAvatar name={patient.fullName} size={28} />
                      <span className="font-medium">{patient.fullName}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">
                    {patient.patientId}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">
                    {calculateAge(patient) ?? '—'} · {patient.gender}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">
                    {patient.phone}
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
