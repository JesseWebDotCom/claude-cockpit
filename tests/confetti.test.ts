import { describe, expect, test } from 'bun:test'
import { CONFETTI_MS, CONFETTI_ROWS, confettiRows, justFinished } from '../hooks/confetti'

describe('confetti', () => {
  test('a finished plan celebrates only on the change, never on first sight', () => {
    expect(justFinished(null, true)).toBe(false)
    expect(justFinished(true, true)).toBe(false)
    expect(justFinished(false, false)).toBe(false)
    expect(justFinished(false, true)).toBe(true)
  })
  test('rows exist during the burst and are gone after it', () => {
    expect(confettiRows(null, 100, 60)).toEqual([])
    expect(confettiRows(1000, 1000 + CONFETTI_MS, 60)).toEqual([])
    const rows = confettiRows(1000, 1500, 60)
    expect(rows.length).toBe(CONFETTI_ROWS)
    expect(rows.flat().some(c => c.color !== undefined)).toBe(true)
  })
  test('each row is exactly as wide as asked', () => {
    for (const r of confettiRows(0, 700, 80)) expect(r.map(c => c.text).join('').length).toBe(80)
  })
  test('a frame is reproducible', () => {
    expect(confettiRows(0, 700, 40)).toEqual(confettiRows(0, 700, 40))
  })
})
