import { useCallback, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getClinicSettings } from '../api/clinic.js'
import Sidebar from './Sidebar.jsx'
import Header from './Header.jsx'

export default function AppLayout() {
  const [navOpen, setNavOpen] = useState(false)
  const closeNav = useCallback(() => setNavOpen(false), [])
  // Same query key as the Settings page, so a saved name or new logo shows
  // in the shell immediately. Readable by every role (GET is not owner-only).
  const { data: clinic } = useQuery({
    queryKey: ['clinic', 'settings'],
    queryFn: getClinicSettings,
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      <Sidebar clinic={clinic} mobileOpen={navOpen} onMobileClose={closeNav} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          clinic={clinic}
          onMenuClick={() => setNavOpen(true)}
          menuButtonExpanded={navOpen}
        />
        {/* relative keeps sr-only (absolute) inputs inside this scroll area;
            otherwise they stretch the page and phones get a second scroll. */}
        <main className="relative flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
