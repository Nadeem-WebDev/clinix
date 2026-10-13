import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { AlertTriangle, ListPlus } from 'lucide-react'
import Modal from './Modal.jsx'
import Button from './Button.jsx'
import PatientPicker from './PatientPicker.jsx'
import { listStaff } from '../api/staff.js'
import { createPatient } from '../api/patients.js'
import { addWalkIn, markArrived } from '../api/appointments.js'
import { walkInFormSchema, toQuickPatientPayload } from '../schemas/appointment.js'
import { GENDERS } from '../schemas/patient.js'

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'
const labelClass = 'mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300'
const errorClass = 'mt-1 text-xs text-red-600 dark:text-red-400'

const GENDER_LABELS = { male: 'Male', female: 'Female', other: 'Other' }

function emptyValues(doctorId) {
  return { mode: 'existing', patientId: '', fullName: '', phone: '', age: '', gender: '', doctorId: doctorId || '' }
}

// "Add walk-in to queue": a patient at the desk without a booking. One step -
// pick or quickly register the patient, pick the doctor - and they are in
// today's queue as WAITING with the next token. No date or time to fill in.
export default function WalkInModal({ open, onClose, onAdded, defaultDoctorId = '' }) {
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState(null)
  const [bookedTodayId, setBookedTodayId] = useState(null)
  const [selectedPatientLabel, setSelectedPatientLabel] = useState(null)

  const { data: staff } = useQuery({ queryKey: ['staff'], queryFn: listStaff, enabled: open })
  const doctors = useMemo(() => (staff ?? []).filter((u) => u.role === 'doctor' && u.active), [staff])

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(walkInFormSchema), defaultValues: emptyValues(defaultDoctorId) })
  const mode = watch('mode')

  // Fresh form every time it opens, starting on whichever doctor the queue
  // is filtered to.
  useEffect(() => {
    if (!open) return
    reset(emptyValues(defaultDoctorId))
    setServerError(null)
    setBookedTodayId(null)
    setSelectedPatientLabel(null)
  }, [open, defaultDoctorId, reset])

  // A single-doctor clinic shouldn't have to pick the doctor every time.
  useEffect(() => {
    if (open && doctors.length === 1 && !getValues('doctorId')) setValue('doctorId', doctors[0]._id)
  }, [open, doctors, getValues, setValue])

  const finish = (appointment) => {
    queryClient.invalidateQueries({ queryKey: ['queue'] })
    queryClient.invalidateQueries({ queryKey: ['appointments'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    onAdded?.(appointment)
    onClose()
  }

  const arriveMutation = useMutation({ mutationFn: markArrived, onSuccess: finish })

  const onSubmit = async (values) => {
    setServerError(null)
    setBookedTodayId(null)
    try {
      let { patientId } = values
      if (values.mode === 'new') {
        const patient = await createPatient(toQuickPatientPayload(values))
        patientId = patient._id
        queryClient.invalidateQueries({ queryKey: ['patients'] })
        // Switch to "existing" with this patient selected, so a retry after
        // a failed queue step never registers the same person twice.
        setValue('mode', 'existing')
        setValue('patientId', patient._id)
        setSelectedPatientLabel(`${patient.fullName} (${patient.patientId})`)
      }
      finish(await addWalkIn({ patientId, doctorId: values.doctorId }))
    } catch (err) {
      const body = err.response?.data
      if (body?.code === 'BOOKED_TODAY') setBookedTodayId(body.details?.appointmentId ?? null)
      setServerError(body?.message ?? 'Something went wrong. Please try again.')
    }
  }

  const modeButton = (value, label) => (
    <button
      type="button"
      aria-pressed={mode === value}
      onClick={() => setValue('mode', value, { shouldValidate: false })}
      className={clsx(
        'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        mode === value
          ? 'bg-blue-600 text-white'
          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800',
      )}
    >
      {label}
    </button>
  )

  return (
    <Modal open={open} onClose={onClose} title="Add walk-in to queue">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {serverError && (
          <div
            role="alert"
            className="space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
          >
            <p className="flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              {serverError}
            </p>
            {bookedTodayId && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => arriveMutation.mutate(bookedTodayId)}
                loading={arriveMutation.isPending}
              >
                Mark arrived instead
              </Button>
            )}
          </div>
        )}

        <div>
          <span className={labelClass}>Patient</span>
          <div className="mb-3 flex rounded-lg border border-gray-200 p-1 dark:border-gray-800">
            {modeButton('existing', 'Existing patient')}
            {modeButton('new', 'New patient')}
          </div>

          {mode === 'existing' ? (
            <>
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
              {errors.patientId && <p className={errorClass}>{errors.patientId.message}</p>}
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label htmlFor="walkin-fullName" className={labelClass}>
                  Full name
                </label>
                <input id="walkin-fullName" autoComplete="off" className={inputClass} {...register('fullName')} />
                {errors.fullName && <p className={errorClass}>{errors.fullName.message}</p>}
              </div>
              <div className="col-span-2">
                <label htmlFor="walkin-phone" className={labelClass}>
                  Phone
                </label>
                <input id="walkin-phone" type="tel" autoComplete="off" className={inputClass} {...register('phone')} />
                {errors.phone && <p className={errorClass}>{errors.phone.message}</p>}
              </div>
              <div>
                <label htmlFor="walkin-age" className={labelClass}>
                  Age
                </label>
                <input id="walkin-age" type="number" inputMode="numeric" min="0" className={inputClass} {...register('age')} />
                {errors.age && <p className={errorClass}>{errors.age.message}</p>}
              </div>
              <div>
                <label htmlFor="walkin-gender" className={labelClass}>
                  Gender
                </label>
                <select id="walkin-gender" className={inputClass} {...register('gender')}>
                  <option value="">Select…</option>
                  {GENDERS.map((g) => (
                    <option key={g} value={g}>
                      {GENDER_LABELS[g] ?? g}
                    </option>
                  ))}
                </select>
                {errors.gender && <p className={errorClass}>{errors.gender.message}</p>}
              </div>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="walkin-doctorId" className={labelClass}>
            Doctor
          </label>
          <select id="walkin-doctorId" className={inputClass} {...register('doctorId')}>
            <option value="">Select a doctor…</option>
            {doctors.map((doctor) => (
              <option key={doctor._id} value={doctor._id}>
                Dr. {doctor.name}
              </option>
            ))}
          </select>
          {errors.doctorId && <p className={errorClass}>{errors.doctorId.message}</p>}
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          They join today&rsquo;s queue straight away with the next token &mdash; no time slot needed.
        </p>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            <ListPlus size={16} aria-hidden="true" />
            Add to queue
          </Button>
        </div>
      </form>
    </Modal>
  )
}
