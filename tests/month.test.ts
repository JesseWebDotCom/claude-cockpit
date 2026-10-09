// The API line's month (cockpit v9): since the 1st at 00:00 UTC, and the limit from credits.json.

import { expect, test } from './pure.ts'

import { apiLimitOf, parseCreditsFile } from '../hooks/limits.ts'
import { monthStartUtcMs, spendArgv } from '../hooks/spend.ts'

test('the month starts on the 1st at 00:00 UTC: the boundary, the first second, the last second, a leap February', async () => {
  expect(monthStartUtcMs(Date.parse('2026-10-08T22:00:00Z'))).toBe(Date.parse('2026-10-01T00:00:00Z'))
  expect(monthStartUtcMs(Date.parse('2026-10-01T00:00:00Z'))).toBe(Date.parse('2026-10-01T00:00:00Z'))
  expect(monthStartUtcMs(Date.parse('2026-09-30T23:59:59Z'))).toBe(Date.parse('2026-09-01T00:00:00Z'))
  expect(monthStartUtcMs(Date.parse('2026-10-31T23:59:59.999Z'))).toBe(Date.parse('2026-10-01T00:00:00Z'))
  expect(monthStartUtcMs(Date.parse('2028-02-29T12:00:00Z'))).toBe(Date.parse('2028-02-01T00:00:00Z'))
  expect(monthStartUtcMs(Date.parse('2027-01-01T00:00:00Z'))).toBe(Date.parse('2027-01-01T00:00:00Z'))
  expect(monthStartUtcMs(Date.parse('2026-12-31T23:59:59Z'))).toBe(Date.parse('2026-12-01T00:00:00Z'))
})

test('a time that is not a number means all time (0), never a guessed month', async () => {
  expect(monthStartUtcMs(Number.NaN)).toBe(0)
  expect(monthStartUtcMs(Number.POSITIVE_INFINITY)).toBe(0)
})

test('the query is asked for the month: the number is in the sql, nothing else is', async () => {
  const argv = spendArgv('/home/x', monthStartUtcMs(Date.parse('2026-10-08T22:00:00Z')))
  expect(argv[3]).toContain('>= ' + Date.parse('2026-10-01T00:00:00Z'))
  expect(argv.slice(0, 2)).toEqual(['sqlite3', '-readonly'])
})

test('the monthly limit: credits.json "limit", else its "total", else 200; zero or nonsense falls back to 200', async () => {
  expect(apiLimitOf(parseCreditsFile('{"opencode":{"limit":50,"total":200}}'))).toBe(50)
  expect(apiLimitOf(parseCreditsFile('{"opencode":{"total":150,"left":10,"expires":"2026-10-28"}}'))).toBe(150)
  expect(apiLimitOf(parseCreditsFile('{"opencode":{"left":10}}'))).toBe(200)
  expect(apiLimitOf(parseCreditsFile('{"opencode":{"limit":0,"total":0}}'))).toBe(200)
  expect(apiLimitOf(parseCreditsFile('{"opencode":{"limit":"$75"}}'))).toBe(75)
  expect(apiLimitOf(null)).toBe(200)
  expect(apiLimitOf(parseCreditsFile('not json'))).toBe(200)
})
