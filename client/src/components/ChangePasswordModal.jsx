import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2 } from 'lucide-react'
import Modal from './Modal.jsx'
import Button from './Button.jsx'
import FormField from './FormField.jsx'
import { changePassword } from '../api/auth.js'
import { changePasswordSchema } from '../schemas/auth.js'

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'

const EMPTY = { currentPassword: '', newPassword: '', confirmPassword: '' }

// Any signed-in user changes their own password. The server keeps this
// session signed in and signs out every other device using the account.
export default function ChangePasswordModal({ open, onClose }) {
  const [serverError, setServerError] = useState(null)
  const [done, setDone] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: EMPTY,
  })

  useEffect(() => {
    if (!open) return
    reset(EMPTY)
    setServerError(null)
    setDone(false)
  }, [open, reset])

  const onSubmit = async (values) => {
    setServerError(null)
    try {
      await changePassword(values)
      setDone(true)
    } catch (err) {
      const body = err.response?.data
      if (body?.code === 'WRONG_PASSWORD') {
        setError(
          'currentPassword',
          { message: 'Current password is incorrect' },
          { shouldFocus: true },
        )
      } else {
        setServerError(
          body?.message ?? 'Could not change the password. Please try again.',
        )
      }
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Change password">
      {done ? (
        <div className="space-y-4">
          <p
            role="status"
            className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
          >
            <CheckCircle2
              size={18}
              className="mt-0.5 shrink-0 text-green-600 dark:text-green-400"
              aria-hidden="true"
            />
            Password changed. Any other device signed in to this account has
            been signed out.
          </p>
          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="space-y-4"
        >
          <FormField
            name="currentPassword"
            label="Current password"
            error={errors.currentPassword}
          >
            <input
              type="password"
              autoComplete="current-password"
              className={inputClass}
              {...register('currentPassword')}
            />
          </FormField>
          <FormField
            name="newPassword"
            label="New password"
            hint="At least 8 characters."
            error={errors.newPassword}
          >
            <input
              type="password"
              autoComplete="new-password"
              className={inputClass}
              {...register('newPassword')}
            />
          </FormField>
          <FormField
            name="confirmPassword"
            label="Confirm new password"
            error={errors.confirmPassword}
          >
            <input
              type="password"
              autoComplete="new-password"
              className={inputClass}
              {...register('confirmPassword')}
            />
          </FormField>
          {serverError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {serverError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Change password
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
