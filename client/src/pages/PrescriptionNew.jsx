import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import PrescriptionForm from '../components/PrescriptionForm.jsx'
import { getConsultation } from '../api/consultations.js'
import { createPrescription } from '../api/prescriptions.js'
import LoadingState from '../components/LoadingState.jsx'
import ErrorState from '../components/ErrorState.jsx'
import BackButton from '../components/BackButton.jsx'

export default function PrescriptionNew() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const consultationId = searchParams.get('consultationId')
  const [serverError, setServerError] = useState(null)

  const { data: consultation, isLoading, isError, refetch } = useQuery({
    queryKey: ['consultations', consultationId],
    queryFn: () => getConsultation(consultationId),
    enabled: Boolean(consultationId),
  })

  if (!consultationId) {
    return (
      <ErrorState
        title="No consultation selected"
        description="Start a prescription from a consultation."
      />
    )
  }
  if (isLoading) return <LoadingState label="Loading consultation…" />
  if (isError) return <ErrorState onRetry={refetch} />

  const onSubmit = async (values) => {
    setServerError(null)
    try {
      const prescription = await createPrescription({
        patientId: consultation.patientId?._id ?? consultation.patientId,
        doctorId: consultation.doctorId?._id ?? consultation.doctorId,
        consultationId,
        ...values,
      })
      navigate(`/prescriptions/${prescription._id}`, { replace: true })
    } catch (err) {
      setServerError(err.response?.data?.message ?? 'Something went wrong. Please try again.')
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <BackButton />
      <h1 className="mb-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
        New Prescription
      </h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        For {consultation.patientId?.fullName} · Dr. {consultation.doctorId?.name}
        {consultation.diagnosis ? ` · ${consultation.diagnosis}` : ''}
      </p>
      <PrescriptionForm onSubmit={onSubmit} submitLabel="Save Prescription" serverError={serverError} />
    </div>
  )
}
