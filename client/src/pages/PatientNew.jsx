import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PatientForm from '../components/PatientForm.jsx'
import { createPatient } from '../api/patients.js'
import { toPatientPayload } from '../schemas/patient.js'

export default function PatientNew() {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState(null)

  const onSubmit = async (values) => {
    setServerError(null)
    try {
      const patient = await createPatient(toPatientPayload(values))
      navigate(`/patients/${patient._id}`, { replace: true })
    } catch (err) {
      setServerError(err.response?.data?.message ?? 'Something went wrong. Please try again.')
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
        Register Patient
      </h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        A patient ID is generated automatically once saved.
      </p>
      <PatientForm onSubmit={onSubmit} submitLabel="Register Patient" serverError={serverError} />
    </div>
  )
}
