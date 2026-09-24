import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Plus, Receipt } from 'lucide-react'
import ConsultationForm from '../components/ConsultationForm.jsx'
import GenerateBillModal from '../components/GenerateBillModal.jsx'
import Button from '../components/Button.jsx'
import { getConsultation, updateConsultation } from '../api/consultations.js'
import { getAppointment } from '../api/appointments.js'
import { listPrescriptions } from '../api/prescriptions.js'
import { fromConsultation, toConsultationPayload } from '../schemas/consultation.js'
import { useAuth } from '../context/AuthContext.jsx'
import LoadingState from '../components/LoadingState.jsx'
import ErrorState from '../components/ErrorState.jsx'
import BackButton from '../components/BackButton.jsx'

// Only owner/admin can actually create invoices (see invoice.routes.js) -
// a doctor can view this page but would just hit a 403, so the button
// doesn't even render for them.
const CAN_BILL = ['owner', 'admin']

export default function ConsultationDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState(null)
  const [billModalOpen, setBillModalOpen] = useState(false)

  const { data: consultation, isLoading, isError, refetch } = useQuery({
    queryKey: ['consultations', id],
    queryFn: () => getConsultation(id),
  })

  const { data: appointment } = useQuery({
    queryKey: ['appointments', consultation?.appointmentId],
    queryFn: () => getAppointment(consultation.appointmentId),
    enabled: Boolean(consultation?.appointmentId),
  })

  const { data: prescriptionData } = useQuery({
    queryKey: ['prescriptions', { consultationId: id }],
    queryFn: () => listPrescriptions({ consultationId: id }),
  })

  if (isLoading) return <LoadingState label="Loading consultation…" />
  if (isError) return <ErrorState onRetry={refetch} />

  const isFinalized = appointment?.status === 'COMPLETED'

  const onSubmit = async (values) => {
    setServerError(null)
    try {
      const updated = await updateConsultation(id, toConsultationPayload(values))
      queryClient.setQueryData(['consultations', id], updated)
    } catch (err) {
      setServerError(err.response?.data?.message ?? 'Something went wrong. Please try again.')
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <BackButton />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Consultation — {consultation.patientId?.fullName}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Dr. {consultation.doctorId?.name} · {new Date(consultation.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isFinalized && CAN_BILL.includes(user?.role) && (
            <Button variant="secondary" onClick={() => setBillModalOpen(true)}>
              <Receipt size={16} aria-hidden="true" />
              Generate Bill
            </Button>
          )}
          <Link to={`/prescriptions/new?consultationId=${id}`}>
            <Button variant="secondary">
              <Plus size={16} aria-hidden="true" />
              New Prescription
            </Button>
          </Link>
        </div>
      </div>

      {prescriptionData?.prescriptions.length > 0 && (
        <div className="mb-6 space-y-2">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Prescriptions</h2>
          {prescriptionData.prescriptions.map((p) => (
            <Link
              key={p._id}
              to={`/prescriptions/${p._id}`}
              className="flex items-center gap-2 rounded-lg border border-gray-200 p-2.5 text-sm hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
            >
              <FileText size={14} className="text-gray-400" aria-hidden="true" />
              <span className="text-gray-900 dark:text-gray-100">
                {p.medicines.map((m) => m.name).join(', ')}
              </span>
              <span className="ml-auto text-xs text-gray-400">
                {p.finalized ? 'Finalized' : 'Draft'}
              </span>
            </Link>
          ))}
        </div>
      )}

      <ConsultationForm
        defaultValues={fromConsultation(consultation)}
        onSubmit={onSubmit}
        submitLabel="Save Changes"
        serverError={serverError}
        readOnly={isFinalized}
      />

      <GenerateBillModal
        open={billModalOpen}
        onClose={() => setBillModalOpen(false)}
        patientId={consultation.patientId?._id}
        doctorId={consultation.doctorId?._id}
        appointmentId={consultation.appointmentId}
        consultationId={consultation._id}
      />
    </div>
  )
}
