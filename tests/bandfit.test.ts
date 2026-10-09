// Cockpit v12: the bar above the prompt fits the room the host gives it, whatever the session is doing, so it can neither
// be scrolled out of its window nor drawn at all while a turn runs. Pure rules; run with `bun test tests/bandfit.test.ts`
// or the host's runner.

import { LEVEL_ROWS, bandFit, bandLogLine, estimateRows, svgRows } from '../hooks/bandfit.ts'
import { expect, test } from './pure.ts'

test('row costs: a 28 px line and a 22 px strip are two rows each; the three layouts are 3, 2 and 1 rows (COCKPIT-44)', () => {
  expect(svgRows(28)).toBe(2)
  expect(svgRows(22)).toBe(2)
  expect(svgRows(20)).toBe(1)
  expect(svgRows(Number.NaN)).toBe(1)
  expect(LEVEL_ROWS).toEqual({ full: 3, compact: 2, line: 1 })
})

test('idle session with a roomy slot: the full bar, the engine\'s own content and an opened card all fit', () => {
  expect(bandFit(12, 0, 0)).toEqual({ level: 'full', embedTheirs: true, allowCard: true })
  expect(bandFit(12, 2, 6)).toEqual({ level: 'full', embedTheirs: true, allowCard: true })
  expect(bandFit(12, 2, 8)).toEqual({ level: 'full', embedTheirs: true, allowCard: false })
})

test('THE SEQUENCE (REGRESSION): the same bar while a turn takes rows from the slot: 12 rows idle, then 6, 4, 2, 1 as the turn runs, then idle again - always something drawn, never taller than the room', () => {
  const seen: string[] = []
  for (const maxRows of [12, 6, 4, 2, 1, 4, 12]) {
    const f = bandFit(maxRows, 0, 0)
    seen.push(f.level)
    expect(LEVEL_ROWS[f.level]).toBeLessThanOrEqual(Math.max(1, maxRows))
  }
  expect(seen).toEqual(['full', 'full', 'full', 'compact', 'line', 'full', 'full'])
})

test('the engine\'s own content (a task list during a turn) never pushes the bar out of its window', () => {
  // Beside 6 rows of the engine's content in a 8-row slot: only the compact bar fits next to it.
  const a = bandFit(8, 6, 0)
  expect(a.embedTheirs).toBe(true)
  expect(a.level).toBe('compact')
  // The slot is full of the engine's content: the bar is drawn alone, as one row, and theirs is left out.
  const b = bandFit(6, 6, 0)
  expect(b.embedTheirs).toBe(false)
  expect(b.level).toBe('full')
  const c = bandFit(3, 5, 0)
  expect(c).toEqual({ level: 'full', embedTheirs: false, allowCard: true })
  // Whenever theirs is drawn, bar plus theirs is within the slot.
  for (const maxRows of [2, 3, 5, 8, 12, 20]) {
    for (const theirs of [0, 1, 2, 4, 6, 10]) {
      const f = bandFit(maxRows, theirs, 0)
      expect(LEVEL_ROWS[f.level] + (f.embedTheirs ? theirs : 0)).toBeLessThanOrEqual(maxRows)
    }
  }
})

test('an unknown slot (no maxRows, zero, not a number) draws the full bar as before', () => {
  for (const m of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(bandFit(m as number | undefined, 3, 0).level).toBe('full')
})

test('estimateRows: columns add, rows take the tallest, a Text or Button is a row, an Svg is its height in rows', () => {
  const text = { type: 'Text', props: {}, children: ['x'] }
  const button = { type: 'Button', props: { label: 'b' } }
  const svg = { type: 'Svg', props: { height: 28 } }
  expect(estimateRows(text)).toBe(1)
  expect(estimateRows(svg)).toBe(2)
  expect(estimateRows({ type: 'Box', props: { flexDirection: 'column' }, children: [text, button, svg] })).toBe(4)
  expect(estimateRows({ type: 'Box', props: { flexDirection: 'row' }, children: [text, svg, button] })).toBe(2)
  expect(estimateRows({ type: 'Box', props: {}, children: [] })).toBe(0)
  expect(estimateRows(undefined)).toBe(0)
  expect(estimateRows(null)).toBe(0)
  expect(estimateRows('a string')).toBe(0)
})

test('the band log line says what was decided and why, tab separated, one line', () => {
  const l = bandLogLine({ atIso: '2026-10-09T15:00:00.000Z', level: 'line', maxRows: 2, theirsRows: 0, embedded: false, hostWorking: true, modBusy: true, columns: 120, px: 952, crewWorking: 1 })
  expect(l).toBe('2026-10-09T15:00:00.000Z\tline\tmaxRows=2\ttheirs=0(out)\thostWorking=true\tmodBusy=true\tcols=120\tpx=952\tcrewWorking=1\n')
  expect(bandLogLine({ atIso: 't', level: 'yield', maxRows: undefined, theirsRows: 3, embedded: true, hostWorking: false, modBusy: false, columns: 0, px: 0, crewWorking: 0 })).toContain('maxRows=none')
})
