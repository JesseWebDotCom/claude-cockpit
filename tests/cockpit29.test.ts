// A Flight log entry is two fixed rows: the status and the title, then all the details cut to one line with an ellipsis.

import { test, expect } from './pure.ts'
import { agoWords, flightDetails, parseReport, whoOf } from '../hooks/flightlog.ts'
import type { FlightEntry } from '../hooks/flightlog.ts'
import { FLIGHT_PITCH, flightHeight, flightSvg } from '../hooks/flightsvg.ts'
import { textWidth } from '../hooks/draw.ts'
import { isWellFormed } from './helpers.ts'

const NOW = 10_000_000
const LONG = 'done in code. The mod is installed and the public twin has a new local commit that carries every change in this item'
const entry = (over: Partial<FlightEntry> = {}): FlightEntry => ({ key: 'k', name: 'FEAT-27', status: 'errored', detail: LONG, atMs: NOW - 5 * 60_000, source: 'report', who: 'Sonnet 5.5', ...over })
const texts = (svg: string): { x: number; y: number; size: number; s: string }[] =>
  [...svg.matchAll(/<text[^>]*x="([\d.]+)"[^>]*y="([\d.]+)"[^>]*font-size="(\d+)"[^>]*>([^<]*)<\/text>/g)].map(m => ({ x: Number(m[1]), y: Number(m[2]), size: Number(m[3]), s: m[4] ?? '' }))

test('an entry draws two rows: status and title on the first, the details on the second', () => {
  const svg = flightSvg(420, [entry()], '1 errored', NOW)
  expect(isWellFormed(svg)).toBe(true)
  const body = texts(svg).filter(t => t.size === 13)
  expect(body.length).toBe(2)
  expect(body[0]?.s).toBe('FEAT-27')
  expect(body[1]?.x).toBe(10)
  expect(body[1]?.y ?? 0).toBeGreaterThan((body[0]?.y ?? 0) + 12)
  expect(svg).toContain('>ERRORED<')
})

test('row 2 is cut with an ellipsis at 360, 420 and 520 px', () => {
  for (const W of [360, 420, 520]) {
    const d = texts(flightSvg(W, [entry()], '', NOW)).filter(t => t.size === 13 && t.x === 10)
    expect(d.length).toBe(1)
    expect(d[0]?.s.endsWith('…')).toBe(true)
    expect(10 + textWidth(d[0]?.s ?? '', 13)).toBeLessThanOrEqual(W - 10 + 1)
  }
})

test('the details carry the statement, who and when, and never the title or the status again', () => {
  expect(flightDetails(entry({ detail: 'FEAT-27' }), NOW)).toBe('Sonnet 5.5 · 5 min ago')
  expect(flightDetails(entry({ detail: 'errored' }), NOW)).toBe('Sonnet 5.5 · 5 min ago')
  expect(flightDetails(entry({ detail: 'gate exit 1' }), NOW)).toBe('gate exit 1 · Sonnet 5.5 · 5 min ago')
  expect(whoOf('# X\nModel: Haiku 4.5\n')).toBe('Haiku 4.5')
  expect(parseReport('x-report.md', '# X\nLane: lane-2\n', 5).who).toBe('lane-2')
  expect([0, 90_000, 7_200_000, 3 * 86_400_000].map(agoWords)).toEqual(['just now', '1 min ago', '2 h ago', '3 d ago'])
})

test('the height counts two rows per entry', () => {
  expect(FLIGHT_PITCH).toBeGreaterThanOrEqual(40)
  expect(flightHeight(3) - flightHeight(2)).toBe(FLIGHT_PITCH)
  const svg = flightSvg(420, Array.from({ length: 8 }, () => entry()), '', NOW)
  expect(svg).toContain(`height="${flightHeight(8)}"`)
})
