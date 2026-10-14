import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Clock } from 'lucide-react'
import Button from '../components/Button.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import BackButton from '../components/BackButton.jsx'
import PatientPicker from '../components/PatientPicker.jsx'
import { listStaff } from '../api/staff.js'
import { createAppointment } from '../api/appointments.js'
import { appointmentFormSchema, toAppointmentPayload, todayDateStr } from '../schemas/appointment.js'
import { DAY_LABELS, fitsHours, formatSessions, sessionsOn, weekdayOf } from '../utils/doctorHours.js'

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'

export default function AppointmentNew() {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState(null)
  const [selectedPatientLabel, setSelectedPatientLabel] = useState(null)
  // Set when the server says the time is outside the doctor's hours: the
  // booking waits for "Book anyway".
  const [outsideHours, setOutsideHours] = useState(null) // { payload, message }
  const [confirming, setConfirming] = useState(false)

  const { data: staff } = useQuery({ queryKey: ['staff'], queryFn: listStaff })
  const doctors = (staff ?? []).filter((u) => u.role === 'doctor' && u.active)

  const {
    control,
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(appointmentFormSchema),
    defaultValues: {
      patientId: '',
      doctorId: '',
      date: todayDateStr(),
      time: '',
      durationMinutes: '',
      notes: '',
    },
  })

  const [doctorId, date, time, durationMinutes] = watch(['doctorId', 'date', 'time', 'durationMinutes'])
  const doctor = doctors.find((d) => d._id === doctorId)
  const sessions = sessionsOn(doctor, date)
  // An early hint only (the clinic's default length isn't known here); the
  // server's check, on the real length, decides.
  const timeOutside = Boolean(sessions?.length) && !fitsHours(sessions, time, Number(durationMinutes) || 0)

  const book = async (payload) => {
    try {
      await createAppointment(payload)
      navigate('/appointments', { replace: true })
    } catch (err) {
      const body = err.response?.data
      if (body?.code === 'OUTSIDE_WORKING_HOURS' && !payload.allowOutsideHours) {
        setOutsideHours({ payload, message: body.message })
        return
      }
      setServerError(body?.message ?? 'Something went wrong. Please try again.')
    }
  }

  const onSubmit = async (values) => {
    setServerError(null)
    await book(toAppointmentPayload(values))
  }

  const bookAnyway = async () => {
    setConfirming(true)
    await book({ ...outsideHours.payload, allowOutsideHours: true })
    setConfirming(false)
    setOutsideHours(null)
  }

  return (
    <div className="mx-auto max-w-lg">
      <BackButton />
      <h1 className="mb-6 text-xl font-semibold text-gray-900 dark:text-gray-100">
        Book Appointment
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
          {sessions && (
            <p
              className={`mt-1 flex items-start gap-1.5 text-xs ${
                sessions.length ? 'text-gray-500 dark:text-gray-400' : 'text-amber-700 dark:text-amber-400'
              }`}
            >
              <Clock size={14} className="mt-px shrink-0" aria-hidden="true" />
              {sessions.length
                ? `Dr. ${doctor.name} sees patients ${formatSessions(sessions)} on ${DAY_LABELS[weekdayOf(date)]}s.`
                : `Dr. ${doctor.name} doesn't see patients on ${DAY_LABELS[weekdayOf(date)]}s.`}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            {!errors.time && time && timeOutside && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                Outside Dr. {doctor.name}&apos;s hours.
              </p>
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

        <Button type="submit" loading={isSubmitting}>
          Book Appointment
        </Button>
      </form>

      <ConfirmDialog
        open={Boolean(outsideHours)}
        title="Book outside working hours?"
        description={`${outsideHours?.message ?? ''} Book this appointment anyway?`}
        confirmLabel="Book anyway"
        variant="primary"
        loading={confirming}
        onConfirm={bookAnyway}
        onCancel={() => setOutsideHours(null)}
      />
    </div>
  )
}
