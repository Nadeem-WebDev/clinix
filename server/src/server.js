import { createApp } from './app.js'
import { connectDB } from './config/db.js'
import { env } from './config/env.js'
import { startAppointmentReminderJob } from './jobs/appointmentReminder.job.js'

async function start() {
  try {
    await connectDB()
    // eslint-disable-next-line no-console
    console.log('MongoDB connected')
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err.message)
    process.exit(1)
  }

  // Self-guarded: no-ops unless WHATSAPP_ENABLED is true, and never under
  // NODE_ENV=test. Started after the DB connection, since its first tick
  // queries clinics and appointments.
  startAppointmentReminderJob()

  const app = createApp()
  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on port ${env.port} (${env.nodeEnv})`)
  })
}

start()
