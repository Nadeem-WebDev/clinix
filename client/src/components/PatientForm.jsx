import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle } from 'lucide-react'
import Button from './Button.jsx'
import FormField from './FormField.jsx'
import { patientFormSchema, GENDERS, BLOOD_GROUPS } from '../schemas/patient.js'

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'

export default function PatientForm({ defaultValues, onSubmit, submitLabel, serverError }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(patientFormSchema), defaultValues })

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField name="fullName" label="Full name" error={errors.fullName}>
          <input className={inputClass} {...register('fullName')} />
        </FormField>
        <FormField name="phone" label="Phone" error={errors.phone}>
          <input className={inputClass} {...register('phone')} />
        </FormField>
        <FormField name="dob" label="Date of birth" error={errors.dob}>
          <input type="date" className={inputClass} {...register('dob')} />
        </FormField>
        <FormField name="age" label="Age (if DOB unknown)" error={errors.age}>
          <input type="number" min="0" max="150" className={inputClass} {...register('age')} />
        </FormField>
        <FormField name="gender" label="Gender" error={errors.gender}>
          <select className={inputClass} {...register('gender')}>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {g[0].toUpperCase() + g.slice(1)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField name="bloodGroup" label="Blood group" error={errors.bloodGroup}>
          <select className={inputClass} {...register('bloodGroup')}>
            {BLOOD_GROUPS.map((bg) => (
              <option key={bg} value={bg}>
                {bg === 'unknown' ? 'Unknown' : bg}
              </option>
            ))}
          </select>
        </FormField>
        <FormField name="email" label="Email" error={errors.email}>
          <input type="email" className={inputClass} {...register('email')} />
        </FormField>
        <FormField name="address" label="Address" error={errors.address}>
          <input className={inputClass} {...register('address')} />
        </FormField>
        <FormField name="emergencyContactName" label="Emergency contact name" error={errors.emergencyContactName}>
          <input className={inputClass} {...register('emergencyContactName')} />
        </FormField>
        <FormField name="emergencyContactPhone" label="Emergency contact phone" error={errors.emergencyContactPhone}>
          <input className={inputClass} {...register('emergencyContactPhone')} />
        </FormField>
      </div>

      <FormField name="allergies" label="Allergies (comma-separated)" error={errors.allergies}>
        <input className={inputClass} placeholder="Penicillin, Peanuts" {...register('allergies')} />
      </FormField>
      <FormField name="medicalConditions" label="Existing medical conditions (comma-separated)" error={errors.medicalConditions}>
        <input className={inputClass} placeholder="Diabetes, Hypertension" {...register('medicalConditions')} />
      </FormField>
      <FormField name="medicalHistory" label="Basic medical history" error={errors.medicalHistory}>
        <textarea rows={3} className={inputClass} {...register('medicalHistory')} />
      </FormField>
      <FormField name="notes" label="Notes" error={errors.notes}>
        <textarea rows={2} className={inputClass} {...register('notes')} />
      </FormField>

      <Button type="submit" loading={isSubmitting}>
        {submitLabel}
      </Button>
    </form>
  )
}
