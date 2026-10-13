import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  ListOrdered,
  Stethoscope,
  FileText,
  Receipt,
  BarChart3,
  FolderClosed,
  UserCog,
  Settings,
  ScrollText,
  X,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../context/AuthContext.jsx'
import ClinicBrand from '../components/ClinicBrand.jsx'

// Full nav model for the MVP, gated by role per the role-capability table
// in the spec (section 2). Server-side authorization is the real
// enforcement boundary - this only avoids showing links a role can't use.
const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard, roles: ['owner', 'admin', 'doctor', 'receptionist', 'nurse'] },
  { to: '/patients', label: 'Patients', Icon: Users, roles: ['owner', 'admin', 'doctor', 'receptionist', 'nurse'] },
  { to: '/appointments', label: 'Appointments', Icon: CalendarDays, roles: ['owner', 'admin', 'doctor', 'receptionist', 'nurse'] },
  { to: '/queue', label: 'Queue', Icon: ListOrdered, roles: ['owner', 'admin', 'doctor', 'receptionist', 'nurse'] },
  { to: '/consultations', label: 'Consultations', Icon: Stethoscope, roles: ['owner', 'admin', 'doctor'] },
  { to: '/prescriptions', label: 'Prescriptions', Icon: FileText, roles: ['owner', 'admin', 'doctor'] },
  { to: '/billing', label: 'Billing', Icon: Receipt, roles: ['owner', 'admin', 'receptionist'] },
  { to: '/reports', label: 'Reports', Icon: BarChart3, roles: ['owner', 'admin'] },
  { to: '/documents', label: 'Documents', Icon: FolderClosed, roles: ['owner', 'admin', 'doctor'] },
  { to: '/staff', label: 'Staff', Icon: UserCog, roles: ['owner', 'admin'] },
  // Owner-exclusive: the one surface admin does NOT get.
  { to: '/settings', label: 'Settings', Icon: Settings, roles: ['owner'] },
  { to: '/audit-logs', label: 'Audit Logs', Icon: ScrollText, roles: ['owner', 'admin'] },
]

function NavList({ items, onNavigate }) {
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
      {items.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800',
            )
          }
        >
          <Icon size={18} aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

// Below md the static sidebar is hidden, so the same nav is offered as a
// slide-in drawer opened from the Header's menu button. It only mounts while
// open, which keeps a single copy of each link in the DOM the rest of the time.
export default function Sidebar({ clinic, mobileOpen = false, onMobileClose }) {
  const { user } = useAuth()
  const items = NAV_ITEMS.filter((item) => !user || item.roles.includes(user.role))

  useEffect(() => {
    if (!mobileOpen) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onMobileClose?.()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [mobileOpen, onMobileClose])

  return (
    <>
      <aside className="hidden w-60 shrink-0 border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 md:flex md:flex-col">
        <div className="flex h-14 items-center px-4">
          <ClinicBrand clinic={clinic} />
        </div>
        <NavList items={items} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/40" onClick={onMobileClose} aria-hidden="true" />
          <aside className="relative flex h-full w-64 max-w-[80%] flex-col border-r border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900">
            <div className="flex h-14 items-center justify-between gap-2 px-4">
              <ClinicBrand clinic={clinic} />
              <button
                type="button"
                onClick={onMobileClose}
                aria-label="Close menu"
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <NavList items={items} onNavigate={onMobileClose} />
          </aside>
        </div>
      )}
    </>
  )
}
