import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { UserCircle, LogOut, Menu, KeyRound, Stethoscope } from 'lucide-react'
import ThemeToggle from '../components/ThemeToggle.jsx'
import ClinicBrand from '../components/ClinicBrand.jsx'
import ChangePasswordModal from '../components/ChangePasswordModal.jsx'
import DoctorProfileModal from '../components/DoctorProfileModal.jsx'
import { useAuth } from '../context/AuthContext.jsx'

const ROLE_LABELS = {
  owner: 'Owner',
  admin: 'Admin',
  doctor: 'Doctor',
  receptionist: 'Receptionist',
  nurse: 'Nurse',
}

export default function Header({
  clinic,
  onMenuClick,
  menuButtonExpanded = false,
}) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [editingProfile, setEditingProfile] = useState(false)
  const menuRef = useRef(null)
  const menuButtonRef = useRef(null)
  const { pathname } = useLocation()

  // The account menu closes like any dropdown: on a press anywhere outside
  // it, on Escape (handing focus back to the button), and when the page
  // changes - not only by clicking the button again. pointerdown covers
  // mouse and touch alike, including iPhone Safari. Presses inside the
  // menu (the theme switch) leave it open.
  useEffect(() => {
    if (!menuOpen) return undefined
    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false)
    }
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      menuButtonRef.current?.focus()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  const handleLogout = async () => {
    setMenuOpen(false)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          aria-expanded={menuButtonExpanded}
          className="shrink-0 rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 md:invisible"
        >
          <Menu size={22} aria-hidden="true" />
        </button>
        {/* The sidebar (which carries the brand on desktop) is hidden below
            md, so the clinic's logo and name move up here on phones. */}
        <ClinicBrand clinic={clinic} size="sm" className="md:hidden" />
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {/* Phones get the theme switch inside the account menu instead - in
            the header it leaves a 320px iPhone SE too little room for the
            clinic's name. */}
        <div className="hidden sm:block">
          <ThemeToggle />
        </div>
        <div ref={menuRef} className="relative">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-haspopup="true"
            aria-label="Account menu"
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 sm:py-1.5"
          >
            <UserCircle size={20} aria-hidden="true" />
            <span className="hidden sm:flex sm:flex-col sm:items-start sm:leading-tight">
              <span>{user?.name}</span>
              <span className="text-xs font-normal text-gray-400 dark:text-gray-500">
                {ROLE_LABELS[user?.role] ?? user?.role}
              </span>
            </span>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-800 dark:bg-gray-900">
              {/* On phones the button shows only an icon, so the menu says
                  who is signed in and carries the theme switch. */}
              <div className="border-b border-gray-100 px-3 pb-3 pt-2 dark:border-gray-800 sm:hidden">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                  {user?.name}
                </p>
                <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                  {ROLE_LABELS[user?.role] ?? user?.role}
                </p>
                <ThemeToggle />
              </div>
              {user?.role === 'doctor' && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    setEditingProfile(true)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  <Stethoscope size={16} aria-hidden="true" />
                  My doctor profile
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setChangingPassword(true)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <KeyRound size={16} aria-hidden="true" />
                Change password
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <LogOut size={16} aria-hidden="true" />
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
      <ChangePasswordModal
        open={changingPassword}
        onClose={() => setChangingPassword(false)}
      />
      {user?.role === 'doctor' && (
        <DoctorProfileModal
          open={editingProfile}
          doctorId={user._id}
          onClose={() => setEditingProfile(false)}
        />
      )}
    </header>
  )
}
