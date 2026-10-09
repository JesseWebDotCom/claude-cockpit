// COCKPIT-40: the bar's second row always carries all five services; subagent rows are crew rows at indent 0 with a tree connector; every hook file imports.
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { test, expect } from './pure.ts'
import { serviceRows } from '../hooks/services.ts'
import type { ServicesIn } from '../hooks/services.ts'
import { codexPool, parseCreditsFile } from '../hooks/limits.ts'
import { claudeWindows, emptyCache } from '../hooks/usage.ts'
import { TREE_LAST, TREE_MID, treeOf } from '../hooks/glyphs.ts'
import { rowSvg } from '../hooks/look.ts'
import { sessionRowIn, subRowIn } from '../hooks/register.tsx'

const NOW = Date.parse('2026-10-09T15:00:00Z')
const CREDITS = parseCreditsFile('{"opencode":{"total":200,"left":105.08,"spent":94.92,"expires":"2026-11-01","source":"console 2026-10-09"},"cloud":{"expires":"2026-11-30"}}')
const w = claudeWindows([{ kind: 'five_hour', percentUsed: 20, resetsAt: '2026-10-09T20:00:00Z' }, { kind: 'seven_day', percentUsed: 40, resetsAt: '2026-10-12T17:00:00Z' }], emptyCache, NOW)
const base: ServicesIn = { nowMs: NOW, claude: { five: w.five, week: w.week }, codex: codexPool(null, NOW, null), codexAtMs: null, credits: CREDITS, creditsAtMs: NOW, apiSpendSince: { usd: 5, atMs: NOW }, rows: [], outages: [], localUp: true }
const NONE: ServicesIn = { ...base, claude: null, credits: null, creditsAtMs: null, apiSpendSince: null, localUp: null }
// The bar's credit line moved on in COCKPIT-41 (icons, bars, no local model): see cockpit41.test.ts.

const sub = (id: string) => ({ id, name: id, type: 'x', model: 'm', status: 'running', description: 'look at things' })

test('subagent connectors: a lone child and the last child get the corner, the others the tee', () => {
  expect(TREE_MID).toBe('├ ')
  expect(TREE_LAST).toBe('└ ')
  expect(subRowIn(sub('a'), NOW).branch).toBe(TREE_LAST)
  const subs = [sub('a'), sub('b'), sub('c')]
  expect(subs.map((s, i) => subRowIn(s, NOW, i === subs.length - 1).branch)).toEqual([TREE_MID, TREE_MID, TREE_LAST])
  expect(treeOf(false)).toBe(TREE_MID)
})

test('crew rows all start at indent 0 and the character column is the same for the Captain and a subagent at every width', () => {
  const cap = sessionRowIn(NOW)
  const child = subRowIn(sub('a'), NOW, false)
  expect(cap.indent).toBe(0)
  expect(child.indent).toBe(0)
  for (const width of [360, 420, 520]) {
    const sprite = (svg: string): string => /<g transform="translate\(([\d.]+)/.exec(svg)?.[1] ?? /<svg[^>]*>[\s\S]*?x="([\d.]+)"/.exec(svg)?.[1] ?? ''
    const a = rowSvg(width, cap)
    const b = rowSvg(width, child)
    expect(sprite(a)).toBe(sprite(b))
    expect(b).toContain('├')
    expect(a).not.toContain('├')
  }
})

test('every hook file imports at load time without throwing', async () => {
  const dir = resolve(import.meta.dir, '../hooks')
  for (const f of readdirSync(dir).filter(n => /\.(ts|tsx)$/.test(n))) await import(resolve(dir, f))
})
