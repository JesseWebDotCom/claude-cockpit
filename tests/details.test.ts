import { expect, test } from './pure.ts'

import { cloudText, contextCard, memberCard, shortName, systemCard, systemDots } from '../hooks/details.ts'
import type { MemberCardIn } from '../hooks/details.ts'
import { emptyReading } from '../hooks/system.ts'

const BASE: MemberCardIn = {
  name: 'codex-a',
  kind: 'codex',
  activity: 'coding',
  powered: 'Codex (ChatGPT plan) \u00b7 GPT-6 Luna low',
  target: 'Billing Settings',
  item: 'b21b',
  description: 'land ADMIN-BILL-SETTINGS-01 without the home-location field',
  lastReport: 'ran the tests, 14 passed',
  since: '12s',
  lockOwner: 'coordinator',
  lockAge: '3h ago',
  context: '',
  limits: 'Codex: 5h 52% used  week 97% used',
  blockedBy: [],
  errored: false,
  errorReason: '',
  out: false,
  back: '',
  isStale: false,
  isStuck: false,
}

test('a Codex member card: name and kind, powered by, state and time, item, task, last report, lock, both limit windows', async () => {
  const lines = memberCard(BASE)
  expect(lines[0]).toBe('codex-a \u00b7 codex')
  expect(lines).toContain('powered by Codex (ChatGPT plan) \u00b7 GPT-6 Luna low')
  expect(lines).toContain('coding \u00b7 Billing Settings (12s)')
  expect(lines).toContain('item: b21b')
  expect(lines).toContain('task: land ADMIN-BILL-SETTINGS-01 without the home-location field')
  expect(lines).toContain('last: ran the tests, 14 passed')
  expect(lines).toContain('lock: coordinator, 3h ago')
  expect(lines).toContain('Codex: 5h 52% used  week 97% used')
  // Nothing that is not known is invented: no error, no blocked line.
  expect(lines.join('\n')).not.toMatch(/errored|blocked|out of credits|undefined|NaN/)
})

test('an OpenCode member card: its credit line and the model, no lock lines when it has no lock', async () => {
  const lines = memberCard({ ...BASE, name: 'opencode-a', kind: 'api', powered: 'Claude API \u00b7 Sonnet 5.5', lockOwner: '', lockAge: '', item: '', limits: 'OpenCode (Claude API): $62 spent \u00b7 $138 left \u00b7 expires Oct 28' })
  expect(lines[0]).toBe('opencode-a \u00b7 api')
  expect(lines).toContain('powered by Claude API \u00b7 Sonnet 5.5')
  expect(lines).toContain('OpenCode (Claude API): $62 spent \u00b7 $138 left \u00b7 expires Oct 28')
  expect(lines.some(l => l.startsWith('lock:'))).toBe(false)
  expect(lines.some(l => l.startsWith('item:'))).toBe(false)
})

test('a cloud member card: the short name, and text only when it passes the junk filter', async () => {
  // The real junk of the 9:33 PM screenshots: code and shell art, rejected by the junk filter.
  const junk = ".replace(/\\bundefined\\b/g, '')"
  const lines = memberCard({ ...BASE, name: 'cloud-shared-remote-state-check', kind: 'cloud', description: junk, lastReport: '\u2592\u2592 zsh \u2592\u2592 100\u2592 21:29:35', limits: 'Claude cloud: expires Nov 30' })
  expect(lines[0]).toBe('shared-remote \u00b7 cloud')
  expect(lines.some(l => l.startsWith('task:'))).toBe(false)
  expect(lines.some(l => l.startsWith('last:'))).toBe(false)
  expect(lines).toContain('Claude cloud: expires Nov 30')
  const clean = memberCard({ ...BASE, name: 'cloud-a', kind: 'cloud', description: 'Reviewing the remote state of the shared repository', lastReport: '' })
  expect(clean).toContain('task: Reviewing the remote state of the shared repository')
  expect(cloudText('foo();')).toBe('')
})

test('a local member card has no limits line; the coordinator card has the context and the Claude Max windows', async () => {
  const local = memberCard({ ...BASE, name: 'local-1', kind: 'local', powered: 'Local \u00b7 qwen3', limits: '', item: '', lockOwner: '', lockAge: '' })
  expect(local.some(l => /5h|week|credit/.test(l))).toBe(false)
  const max = memberCard({ ...BASE, name: 'this session', kind: 'max', powered: 'Claude Max \u00b7 Opus 5.5', context: 'context 74% \u00b7 148k of 200k', limits: 'Claude Max: 5h 31% used  week 62% used', lockOwner: '', lockAge: '', item: '' })
  expect(max).toContain('context 74% \u00b7 148k of 200k')
  expect(max).toContain('Claude Max: 5h 31% used  week 62% used')
})

test('errored shows its reason, or "errored" alone with none; out of credits shows when it is back; blocked lists the why', async () => {
  expect(memberCard({ ...BASE, errored: true, errorReason: 'session died' })).toContain('errored: session died')
  expect(memberCard({ ...BASE, errored: true, errorReason: '' })).toContain('errored')
  expect(memberCard({ ...BASE, errored: true, errorReason: '' }).some(l => l.startsWith('errored:'))).toBe(false)
  expect(memberCard({ ...BASE, out: true, back: 'back Thu 9:00' })).toContain('out of credits, back Thu 9:00')
  expect(memberCard({ ...BASE, out: true, back: '' })).toContain('out of credits')
  expect(memberCard({ ...BASE, blockedBy: [{ on: 'codex-b', why: 'needs b20c on main' }] })).toContain('blocked by codex-b: needs b20c on main')
  expect(memberCard({ ...BASE, isStuck: true }).some(l => l.startsWith('stuck?'))).toBe(true)
  expect(memberCard({ ...BASE, isStale: true }).some(l => l.startsWith('stale?'))).toBe(true)
})

test('short names: a cloud name loses its prefix and keeps two words; other kinds are unchanged', async () => {
  expect(shortName('cloud-shared-remote-sta\u2026', 'cloud')).toBe('shared-remote')
  expect(shortName('cloud-shared', 'cloud')).toBe('shared')
  expect(shortName('codex-a', 'codex')).toBe('codex-a')
  expect(shortName('opencode-a', 'api')).toBe('opencode-a')
})

test('system dots: memory, CPU, disk, worst first; a listed host only when it answered, under its own name', async () => {
  const r = { ...emptyReading, memFree: 6, swapMB: 7000, load1: 3, cores: 8, diskFree: 40 }
  const dots = systemDots(r, [])
  expect(dots.map(d => d.name)).toEqual(['memory', 'cpu', 'disk'])
  expect(dots[0]?.color).toBe('#F85149')
  expect(dots[2]?.color).toBe('#3FB950')
  // A host that did not answer (grey) is left out; one that did is a fourth dot, named as listed (spaces and all).
  expect(systemDots(r, [{ name: 'gpu-server', answered: false, mem: null, gpu: null }]).map(d => d.name)).toEqual(['memory', 'cpu', 'disk'])
  const withHost = systemDots(r, [{ name: 'gpu server', answered: true, mem: { totalMB: 32000, availMB: 20000, freePct: 62, swapUsedMB: 0 }, gpu: { usedMB: 1, totalMB: 10, util: 1 } }])
  expect(withHost.map(d => d.name)).toContain('gpu server')
  expect(withHost.filter(d => d.name.includes('gpu')).length).toBe(1)
  // Worse comes first: a red memory before an amber CPU before green.
  const order = ['red', 'amber', 'green', 'grey']
  const levels = withHost.map(d => order.indexOf(d.level))
  expect([...levels].sort((a, b) => a - b)).toEqual(levels)
  // Nothing is known: grey dots, never a crash.
  expect(systemDots(emptyReading, []).every(d => d.level === 'grey')).toBe(true)
})

test('system card: the numbers (used, swap) and the top three memory processes', async () => {
  const r = { ...emptyReading, memFree: 22, swapMB: 3000, load1: 2.5, cores: 8, diskFree: 40, top: [{ name: 'chrome', mb: 3200 }, { name: 'bun', mb: 1800 }, { name: 'node', mb: 900 }, { name: 'zsh', mb: 10 }] }
  const lines = systemCard(r, [])
  expect(lines.some(l => l.includes('Memory 78% used') && l.includes('swap'))).toBe(true)
  expect(lines.some(l => l.includes('Disk 60% used'))).toBe(true)
  const top = lines[lines.length - 1] ?? ''
  expect(top).toContain('chrome')
  expect(top).toContain('node')
  expect(top).not.toContain('zsh')
})

test('context card: tokens, startup cost (not read here, never guessed) and the handoff age', async () => {
  const now = 1_000_000_000_000
  const lines = contextCard({ used: 148000, window: 200000, percent: 74, handoffMtimeMs: now - 5 * 60_000, nowMs: now })
  expect(lines[0]).toBe('context 74% \u00b7 148k of 200k tokens')
  expect(lines).toContain('startup cost: not read here')
  expect(lines).toContain('handoff written 5m ago')
  expect(contextCard({ used: null, window: null, percent: null, handoffMtimeMs: null, nowMs: now })).toEqual(['context: no data', 'startup cost: not read here', 'no handoff written today'])
})
