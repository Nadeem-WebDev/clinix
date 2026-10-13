import { describe, it, expect } from 'vitest'
import { fillSeries, daysInRange } from './reportSeries.js'

const keys = (series) => series.map((p) => p.key)

describe('fillSeries', () => {
  it('puts every day of the range in, with 0 for days that had nothing', () => {
    const series = fillSeries([{ date: '2026-10-11', count: 3 }], {
      from: '2026-10-10',
      to: '2026-10-12',
      keyField: 'date',
      valueField: 'count',
    })
    expect(series.map((p) => [p.key, p.value])).toEqual([
      ['2026-10-10', 0],
      ['2026-10-11', 3],
      ['2026-10-12', 0],
    ])
  })

  it('crosses a month end and a DST change without skipping or repeating a day', () => {
    // 1 Nov 2026 is the US clock change; the series must not care.
    const series = fillSeries([], {
      from: '2026-10-30',
      to: '2026-11-02',
      keyField: 'd',
      valueField: 'v',
    })
    expect(keys(series)).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ])
  })

  it('uses the same ISO week keys as the server (%G-W%V), across a year end', () => {
    // Keys checked against MongoDB's $dateToString '%G-W%V'.
    const series = fillSeries([{ period: '2026-W53', total: 500 }], {
      from: '2026-12-21',
      to: '2027-01-05',
      groupBy: 'week',
      keyField: 'period',
      valueField: 'total',
    })
    expect(keys(series)).toEqual(['2026-W52', '2026-W53', '2027-W01'])
    expect(series[1].value).toBe(500)
    expect(
      fillSeries([], {
        from: '2026-10-12',
        to: '2026-10-12',
        groupBy: 'week',
        keyField: 'p',
        valueField: 't',
      })[0].key,
    ).toBe('2026-W42')
  })

  it('groups by month', () => {
    const series = fillSeries([{ period: '2026-09', total: 10 }], {
      from: '2026-08-20',
      to: '2026-10-05',
      groupBy: 'month',
      keyField: 'period',
      valueField: 'total',
    })
    expect(series.map((p) => [p.key, p.value])).toEqual([
      ['2026-08', 0],
      ['2026-09', 10],
      ['2026-10', 0],
    ])
  })

  it('gives each point a short axis label and a longer tooltip label', () => {
    const [point] = fillSeries([], {
      from: '2026-10-12',
      to: '2026-10-12',
      keyField: 'd',
      valueField: 'v',
    })
    expect(point.label).toMatch(/12/)
    expect(point.label).toMatch(/Oct/)
    expect(point.fullLabel).toMatch(/2026/)
  })
})

describe('daysInRange', () => {
  it('counts both ends', () => {
    expect(daysInRange('2026-10-12', '2026-10-12')).toBe(1)
    expect(daysInRange('2026-09-13', '2026-10-12')).toBe(30)
  })
})
