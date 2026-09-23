import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileDown, CheckCircle2 } from 'lucide-react'
import PrescriptionForm from '../components/PrescriptionForm.jsx'
import Button from '../components/Button.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import {
  getPrescription,
  updatePrescription,
  finalizePrescription,
  prescriptionPdfUrl,
} from '../api/prescriptions.js'
import LoadingState from '../components/LoadingState.jsx'
import ErrorState from '../components/ErrorState.jsx'

export default function PrescriptionDetail() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState(null)
  const [confirmFinalize, setConfirmFinalize] = useState(false)
  const [finalizing, setFinalizing] = useState(false)

  const { data: prescription, isLoading, isError, refetch } = useQuery({
    queryKey: ['prescriptions', id],
    queryFn: () => getPrescription(id),
  })

  if (isLoading) return <LoadingState label="Loading prescription…" />
  if (isError) return <ErrorState onRetry={refetch} />

  const onSubmit = async (values) => {
    setServerError(null)
    try {
      const updated = await updatePrescription(id, values)
      queryClient.setQueryData(['prescriptions', id], updated)
    } catch (err) {
      setServerError(err.response?.data?.message ?? 'Something went wrong. Please try again.')
    }
  }

  const handleFinalize = async () => {
    setFinalizing(true)
    try {
      const updated = await finalizePrescription(id)
      queryClient.setQueryData(['prescriptions', id], updated)
      setConfirmFinalize(false)
    } catch (err) {
      setServerError(err.response?.data?.message ?? 'Could not finalize.')
      setConfirmFinalize(false)
    } finally {
      setFinalizing(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Prescription — {prescription.patientId?.fullName}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Dr. {prescription.doctorId?.name} · {new Date(prescription.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          <a href={prescriptionPdfUrl(id)} target="_blank" rel="noreferrer">
            <Button variant="secondary">
              <FileDown size={16} aria-hidden="true" />
              View / Print PDF
            </Button>
          </a>
          {!prescription.finalized && (
            <Button onClick={() => setConfirmFinalize(true)}>
              <CheckCircle2 size={16} aria-hidden="true" />
              Finalize
            </Button>
          )}
        </div>
      </div>

      <PrescriptionForm
        defaultValues={{ medicines: prescription.medicines, notes: prescription.notes ?? '' }}
        onSubmit={onSubmit}
        submitLabel="Save Changes"
        serverError={serverError}
        readOnly={prescription.finalized}
      />

      <ConfirmDialog
        open={confirmFinalize}
        title="Finalize prescription?"
        description="Once finalized, this prescription can no longer be edited. This preserves it as the official historical record."
        confirmLabel="Finalize"
        variant="primary"
        loading={finalizing}
        onConfirm={handleFinalize}
        onCancel={() => setConfirmFinalize(false)}
      />
    </div>
  )
}
