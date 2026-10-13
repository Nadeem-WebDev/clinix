import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import ClinixLogo from '../components/ClinixLogo.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'
import Button from '../components/Button.jsx'
import { useAuth } from '../context/AuthContext.jsx'

// Where "home" is depends on who is looking: the platform panel, the
// signed-in app, or the login page.
function homeLink(pathname, isAuthenticated) {
  if (pathname.startsWith('/platform'))
    return { to: '/platform', label: 'Go to admin panel' }
  if (isAuthenticated) return { to: '/dashboard', label: 'Go to dashboard' }
  return { to: '/login', label: 'Go to sign in' }
}

export default function NotFound() {
  const { isAuthenticated } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const home = homeLink(location.pathname, isAuthenticated)
  // "default" is the first page of this visit - there's nothing to go back to.
  const canGoBack = location.key !== 'default'

  useEffect(() => {
    const previous = document.title
    document.title = 'Page not found – Clinix'
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 px-4 dark:bg-gray-950">
      <header className="flex items-center justify-between py-4">
        <Link
          to={home.to}
          className="flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100"
        >
          <ClinixLogo size={28} />
          Clinix
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center pb-16">
        <div className="w-full max-w-md text-center">
          <p className="text-7xl font-bold tracking-tight text-blue-600 sm:text-8xl dark:text-blue-500">
            404
          </p>
          <h1 className="mt-4 text-2xl font-semibold text-gray-900 dark:text-gray-100">
            Page not found
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            We couldn&apos;t find{' '}
            <code className="break-all rounded bg-gray-100 px-1.5 py-0.5 text-gray-800 dark:bg-gray-800 dark:text-gray-200">
              {location.pathname}
            </code>
            . The link may be wrong, or the page may have moved.
          </p>

          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
            {canGoBack && (
              <Button variant="secondary" onClick={() => navigate(-1)}>
                <ArrowLeft size={16} aria-hidden="true" />
                Go back
              </Button>
            )}
            <Link
              to={home.to}
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              {home.label}
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
