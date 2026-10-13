import {
  Link,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'
import ClinixLogo from '../../components/ClinixLogo.jsx'
import ThemeToggle from '../../components/ThemeToggle.jsx'
import LoadingState from '../../components/LoadingState.jsx'
import { getPlatformMe, platformLogout } from '../../api/platform.js'

// Shell for the platform admin panel: its own header, no clinic sidebar,
// and its own session check (a clinic login doesn't get you in).
export default function PlatformLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: admin, isLoading } = useQuery({
    queryKey: ['platform', 'me'],
    queryFn: getPlatformMe,
    retry: false,
  })

  if (isLoading) return <LoadingState label="Checking session…" />
  if (!admin)
    return <Navigate to="/platform/login" state={{ from: location }} replace />

  const logout = async () => {
    await platformLogout()
    queryClient.removeQueries({ queryKey: ['platform'] })
    navigate('/platform/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link
            to="/platform"
            className="flex min-w-0 items-center gap-2 font-semibold text-gray-900 dark:text-gray-100"
          >
            <ClinixLogo size={24} className="shrink-0" />
            <span className="truncate">Clinix Platform</span>
          </Link>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>
            <span className="hidden text-sm text-gray-600 dark:text-gray-400 md:inline">
              {admin.name}
            </span>
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <LogOut size={16} aria-hidden="true" />
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
