import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import PatientForm from '../components/PatientForm.jsx'
import { getPatient, updatePatient } from '../api/patients.js'
import { fromPatient, toPatientPayload } from '../schemas/patient.js'
import LoadingState from '../components/LoadingState.jsx'
import ErrorState from '../components/ErrorState.jsx'
import BackButton from '../components/BackButton.jsx'

export default function PatientEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState(null)

  const { data: patient, isLoading, isError, refetch } = useQuery({
    queryKey: ['patients', id],
    queryFn: () => getPatient(id),
  })

  const onSubmit = async (values) => {
    setServerError(null)
    try {
      await updatePatient(id, toPatientPayload(values))
      navigate(`/patients/${id}`, { replace: true })
    } catch (err) {
      setServerError(err.response?.data?.message ?? 'Something went wrong. Please try again.')
    }
  }

  if (isLoading) return <LoadingState label="Loading patient…" />
  if (isError) return <ErrorState onRetry={refetch} />

  return (
    <div className="mx-auto max-w-2xl">
      <BackButton />
      <h1 className="mb-6 text-xl font-semibold text-gray-900 dark:text-gray-100">
        Edit {patient.fullName}
      </h1>
      <PatientForm
        defaultValues={fromPatient(patient)}
        onSubmit={onSubmit}
        submitLabel="Save Changes"
        serverError={serverError}
      />
    </div>
  )
}
