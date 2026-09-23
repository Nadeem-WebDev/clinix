import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, UserPlus, Pencil } from 'lucide-react'
import {
  listAppointments,
  markArrived,
  cancelAppointment,
  markNoShow,
  rescheduleAppointment,
} from '../api/appointments.js'
import { listStaff } from '../api/staff.js'
import { useAuth } from '../context/AuthContext.jsx'
import Button from '../components/Button.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import Modal from '../components/Modal.jsx'
import Pagination from '../components/Pagination.jsx'
import LoadingState from '../components/LoadingState.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ErrorState from '../components/ErrorState.jsx'

const CAN_MANAGE = ['owner', 'admin', 'receptionist']

function toDateStr(date) {
  return date.toISOString().slice(0, 10)
}
function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

const VIEWS = ['today', 'tomorrow', 'upcoming']

export default function Appointments() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [view, setView] = useState('today')
  const [doctorId, setDoctorId] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [confirmAction, setConfirmAction] = useState(null) // { type, appointment }
  const [rescheduleTarget, setRescheduleTarget] = useState(null)

  const dateParams = useMemo(() => {
    const today = new Date()
    if (view === 'today') return { date: toDateStr(today) }
    if (view === 'tomorrow') return { date: toDateStr(addDays(today, 1)) }
    return { from: toDateStr(today) } // upcoming
  }, [view])

  const queryParams = { ...dateParams, doctorId: doctorId || undefined, status: status || undefined, page, limit: 20 }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['appointments', queryParams],
    queryFn: () => listAppointments(queryParams),
    placeholderData: (prev) => prev,
  })

  const { data: staff } = useQuery({ queryKey: ['staff'], queryFn: listStaff })
  const doctors = (staff ?? []).filter((u) => u.role === 'doctor')

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['appointments'] })

  const arriveMutation = useMutation({ mutationFn: markArrived, onSuccess: invalidate })
  const cancelMutation = useMutation({
    mutationFn: cancelAppointment,
    onSuccess: () => {
      invalidate()
      setConfirmAction(null)
    },
  })
  const noShowMutation = useMutation({
    mutationFn: markNoShow,
    onSuccess: () => {
      invalidate()
      setConfirmAction(null)
    },
  })
  const rescheduleMutation = useMutation({
    mutationFn: ({ id, payload }) => rescheduleAppointment(id, payload),
    onSuccess: () => {
      invalidate()
      setRescheduleTarget(null)
    },
  })

  const canManage = CAN_MANAGE.includes(user?.role)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Appointments</h1>
        {canManage && (
          <div className="flex gap-2">
            <Link to="/appointments/new?walkin=1">
              <Button variant="secondary">
                <UserPlus size={16} aria-hidden="true" />
                Walk-in
              </Button>
            </Link>
            <Link to="/appointments/new">
              <Button>
                <Plus size={16} aria-hidden="true" />
                Book Appointment
              </Button>
            </Link>
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-gray-200 p-1 dark:border-gray-800">
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                setView(v)
                setPage(1)
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                view === v
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

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

        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="">Any status</option>
          {['BOOKED', 'ARRIVED', 'WAITING', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <LoadingState label="Loading appointments…" />}
      {isError && <ErrorState onRetry={refetch} />}

      {!isLoading && !isError && data.appointments.length === 0 && (
        <EmptyState
          title="No appointments"
          description="Nothing scheduled for this view."
          action={
            canManage && (
              <Link to="/appointments/new">
                <Button variant="secondary">
                  <Plus size={16} aria-hidden="true" />
                  Book Appointment
                </Button>
              </Link>
            )
          }
        />
      )}

      {!isLoading && !isError && data.appointments.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <tr>
                <th className="px-4 py-2 font-medium">Time</th>
                <th className="px-4 py-2 font-medium">Patient</th>
                <th className="px-4 py-2 font-medium">Doctor</th>
                <th className="px-4 py-2 font-medium">Status</th>
                {canManage && <th className="px-4 py-2 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.appointments.map((appt) => (
                <tr key={appt._id}>
                  <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100">
                    {new Date(appt.scheduledAt).toLocaleString([], {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td className="px-4 py-2.5">
                    <Link to={`/patients/${appt.patientId?._id}`} className="text-gray-900 hover:underline dark:text-gray-100">
                      {appt.patientId?.fullName}
                    </Link>
                    <span className="ml-1 text-xs text-gray-400">#{appt.tokenNumber}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">
                    Dr. {appt.doctorId?.name}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={appt.status} />
                  </td>
                  {canManage && (
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {appt.status === 'BOOKED' && (
                          <>
                            <Button
                              variant="secondary"
                              onClick={() => arriveMutation.mutate(appt._id)}
                              loading={arriveMutation.isPending && arriveMutation.variables === appt._id}
                            >
                              Mark Arrived
                            </Button>
                            <Button variant="ghost" onClick={() => setRescheduleTarget(appt)} aria-label="Reschedule">
                              <Pencil size={14} aria-hidden="true" />
                            </Button>
                          </>
                        )}
                        {['BOOKED', 'ARRIVED', 'WAITING'].includes(appt.status) && (
                          <>
                            <Button
                              variant="ghost"
                              onClick={() => setConfirmAction({ type: 'no-show', appointment: appt })}
                            >
                              No-show
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => setConfirmAction({ type: 'cancel', appointment: appt })}
                            >
                              Cancel
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  )}
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

      <ConfirmDialog
        open={confirmAction?.type === 'cancel'}
        title="Cancel appointment?"
        description={`This will cancel ${confirmAction?.appointment?.patientId?.fullName}'s appointment. This cannot be undone.`}
        confirmLabel="Cancel appointment"
        loading={cancelMutation.isPending}
        onConfirm={() => cancelMutation.mutate(confirmAction.appointment._id)}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction?.type === 'no-show'}
        title="Mark as no-show?"
        description={`Mark ${confirmAction?.appointment?.patientId?.fullName} as a no-show for this appointment.`}
        confirmLabel="Mark no-show"
        loading={noShowMutation.isPending}
        onConfirm={() => noShowMutation.mutate(confirmAction.appointment._id)}
        onCancel={() => setConfirmAction(null)}
      />

      <RescheduleModal
        appointment={rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        onSubmit={(payload) => rescheduleMutation.mutate({ id: rescheduleTarget._id, payload })}
        loading={rescheduleMutation.isPending}
      />
    </div>
  )
}

function RescheduleModal({ appointment, onClose, onSubmit, loading }) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')

  useEffect(() => {
    if (appointment) {
      const d = new Date(appointment.scheduledAt)
      setDate(d.toISOString().slice(0, 10))
      setTime(d.toTimeString().slice(0, 5))
    }
  }, [appointment])

  return (
    <Modal open={Boolean(appointment)} onClose={onClose} title="Reschedule Appointment">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="rescheduleDate" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Date</label>
            <input
              id="rescheduleDate"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <div>
            <label htmlFor="rescheduleTime" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Time</label>
            <input
              id="rescheduleTime"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={loading}
            onClick={() => onSubmit({ scheduledAt: new Date(`${date}T${time}:00`).toISOString() })}
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  )
}
