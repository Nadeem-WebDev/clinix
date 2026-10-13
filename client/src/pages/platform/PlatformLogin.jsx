import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import ClinixLogo from '../../components/ClinixLogo.jsx'
import ThemeToggle from '../../components/ThemeToggle.jsx'
import Button from '../../components/Button.jsx'
import FormField from '../../components/FormField.jsx'
import { getPlatformMe, platformLogin } from '../../api/platform.js'
import { loginSchema } from '../../schemas/auth.js'

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'

// Sign-in for Clinix's own team - not for clinics. Accounts come from
// `npm run create-platform-admin`; there is no signup link on purpose.
export default function PlatformLogin() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { data: admin } = useQuery({
    queryKey: ['platform', 'me'],
    queryFn: getPlatformMe,
    retry: false,
  })
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(loginSchema) })

  if (admin) return <Navigate to="/platform" replace />

  const onSubmit = async (values) => {
    try {
      const signedIn = await platformLogin(values)
      queryClient.setQueryData(['platform', 'me'], signedIn)
      navigate(location.state?.from?.pathname ?? '/platform', { replace: true })
    } catch (err) {
      setError('root', {
        message:
          err.response?.data?.message ??
          'Something went wrong. Please try again.',
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
          <ClinixLogo size={40} />
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Clinix Platform
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Sign in to manage clinics
          </p>
        </div>

        {errors.root && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
          >
            <AlertTriangle
              size={16}
              className="mt-0.5 shrink-0"
              aria-hidden="true"
            />
            {errors.root.message}
          </div>
        )}

        <form
          className="space-y-4"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
        >
          <FormField name="email" label="Email" error={errors.email}>
            <input
              type="email"
              autoComplete="email"
              className={inputClass}
              {...register('email')}
            />
          </FormField>
          <FormField name="password" label="Password" error={errors.password}>
            <input
              type="password"
              autoComplete="current-password"
              className={inputClass}
              {...register('password')}
            />
          </FormField>
          <Button type="submit" className="w-full" loading={isSubmitting}>
            Sign in
          </Button>
        </form>
      </div>
    </div>
  )
}
