import { Router } from 'express'

// GET /api/v1/keep-alive - the cheapest possible request, for keeping a
// Render free-plan instance awake (it sleeps after 15 minutes without
// traffic). Pinged every few minutes by the self-ping job
// (jobs/keepAlive.job.js) or an outside monitor (UptimeRobot,
// cron-job.org). No database work, no session, nothing patient-related -
// /health stays the one that reports database state.
const router = Router()

router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json({ success: true, message: 'alive' })
})

export default router
