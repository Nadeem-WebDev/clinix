import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './layouts/AppLayout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import LoadingState from './components/LoadingState.jsx'
import Login from './pages/Login.jsx'
import RegisterClinic from './pages/RegisterClinic.jsx'
import NotFound from './pages/NotFound.jsx'

// Everything behind the authenticated app shell is lazy-loaded by route -
// keeps the initial bundle to just what an unauthenticated visitor needs
// (Login/RegisterClinic) instead of one >1.2MB chunk with every module
// (Reports' Recharts usage in particular) loaded up front. Login/
// RegisterClinic/NotFound stay eager: they're the first thing most visitors
// see, and lazy-loading them would trade a real, likely-taken code path for
// a loading flash that never pays for itself.
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'))
const Patients = lazy(() => import('./pages/Patients.jsx'))
const PatientNew = lazy(() => import('./pages/PatientNew.jsx'))
const PatientProfile = lazy(() => import('./pages/PatientProfile.jsx'))
const PatientEdit = lazy(() => import('./pages/PatientEdit.jsx'))
const Appointments = lazy(() => import('./pages/Appointments.jsx'))
const AppointmentNew = lazy(() => import('./pages/AppointmentNew.jsx'))
const Queue = lazy(() => import('./pages/Queue.jsx'))
const Consultations = lazy(() => import('./pages/Consultations.jsx'))
const ConsultationNew = lazy(() => import('./pages/ConsultationNew.jsx'))
const ConsultationDetail = lazy(() => import('./pages/ConsultationDetail.jsx'))
const Prescriptions = lazy(() => import('./pages/Prescriptions.jsx'))
const PrescriptionNew = lazy(() => import('./pages/PrescriptionNew.jsx'))
const PrescriptionDetail = lazy(() => import('./pages/PrescriptionDetail.jsx'))
const Billing = lazy(() => import('./pages/Billing.jsx'))
const InvoiceNew = lazy(() => import('./pages/InvoiceNew.jsx'))
const InvoiceDetail = lazy(() => import('./pages/InvoiceDetail.jsx'))
const Reports = lazy(() => import('./pages/Reports.jsx'))
const Documents = lazy(() => import('./pages/Documents.jsx'))
const AuditLogs = lazy(() => import('./pages/AuditLogs.jsx'))
const Settings = lazy(() => import('./pages/Settings.jsx'))
const Staff = lazy(() => import('./pages/Staff.jsx'))

// Public, no-login waiting-room queue. Lazy like the authenticated pages -
// but for the opposite reason: almost nobody who loads the app shell will
// ever open it, and almost nobody who opens it will load the app shell.
const PublicQueue = lazy(() => import('./pages/PublicQueue.jsx'))

export default function App() {
  return (
    <Suspense fallback={<LoadingState label="Loading…" />}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register-clinic" element={<RegisterClinic />} />

        {/* Outside ProtectedRoute and AppLayout on purpose: no session, no
            sidebar, and no redirect to /login when there's no cookie. */}
        <Route path="/q/:slug" element={<PublicQueue />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />

            <Route path="/patients" element={<Patients />} />
            <Route path="/patients/:id" element={<PatientProfile />} />

            <Route element={<ProtectedRoute allowedRoles={['owner', 'admin', 'receptionist']} />}>
              <Route path="/patients/new" element={<PatientNew />} />
            </Route>
            <Route element={<ProtectedRoute allowedRoles={['owner', 'admin', 'receptionist', 'nurse']} />}>
              <Route path="/patients/:id/edit" element={<PatientEdit />} />
            </Route>

            <Route path="/appointments" element={<Appointments />} />
            <Route path="/queue" element={<Queue />} />
            <Route element={<ProtectedRoute allowedRoles={['owner', 'admin', 'receptionist']} />}>
              <Route path="/appointments/new" element={<AppointmentNew />} />
            </Route>

            <Route element={<ProtectedRoute allowedRoles={['owner', 'admin', 'doctor']} />}>
              <Route path="/consultations" element={<Consultations />} />
              <Route path="/consultations/new" element={<ConsultationNew />} />
              <Route path="/consultations/:id" element={<ConsultationDetail />} />

              <Route path="/prescriptions" element={<Prescriptions />} />
              <Route path="/prescriptions/new" element={<PrescriptionNew />} />
              <Route path="/prescriptions/:id" element={<PrescriptionDetail />} />

              <Route path="/documents" element={<Documents />} />
            </Route>

            <Route element={<ProtectedRoute allowedRoles={['owner', 'admin', 'receptionist']} />}>
              <Route path="/billing" element={<Billing />} />
              <Route path="/billing/new" element={<InvoiceNew />} />
              <Route path="/billing/:id" element={<InvoiceDetail />} />
            </Route>

            <Route element={<ProtectedRoute allowedRoles={['owner', 'admin']} />}>
              <Route path="/reports" element={<Reports />} />
              <Route path="/audit-logs" element={<AuditLogs />} />
              <Route path="/staff" element={<Staff />} />
            </Route>

            {/* Owner-exclusive: the one surface admin does NOT get. */}
            <Route element={<ProtectedRoute allowedRoles={['owner']} />}>
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}
