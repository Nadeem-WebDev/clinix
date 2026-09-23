import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Building2, Clock, Save, AlertTriangle, CheckCircle2, MessageCircle } from 'lucide-react'
import Button from '../components/Button.jsx'
import FormField from '../components/FormField.jsx'
import LoadingState from '../components/LoadingState.jsx'
import ErrorState from '../components/ErrorState.jsx'
import { getClinicSettings, updateClinicSettings } from '../api/clinic.js'
import { clinicSettingsFormSchema, fromClinic, toClinicPayload, DAYS_OF_WEEK } from '../schemas/clinic.js'

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'

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

  // Seed the form once the clinic loads (and again after a successful
  // save, so isDirty resets and the fields reflect what was actually saved).
  useEffect(() => {
    if (clinic) reset(fromClinic(clinic))
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

        <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">Clinic details</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField name="name" label="Clinic name" error={errors.name}>
              <input className={inputClass} {...register('name')} />
            </FormField>
            <FormField name="phone" label="Contact phone" error={errors.phone}>
              <input className={inputClass} {...register('phone')} />
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
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <Clock size={16} aria-hidden="true" />
            Working hours
          </h2>
          <div className="space-y-2">
            {DAYS_OF_WEEK.map((day, index) => {
              const isOpen = watch(`workingHours.${index}.isOpen`)
              const closeTimeError = errors.workingHours?.[index]?.closeTime
              return (
                <div
                  key={day}
                  className="flex flex-wrap items-center gap-3 border-b border-gray-100 py-2 last:border-0 dark:border-gray-800"
                >
                  <label className="flex w-32 shrink-0 items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-700"
                      {...register(`workingHours.${index}.isOpen`)}
                    />
                    {DAY_LABELS[day]}
                  </label>
                  <input
                    type="time"
                    disabled={!isOpen}
                    className={`${inputClass} w-32 disabled:opacity-50`}
                    {...register(`workingHours.${index}.openTime`)}
                  />
                  <span className="text-sm text-gray-400 dark:text-gray-500">to</span>
                  <input
                    type="time"
                    disabled={!isOpen}
                    className={`${inputClass} w-32 disabled:opacity-50`}
                    {...register(`workingHours.${index}.closeTime`)}
                  />
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

        <Button type="submit" loading={isSubmitting}>
          <Save size={16} aria-hidden="true" />
          Save Changes
        </Button>
      </form>
    </div>
  )
}
