// COCKPIT-43: the bar's credit row prints each service's name after its icon (Claude, Cloud, API, Codex), from the one list in services.ts.
import { test, expect } from './pure.ts'
import { SERVICES, serviceRows } from '../hooks/services.ts'
import type { ServicesIn } from '../hooks/services.ts'
import { codexPool, parseCreditsFile } from '../hooks/limits.ts'
import { claudeWindows, emptyCache } from '../hooks/usage.ts'

const NOW = Date.parse('2026-10-09T15:00:00Z')
const CREDITS = parseCreditsFile('{"opencode":{"total":200,"left":105.08,"expires":"2026-11-01","source":"console 2026-10-09"}}')
const w = claudeWindows([{ kind: 'five_hour', percentUsed: 20, resetsAt: '2026-10-09T20:00:00Z' }, { kind: 'seven_day', percentUsed: 40, resetsAt: '2026-10-12T17:00:00Z' }], emptyCache, NOW)
const base: ServicesIn = { nowMs: NOW, claude: { five: w.five, week: w.week }, codex: codexPool(null, NOW, null), codexAtMs: null, credits: CREDITS, creditsAtMs: NOW, apiSpendSince: { usd: 5, atMs: NOW }, rows: [], outages: [], localUp: true }

test('the names come from the one service list', () => {
  expect(SERVICES.filter(s => s.id !== 'local').map(s => s.short)).toEqual(['Claude', 'Cloud', 'API', 'Codex'])
})
// COCKPIT-46 replaced the row's layout tests (tests/cockpit46.test.ts): the services are packed left, not right-aligned.
