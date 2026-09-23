import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import Button from './Button.jsx'
import FormField from './FormField.jsx'
import { invoiceFormSchema, emptyInvoiceItem } from '../schemas/invoice.js'

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'

function money(n) {
  return (Number.isFinite(n) ? n : 0).toFixed(2)
}

export default function InvoiceForm({ defaultValues, onSubmit, submitLabel, serverError, readOnly }) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: defaultValues ?? { items: [{ ...emptyInvoiceItem }], discount: '', tax: '', notes: '' },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })

  // Client-side estimate only, for immediate feedback while typing - the
  // real total is always recomputed server-side and is the only one that
  // ever gets persisted (never trust a client-sent total).
  const watchedItems = useWatch({ control, name: 'items' })
  const watchedDiscount = useWatch({ control, name: 'discount' })
  const watchedTax = useWatch({ control, name: 'tax' })
  const subtotal = (watchedItems ?? []).reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
    0,
  )
  const total = Math.max(0, subtotal - (Number(watchedDiscount) || 0) + (Number(watchedTax) || 0))

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
          This invoice has payments recorded and can no longer be edited.
        </div>
      )}

      {errors.items?.root && (
        <p className="text-sm text-red-600 dark:text-red-400">{errors.items.root.message}</p>
      )}

      <fieldset disabled={readOnly} className="space-y-4">
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="w-20 px-3 py-2 font-medium">Qty</th>
                <th className="w-28 px-3 py-2 font-medium">Unit Price</th>
                <th className="w-28 px-3 py-2 font-medium">Amount</th>
                {!readOnly && <th className="w-10 px-3 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {fields.map((field, index) => {
                const qty = Number(watchedItems?.[index]?.quantity) || 0
                const price = Number(watchedItems?.[index]?.unitPrice) || 0
                return (
                  <tr key={field.id}>
                    <td className="px-3 py-2">
                      <input
                        aria-label={`Description (item ${index + 1})`}
                        className={inputClass}
                        {...register(`items.${index}.description`)}
                      />
                      {errors.items?.[index]?.description && (
                        <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">
                          {errors.items[index].description.message}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="1"
                        aria-label={`Quantity (item ${index + 1})`}
                        className={inputClass}
                        {...register(`items.${index}.quantity`)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        aria-label={`Unit price (item ${index + 1})`}
                        className={inputClass}
                        {...register(`items.${index}.unitPrice`)}
                      />
                    </td>
                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{money(qty * price)}</td>
                    {!readOnly && (
                      <td className="px-3 py-2">
                        {fields.length > 1 && (
                          <button
                            type="button"
                            onClick={() => remove(index)}
                            aria-label={`Remove item ${index + 1}`}
                            className="text-red-600 hover:text-red-700 dark:text-red-400"
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {!readOnly && (
          <Button variant="secondary" type="button" onClick={() => append({ ...emptyInvoiceItem })}>
            <Plus size={14} aria-hidden="true" />
            Add Item
          </Button>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField name="discount" label="Discount">
            <input type="number" min="0" step="0.01" className={inputClass} {...register('discount')} />
          </FormField>
          <FormField name="tax" label="Tax">
            <input type="number" min="0" step="0.01" className={inputClass} {...register('tax')} />
          </FormField>
        </div>

        <FormField name="notes" label="Notes">
          <textarea rows={2} className={inputClass} {...register('notes')} />
        </FormField>

        <div className="flex justify-end gap-8 border-t border-gray-200 pt-3 text-sm dark:border-gray-800">
          <div className="text-gray-500 dark:text-gray-400">Subtotal: {money(subtotal)}</div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">Total: {money(total)}</div>
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
