// COCKPIT-29 (cockpit 0.8.1): a Flight log entry is two fixed rows. Row 1 is the status and the title only. Row 2 is every detail (statement, who,
// when), cut with an ellipsis to one line. The height counts two rows per entry, so the pane's budget stays honest.

import { test, expect } from './pure.ts'
import { agoWords, flightDetails, parseReport, whoOf, STATUS_HEX, STATUS_WORD } from '../hooks/flightlog.ts'
import type { FlightEntry } from '../hooks/flightlog.ts'
import { FLIGHT_PITCH, SEC_END, flightBodyHeight, flightBodySvg } from '../hooks/sections.ts'
import { textWidth } from '../hooks/draw.ts'
import { GUTTER } from '../hooks/tokens.ts'
import { isWellFormed } from './helpers.ts'

const NOW = 10_000_000
const LONG = 'done in code. The private mod is installed and the public twin has a new local commit that carries every change in this item'
const entry = (over: Partial<FlightEntry> = {}): FlightEntry => ({ key: 'k', name: 'COCKPIT-27', status: 'errored', detail: LONG, atMs: NOW - 5 * 60_000, source: 'report', who: 'Sonnet 5.5', ...over })
const rowOf = (e: FlightEntry) => ({ name: e.name, detail: flightDetails(e, NOW), word: STATUS_WORD[e.status], hex: STATUS_HEX[e.status] })
const texts = (svg: string): { y: number; x: number; s: string; size: number }[] =>
  [...svg.matchAll(/<text[^>]*x="([\d.]+)"[^>]*y="([\d.]+)"[^>]*font-size="(\d+)"[^>]*>([^<]*)<\/text>/g)].map(m => ({ x: Number(m[1]), y: Number(m[2]), size: Number(m[3]), s: m[4] ?? '' }))

test('an entry draws exactly two rows: the title on the first, the details on the second, nothing on a third', () => {
  const svg = flightBodySvg(420, [rowOf(entry())])
  expect(isWellFormed(svg)).toBe(true)
  const t = texts(svg).filter(x => x.size >= 13)
  // chip text is 11 px; the 13 px title and the 13 px details are the two rows.
  expect(t.length).toBe(2)
  expect(t[0]?.s).toBe('COCKPIT-27')
  expect(t[1]?.y ?? 0).toBeGreaterThan((t[0]?.y ?? 0) + 12)
  expect(t[1]?.y ?? 99).toBeLessThan(FLIGHT_PITCH + 8)
})

test('row 1 holds the status and the title only; the statement is on row 2', () => {
  const svg = flightBodySvg(420, [rowOf(entry({ detail: 'gate exit 1', who: '' }))])
  const t = texts(svg)
  const row1 = t.filter(x => x.y < 8 + 28)
  expect(row1.map(x => x.s).join(' ')).toContain('ERRORED')
  expect(row1.map(x => x.s).join(' ')).toContain('COCKPIT-27')
  expect(row1.map(x => x.s).join(' ')).not.toContain('gate exit')
  expect(t.filter(x => x.y >= 8 + 28).map(x => x.s).join(' ')).toContain('gate exit 1')
})

test('row 2 is cut with an ellipsis to fit at 360, 420 and 520 px', () => {
  for (const W of [360, 420, 520]) {
    const svg = flightBodySvg(W, [rowOf(entry()), rowOf(entry({ name: 'A-VERY-LONG-ITEM-NAME-THAT-GOES-ON-AND-ON-FOR-A-WHILE-01' }))])
    const t = texts(svg).filter(x => x.size === 13 && x.x === GUTTER)
    expect(t.length).toBe(2)
    for (const x of t) {
      expect(x.s.endsWith('…')).toBe(true)
      expect(x.x + textWidth(x.s.replace(/&[a-z]+;/g, '&'), 13)).toBeLessThanOrEqual(W - GUTTER + 1)
    }
    for (const x of texts(svg).filter(x => x.size === 13 && x.x > GUTTER)) expect(x.x + textWidth(x.s, 13)).toBeLessThanOrEqual(W - GUTTER + 1)
  }
})

test('the details do not repeat the title or the status; they carry the statement, who and when', () => {
  expect(flightDetails(entry({ detail: 'COCKPIT-27' }), NOW)).toBe('Sonnet 5.5 · 5 min ago')
  expect(flightDetails(entry({ detail: 'errored' }), NOW)).toBe('Sonnet 5.5 · 5 min ago')
  expect(flightDetails(entry({ detail: 'gate exit 1' }), NOW)).toBe('gate exit 1 · Sonnet 5.5 · 5 min ago')
  expect(flightDetails(entry({ detail: 'blocked by codex-a', source: 'crew', who: undefined }), NOW)).toBe('blocked by codex-a · agent · 5 min ago')
  expect(flightDetails(entry({ detail: '', who: '', atMs: 0 }), NOW)).toBe('')
})

test('who and when are read from the report and the clock', () => {
  expect(whoOf('# X\n\nStatus: done.\nModel: Sonnet 5.5, resumed from a run.\n')).toBe('Sonnet 5.5')
  expect(whoOf('# X\nLane: opencode-2\n')).toBe('opencode-2')
  expect(whoOf('# X\nno such line\n')).toBe('')
  expect(parseReport('x-report.md', '# X\nStatus: done in code.\nModel: Haiku 4.5\n', 5).who).toBe('Haiku 4.5')
  expect([0, 90_000, 7_200_000, 3 * 86_400_000].map(agoWords)).toEqual(['just now', '1 min ago', '2 h ago', '3 d ago'])
})

test('the height counts two rows per entry, and the card never exceeds its budget', () => {
  expect(FLIGHT_PITCH).toBeGreaterThanOrEqual(2 * 20)
  expect(flightBodyHeight(3) - flightBodyHeight(2)).toBe(FLIGHT_PITCH)
  expect(flightBodyHeight(8)).toBe(8 + 8 * FLIGHT_PITCH + 4 + SEC_END)
  for (const n of [1, 8, 20]) {
    const svg = flightBodySvg(420, Array.from({ length: n }, () => rowOf(entry())))
    expect(svg).toContain(`height="${flightBodyHeight(n)}"`)
    for (const x of texts(svg)) expect(x.y).toBeLessThanOrEqual(flightBodyHeight(n) - SEC_END)
  }
  expect(flightBodyHeight(0)).toBe(flightBodyHeight(1))
})
