import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import ConsultationForm from '../components/ConsultationForm.jsx'
import PatientContextPanel from '../components/PatientContextPanel.jsx'
import PatientPicker from '../components/PatientPicker.jsx'
import { createConsultation } from '../api/consultations.js'
import { getAppointment } from '../api/appointments.js'
import { listStaff } from '../api/staff.js'
import { useAuth } from '../context/AuthContext.jsx'
import { toConsultationPayload } from '../schemas/consultation.js'

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'

export default function ConsultationNew() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const appointmentId = searchParams.get('appointmentId')
  const [serverError, setServerError] = useState(null)

  // Manual mode (no appointmentId): doctor/admin picks patient + doctor directly.
  const [manualPatient, setManualPatient] = useState(null)
  const [manualDoctorId, setManualDoctorId] = useState(user?.role === 'doctor' ? user._id : '')

  const { data: appointment, isLoading: loadingAppointment } = useQuery({
    queryKey: ['appointments', appointmentId],
    queryFn: () => getAppointment(appointmentId),
    enabled: Boolean(appointmentId),
  })
  const { data: staff } = useQuery({ queryKey: ['staff'], queryFn: listStaff, enabled: !appointmentId })
  const doctors = (staff ?? []).filter((u) => u.role === 'doctor')

  const patientId = appointmentId ? appointment?.patientId?._id : manualPatient?._id
  const doctorId = appointmentId ? appointment?.doctorId?._id : manualDoctorId

  const onSubmit = async (values) => {
    setServerError(null)
    if (!patientId || !doctorId) {
      setServerError('Select a patient and doctor first.')
      return
    }
    try {
      await createConsultation({
        patientId,
        doctorId,
        ...(appointmentId ? { appointmentId } : {}),
        ...toConsultationPayload(values),
      })
      navigate(`/patients/${patientId}`, { replace: true })
    } catch (err) {
      setServerError(err.response?.data?.message ?? 'Something went wrong. Please try again.')
    }
  }

  if (appointmentId && loadingAppointment) return null

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <h1 className="mb-6 text-xl font-semibold text-gray-900 dark:text-gray-100">New Consultation</h1>

        {!appointmentId && (
          <div className="mb-6 grid grid-cols-1 gap-4 rounded-xl border border-gray-200 p-4 dark:border-gray-800 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Patient
              </label>
              <PatientPicker
                value={manualPatient?._id}
                selectedLabel={manualPatient ? `${manualPatient.fullName} (${manualPatient.patientId})` : null}
                onChange={(_id, patient) => setManualPatient(patient)}
              />
            </div>
            <div>
              <label htmlFor="doctorId" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Doctor
              </label>
              <select
                id="doctorId"
                className={inputClass}
                value={manualDoctorId}
                onChange={(e) => setManualDoctorId(e.target.value)}
              >
                <option value="">Select a doctor…</option>
                {doctors.map((d) => (
                  <option key={d._id} value={d._id}>
                    Dr. {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <ConsultationForm
          key={patientId ?? 'empty'}
          defaultValues={{}}
          onSubmit={onSubmit}
          submitLabel="Save Consultation"
          serverError={serverError}
        />
      </div>

      <div>{patientId && <PatientContextPanel patientId={patientId} />}</div>
    </div>
  )
}
