// COCKPIT-50: the title and the done count on the status row above the input box are plain Text beside the bar, first in the row,
// so they cannot vanish when the bar picture is dropped. The bar picture holds no text and obeys the host's Svg rules.
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(import.meta.dir, '..', 'hooks/register.tsx'), 'utf8')

import { headCells, textBar } from '../hooks/look.ts'

test('the text bar is proportional: 0/N empty, 1/7 one cell, 9/10 nearly full, N/N full', () => {
  const cells = 20
  expect(textBar(0, cells).filled).toBe('')
  expect(textBar(1 / 7, cells).filled.length).toBe(3)
  expect(textBar(0.9, cells).filled.length).toBe(18)
  expect(textBar(1, cells).filled.length).toBe(cells)
  expect(textBar(0.01, cells).filled.length).toBe(1)
  expect(textBar(0.999, cells).empty.length).toBe(1)
  expect(textBar(null, cells).filled).toBe('')
  for (const r of [0, 0.3, 1]) expect(textBar(r, cells).filled.length + textBar(r, cells).empty.length).toBe(cells)
})

test('the cells grow to 30 on a wide row and shrink to 12 before the title truncates; the count never drops', () => {
  const wide = headCells(1112 * 0.6, 'Remote Stack pairing', '9/10')
  expect(wide.cells).toBe(30)
  expect(wide.title).toBe('Remote Stack pairing')
  const mid = headCells(330, 'Remote Stack pairing', '9/10')
  expect(mid.cells).toBeGreaterThanOrEqual(12)
  expect(mid.cells).toBeLessThan(30)
  expect(mid.title).toBe('Remote Stack pairing')
  for (const px of [150, 250, 340, 420]) {
    const s = headCells(px, 'Remote Stack pairing and more words', '9/10')
    expect(s.cells).toBe(12)
    expect(s.count).toBe('9/10')
    expect(s.title.length).toBeGreaterThan(0)
    expect(s.cells + 1 + s.title.length + 1 + s.count.length).toBeLessThanOrEqual(Math.max(Math.floor(px / 8), 12 + 1 + 1 + 1 + 4))
  }
  expect(headCells(340, 'Short', '1/7').title).toBe('Short')
})

test('the status row draws no Svg for the bar, title or count', () => {
  const a = SRC.indexOf('const progress = Box({ key')
  expect(a).toBeGreaterThan(0)
  expect(SRC.slice(a, a + 400)).not.toContain('Svg(')
  expect(SRC).not.toContain("key: 'band-progress', source")
})

test('the row puts the bar first, then the plain-Text title, then the count, and the alt never holds the title', () => {
  const c = SRC.indexOf('...(st.ratio !== null ? [progress]')
  const a = SRC.indexOf("key: 'band-title'")
  const b = SRC.indexOf("key: 'band-count'")
  expect(c).toBeGreaterThan(0)
  expect(a).toBeGreaterThan(c)
  expect(b).toBeGreaterThan(a)
  expect(SRC).toContain('crew-band-pieces.log')
})
