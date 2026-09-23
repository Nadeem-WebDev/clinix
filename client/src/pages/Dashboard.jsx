import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarDays,
  Users,
  UserPlus,
  Repeat,
  ListOrdered,
  Stethoscope,
  IndianRupee,
  Receipt,
  ArrowRightCircle,
  Plus,
  UserCog,
  Search,
  Clock,
  Phone,
  CalendarClock,
} from 'lucide-react'
import { getDashboard } from '../api/dashboard.js'
import { getFollowUpsDue } from '../api/consultations.js'
import { callNext } from '../api/appointments.js'
import { useAuth } from '../context/AuthContext.jsx'
import StatCard from '../components/StatCard.jsx'
import Button from '../components/Button.jsx'
import PatientAvatar from '../components/PatientAvatar.jsx'
import LoadingState from '../components/LoadingState.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ErrorState from '../components/ErrorState.jsx'

function money(n) {
  return `₹${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function SectionTitle({ children }) {
  return (
    <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">{children}</h2>
  )
}

function QuickActions({ actions }) {
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map(({ to, label, Icon }) => (
        <Link key={to} to={to}>
          <Button variant="secondary">
            <Icon size={16} aria-hidden="true" />
            {label}
          </Button>
        </Link>
      ))}
    </div>
  )
}

// Fetched independently from its own dedicated endpoint (GET
// /consultations/follow-ups) rather than embedded in the main dashboard
// payload - a scoped, lighter-weight query the widget can refetch on its
// own without pulling the whole dashboard along with it. Shared between
// AdminDashboard and DoctorDashboard (the backend scopes the doctor variant
// to that doctor's own patients automatically).
function FollowUpsDueCard() {
  const { data: followUps, isLoading, isError } = useQuery({
    queryKey: ['consultations', 'follow-ups'],
    queryFn: getFollowUpsDue,
  })

  return (
    <div>
      <SectionTitle>Follow-ups due</SectionTitle>
      {isLoading && <p className="text-sm text-gray-400 dark:text-gray-500">Loading…</p>}
      {isError && <p className="text-sm text-red-600 dark:text-red-400">Could not load follow-ups.</p>}
      {!isLoading && !isError && (
        (followUps ?? []).length === 0 ? (
          <EmptyState title="No follow-ups due" description="Nothing due in the next 7 days." />
        ) : (
          <ul className="space-y-2">
            {followUps.map((c) => (
              <li
                key={c._id}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-2.5 text-sm dark:border-gray-800"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900 dark:text-gray-100">{c.patientId?.fullName}</p>
                  <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <Phone size={12} aria-hidden="true" />
                    {c.patientId?.phone}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                  <CalendarClock size={12} aria-hidden="true" />
                  {new Date(c.followUpDate).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  )
}

function AdminDashboard({ dash }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Today's appointments" value={dash.todayAppointments} icon={CalendarDays} />
        <StatCard label="Today's patients" value={dash.todayPatients} icon={Users} />
        <StatCard label="New patients" value={dash.newPatients} icon={UserPlus} />
        <StatCard label="Returning patients" value={dash.returningPatients} icon={Repeat} />
        <StatCard label="Waiting" value={dash.waitingPatients} icon={ListOrdered} />
        <StatCard label="Completed consultations" value={dash.completedConsultations} icon={Stethoscope} />
        <StatCard label="Today's revenue" value={money(dash.todayRevenue)} icon={IndianRupee} />
        <StatCard
          label="Pending payments"
          value={`${money(dash.pendingPayments.amount)} (${dash.pendingPayments.count})`}
          icon={Receipt}
        />
      </div>

      <div>
        <SectionTitle>Quick actions</SectionTitle>
        <QuickActions actions={[{ to: '/reports', label: 'View Reports', Icon: Receipt }]} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle>Upcoming appointments</SectionTitle>
          {dash.upcomingAppointments.length === 0 ? (
            <EmptyState title="Nothing upcoming" description="The next 7 days are clear." />
          ) : (
            <ul className="space-y-2">
              {dash.upcomingAppointments.map((a) => (
                <li
                  key={a._id}
                  className="flex items-center justify-between rounded-lg border border-gray-200 p-2.5 text-sm dark:border-gray-800"
                >
                  <span className="text-gray-900 dark:text-gray-100">{a.patientId?.fullName}</span>
                  <span className="text-gray-400 dark:text-gray-500">
                    {new Date(a.scheduledAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <FollowUpsDueCard />
      </div>
    </div>
  )
}

function DoctorDashboard({ dash }) {
  const queryClient = useQueryClient()
  const callMutation = useMutation({
    mutationFn: callNext,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
  })

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Today's appointments" value={dash.todayAppointments} icon={CalendarDays} />
        <StatCard label="Waiting" value={dash.waitingPatients} icon={ListOrdered} />
        <StatCard label="Completed consultations" value={dash.completedConsultations} icon={Stethoscope} />
      </div>

      <div>
        <SectionTitle>Quick actions</SectionTitle>
        <QuickActions
          actions={[
            { to: '/appointments', label: "Today's Appointments", Icon: CalendarDays },
            { to: '/consultations/new', label: 'New Consultation', Icon: Stethoscope },
            { to: '/patients', label: 'Patient Search', Icon: Search },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle>Current patient</SectionTitle>
          {dash.currentPatient ? (
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
              <PatientAvatar name={dash.currentPatient.patientId?.fullName} size={32} />
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {dash.currentPatient.patientId?.fullName}
              </span>
              <Link to={`/consultations/new?appointmentId=${dash.currentPatient._id}`} className="ml-auto">
                <Button variant="secondary">Consult</Button>
              </Link>
            </div>
          ) : (
            <EmptyState title="No one in consultation" />
          )}
        </div>
        <div>
          <SectionTitle>Next patient</SectionTitle>
          {dash.nextPatient ? (
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
              <PatientAvatar name={dash.nextPatient.patientId?.fullName} size={32} />
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {dash.nextPatient.patientId?.fullName}
              </span>
              <Button
                className="ml-auto"
                onClick={() => callMutation.mutate(dash.nextPatient._id)}
                loading={callMutation.isPending}
              >
                <ArrowRightCircle size={16} aria-hidden="true" />
                Next Patient
              </Button>
            </div>
          ) : (
            <EmptyState title="No one waiting" />
          )}
        </div>
      </div>

      <FollowUpsDueCard />
    </div>
  )
}

function FrontDeskDashboard({ dash }) {
  const { user } = useAuth()
  const actions = [
    { to: '/patients/new', label: 'Register Patient', Icon: UserPlus },
    { to: '/appointments/new', label: 'Book Appointment', Icon: Plus },
    { to: '/appointments/new?walkin=1', label: 'Walk-in Patient', Icon: UserCog },
  ]
  if (user?.role === 'receptionist') {
    actions.push({ to: '/billing/new', label: 'Create Bill', Icon: Receipt })
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Today's appointments" value={dash.todayAppointments} icon={CalendarDays} />
        <StatCard label="Waiting" value={dash.waitingPatients} icon={ListOrdered} />
      </div>

      <div>
        <SectionTitle>Quick actions</SectionTitle>
        <QuickActions actions={actions} />
      </div>

      <div>
        <SectionTitle>Today&apos;s appointments</SectionTitle>
        {dash.todayAppointmentsList.length === 0 ? (
          <EmptyState title="Nothing scheduled today" />
        ) : (
          <ul className="space-y-2">
            {dash.todayAppointmentsList.map((a) => (
              <li
                key={a._id}
                className="flex items-center justify-between rounded-lg border border-gray-200 p-2.5 text-sm dark:border-gray-800"
              >
                <span className="text-gray-900 dark:text-gray-100">{a.patientId?.fullName}</span>
                <span className="text-gray-400 dark:text-gray-500">
                  {new Date(a.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · Dr.{' '}
                  {a.doctorId?.name}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { data: dash, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboard,
    refetchInterval: 30000,
  })

  if (isLoading) return <LoadingState label="Loading dashboard…" />
  if (isError) return <ErrorState onRetry={refetch} />

  return (
    <div>
      <h1 className="mb-6 flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-gray-100">
        <Clock size={20} className="text-gray-400" aria-hidden="true" />
        Today&apos;s Overview
      </h1>
      {dash.role === 'admin' && <AdminDashboard dash={dash} />}
      {dash.role === 'doctor' && <DoctorDashboard dash={dash} />}
      {(dash.role === 'receptionist' || dash.role === 'nurse') && <FrontDeskDashboard dash={dash} />}
    </div>
  )
}
