// COCKPIT-20 (cockpit 0.5.3): the active card's border travels the WHOLE perimeter and carries on across redraws.
// Cause: the bright stretch is a CSS animation of one lap in 5 s inside the card's svg; while anything works the card is redrawn every second, a
// new svg started the animation from the top again, so the stretch only ever covered the first fifth of the lap and jumped back. Fix: phaseCss
// gives `.bt` a negative delay from the wall clock, so each new svg continues the lap.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { test, expect } from './pure.ts'
import { BORDER_PERIOD_MS, borderCell, phaseCss } from '../hooks/draw.ts'
import { borderSvg, rowSvg } from '../hooks/look.ts'
import type { LookRow } from '../hooks/look.ts'
import { REDRAW_WORKING_MS } from '../hooks/live.ts'

const ROOT = resolve(import.meta.dir, '..')

const ROW: LookRow = {
  kind: 'codex', variant: 0, mode: 'work', activity: 'coding', title: 'codex-a', state: { text: 'working', color: '#22C55E' }, item: 'X-01 \u00b7 editing core.ts', tag: 'GPT-6 low', since: '4m',
  trouble: null, isOut: false, indent: 0, isOpen: false, detail: [], bars: [], burst: '', landed: '', phase: 0, tone: 'green', border: 'pulse',
}

// The perimeter of a card in whole cells (one per pixel of its ring): a fixed, large number is just as good, the rule is modulo.
const perimeterOf = (w: number, h: number): number => 2 * (w - 2) + 2 * (h - 2)

test('one full cycle visits every perimeter cell exactly once, for narrow, wide and tall cards', () => {
  for (const [w, h] of [[240, 36], [520, 52], [900, 36], [520, 400]] as const) {
    const cells = perimeterOf(w, h)
    const seen = new Map<number, number>()
    // One sample in the middle of each frame of the lap.
    for (let k = 0; k < cells; k++) {
      const c = borderCell(((k + 0.5) * BORDER_PERIOD_MS) / cells, cells)
      seen.set(c, (seen.get(c) ?? 0) + 1)
    }
    expect(seen.size).toBe(cells)
    for (let c = 0; c < cells; c++) expect(seen.get(c)).toBe(1)
  }
})

test('the frame after the last is frame 0: the lap closes with no stop and no jump (modulo, never a clamp)', () => {
  for (const cells of [1, 7, 100, 568, 1136]) {
    expect(borderCell(0, cells)).toBe(0)
    expect(borderCell(BORDER_PERIOD_MS, cells)).toBe(borderCell(0, cells))
    expect(borderCell(BORDER_PERIOD_MS * 7, cells)).toBe(0)
    // The last frame of a lap is the last cell, and one tick later it is cell 0.
    const dt = BORDER_PERIOD_MS / cells
    expect(borderCell(BORDER_PERIOD_MS - dt / 2, cells)).toBe(cells - 1)
    expect(borderCell(BORDER_PERIOD_MS + dt / 2, cells)).toBe(0)
  }
  // Wall-clock times far apart wrap too (a negative or odd time never leaves the perimeter).
  for (const t of [0, 1, 4999, 5000, 123_456_789, -3000, Number.NaN]) {
    const c = borderCell(t, 568)
    expect(c).toBeGreaterThanOrEqual(0)
    expect(c).toBeLessThan(568)
  }
})

const delayOf = (svg: string): number => {
  const m = /\.bt\{animation-delay:-([\d.]+)s\}/.exec(svg)
  expect(m).not.toBeNull()
  return Number(m![1])
}

test('every redraw carries on where the last one was: the delay is the wall clock\'s place in the 5 s lap', () => {
  expect(phaseCss(0)).toContain('.bt{animation-delay:-0s}')
  expect(phaseCss(1000)).toContain('.bt{animation-delay:-1s}')
  expect(phaseCss(4000)).toContain('.bt{animation-delay:-4s}')
  expect(phaseCss(5000)).toContain('.bt{animation-delay:-0s}')
  expect(phaseCss(12_500)).toContain('.bt{animation-delay:-2.5s}')
  expect(phaseCss(Number.NaN)).toContain('.bt{animation-delay:-0s}')
  // The pulse card's own svg has it, with its phase.
  expect(delayOf(rowSvg(520, { ...ROW, phase: 3000 }))).toBe(3)
  expect(delayOf(rowSvg(520, { ...ROW, phase: 8000 }))).toBe(3)
  // The keyframes and the lap time are the ones the delay assumes.
  const svg = rowSvg(520, ROW)
  expect(svg).toContain('@keyframes bt{to{stroke-dashoffset:-100}}')
  expect(svg).toContain('.bt{animation:bt 5s linear infinite}')
  expect(BORDER_PERIOD_MS).toBe(5000)
})

test('across the redraws of a working lane (every second) the bright stretch passes every fifth of the lap, then wraps; it no longer restarts at the top', () => {
  // The position in percent of the lap, `elapsedMs` after an svg drawn at `phase`.
  const pos = (phase: number, elapsedMs: number): number => (((delayOf(rowSvg(520, { ...ROW, phase })) * 1000 + elapsedMs) % BORDER_PERIOD_MS) / BORDER_PERIOD_MS) * 100
  const start = 1_000_000_000_000
  const heads: number[] = []
  for (let i = 0; i < 12; i++) {
    const drawnAt = start + i * REDRAW_WORKING_MS
    // The moment this svg is replaced by the next one: its position then is the next one's position at the start (no jump).
    expect(Math.abs(pos(drawnAt, REDRAW_WORKING_MS) - pos(drawnAt + REDRAW_WORKING_MS, 0)) % 100).toBeLessThan(1e-6)
    heads.push(Math.round(pos(drawnAt, 0)))
  }
  // Twelve redraws are two and a bit laps: every fifth of the lap shows up, and it wraps from 80 to 0.
  expect(new Set(heads.map(h => Math.floor(h / 20)))).toEqual(new Set([0, 1, 2, 3, 4]))
  expect(heads.slice(0, 6)).toEqual([...heads.slice(5, 11)].map((_, i) => heads[(i) % 12]!))
  // The old behaviour (no delay: every svg started at 0) never got past a fifth of the lap.
  const old = Array.from({ length: 12 }, () => Math.round((0 / BORDER_PERIOD_MS) * 100))
  expect(Math.max(...old)).toBe(0)
})

test('the ring is one rounded rect with pathLength 100, so its dash covers the whole perimeter for any width and height', () => {
  for (const [w, h] of [[240, 36], [520, 52], [900, 400]] as const) {
    const svg = borderSvg(w, h, 'pulse')
    expect(svg).toContain(`width="${w - 2}" height="${h - 2}"`)
    expect(svg).toContain('pathLength="100" stroke-dasharray="14 86"')
  }
})

test('the manifest is 0.5.3 or later', () => {
  expect(JSON.parse(readFileSync(resolve(ROOT, '.claude-plugin/plugin.json'), 'utf8')).version).toMatch(/^0\.(?:5\.(?:[3-9]|\d{2})|(?:[6-9]|\d{2})\.\d+)$/)
})
