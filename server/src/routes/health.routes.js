import { Router } from 'express'
import mongoose from 'mongoose'
import { sendSuccess } from '../utils/ApiResponse.js'

const router = Router()

router.get('/', (req, res) => {
  sendSuccess(res, {
    message: 'OK',
    data: {
      uptime: process.uptime(),
      dbState: mongoose.connection.readyState, // 1 = connected
    },
  })
})

export default router
