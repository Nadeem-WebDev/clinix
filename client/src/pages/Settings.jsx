import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Building2,
  Clock,
  Save,
  AlertTriangle,
  CheckCircle2,
  MessageCircle,
  Mail,
  Copy,
  ExternalLink,
  ImageUp,
  Trash2,
} from 'lucide-react'
import Button from '../components/Button.jsx'
import FormField from '../components/FormField.jsx'
import LoadingState from '../components/LoadingState.jsx'
import ErrorState from '../components/ErrorState.jsx'
import { getClinicSettings, updateClinicSettings, uploadClinicLogo, removeClinicLogo } from '../api/clinic.js'
import { clinicSettingsFormSchema, fromClinic, toClinicPayload, DAYS_OF_WEEK, timeZoneOptions } from '../schemas/clinic.js'

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'

// The shared inputClass carries w-full, which beats a narrower width class,
// so time inputs get their own sizing: two fill one row on a phone, fixed
// width from sm up. color-scheme:dark makes the browser's native clock icon
// light in dark mode instead of black-on-dark.
const timeInputClass =
  'min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:[color-scheme:dark] sm:w-36 sm:flex-none'

// Visual track + knob for the sr-only checkbox before it (peer). The real
// input stays a native checkbox so react-hook-form's register() works as-is.
const switchTrackClass =
  "relative h-5 w-9 shrink-0 rounded-full bg-gray-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2 dark:bg-gray-600 dark:peer-checked:bg-blue-500 dark:peer-focus-visible:ring-offset-gray-900"

// Mirrors the server's image rules (middleware/upload.js) so a wrong file is
// caught before the upload starts; the server still enforces them.
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const LOGO_MAX_BYTES = 2 * 1024 * 1024

function ClinicLogoSection({ clinic }) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef(null)
  const [error, setError] = useState(null)

  const onSuccess = (updated) => {
    setError(null)
    queryClient.setQueryData(['clinic', 'settings'], updated)
  }
  const onError = (err) => setError(err.response?.data?.message ?? 'Something went wrong. Please try again.')

  const uploadMutation = useMutation({ mutationFn: uploadClinicLogo, onSuccess, onError })
  const removeMutation = useMutation({ mutationFn: removeClinicLogo, onSuccess, onError })
  const busy = uploadMutation.isPending || removeMutation.isPending

  const onFileChosen = (event) => {
    const file = event.target.files?.[0]
    // Reset so choosing the same file again still fires onChange.
    event.target.value = ''
    if (!file) return
    if (!LOGO_TYPES.includes(file.type)) {
      setError('Only PNG, JPG, and WebP images are allowed.')
      return
    }
    if (file.size > LOGO_MAX_BYTES) {
      setError('That image is over 2MB. Please choose a smaller one.')
      return
    }
    uploadMutation.mutate(file)
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
        <ImageUp size={16} aria-hidden="true" />
        Clinic logo
      </h2>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Shown beside your clinic name in the app and on the patient queue screen. Changes apply
        straight away &mdash; no need to press Save.
      </p>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700">
          {clinic?.logoUrl ? (
            <img src={clinic.logoUrl} alt={`${clinic.name} logo`} className="h-full w-full object-contain p-1.5" />
          ) : (
            <span aria-hidden="true" className="text-2xl font-semibold text-gray-300">
              {(clinic?.name ?? '?').trim().charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={LOGO_TYPES.join(',')}
              aria-label="Clinic logo file"
              className="sr-only"
              onChange={onFileChosen}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              loading={uploadMutation.isPending}
              disabled={busy}
            >
              <ImageUp size={16} aria-hidden="true" />
              {clinic?.logoUrl ? 'Change logo' : 'Upload logo'}
            </Button>
            {clinic?.logoUrl && (
              <Button
                type="button"
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
          <p className="text-xs text-gray-500 dark:text-gray-400">
            PNG, JPG or WebP, up to 2MB. A square image with a transparent or white background works best.
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  )
}

const DAY_LABELS = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

export default function Settings() {
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  const {
    data: clinic,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['clinic', 'settings'],
    queryFn: getClinicSettings,
  })

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(clinicSettingsFormSchema) })

  // Shows what "now" is in the chosen zone, so a wrong pick is obvious.
  const selectedTimezone = watch('timezone')
  let timezoneHint = 'Decides which day counts as "today" for the queue, token numbers, dashboard and reports.'
  if (selectedTimezone) {
    try {
      const now = new Intl.DateTimeFormat(undefined, {
        timeZone: selectedTimezone,
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date())
      timezoneHint = `It is ${now} there. ${timezoneHint}`
    } catch {
      // Unknown to this browser - the server still validates it on save.
    }
  }

  // Seed the form once the clinic loads (and again after a successful
  // save, so isDirty resets and the fields reflect what was actually saved).
  // keepDirtyValues: a logo upload also replaces the cached clinic, and must
  // not wipe edits the user has typed but not saved yet.
  useEffect(() => {
    if (clinic) reset(fromClinic(clinic), { keepDirtyValues: true })
  }, [clinic, reset])

  const mutation = useMutation({
    mutationFn: updateClinicSettings,
    onSuccess: (updated) => {
      queryClient.setQueryData(['clinic', 'settings'], updated)
      reset(fromClinic(updated))
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  const onSubmit = async (values) => {
    setServerError(null)
    try {
      await mutation.mutateAsync(toClinicPayload(values))
    } catch (err) {
      setServerError(err.response?.data?.message ?? 'Something went wrong. Please try again.')
    }
  }

  const publicQueueUrl = clinic?.slug ? `${window.location.origin}/q/${clinic.slug}` : ''

  const copyPublicQueueUrl = async () => {
    await navigator.clipboard.writeText(publicQueueUrl)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 3000)
  }

  if (isLoading) return <LoadingState label="Loading clinic settings…" />
  if (isError) return <ErrorState onRetry={refetch} />

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-gray-100">
        <Building2 size={22} aria-hidden="true" />
        Clinic Settings
      </h1>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        {serverError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            {serverError}
          </div>
        )}
        {saved && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-300"
          >
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            Clinic settings saved.
          </div>
        )}

        <ClinicLogoSection clinic={clinic} />

        <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">Clinic details</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField name="name" label="Clinic name" error={errors.name}>
              <input className={inputClass} {...register('name')} />
            </FormField>
            <FormField name="phone" label="Contact phone" error={errors.phone}>
              <input className={inputClass} {...register('phone')} />
            </FormField>
            <FormField
              name="email"
              label="Contact email"
              hint="Printed on prescriptions and bills. Patients' replies to notification emails come here."
              error={errors.email}
              className="sm:col-span-2"
            >
              <input type="email" className={inputClass} {...register('email')} />
            </FormField>
            <FormField name="address" label="Address" error={errors.address} className="sm:col-span-2">
              <input className={inputClass} {...register('address')} />
            </FormField>
            <FormField
              name="defaultConsultationFee"
              label="Default consultation fee"
              error={errors.defaultConsultationFee}
            >
              <input type="number" min="0" step="0.01" className={inputClass} {...register('defaultConsultationFee')} />
            </FormField>
            <FormField
              name="timezone"
              label="Time zone"
              error={errors.timezone}
              className="sm:col-span-2"
              hint={timezoneHint}
            >
              <select className={inputClass} {...register('timezone')}>
                {timeZoneOptions(clinic?.timezone).map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <Clock size={16} aria-hidden="true" />
            Working hours
          </h2>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {DAYS_OF_WEEK.map((day, index) => {
              const isOpen = watch(`workingHours.${index}.isOpen`)
              const closeTimeError = errors.workingHours?.[index]?.closeTime
              return (
                <div key={day} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
                  <label className="flex flex-1 cursor-pointer items-center gap-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 sm:w-40 sm:flex-none">
                    <input
                      type="checkbox"
                      role="switch"
                      className="peer sr-only"
                      {...register(`workingHours.${index}.isOpen`)}
                    />
                    <span aria-hidden="true" className={switchTrackClass} />
                    {DAY_LABELS[day]}
                  </label>
                  {/* Closed days unmount their time inputs rather than disabling
                      them - react-hook-form keeps the stored times either way,
                      so reopening a day restores its previous hours. */}
                  {isOpen ? (
                    <div className="flex w-full items-center gap-2 sm:w-auto">
                      <input
                        type="time"
                        aria-label={`${DAY_LABELS[day]} opening time`}
                        className={timeInputClass}
                        {...register(`workingHours.${index}.openTime`)}
                      />
                      <span className="text-sm text-gray-400 dark:text-gray-500" aria-hidden="true">
                        &ndash;
                      </span>
                      <input
                        type="time"
                        aria-label={`${DAY_LABELS[day]} closing time`}
                        className={timeInputClass}
                        {...register(`workingHours.${index}.closeTime`)}
                      />
                    </div>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                      Closed
                    </span>
                  )}
                  {closeTimeError && (
                    <p className="w-full text-xs text-red-600 dark:text-red-400">{closeTimeError.message}</p>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <MessageCircle size={16} aria-hidden="true" />
            WhatsApp notifications
          </h2>

          <label
            htmlFor="whatsappEnabled"
            className="flex items-start gap-3 text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            <input
              id="whatsappEnabled"
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-700"
              {...register('whatsappEnabled')}
            />
            <span>
              Send appointment and queue updates to patients on WhatsApp
              <span className="mt-1 block font-normal text-gray-500 dark:text-gray-400">
                Covers booking confirmations, queue updates, day-before reminders, and
                &ldquo;your prescription/receipt is ready&rdquo; notices. Patients who reply STOP are
                opted out automatically and will not be messaged again.
              </span>
            </span>
          </label>

          {/* No credential fields here, deliberately: the WhatsApp Business
              number, access token and message templates are approved by Meta
              and configured at the platform level. A clinic cannot
              self-configure them, so offering inputs would imply otherwise. */}
          <p className="mt-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
            The WhatsApp Business number and message templates are configured and approved
            centrally, not per clinic. If this toggle is on but messages aren&rsquo;t arriving,
            contact support &mdash; it usually means template approval is still pending.
          </p>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <Mail size={16} aria-hidden="true" />
            Email notifications
          </h2>

          <label
            htmlFor="emailEnabled"
            className="flex items-start gap-3 text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            <input
              id="emailEnabled"
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-700"
              {...register('emailEnabled')}
            />
            <span>
              Send appointment and queue updates to patients by email
              <span className="mt-1 block font-normal text-gray-500 dark:text-gray-400">
                The same messages as WhatsApp - booking confirmations, queue updates, day-before
                reminders, and &ldquo;your prescription/receipt is ready&rdquo; - to patients who have an
                email address on file. Every email has an unsubscribe link; patients who use it
                won&rsquo;t be emailed again.
              </span>
            </span>
          </label>

          <p className="mt-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
            Emails are sent in your clinic&rsquo;s name from Clinix&rsquo;s email service. Replies go to
            the contact email above, so fill it in. If this is on but emails aren&rsquo;t arriving,
            contact support.
          </p>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-1 text-sm font-semibold text-gray-900 dark:text-gray-100">Patient queue link</h2>
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            Share this link with patients so they can check your live queue without signing in.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              aria-label="Patient queue link"
              readOnly
              value={publicQueueUrl}
              className={`${inputClass} min-w-0 flex-1 bg-gray-50 dark:bg-gray-800/60`}
            />
            <Button type="button" variant="secondary" onClick={copyPublicQueueUrl} disabled={!publicQueueUrl}>
              <Copy size={16} aria-hidden="true" />
              {linkCopied ? 'Copied' : 'Copy link'}
            </Button>
            <a
              href={publicQueueUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Open patient queue link"
              className="inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <ExternalLink size={16} aria-hidden="true" />
              Open
            </a>
          </div>
          {linkCopied && <p role="status" className="mt-2 text-xs text-green-600 dark:text-green-400">Link copied.</p>}
        </section>

        <Button type="submit" loading={isSubmitting}>
          <Save size={16} aria-hidden="true" />
          Save Changes
        </Button>
      </form>
    </div>
  )
}
