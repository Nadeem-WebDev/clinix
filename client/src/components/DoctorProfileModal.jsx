import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PenLine, Trash2 } from 'lucide-react'
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
import {
  doctorProfileFormSchema,
  toDoctorProfileForm,
} from '../schemas/staff.js'

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'

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

// What a prescription prints about its doctor. Opened by the doctor
// (account menu) or an owner/admin (Staff page); the server enforces who
// may edit whom.
export default function DoctorProfileModal({ open, onClose, doctorId }) {
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState(null)
  const [saved, setSaved] = useState(false)
  const { data: staff, isLoading } = useQuery({
    queryKey: ['staff'],
    queryFn: listStaff,
    enabled: open,
  })
  const doctor = staff?.find((u) => u._id === doctorId)

  const {
    register,
    handleSubmit,
    reset,
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
    if (doctor && loadedFor.current !== doctor._id) {
      loadedFor.current = doctor._id
      reset(toDoctorProfileForm(doctor.doctorProfile))
      setServerError(null)
      setSaved(false)
    }
  }, [open, doctor, reset])

  const replaceInStaff = (updated) => {
    queryClient.setQueryData(['staff'], (list) =>
      list?.map((u) => (u._id === updated._id ? updated : u)),
    )
  }

  const onSubmit = async (values) => {
    setServerError(null)
    setSaved(false)
    try {
      const updated = await updateDoctorProfile(doctorId, values)
      replaceInStaff(updated)
      reset(toDoctorProfileForm(updated.doctorProfile))
      setSaved(true)
    } catch (err) {
      setServerError(errorMessage(err))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Doctor profile">
      {isLoading || !doctor ? (
        <LoadingState label="Loading profile…" />
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Printed on Dr. {doctor.name}&apos;s prescriptions. Leave blank
            anything you don&apos;t want shown.
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
