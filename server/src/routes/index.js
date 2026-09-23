import { Router } from 'express'
import healthRoutes from './health.routes.js'
import authRoutes from './auth.routes.js'
import userRoutes from './user.routes.js'
import patientRoutes from './patient.routes.js'
import appointmentRoutes from './appointment.routes.js'
import consultationRoutes from './consultation.routes.js'
import prescriptionRoutes from './prescription.routes.js'
import invoiceRoutes from './invoice.routes.js'
import dashboardRoutes from './dashboard.routes.js'
import reportRoutes from './report.routes.js'
import documentRoutes from './document.routes.js'
import auditLogRoutes from './auditLog.routes.js'
import clinicRoutes from './clinic.routes.js'
import publicRoutes from './public.routes.js'
import whatsappWebhookRoutes from './whatsappWebhook.routes.js'

const router = Router()

// Versioned API root: /api/v1/*
router.use('/health', healthRoutes)
router.use('/auth', authRoutes)
router.use('/users', userRoutes)
router.use('/patients', patientRoutes)
router.use('/appointments', appointmentRoutes)
router.use('/consultations', consultationRoutes)
router.use('/prescriptions', prescriptionRoutes)
router.use('/invoices', invoiceRoutes)
router.use('/dashboard', dashboardRoutes)
router.use('/reports', reportRoutes)
router.use('/documents', documentRoutes)
router.use('/audit-logs', auditLogRoutes)
router.use('/clinics', clinicRoutes)

// Unauthenticated - see public.routes.js for why, and what that costs.
router.use('/public', publicRoutes)

// Unauthenticated, called by Meta rather than by a browser - see
// whatsappWebhook.routes.js.
router.use('/whatsapp', whatsappWebhookRoutes)

export default router
