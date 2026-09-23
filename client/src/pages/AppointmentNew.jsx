import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import Button from '../components/Button.jsx'
import PatientPicker from '../components/PatientPicker.jsx'
import { listStaff } from '../api/staff.js'
import { createAppointment } from '../api/appointments.js'
import { appointmentFormSchema, toAppointmentPayload, todayDateStr, nowTimeStr } from '../schemas/appointment.js'

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'

export default function AppointmentNew() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isWalkIn = searchParams.get('walkin') === '1'
  const [serverError, setServerError] = useState(null)
  const [selectedPatientLabel, setSelectedPatientLabel] = useState(null)

  const { data: staff } = useQuery({ queryKey: ['staff'], queryFn: listStaff })
  const doctors = (staff ?? []).filter((u) => u.role === 'doctor' && u.active)

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(appointmentFormSchema),
    defaultValues: {
      patientId: '',
      doctorId: '',
      date: todayDateStr(),
      time: isWalkIn ? nowTimeStr() : '',
      durationMinutes: '',
      notes: '',
      isWalkIn,
    },
  })

  const onSubmit = async (values) => {
    setServerError(null)
    try {
      await createAppointment(toAppointmentPayload(values))
      navigate('/appointments', { replace: true })
    } catch (err) {
      setServerError(err.response?.data?.message ?? 'Something went wrong. Please try again.')
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-xl font-semibold text-gray-900 dark:text-gray-100">
        {isWalkIn ? 'Walk-in Patient' : 'Book Appointment'}
      </h1>

      {serverError && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Patient
          </label>
          <Controller
            control={control}
            name="patientId"
            render={({ field }) => (
              <PatientPicker
                value={field.value}
                selectedLabel={selectedPatientLabel}
                onChange={(id, patient) => {
                  field.onChange(id)
                  setSelectedPatientLabel(patient ? `${patient.fullName} (${patient.patientId})` : null)
                }}
              />
            )}
          />
          {errors.patientId && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.patientId.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="doctorId" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Doctor
          </label>
          <select id="doctorId" className={inputClass} {...register('doctorId')}>
            <option value="">Select a doctor…</option>
            {doctors.map((doctor) => (
              <option key={doctor._id} value={doctor._id}>
                Dr. {doctor.name}
              </option>
            ))}
          </select>
          {errors.doctorId && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.doctorId.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="date" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Date
            </label>
            <input id="date" type="date" className={inputClass} {...register('date')} />
            {errors.date && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.date.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="time" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Time
            </label>
            <input id="time" type="time" className={inputClass} {...register('time')} />
            {errors.time && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.time.message}</p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="durationMinutes" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Duration (minutes, optional)
          </label>
          <input
            id="durationMinutes"
            type="number"
            min="5"
            placeholder="Clinic default"
            className={inputClass}
            {...register('durationMinutes')}
          />
        </div>

        <div>
          <label htmlFor="notes" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Notes
          </label>
          <textarea id="notes" rows={2} className={inputClass} {...register('notes')} />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" {...register('isWalkIn')} />
          Walk-in (no prior booking)
        </label>

        <Button type="submit" loading={isSubmitting}>
          {isWalkIn ? 'Register Walk-in' : 'Book Appointment'}
        </Button>
      </form>
    </div>
  )
}
