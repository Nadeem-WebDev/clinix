import request from 'supertest'
import { createApp } from '../src/app.js'

describe('GET /api/v1/health', () => {
  it('returns a success envelope', async () => {
    const app = createApp()
    const res = await request(app).get('/api/v1/health')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('uptime')
  })
})

describe('unknown route', () => {
  it('returns a consistent 404 error envelope', async () => {
    const app = createApp()
    const res = await request(app).get('/api/v1/does-not-exist')

    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
    expect(res.body.code).toBe('NOT_FOUND')
  })
})
