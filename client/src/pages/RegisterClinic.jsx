import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Building2, AlertTriangle } from 'lucide-react'
import ThemeToggle from '../components/ThemeToggle.jsx'
import Button from '../components/Button.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { registerClinicSchema } from '../schemas/auth.js'
import apiClient from '../api/client.js'
import { useQueryClient } from '@tanstack/react-query'

const FIELDS = [
  { name: 'clinicName', label: 'Clinic name', type: 'text', autoComplete: 'organization' },
  { name: 'adminName', label: 'Your name', type: 'text', autoComplete: 'name' },
  { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
  { name: 'password', label: 'Password', type: 'password', autoComplete: 'new-password' },
]

export default function RegisterClinic() {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm({ resolver: zodResolver(registerClinicSchema) })

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  const onSubmit = async (values) => {
    try {
      const { data } = await apiClient.post('/auth/register-clinic', values)
      queryClient.setQueryData(['auth', 'me'], data.data.user)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError('root', {
        message:
          err.response?.data?.message ?? 'Something went wrong. Please try again.',
      })
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-6 flex flex-col items-center gap-2">
          <Building2 size={28} className="text-blue-600" aria-hidden="true" />
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Set up your clinic
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Creates your clinic and your owner account
          </p>
        </div>

        {errors.root && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            {errors.root.message}
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          {FIELDS.map(({ name, label, type, autoComplete }) => (
            <div key={name}>
              <label
                htmlFor={name}
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                {label}
              </label>
              <input
                id={name}
                type={type}
                autoComplete={autoComplete}
                aria-invalid={Boolean(errors[name])}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                {...register(name)}
              />
              {errors[name] && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {errors[name].message}
                </p>
              )}
            </div>
          ))}
          <Button type="submit" className="w-full" loading={isSubmitting}>
            Create clinic
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
