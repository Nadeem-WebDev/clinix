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
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../context/AuthContext.jsx'

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

export default function Sidebar() {
  const { user } = useAuth()
  const items = NAV_ITEMS.filter((item) => !user || item.roles.includes(user.role))

  return (
    <aside className="hidden w-60 shrink-0 border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 md:flex md:flex-col">
      <div className="flex h-14 items-center px-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        Clinic CRM
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
        {items.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
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
    </aside>
  )
}
