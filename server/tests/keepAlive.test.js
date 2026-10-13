import { jest } from '@jest/globals'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { env } from '../src/config/env.js'
import { pingOnce, startKeepAliveJob, stopKeepAliveJob } from '../src/jobs/keepAlive.job.js'

const originalKeepAlive = { ...env.keepAlive }
const originalNodeEnv = env.nodeEnv

afterEach(() => {
  stopKeepAliveJob()
  jest.restoreAllMocks()
  Object.assign(env.keepAlive, originalKeepAlive)
  env.nodeEnv = originalNodeEnv
})

describe('GET /api/v1/keep-alive', () => {
  it('answers without a session or a database, and is never cached', async () => {
    // No connectTestDB() in this file: the endpoint must not need Mongo.
    const res = await request(createApp()).get('/api/v1/keep-alive')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, message: 'alive' })
    expect(res.headers['cache-control']).toBe('no-store')
  })
})

describe('the self-ping job', () => {
  it('is off unless KEEP_ALIVE_ENABLED is "true"', () => {
    expect(originalKeepAlive.enabled).toBe(false)
    env.nodeEnv = 'production'
    env.keepAlive.enabled = false
    expect(startKeepAliveJob()).toBeNull()
  })

  it('never starts under tests, even when enabled', () => {
    env.keepAlive.enabled = true
    env.keepAlive.url = 'https://clinix.example/api/v1/keep-alive'
    expect(startKeepAliveJob()).toBeNull()
  })

  it('starts on the configured interval when enabled with a URL', () => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    const intervalSpy = jest.spyOn(globalThis, 'setInterval')
    env.nodeEnv = 'production'
    Object.assign(env.keepAlive, { enabled: true, url: 'https://clinix.example/api/v1/keep-alive', intervalMinutes: 13 })

    expect(startKeepAliveJob()).not.toBeNull()
    expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 13 * 60 * 1000)
  })

  it('refuses to start without a URL to ping', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    env.nodeEnv = 'production'
    Object.assign(env.keepAlive, { enabled: true, url: null })
    expect(startKeepAliveJob()).toBeNull()
  })

  it('a failed ping is logged, never thrown', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('getaddrinfo ENOTFOUND'))
    await expect(pingOnce('https://nowhere.example/api/v1/keep-alive')).resolves.toBe(false)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('ENOTFOUND'))
  })

  it('a successful ping resolves true', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200 })
    await expect(pingOnce('https://clinix.example/api/v1/keep-alive')).resolves.toBe(true)
  })
})
