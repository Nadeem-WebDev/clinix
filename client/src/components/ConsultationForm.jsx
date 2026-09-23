import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle } from 'lucide-react'
import Button from './Button.jsx'
import FormField from './FormField.jsx'
import { consultationFormSchema } from '../schemas/consultation.js'

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'

const VITAL_FIELDS = [
  { name: 'temperature', label: 'Temperature' },
  { name: 'bloodPressure', label: 'Blood Pressure' },
  { name: 'pulse', label: 'Pulse' },
  { name: 'respiratoryRate', label: 'Respiratory Rate' },
  { name: 'spo2', label: 'SpO2' },
  { name: 'weight', label: 'Weight' },
  { name: 'height', label: 'Height' },
]

export default function ConsultationForm({ defaultValues, onSubmit, submitLabel, serverError, readOnly }) {
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm({ resolver: zodResolver(consultationFormSchema), defaultValues })

  return (
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

      {readOnly && (
        <div className="rounded-lg bg-gray-100 p-3 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-400">
          This consultation is finalized (the appointment is complete) and can no longer be edited.
        </div>
      )}

      <fieldset disabled={readOnly} className="space-y-6">
        <FormField name="chiefComplaint" label="Chief Complaint" className="sm:col-span-2">
          <textarea rows={2} className={inputClass} {...register('chiefComplaint')} />
        </FormField>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Vitals</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {VITAL_FIELDS.map(({ name, label }) => (
              <FormField key={name} name={name} label={label}>
                <input className={inputClass} {...register(name)} />
              </FormField>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField name="symptoms" label="Symptoms" className="sm:col-span-2">
            <textarea rows={2} className={inputClass} {...register('symptoms')} />
          </FormField>
          <FormField name="examinationNotes" label="Examination Notes" className="sm:col-span-2">
            <textarea rows={2} className={inputClass} {...register('examinationNotes')} />
          </FormField>
          <FormField name="diagnosis" label="Diagnosis">
            <textarea rows={2} className={inputClass} {...register('diagnosis')} />
          </FormField>
          <FormField name="treatmentPlan" label="Treatment Plan">
            <textarea rows={2} className={inputClass} {...register('treatmentPlan')} />
          </FormField>
          <FormField name="doctorNotes" label="Doctor Notes" className="sm:col-span-2">
            <textarea rows={2} className={inputClass} {...register('doctorNotes')} />
          </FormField>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Follow-up</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField name="followUpDate" label="Follow-up Date">
              <input type="date" className={inputClass} {...register('followUpDate')} />
            </FormField>
            <FormField name="followUpInstructions" label="Follow-up Instructions">
              <input className={inputClass} {...register('followUpInstructions')} />
            </FormField>
          </div>
        </div>

        {!readOnly && (
          <Button type="submit" loading={isSubmitting}>
            {submitLabel}
          </Button>
        )}
      </fieldset>
    </form>
  )
}
