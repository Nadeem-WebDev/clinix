import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Lock, Stethoscope, FileText, Receipt } from 'lucide-react'
import { getPatient, getPatientVisits, getPatientFollowUps } from '../api/patients.js'
import { listAppointments } from '../api/appointments.js'
import { listConsultations } from '../api/consultations.js'
import { listPrescriptions } from '../api/prescriptions.js'
import { listInvoices } from '../api/invoices.js'
import { listDocuments, uploadDocument, getDocumentUrl, deleteDocument } from '../api/documents.js'
import { useAuth } from '../context/AuthContext.jsx'
import PatientAvatar from '../components/PatientAvatar.jsx'
import Tabs from '../components/Tabs.jsx'
import Button from '../components/Button.jsx'
import BackButton from '../components/BackButton.jsx'
import StatusBadge, { WalkInTag } from '../components/StatusBadge.jsx'
import RestrictedTabList from '../components/RestrictedTabList.jsx'
import DocumentUploadForm from '../components/DocumentUploadForm.jsx'
import DocumentList from '../components/DocumentList.jsx'
import LoadingState from '../components/LoadingState.jsx'
import ErrorState from '../components/ErrorState.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { localDateStr } from '../utils/date.js'

const CAN_EDIT = ['owner', 'admin', 'receptionist', 'nurse']
// Gated to owner/admin/doctor - the spec's "don't expose medical notes to
// receptionists" rule, applied to prescriptions too (arguably even more
// sensitive: actual medications).
const CAN_VIEW_CLINICAL = ['owner', 'admin', 'doctor']
// Billing is front-desk/admin territory, not clinical data - the inverse
// gate from consultations/prescriptions.
const CAN_VIEW_BILLING = ['owner', 'admin', 'receptionist']
// Follow-up dates: clinical staff plus the front desk, who book them (the
// server leaves the doctor's instructions out for receptionists).
const CAN_VIEW_FOLLOW_UPS = ['owner', 'admin', 'doctor', 'receptionist']

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'visits', label: 'Visits' },
  { key: 'consultations', label: 'Consultations' },
  { key: 'prescriptions', label: 'Prescriptions' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'billing', label: 'Billing' },
  { key: 'documents', label: 'Documents' },
  { key: 'followups', label: 'Follow-ups' },
]

function calculateAge(patient) {
  if (patient.age != null) return patient.age
  if (!patient.dob) return null
  const diff = Date.now() - new Date(patient.dob).getTime()
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000))
}

function InfoRow({ label, value }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-gray-900 dark:text-gray-100">{value || '—'}</dd>
    </div>
  )
}

function RecordLink({ to, title, meta }) {
  return (
    <li>
      <Link
        to={to}
        className="flex items-center justify-between rounded-lg border border-gray-200 p-3 text-sm hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
      >
        <span className="text-gray-900 dark:text-gray-100">{title}</span>
        <span className="text-gray-400 dark:text-gray-500">{meta}</span>
      </Link>
    </li>
  )
}

const formatDate = (value) => new Date(value).toLocaleDateString([], { dateStyle: 'medium' })
const chipClass =
  'inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'

// One visit: appointment (if any) + its consultation, prescriptions and
// bills. Which parts are present depends on the role - the server already
// left out what this user may not see.
function VisitItem({ visit }) {
  const heading = visit.billOnly ? 'Bill only' : visit.status ? null : 'Consultation'
  return (
    <li className="rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-gray-900 dark:text-gray-100">
            {new Date(visit.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
            {visit.isWalkIn && <WalkInTag />}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {[visit.doctor && `Dr. ${visit.doctor.name}`, visit.tokenNumber && `Token ${visit.tokenNumber}`]
              .filter(Boolean)
              .join(' · ') || '—'}
          </p>
        </div>
        {visit.status ? (
          <StatusBadge status={visit.status} />
        ) : (
          <span className="text-xs text-gray-500 dark:text-gray-400">{heading}</span>
        )}
      </div>

      {(visit.consultation || visit.prescriptions.length > 0 || visit.invoices.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {visit.consultation?.id && (
            <Link to={`/consultations/${visit.consultation.id}`} className={chipClass}>
              <Stethoscope size={14} aria-hidden="true" />
              {visit.consultation.diagnosis || 'Consultation'}
            </Link>
          )}
          {visit.consultation?.recorded && (
            <span className="inline-flex items-center gap-1.5 px-1 py-1 text-xs text-gray-500 dark:text-gray-400">
              <Stethoscope size={14} aria-hidden="true" />
              Consultation recorded
            </span>
          )}
          {visit.prescriptions.map((p) => (
            <Link key={p.id} to={`/prescriptions/${p.id}`} className={chipClass}>
              <FileText size={14} aria-hidden="true" />
              Prescription · {p.medicineCount} {p.medicineCount === 1 ? 'medicine' : 'medicines'} ·{' '}
              {p.finalized ? 'Finalized' : 'Draft'}
            </Link>
          ))}
          {visit.invoices.map((inv) => (
            <Link key={inv.id} to={`/billing/${inv.id}`} className={chipClass}>
              <Receipt size={14} aria-hidden="true" />
              {inv.invoiceNumber} · {inv.total.toFixed(2)}
              <StatusBadge status={inv.paymentStatus} />
            </Link>
          ))}
        </div>
      )}
    </li>
  )
}

const FOLLOW_UP_STATUS = {
  due_today: { label: 'Due today', className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  overdue: { label: 'Overdue', className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
  upcoming: { label: 'Upcoming', className: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
  done: { label: 'Done', className: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' },
}

function FollowUpItem({ followUp }) {
  const status = FOLLOW_UP_STATUS[followUp.status]
  const details = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-gray-900 dark:text-gray-100">{formatDate(followUp.followUpDate)}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Set by {followUp.doctor ? `Dr. ${followUp.doctor.name}` : 'the doctor'} on {formatDate(followUp.setOn)}
          </p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>{status.label}</span>
      </div>
      {followUp.instructions && <p className="mt-2 text-gray-700 dark:text-gray-300">{followUp.instructions}</p>}
    </>
  )
  const boxClass = 'block rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-800'
  return (
    <li>
      {followUp.consultationId ? (
        <Link to={`/consultations/${followUp.consultationId}`} className={`${boxClass} hover:bg-gray-50 dark:hover:bg-gray-900`}>
          {details}
        </Link>
      ) : (
        <div className={boxClass}>{details}</div>
      )}
    </li>
  )
}

function DocumentsTab({ patientId, canView }) {
  const queryClient = useQueryClient()
  const queryKey = ['documents', { patientId }]

  const { data: documents, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => listDocuments({ patientId }),
    enabled: canView,
  })

  const uploadMutation = useMutation({
    mutationFn: (values) => uploadDocument({ patientId, ...values }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
  const deleteMutation = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const handleView = async (id) => {
    const url = await getDocumentUrl(id)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  if (!canView) {
    return <EmptyState icon={Lock} title="Restricted" description="Not shown to your role." />
  }
  if (isLoading) return <LoadingState label="Loading documents…" />
  if (isError) return <ErrorState onRetry={refetch} />

  return (
    <div className="space-y-4">
      <DocumentUploadForm onUpload={(values) => uploadMutation.mutateAsync(values)} />
      {documents.length === 0 ? (
        <EmptyState title="No documents yet" description="Upload a report, scan, or previous prescription." />
      ) : (
        <DocumentList
          documents={documents}
          onView={handleView}
          onDelete={(id) => deleteMutation.mutateAsync(id)}
        />
      )}
    </div>
  )
}

export default function PatientProfile() {
  const { id } = useParams()
  const { user } = useAuth()
  const [tab, setTab] = useState('overview')
  const canViewClinical = CAN_VIEW_CLINICAL.includes(user?.role)

  const { data: patient, isLoading, isError, refetch } = useQuery({
    queryKey: ['patients', id],
    queryFn: () => getPatient(id),
  })

  if (isLoading) return <LoadingState label="Loading patient…" />
  if (isError) return <ErrorState onRetry={refetch} />

  return (
    <div>
      <BackButton />
      <div className="mb-6 flex items-start justify-between rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-4">
          <PatientAvatar name={patient.fullName} size={48} />
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {patient.fullName}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {calculateAge(patient) ?? '—'} yrs · {patient.gender} ·{' '}
              <span className="whitespace-nowrap">{patient.phone}</span> ·{' '}
              <span className="whitespace-nowrap">{patient.patientId}</span>
            </p>
          </div>
        </div>
        {CAN_EDIT.includes(user?.role) && (
          <Link to={`/patients/${id}/edit`}>
            <Button variant="secondary">
              <Pencil size={16} aria-hidden="true" />
              Edit
            </Button>
          </Link>
        )}
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      <div className="pt-4">
        {tab === 'overview' && (
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoRow label="Email" value={patient.email} />
            <InfoRow label="Address" value={patient.address} />
            <InfoRow label="Blood group" value={patient.bloodGroup} />
            <InfoRow
              label="Emergency contact"
              value={
                patient.emergencyContact?.name || patient.emergencyContact?.phone
                  ? `${patient.emergencyContact?.name ?? ''} ${patient.emergencyContact?.phone ?? ''}`.trim()
                  : null
              }
            />
            <InfoRow label="Allergies" value={patient.allergies?.join(', ')} />
            <InfoRow label="Medical conditions" value={patient.medicalConditions?.join(', ')} />
            <div className="sm:col-span-2 lg:col-span-3">
              <InfoRow label="Medical history" value={patient.medicalHistory} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <InfoRow label="Notes" value={patient.notes} />
            </div>
          </dl>
        )}

        {tab === 'consultations' && (
          <RestrictedTabList
            active={tab === 'consultations'}
            canView={canViewClinical}
            queryKey={['consultations', { patientId: id }]}
            queryFn={async () => (await listConsultations({ patientId: id, limit: 20 })).consultations}
            emptyTitle="No consultations yet"
            emptyDescription="Past visits will appear here."
            renderItem={(c) => (
              <RecordLink
                key={c._id}
                to={`/consultations/${c._id}`}
                title={c.diagnosis || 'No diagnosis recorded'}
                meta={`${new Date(c.createdAt).toLocaleDateString()} · Dr. ${c.doctorId?.name}`}
              />
            )}
          />
        )}

        {tab === 'prescriptions' && (
          <RestrictedTabList
            active={tab === 'prescriptions'}
            canView={canViewClinical}
            queryKey={['prescriptions', { patientId: id }]}
            queryFn={async () => (await listPrescriptions({ patientId: id, limit: 20 })).prescriptions}
            emptyTitle="No prescriptions yet"
            emptyDescription="Prescriptions from consultations will appear here."
            renderItem={(p) => (
              <RecordLink
                key={p._id}
                to={`/prescriptions/${p._id}`}
                title={p.medicines.map((m) => m.name).join(', ')}
                meta={`${new Date(p.createdAt).toLocaleDateString()} · ${p.finalized ? 'Finalized' : 'Draft'}`}
              />
            )}
          />
        )}

        {tab === 'billing' && (
          <RestrictedTabList
            active={tab === 'billing'}
            canView={CAN_VIEW_BILLING.includes(user?.role)}
            queryKey={['invoices', { patientId: id }]}
            queryFn={async () => (await listInvoices({ patientId: id, limit: 20 })).invoices}
            emptyTitle="No invoices yet"
            emptyDescription="Bills for this patient will appear here."
            renderItem={(inv) => (
              <li key={inv._id}>
                <Link
                  to={`/billing/${inv._id}`}
                  className="flex items-center justify-between rounded-lg border border-gray-200 p-3 text-sm hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
                >
                  <span className="text-gray-900 dark:text-gray-100">
                    {inv.invoiceNumber} · {inv.total.toFixed(2)}
                  </span>
                  <span className="flex items-center gap-2 text-gray-400 dark:text-gray-500">
                    {new Date(inv.createdAt).toLocaleDateString()}
                    <StatusBadge status={inv.paymentStatus} />
                  </span>
                </Link>
              </li>
            )}
          />
        )}

        {tab === 'documents' && <DocumentsTab patientId={id} canView={canViewClinical} />}

        {tab === 'visits' && (
          <RestrictedTabList
            active={tab === 'visits'}
            canView
            queryKey={['patients', id, 'visits']}
            queryFn={() => getPatientVisits(id)}
            emptyTitle="No visits yet"
            emptyDescription="Each time this patient is seen - with the consultation, prescription and bill - appears here."
            renderItem={(visit) => <VisitItem key={visit.key} visit={visit} />}
          />
        )}

        {tab === 'followups' && (
          <RestrictedTabList
            active={tab === 'followups'}
            canView={CAN_VIEW_FOLLOW_UPS.includes(user?.role)}
            queryKey={['patients', id, 'follow-ups']}
            queryFn={() => getPatientFollowUps(id)}
            emptyTitle="No follow-ups"
            emptyDescription="Follow-up dates a doctor sets during a consultation appear here."
            renderItem={(followUp) => <FollowUpItem key={followUp.key} followUp={followUp} />}
          />
        )}

        {tab === 'appointments' && (
          <RestrictedTabList
            active={tab === 'appointments'}
            canView
            queryKey={['appointments', { patientId: id, limit: 20 }]}
            queryFn={async () => (await listAppointments({ patientId: id, limit: 20 })).appointments}
            emptyTitle="No appointments yet"
            emptyDescription="Appointments for this patient will appear here."
            renderItem={(appointment) => (
              <RecordLink
                key={appointment._id}
                to={`/appointments?date=${localDateStr(appointment.scheduledAt)}`}
                title={new Date(appointment.scheduledAt).toLocaleString([], {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
                meta={`Dr. ${appointment.doctorId?.name} · ${appointment.status}`}
              />
            )}
          />
        )}

      </div>
    </div>
  )
}
