// Cockpit v10: the expandable Status card (an open line shows its whole text, wrapped; NEXT one entry per row) and the
// band's width clamp. Pure drawings; run with `bun test tests/statuscard.test.ts` or the host's runner.

import { BAND_MAX_PX, BAND_MIN_PX, STATUS_H, bandPx, fieldCanOpen, fieldItems, statusHeight, statusSvg } from '../hooks/look.ts'
import type { LookStatus } from '../hooks/look.ts'
import { isWellFormed } from './helpers.ts'
import { expect, test } from './pure.ts'

const LONG_NOW = 'COCKPIT-10: the self-updating Crew panel, the expandable card and the bar that went missing after the toggle (opencode-1)'
const CARD: LookStatus = {
  title: 'Pair the app with the remote service',
  ratio: 5 / 6,
  count: '5/6',
  note: '',
  now: LONG_NOW,
  next: 'bind chat/vision to 127.0.0.1:8791, smoke test a real turn, write the pairing doc for the box owner',
  you: 'Get a fresh pairing code and run the pair command on the box',
  youHex: '#F0A500',
  isAway: false,
  presenceText: 'Active',
  stale: '',
  phase: 0,
  nowItems: [LONG_NOW],
  nextItems: ['bind chat/vision to 127.0.0.1:8791', 'smoke test a real turn', 'write the pairing doc for the box owner'],
  youItems: ['Get a fresh pairing code and run the pair command on the box'],
}
const heightOf = (svg: string): number => Number(/height="(\d+(?:\.\d+)?)"/.exec(svg)?.[1] ?? Number.NaN)
const rowsOf = (svg: string): string[] => [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map(m => m[1] ?? '')

test('closed (or no open flags): the card is the single-line card it was, text cut with an ellipsis', () => {
  for (const s of [CARD, { ...CARD, open: { now: false, next: false, you: false } }]) {
    const svg = statusSvg(360, s)
    expect(isWellFormed(svg)).toBe(true)
    expect(heightOf(svg)).toBe(statusHeight(360, s))
    expect(statusHeight(360, s)).toBe(STATUS_H + (statusHeight(360, s) - STATUS_H))
    expect(svg).not.toContain(LONG_NOW)
  }
  // The same card without any v10 field draws the same as one with the lists but closed.
  const bare: LookStatus = { ...CARD, nowItems: undefined, nextItems: undefined, youItems: undefined }
  expect(statusSvg(360, bare)).toBe(statusSvg(360, { ...CARD, open: {} }))
})

test('NEXT open: one entry per row, in full, and the card grows by exactly the rows added', () => {
  const closed = statusHeight(520, CARD)
  const open = { ...CARD, open: { next: true } }
  const svg = statusSvg(520, open)
  expect(isWellFormed(svg)).toBe(true)
  expect(heightOf(svg)).toBe(statusHeight(520, open))
  expect(statusHeight(520, open)).toBe(closed + 2 * 18)
  const rows = rowsOf(svg)
  for (const item of CARD.nextItems ?? []) expect(rows).toContain(item)
  expect(svg).toContain(`viewBox="0 0 520 ${statusHeight(520, open)}"`)
})

test('NOW open: the whole text, wrapped over rows, never an ellipsis; closing it gives the old height back', () => {
  const open = { ...CARD, open: { now: true } }
  const svg = statusSvg(360, open)
  expect(isWellFormed(svg)).toBe(true)
  const rows = rowsOf(svg)
  // The rows between the NOW label and the NEXT label are the NOW line (NEXT and YOU are closed here and may be cut).
  const nowRows = rows.slice(rows.indexOf('NOW') + 1, rows.indexOf('NEXT'))
  expect(nowRows.length).toBeGreaterThan(1)
  const joined = nowRows.join(' ')
  for (const word of LONG_NOW.split(' ')) expect(joined).toContain(word)
  expect(joined).not.toContain('...')
  expect(joined).not.toContain('\u2026')
  expect(statusHeight(360, open)).toBeGreaterThan(statusHeight(360, CARD))
  expect(statusHeight(360, { ...open, open: { now: false } })).toBe(statusHeight(360, CARD))
  // The stale chip stays on the NOW line when it is open, and the card still closes its tags.
  const chipped = statusSvg(360, { ...open, stale: 'stale: updated 2h ago' })
  expect(isWellFormed(chipped)).toBe(true)
  expect(chipped).toContain('>stale: updated 2h ago<')
  expect(chipped.indexOf('>stale: updated 2h ago<')).toBeLessThan(chipped.indexOf('>NEXT<'))
})

test('all three open at once, at every width: well formed, the height matches the drawing, text is escaped', () => {
  for (const W of [240, 360, 520, 900]) {
    const s: LookStatus = { ...CARD, open: { now: true, next: true, you: true }, youItems: ['<script>x</script> & "q"'] }
    const svg = statusSvg(W, s)
    expect(isWellFormed(svg)).toBe(true)
    expect(heightOf(svg)).toBe(statusHeight(W, s))
    expect(svg).not.toContain('<script>')
    expect(svg).not.toMatch(/NaN|undefined/)
  }
})

test('a line that says nothing cannot open and stays one line even if flagged open', () => {
  const empty: LookStatus = { ...CARD, now: '', nowItems: [], open: { now: true } }
  expect(fieldCanOpen(empty, 'now')).toBe(false)
  expect(fieldCanOpen(empty, 'next')).toBe(true)
  expect(statusHeight(520, empty)).toBe(statusHeight(520, { ...empty, open: {} }))
  // Without the lists the joined text is the one entry.
  expect(fieldItems({ ...CARD, nextItems: undefined }, 'next')).toEqual([CARD.next])
  expect(fieldItems({ ...CARD, you: '', youItems: undefined }, 'you')).toEqual([])
})

test('the band width: a very wide window never makes the Svg wider than the host accepts (4096 px)', () => {
  expect(bandPx(100)).toBe(792)
  expect(bandPx(0)).toBe(BAND_MIN_PX)
  expect(bandPx(Number.NaN)).toBe(792)
  for (const cols of [513, 514, 1000, 5000, 1e9]) {
    expect(bandPx(cols)).toBeLessThanOrEqual(BAND_MAX_PX)
    expect(bandPx(cols)).toBeLessThanOrEqual(4096)
  }
  expect(bandPx(1000)).toBe(BAND_MAX_PX)
})
