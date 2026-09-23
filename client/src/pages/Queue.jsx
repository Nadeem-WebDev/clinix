import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRightCircle, CheckCircle2, SkipForward, Stethoscope } from 'lucide-react'
import { getQueue, callNext, completeAppointment, skipAppointment } from '../api/appointments.js'
import { listStaff } from '../api/staff.js'
import { useAuth } from '../context/AuthContext.jsx'
import Button from '../components/Button.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import PatientAvatar from '../components/PatientAvatar.jsx'
import LoadingState from '../components/LoadingState.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ErrorState from '../components/ErrorState.jsx'

const CAN_DRIVE_QUEUE = ['owner', 'admin', 'doctor']

export default function Queue() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [doctorId, setDoctorId] = useState(user?.role === 'doctor' ? user._id : '')

  const { data: staff } = useQuery({ queryKey: ['staff'], queryFn: listStaff })
  const doctors = useMemo(() => (staff ?? []).filter((u) => u.role === 'doctor'), [staff])

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['queue', doctorId],
    queryFn: () => getQueue({ doctorId: doctorId || undefined }),
    refetchInterval: 15000, // queues change fast at the front desk - keep it fresh
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['queue'] })
  const callMutation = useMutation({ mutationFn: callNext, onSuccess: invalidate })
  const completeMutation = useMutation({ mutationFn: completeAppointment, onSuccess: invalidate })
  const skipMutation = useMutation({ mutationFn: skipAppointment, onSuccess: invalidate })

  const canDrive = CAN_DRIVE_QUEUE.includes(user?.role)
  const appointments = data?.appointments ?? []
  const nextWaiting = appointments.find((a) => a.status === 'WAITING')

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">OPD Queue</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {data?.date ? `For ${data.date}` : 'Today'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {user?.role !== 'doctor' && (
            <select
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">All doctors</option>
              {doctors.map((d) => (
                <option key={d._id} value={d._id}>
                  Dr. {d.name}
                </option>
              ))}
            </select>
          )}
          {canDrive && nextWaiting && (
            <Button
              onClick={() => callMutation.mutate(nextWaiting._id)}
              loading={callMutation.isPending}
            >
              <ArrowRightCircle size={16} aria-hidden="true" />
              Next Patient
            </Button>
          )}
        </div>
      </div>

      {isLoading && <LoadingState label="Loading queue…" />}
      {isError && <ErrorState onRetry={refetch} />}

      {!isLoading && !isError && appointments.length === 0 && (
        <EmptyState title="Queue is empty" description="No patients waiting or in consultation." />
      )}

      {!isLoading && !isError && appointments.length > 0 && (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
          {appointments.map((appt) => (
            <li
              key={appt._id}
              className="flex items-center justify-between gap-3 bg-white px-4 py-3 dark:bg-gray-900"
            >
              <div className="flex items-center gap-3">
                <span className="w-8 text-center text-sm font-semibold text-gray-400 dark:text-gray-500">
                  {appt.tokenNumber}
                </span>
                <PatientAvatar name={appt.patientId?.fullName} size={32} />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {appt.patientId?.fullName}
                    {appt.skipped && (
                      <span className="ml-2 text-xs font-normal text-amber-600 dark:text-amber-400">
                        skipped
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Dr. {appt.doctorId?.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={appt.status} />
                {canDrive && appt.status === 'WAITING' && (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => callMutation.mutate(appt._id)}
                      loading={callMutation.isPending && callMutation.variables === appt._id}
                    >
                      Call
                    </Button>
                    <Button
                      variant="ghost"
                      aria-label="Skip"
                      onClick={() => skipMutation.mutate(appt._id)}
                      loading={skipMutation.isPending && skipMutation.variables === appt._id}
                    >
                      <SkipForward size={14} aria-hidden="true" />
                    </Button>
                  </>
                )}
                {canDrive && appt.status === 'IN_CONSULTATION' && (
                  <>
                    <Link to={`/consultations/new?appointmentId=${appt._id}`}>
                      <Button variant="secondary">
                        <Stethoscope size={14} aria-hidden="true" />
                        Consult
                      </Button>
                    </Link>
                    <Button
                      variant="secondary"
                      onClick={() => completeMutation.mutate(appt._id)}
                      loading={completeMutation.isPending && completeMutation.variables === appt._id}
                    >
                      <CheckCircle2 size={14} aria-hidden="true" />
                      Complete
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
