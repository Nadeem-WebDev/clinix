import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { localDateStr, localDaysAgo, addLocalDays } from './date.js'

// Run these on an Indian clock, where the UTC date is a day behind between
// midnight and 05:30 - the case toISOString() got wrong.
const originalTz = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'Asia/Kolkata'
})
afterAll(() => {
  process.env.TZ = originalTz
})

describe('local calendar dates', () => {
  it('uses the local date, not the UTC one', () => {
    const earlyMorning = new Date('2026-10-12T20:00:00.000Z') // 01:30 on 13 Oct in India
    expect(earlyMorning.toISOString().slice(0, 10)).toBe('2026-10-12')
    expect(localDateStr(earlyMorning)).toBe('2026-10-13')
  })

  it('adds days on the local calendar', () => {
    expect(localDateStr(addLocalDays(new Date('2026-10-31T20:00:00.000Z'), 1))).toBe('2026-11-02')
  })

  it('starts a "last N days" range N-1 days before today', () => {
    expect(localDaysAgo(1)).toBe(localDateStr())
    expect(localDaysAgo(7)).toBe(localDateStr(addLocalDays(new Date(), -6)))
  })
})
