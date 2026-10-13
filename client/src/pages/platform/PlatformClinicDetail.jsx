import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Copy,
  KeyRound,
  AlertTriangle,
} from 'lucide-react'
import Button from '../../components/Button.jsx'
import Modal from '../../components/Modal.jsx'
import ConfirmDialog from '../../components/ConfirmDialog.jsx'
import StatCard from '../../components/StatCard.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import LoadingState from '../../components/LoadingState.jsx'
import ErrorState from '../../components/ErrorState.jsx'
import {
  getPlatformClinic,
  suspendClinic,
  unsuspendClinic,
  resetStaffPassword,
} from '../../api/platform.js'
import { formatDate, formatDateTime, timeAgo } from './format.js'

const ROLE_LABELS = {
  owner: 'Owner',
  admin: 'Admin',
  doctor: 'Doctor',
  receptionist: 'Receptionist',
  nurse: 'Nurse',
}

// "APPOINTMENT_NO_SHOW" -> "Appointment no show"
function humanize(action) {
  const words = action.toLowerCase().replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const errorMessage = (err) =>
  err.response?.data?.message ?? 'Something went wrong. Please try again.'

function Card({ title, children }) {
  return (
    <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
        {title}
      </h2>
      {children}
    </section>
  )
}

function InfoRow({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-gray-500 dark:text-gray-400 sm:w-32">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-gray-900 dark:text-gray-100">
        {children || '—'}
      </dd>
    </div>
  )
}

function SuspendDialog({
  open,
  clinicName,
  onCancel,
  onConfirm,
  loading,
  error,
}) {
  const [reason, setReason] = useState('')
  const tooShort = reason.trim().length < 3
  return (
    <Modal open={open} onClose={onCancel} title="Suspend clinic?">
      <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
        Everyone at <strong>{clinicName}</strong> is signed out and can&apos;t
        log in, and its patient queue page goes offline. Nothing is deleted -
        you can reactivate it at any time.
      </p>
      <label
        htmlFor="suspend-reason"
        className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        Reason (only Clinix staff see this)
      </label>
      <textarea
        id="suspend-reason"
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
      />
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="danger"
          disabled={tooShort}
          loading={loading}
          onClick={() => onConfirm(reason.trim())}
        >
          Suspend clinic
        </Button>
      </div>
    </Modal>
  )
}

// Shown once, right after a reset: the server never returns it again.
function TempPasswordDialog({ result, onClose }) {
  const [copied, setCopied] = useState(false)
  if (!result) return null
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.temporaryPassword)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <Modal open onClose={onClose} title="Temporary password">
      <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
        Give this to <strong>{result.user.name}</strong> ({result.user.email}).
        They have been signed out everywhere and should change it after logging
        in (account menu → Change password).
      </p>
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
        <code className="min-w-0 flex-1 break-all font-mono text-base text-gray-900 dark:text-gray-100">
          {result.temporaryPassword}
        </code>
        <Button variant="secondary" onClick={copy} aria-label="Copy password">
          <Copy size={16} aria-hidden="true" />
        </Button>
      </div>
      <p
        role="status"
        className="mt-2 text-xs text-gray-500 dark:text-gray-400"
      >
        {copied ? 'Copied.' : 'This is shown only once.'}
      </p>
      <div className="mt-4 flex justify-end">
        <Button onClick={onClose}>Done</Button>
      </div>
    </Modal>
  )
}

export default function PlatformClinicDetail() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const [suspendOpen, setSuspendOpen] = useState(false)
  const [reactivateOpen, setReactivateOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState(null)
  const [resetResult, setResetResult] = useState(null)
  const [actionError, setActionError] = useState(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['platform', 'clinic', id],
    queryFn: () => getPlatformClinic(id),
  })

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['platform'] })
  const suspendMutation = useMutation({
    mutationFn: (reason) => suspendClinic(id, reason),
    onSuccess: () => {
      setSuspendOpen(false)
      refresh()
    },
    onError: (err) => setActionError(errorMessage(err)),
  })
  const reactivateMutation = useMutation({
    mutationFn: () => unsuspendClinic(id),
    onSuccess: () => {
      setReactivateOpen(false)
      refresh()
    },
    onError: (err) => setActionError(errorMessage(err)),
  })
  const resetMutation = useMutation({
    mutationFn: (userId) => resetStaffPassword(id, userId),
    onSuccess: (result) => {
      setResetTarget(null)
      setResetResult(result)
      refresh()
    },
    onError: (err) => setActionError(errorMessage(err)),
  })

  if (isLoading) return <LoadingState label="Loading clinic…" />
  if (isError) return <ErrorState onRetry={refetch} />

  const { clinic, staff, usage, activity, platformActions } = data

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/platform"
          className="mb-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          All clinics
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {clinic.logoUrl && (
              <img
                src={clinic.logoUrl}
                alt=""
                className="h-12 w-12 shrink-0 rounded-lg border border-gray-200 bg-white object-contain p-1 dark:border-gray-700"
              />
            )}
            <div className="min-w-0">
              <h1 className="break-words text-xl font-semibold text-gray-900 dark:text-gray-100">
                {clinic.name}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Joined {formatDate(clinic.createdAt)}
              </p>
            </div>
            <StatusBadge status={clinic.active ? 'ACTIVE' : 'SUSPENDED'} />
          </div>
          {clinic.active ? (
            <Button
              variant="danger"
              onClick={() => {
                setActionError(null)
                setSuspendOpen(true)
              }}
            >
              <Ban size={16} aria-hidden="true" />
              Suspend
            </Button>
          ) : (
            <Button
              onClick={() => {
                setActionError(null)
                setReactivateOpen(true)
              }}
            >
              <CheckCircle2 size={16} aria-hidden="true" />
              Reactivate
            </Button>
          )}
        </div>
      </div>

      {!clinic.active && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          <AlertTriangle
            size={16}
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <span>
            Suspended{' '}
            {clinic.suspendedAt ? formatDateTime(clinic.suspendedAt) : ''}
            {clinic.suspendedReason ? ` - ${clinic.suspendedReason}` : ''}.
            Staff can&apos;t log in and the queue page is offline.
          </span>
        </div>
      )}
      {actionError && !suspendOpen && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {actionError}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Patients" value={usage.patients} />
        <StatCard label="Appointments" value={usage.appointments} />
        <StatCard label="Appts, 30 days" value={usage.appointments30d} />
        <StatCard label="Consultations" value={usage.consultations} />
        <StatCard label="Prescriptions" value={usage.prescriptions} />
        <StatCard label="Invoices" value={usage.invoices} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Clinic details">
          <dl className="text-sm">
            <InfoRow label="Queue page">
              <a
                href={`/q/${clinic.slug}`}
                target="_blank"
                rel="noreferrer"
                className="inline-block py-1 text-blue-600 hover:underline dark:text-blue-400"
              >
                /q/{clinic.slug}
              </a>
            </InfoRow>
            <InfoRow label="Phone">{clinic.phone}</InfoRow>
            <InfoRow label="Email">{clinic.email}</InfoRow>
            <InfoRow label="Address">{clinic.address}</InfoRow>
            <InfoRow label="Time zone">{clinic.timezone}</InfoRow>
            <InfoRow label="WhatsApp">
              {clinic.whatsappEnabled ? 'On' : 'Off'}
            </InfoRow>
            <InfoRow label="Email notifications">
              {clinic.emailEnabled ? 'On' : 'Off'}
            </InfoRow>
          </dl>
        </Card>

        <Card title="Recent activity">
          {activity.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Nothing yet.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {activity.map((a) => (
                <li
                  key={a._id}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span className="min-w-0 text-gray-700 dark:text-gray-300">
                    {humanize(a.action)}
                    {a.userId?.name && (
                      <span className="text-gray-500 dark:text-gray-400">
                        {' '}
                        · {a.userId.name}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                    {timeAgo(a.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title={`Staff (${staff.length})`}>
        <div className="-mx-4 overflow-x-auto">
          <table className="stack-table w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Joined</th>
                <th className="px-4 py-2 font-medium">Support</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {staff.map((s) => (
                <tr key={s._id}>
                  <td
                    data-cell="title"
                    className="px-4 py-2.5 text-gray-900 dark:text-gray-100"
                  >
                    {s.name}
                  </td>
                  <td
                    data-label="Email"
                    data-cell="wide"
                    className="px-4 py-2.5 text-gray-500 dark:text-gray-400"
                  >
                    {s.email}
                  </td>
                  <td
                    data-label="Role"
                    className="px-4 py-2.5 text-gray-500 dark:text-gray-400"
                  >
                    {ROLE_LABELS[s.role] ?? s.role}
                  </td>
                  <td data-cell="badge" className="px-4 py-2.5">
                    <StatusBadge status={s.active ? 'ACTIVE' : 'INACTIVE'} />
                  </td>
                  <td
                    data-label="Joined"
                    className="px-4 py-2.5 text-gray-500 dark:text-gray-400"
                  >
                    {formatDate(s.createdAt)}
                  </td>
                  <td data-cell="actions" className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setActionError(null)
                        setResetTarget(s)
                      }}
                      aria-label={`Reset password for ${s.name}`}
                      className="flex items-center gap-1.5 py-1.5 text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    >
                      <KeyRound size={14} aria-hidden="true" />
                      Reset password
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Clinix support actions">
        {platformActions.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">None yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {platformActions.map((a) => (
              <li
                key={a._id}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="min-w-0 text-gray-700 dark:text-gray-300">
                  {humanize(a.action)}
                  {a.targetUserId?.name && ` · ${a.targetUserId.name}`}
                  {a.metadata?.reason && (
                    <span className="text-gray-500 dark:text-gray-400">
                      {' '}
                      · {a.metadata.reason}
                    </span>
                  )}
                  {a.adminId?.name && (
                    <span className="text-gray-500 dark:text-gray-400">
                      {' '}
                      · by {a.adminId.name}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                  {formatDateTime(a.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {suspendOpen && (
        <SuspendDialog
          open
          clinicName={clinic.name}
          loading={suspendMutation.isPending}
          error={actionError}
          onCancel={() => setSuspendOpen(false)}
          onConfirm={(reason) => suspendMutation.mutate(reason)}
        />
      )}
      <ConfirmDialog
        open={reactivateOpen}
        title="Reactivate clinic?"
        description={`Staff at ${clinic.name} can log in again and the queue page comes back online.`}
        confirmLabel="Reactivate"
        variant="primary"
        loading={reactivateMutation.isPending}
        onConfirm={() => reactivateMutation.mutate()}
        onCancel={() => setReactivateOpen(false)}
      />
      <ConfirmDialog
        open={Boolean(resetTarget)}
        title="Reset password?"
        description={`${resetTarget?.name} will be signed out everywhere and their current password stops working. You'll get a temporary password to give them.`}
        confirmLabel="Reset password"
        loading={resetMutation.isPending}
        onConfirm={() => resetMutation.mutate(resetTarget._id)}
        onCancel={() => setResetTarget(null)}
      />
      <TempPasswordDialog
        result={resetResult}
        onClose={() => setResetResult(null)}
      />
    </div>
  )
}
