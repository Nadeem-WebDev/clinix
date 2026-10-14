import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PenLine, Plus, Trash2, X } from 'lucide-react'
import Modal from './Modal.jsx'
import Button from './Button.jsx'
import FormField from './FormField.jsx'
import LoadingState from './LoadingState.jsx'
import {
  listStaff,
  updateDoctorProfile,
  uploadDoctorSignature,
  removeDoctorSignature,
  fetchDoctorSignature,
} from '../api/staff.js'
import { getClinicSettings } from '../api/clinic.js'
import { useAuth } from '../context/AuthContext.jsx'
import {
  doctorProfileFormSchema,
  toDoctorProfileForm,
  toDoctorProfilePayload,
} from '../schemas/staff.js'
import { DAYS_OF_WEEK } from '../schemas/clinic.js'
import { DAY_LABELS } from '../utils/doctorHours.js'

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'

// The switch matches Clinic Settings' working hours (a styled sr-only
// checkbox). The time inputs always share a row: the dialog is phone-narrow
// even on a desktop, so no breakpoint widens them.
const timeInputClass =
  'min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:[color-scheme:dark]'
const switchTrackClass =
  "relative h-5 w-9 shrink-0 rounded-full bg-gray-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2 dark:bg-gray-600 dark:peer-checked:bg-blue-500 dark:peer-focus-visible:ring-offset-gray-900"

// Mirrors the server's rules (middleware/upload.js): PNG/JPG only, since
// the image is drawn straight into the prescription PDF.
const SIGNATURE_TYPES = ['image/png', 'image/jpeg']
const SIGNATURE_MAX_BYTES = 1024 * 1024

const errorMessage = (err) =>
  err.response?.data?.message ?? 'Something went wrong. Please try again.'

// The signature preview as a blob: URL (see fetchDoctorSignature for why
// it isn't a plain <img src>). Reloads when the upload time changes, and
// releases the previous object URL so replaced images don't pile up in
// memory. The CSP allows blob: images.
function useSignaturePreview(doctorId, version) {
  const [preview, setPreview] = useState({ src: null, failed: false })
  useEffect(() => {
    if (!version) {
      setPreview({ src: null, failed: false })
      return undefined
    }
    let cancelled = false
    let objectUrl = null
    fetchDoctorSignature(doctorId, version)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setPreview({ src: objectUrl, failed: false })
      })
      .catch(() => {
        if (!cancelled) setPreview({ src: null, failed: true })
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [doctorId, version])
  return preview
}

// The signature is saved as soon as a file is chosen (like the clinic
// logo); the text fields wait for Save.
function SignatureSection({ doctor, onUpdated }) {
  const fileInputRef = useRef(null)
  const [error, setError] = useState(null)
  const signature = doctor.doctorProfile?.signature
  const preview = useSignaturePreview(doctor._id, signature?.updatedAt)

  const onSuccess = (updated) => {
    setError(null)
    onUpdated(updated)
  }
  const onError = (err) => setError(errorMessage(err))
  const uploadMutation = useMutation({
    mutationFn: (file) => uploadDoctorSignature(doctor._id, file),
    onSuccess,
    onError,
  })
  const removeMutation = useMutation({
    mutationFn: () => removeDoctorSignature(doctor._id),
    onSuccess,
    onError,
  })
  const busy = uploadMutation.isPending || removeMutation.isPending

  const onFileChosen = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!SIGNATURE_TYPES.includes(file.type)) {
      setError('Only PNG and JPG images are allowed.')
      return
    }
    if (file.size > SIGNATURE_MAX_BYTES) {
      setError('That image is over 1MB. Please choose a smaller one.')
      return
    }
    uploadMutation.mutate(file)
  }

  return (
    <div>
      <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
        Signature
      </p>
      {/* Always a white box: a dark-ink signature must stay readable in dark mode. */}
      <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white px-3 dark:border-gray-700">
        {signature?.updatedAt ? (
          preview.src ? (
            <img
              src={preview.src}
              alt={`Signature of Dr. ${doctor.name}`}
              className="max-h-16 max-w-full object-contain"
            />
          ) : (
            <span className="text-sm text-gray-400">
              {preview.failed ? 'Signature saved, but the preview could not be loaded' : 'Loading signature…'}
            </span>
          )
        ) : (
          <span className="text-sm text-gray-400">No signature yet</span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={SIGNATURE_TYPES.join(',')}
          aria-label="Signature image file"
          className="sr-only"
          onChange={onFileChosen}
        />
        <Button
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          loading={uploadMutation.isPending}
          disabled={busy}
        >
          <PenLine size={16} aria-hidden="true" />
          {signature?.updatedAt ? 'Change signature' : 'Upload signature'}
        </Button>
        {signature?.updatedAt && (
          <Button
            variant="ghost"
            onClick={() => removeMutation.mutate()}
            loading={removeMutation.isPending}
            disabled={busy}
          >
            <Trash2 size={16} aria-hidden="true" />
            Remove
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        A photo or scan of the signature on white paper, PNG or JPG up to 1MB.
        It is printed only on finalized prescriptions, and only you and the
        clinic&apos;s owner/admin can see it here.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}

function TimeRange({ register, index, which, dayLabel }) {
  const [start, end] = which === 2 ? ['start2', 'end2'] : ['start', 'end']
  const label = which === 2 ? `${dayLabel} second session` : dayLabel
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <input
        type="time"
        aria-label={`${label} start time`}
        className={timeInputClass}
        {...register(`workingHours.${index}.${start}`)}
      />
      <span className="text-sm text-gray-400 dark:text-gray-500" aria-hidden="true">
        &ndash;
      </span>
      <input
        type="time"
        aria-label={`${label} end time`}
        className={timeInputClass}
        {...register(`workingHours.${index}.${end}`)}
      />
    </div>
  )
}

// The weekly timetable bookings are checked against. Off by default: a
// doctor without fixed hours can be booked at any time.
function WorkingHoursFields({ register, watch, setValue, errors, doctorName }) {
  const hasOwnHours = watch('hasOwnHours')
  return (
    // min-w-0: a fieldset otherwise refuses to shrink below its content,
    // pushing the time inputs off a 320px screen.
    <fieldset className="min-w-0">
      <legend className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Working hours</legend>
      <label className="flex cursor-pointer items-center gap-3 py-2 text-sm text-gray-700 dark:text-gray-300">
        <input type="checkbox" role="switch" className="peer sr-only" {...register('hasOwnHours')} />
        <span aria-hidden="true" className={switchTrackClass} />
        Fixed weekly hours
      </label>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {hasOwnHours
          ? 'Booking outside these hours asks the front desk to confirm first. Walk-ins are never blocked.'
          : `No fixed hours: Dr. ${doctorName} can be booked at any time.`}
      </p>
      {hasOwnHours && (
        <div className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
          {DAYS_OF_WEEK.map((day, index) => {
            const isAvailable = watch(`workingHours.${index}.isAvailable`)
            const split = watch(`workingHours.${index}.split`)
            const dayErrors = errors.workingHours?.[index]
            const dayError = dayErrors?.end ?? dayErrors?.start2 ?? dayErrors?.end2
            const setSplit = (value) =>
              setValue(`workingHours.${index}.split`, value, { shouldDirty: true, shouldValidate: Boolean(dayErrors) })
            return (
              <div key={day} className="py-2 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <label className="flex cursor-pointer items-center gap-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      role="switch"
                      className="peer sr-only"
                      {...register(`workingHours.${index}.isAvailable`)}
                    />
                    <span aria-hidden="true" className={switchTrackClass} />
                    {DAY_LABELS[day]}
                  </label>
                  {!isAvailable && (
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                      Off
                    </span>
                  )}
                </div>
                {isAvailable && (
                  // Every time row gets the full width - on a 360px phone
                  // anything beside it clips "AM"/"PM" off the times.
                  <div className="space-y-2">
                    <div className="flex">
                      <TimeRange register={register} index={index} which={1} dayLabel={DAY_LABELS[day]} />
                    </div>
                    {split ? (
                      <>
                        <div className="flex">
                          <TimeRange register={register} index={index} which={2} dayLabel={DAY_LABELS[day]} />
                        </div>
                        <button
                          type="button"
                          onClick={() => setSplit(false)}
                          aria-label={`Remove ${DAY_LABELS[day]} second session`}
                          className="inline-flex items-center gap-1 rounded py-1 text-xs font-medium text-gray-500 hover:underline dark:text-gray-400"
                        >
                          <X size={14} aria-hidden="true" />
                          Remove second session
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSplit(true)}
                        aria-label={`Add a second session on ${DAY_LABELS[day]}`}
                        className="inline-flex items-center gap-1 rounded py-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        <Plus size={14} aria-hidden="true" />
                        Second session
                      </button>
                    )}
                  </div>
                )}
                {isAvailable && dayError && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">{dayError.message}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </fieldset>
  )
}

// What a prescription prints about its doctor. Opened by the doctor
// (account menu) or an owner/admin (Staff page); the server enforces who
// may edit whom.
export default function DoctorProfileModal({ open, onClose, doctorId }) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  // The fee is the clinic's call; a doctor sees theirs but can't change it.
  const canEditFee = ['owner', 'admin'].includes(user?.role)
  const [serverError, setServerError] = useState(null)
  const [saved, setSaved] = useState(false)
  const { data: staff, isLoading } = useQuery({
    queryKey: ['staff'],
    queryFn: listStaff,
    enabled: open,
  })
  // For the fee hint and as the starting timetable. Not required: the form
  // falls back to Monday-Saturday 9-6 if it can't load.
  const { data: clinic, isLoading: clinicLoading } = useQuery({
    queryKey: ['clinic', 'settings'],
    queryFn: getClinicSettings,
    enabled: open,
  })
  const doctor = staff?.find((u) => u._id === doctorId)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    resolver: zodResolver(doctorProfileFormSchema),
    defaultValues: toDoctorProfileForm(),
  })

  // Load the form once per opening - not on every staff refetch, which
  // would wipe what the user is typing (e.g. after a signature upload).
  const loadedFor = useRef(null)
  useEffect(() => {
    if (!open) {
      loadedFor.current = null
      return
    }
    if (doctor && !clinicLoading && loadedFor.current !== doctor._id) {
      loadedFor.current = doctor._id
      reset(toDoctorProfileForm(doctor.doctorProfile, clinic))
      setServerError(null)
      setSaved(false)
    }
  }, [open, doctor, clinic, clinicLoading, reset])

  const replaceInStaff = (updated) => {
    queryClient.setQueryData(['staff'], (list) =>
      list?.map((u) => (u._id === updated._id ? updated : u)),
    )
  }

  const onSubmit = async (values) => {
    setServerError(null)
    setSaved(false)
    try {
      const updated = await updateDoctorProfile(doctorId, toDoctorProfilePayload(values, { canEditFee }))
      replaceInStaff(updated)
      reset(toDoctorProfileForm(updated.doctorProfile, clinic))
      setSaved(true)
    } catch (err) {
      setServerError(errorMessage(err))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Doctor profile">
      {isLoading || clinicLoading || !doctor ? (
        <LoadingState label="Loading profile…" />
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            The details are printed on Dr. {doctor.name}&apos;s
            prescriptions; leave blank anything you don&apos;t want shown.
            The fee and hours are used for bills and bookings.
          </p>
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="space-y-4"
          >
            <FormField
              name="qualifications"
              label="Qualifications"
              hint="For example: MBBS, MD (General Medicine)"
              error={errors.qualifications}
            >
              <input className={inputClass} {...register('qualifications')} />
            </FormField>
            <FormField
              name="specialization"
              label="Specialisation"
              error={errors.specialization}
            >
              <input
                className={inputClass}
                placeholder="General Physician"
                {...register('specialization')}
              />
            </FormField>
            <FormField
              name="registrationNumber"
              label="Registration number"
              error={errors.registrationNumber}
            >
              <input
                className={inputClass}
                {...register('registrationNumber')}
              />
            </FormField>
            <FormField
              name="registrationCouncil"
              label="Medical council"
              error={errors.registrationCouncil}
            >
              <input
                className={inputClass}
                placeholder="Maharashtra Medical Council"
                {...register('registrationCouncil')}
              />
            </FormField>
            <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
              <FormField
                name="consultationFee"
                label="Consultation fee (₹)"
                hint={
                  canEditFee
                    ? `Starts this doctor's bills. Leave blank to use the clinic's fee (₹${clinic?.defaultConsultationFee ?? 0}).`
                    : `Set by the clinic's owner or admin.${clinic ? ` Blank means the clinic's fee (₹${clinic.defaultConsultationFee ?? 0}).` : ''}`
                }
                error={errors.consultationFee}
              >
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  // readOnly, not disabled: react-hook-form drops a disabled
                  // field's value, which would fail validation on save.
                  readOnly={!canEditFee}
                  className={`${inputClass} read-only:cursor-not-allowed read-only:bg-gray-50 read-only:text-gray-500 dark:read-only:bg-gray-800/50 dark:read-only:text-gray-400`}
                  {...register('consultationFee')}
                />
              </FormField>
            </div>
            <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
              <WorkingHoursFields
                register={register}
                watch={watch}
                setValue={setValue}
                errors={errors}
                doctorName={doctor.name}
              />
            </div>
            {serverError && (
              <p
                role="alert"
                className="text-sm text-red-600 dark:text-red-400"
              >
                {serverError}
              </p>
            )}
            <div className="flex items-center justify-end gap-3">
              {saved && !isDirty && (
                <span
                  role="status"
                  className="text-sm text-green-700 dark:text-green-400"
                >
                  Saved
                </span>
              )}
              <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
                Save details
              </Button>
            </div>
          </form>

          <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
            <SignatureSection doctor={doctor} onUpdated={replaceInStaff} />
          </div>

          <div className="flex justify-end">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
