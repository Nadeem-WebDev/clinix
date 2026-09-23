import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import Button from './Button.jsx'
import FormField from './FormField.jsx'
import { prescriptionFormSchema, emptyMedicine } from '../schemas/prescription.js'

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'

const MEDICINE_FIELDS = [
  { name: 'name', label: 'Medicine', placeholder: 'Paracetamol' },
  { name: 'dosage', label: 'Dosage', placeholder: '500mg' },
  { name: 'frequency', label: 'Frequency', placeholder: '1 - 0 - 1' },
  { name: 'route', label: 'Route', placeholder: 'Oral' },
  { name: 'timing', label: 'Timing', placeholder: 'After food' },
  { name: 'duration', label: 'Duration', placeholder: '3 days' },
  { name: 'quantity', label: 'Qty', placeholder: '10' },
]

export default function PrescriptionForm({ defaultValues, onSubmit, submitLabel, serverError, readOnly }) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(prescriptionFormSchema),
    defaultValues: defaultValues ?? { medicines: [{ ...emptyMedicine }], notes: '' },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'medicines' })

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
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
          This prescription is finalized and can no longer be edited.
        </div>
      )}

      {errors.medicines?.root && (
        <p className="text-sm text-red-600 dark:text-red-400">{errors.medicines.root.message}</p>
      )}

      <fieldset disabled={readOnly} className="space-y-4">
        <div className="space-y-3">
          {fields.map((field, index) => {
            const instructionsId = `medicines.${index}.instructions`
            return (
              <div
                key={field.id}
                className="rounded-lg border border-gray-200 p-3 dark:border-gray-800"
              >
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {MEDICINE_FIELDS.map(({ name, label, placeholder }) => {
                    const fieldId = `medicines.${index}.${name}`
                    return (
                      <div key={name}>
                        <label
                          htmlFor={fieldId}
                          className="mb-0.5 block text-xs font-medium text-gray-500 dark:text-gray-400"
                        >
                          {label}
                        </label>
                        <input
                          id={fieldId}
                          className={inputClass}
                          placeholder={placeholder}
                          {...register(fieldId)}
                        />
                        {errors.medicines?.[index]?.[name] && (
                          <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">
                            {errors.medicines[index][name].message}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div className="mt-2">
                  <label
                    htmlFor={instructionsId}
                    className="mb-0.5 block text-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    Instructions
                  </label>
                  <input
                    id={instructionsId}
                    className={inputClass}
                    placeholder="Take with plenty of water"
                    {...register(instructionsId)}
                  />
                </div>
                {fields.length > 1 && !readOnly && (
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="mt-2 flex items-center gap-1 text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                  >
                    <Trash2 size={12} aria-hidden="true" />
                    Remove
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {!readOnly && (
          <Button variant="secondary" type="button" onClick={() => append({ ...emptyMedicine })}>
            <Plus size={14} aria-hidden="true" />
            Add Medicine
          </Button>
        )}

        <FormField name="notes" label="Notes">
          <textarea rows={2} className={inputClass} {...register('notes')} />
        </FormField>

        {!readOnly && (
          <Button type="submit" loading={isSubmitting}>
            {submitLabel}
          </Button>
        )}
      </fieldset>
    </form>
  )
}
