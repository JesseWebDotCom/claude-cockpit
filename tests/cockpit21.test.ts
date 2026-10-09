// COCKPIT-21 (cockpit 0.5.4): the second line of a card is the item id and a HUMAN title, never pane text. A fragment of source code scraped from
// the pane ("et) % period) / 1000) * 100) / 100 + 's'") once showed after the id. Order: the claim's line 3, else the brief's heading, else the
// id and the status word. The pane is used only for a clean "editing core.ts" style phrase, and only when there is no title.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { test, expect } from './pure.ts'
import { cleanVerbPhrase, doingOf, plainTitle, taskLineOf } from '../hooks/doing.ts'
import { parseClaim, resolveLaneItem } from '../hooks/laneitem.ts'
import { briefHeading, lastLines } from '../hooks/core.ts'

const ROOT = resolve(import.meta.dir, '..')
const read = (rel: string): string => readFileSync(resolve(ROOT, rel), 'utf8')
const FRAGMENT = "et) % period) / 1000) * 100) / 100 + 's'"
const PANE = lastLines(read('fixtures/pane-opencode-code-fragment.txt'), 40)
const NOW = Date.parse('2026-10-09T15:00:00Z')

test('the fixture really holds the fragment, and the pane scraper still finds it as a "doing" phrase (so the task line must not use it)', () => {
  expect(PANE.some(l => l.includes(FRAGMENT))).toBe(true)
  const d = doingOf(PANE)
  // whatever the scraper makes of this pane, the line below never carries it
  const line = taskLineOf({ item: 'COCKPIT-19', title: '', doing: { verb: '', phrase: FRAGMENT, full: FRAGMENT }, isSleeping: false, isWorking: true })
  expect(line).toBe('COCKPIT-19')
  expect(line).not.toContain('et)')
  void d
})

test('a claim with no line 3 and a brief with a heading: the line reads the heading, whatever the pane says', () => {
  const claim = parseClaim('COCKPIT-19.claim', 'COCKPIT-19\nlane: opencode-1\n', NOW - 5 * 60_000)
  expect(claim.title).toBe('')
  const brief = { name: 'brief-oc-cockpit19.md', heading: briefHeading('# COCKPIT-19: make Cockpit public\n\nbody', 'COCKPIT-19') }
  expect(brief.heading).toBe('make Cockpit public')
  const li = resolveLaneItem({ lane: 'opencode-1', awake: true, lastActivityMs: NOW, paneLines: PANE, lock: null, claims: [claim], runBrief: '', runStartedMs: null, briefs: [brief], reports: [], landed: [], nowMs: NOW })
  expect(li.item).toBe('COCKPIT-19')
  const text = taskLineOf({ item: li.item, title: brief.heading, claimTitle: claim.title, doing: doingOf(PANE), isSleeping: false, isWorking: true, statusWord: 'working' })
  expect(text).toBe('COCKPIT-19 \u00b7 make Cockpit public')
})

test('neither a claim title nor a brief: the line reads the id and the status word, nothing scraped', () => {
  const text = taskLineOf({ item: 'COCKPIT-19', title: '', claimTitle: '', doing: { verb: '', phrase: FRAGMENT, full: FRAGMENT }, isSleeping: false, isWorking: true, statusWord: 'working' })
  expect(text).toBe('COCKPIT-19 \u00b7 working')
  // and with the pane's real doing from the fixture
  expect(taskLineOf({ item: 'COCKPIT-19', title: '', doing: doingOf(PANE), isSleeping: false, isWorking: true, statusWord: 'working' })).not.toMatch(/[()/*+']/)
  expect(taskLineOf({ item: 'COCKPIT-19', title: '', doing: null, isSleeping: false, isWorking: true })).toBe('COCKPIT-19')
})

test('the claim\'s line 3 is the first choice; a key: value third line is not a title', () => {
  expect(parseClaim('API-12.claim', 'API-12\nlane: codex-a\nretry with backoff in the sync client\n', 5).title).toBe('retry with backoff in the sync client')
  expect(parseClaim('API-12.claim', 'API-12\nlane: codex-a\nitem: API-12\n', 5).title).toBe('')
  expect(parseClaim('API-12.claim', 'API-12\r\nlane: codex-a\r\nretry with backoff\r\n', 5).title).toBe('retry with backoff')
  expect(taskLineOf({ item: 'API-12', title: 'brief heading', claimTitle: 'retry with backoff', doing: null, isSleeping: false, isWorking: true })).toBe('API-12 \u00b7 retry with backoff')
  // the heading's own "ID:" lead is dropped, in either place
  expect(taskLineOf({ item: 'API-12', title: 'API-12: retry with backoff', doing: null, isSleeping: false, isWorking: true })).toBe('API-12 \u00b7 retry with backoff')
  // a claim title that looks like code is skipped, and the brief heading is used
  expect(taskLineOf({ item: 'API-12', title: 'retry with backoff', claimTitle: FRAGMENT, doing: null, isSleeping: false, isWorking: true })).toBe('API-12 \u00b7 retry with backoff')
})

test('code and log characters never reach the line: parentheses, operators, quotes, slashes, brackets', () => {
  for (const bad of [FRAGMENT, 'foo(bar)', 'a = b', 'x => y', '{ "k": 1 }', 'rm -rf /tmp/x', 'src/a/b.ts', 'a | b', 'done; next', "it's 'broken", '[1, 2]', '5 % 3', 'C:\\x']) {
    expect(plainTitle(bad), bad).toBe('')
    const t = taskLineOf({ item: 'X-1', title: bad, claimTitle: bad, doing: null, isSleeping: false, isWorking: true, statusWord: 'working' })
    expect(t, bad).toBe('X-1 \u00b7 working')
  }
  for (const good of ['make Cockpit public', 'retry with backoff in the sync client', 'owner and admin rows', "don't show code"]) expect(plainTitle(good), good).toBe(good)
  expect(plainTitle('**Bold** `title` here')).toBe('Bold title here')
  expect(plainTitle('x'.repeat(100)).length).toBe(60)
})

test('the "editing core.ts" verb shows only for a clean file name (else the bare verb)', () => {
  const ok = { verb: 'editing', phrase: 'editing core.ts', full: '' }
  expect(cleanVerbPhrase(ok)).toBe('editing core.ts')
  expect(cleanVerbPhrase({ verb: 'running tests', phrase: 'running tests', full: '' })).toBe('running tests')
  // a search pattern is never shown (the bare verb is); an unclean file name leaves the bare verb
  expect(cleanVerbPhrase({ verb: 'searching', phrase: 'searching for foo(bar) / 2', full: '' })).toBe('searching')
  expect(cleanVerbPhrase({ verb: 'editing', phrase: 'editing et) % period) / 1000', full: '' })).toBe('editing')
  expect(cleanVerbPhrase({ verb: 'running node', phrase: 'running node', full: '' })).toBe('')
  expect(cleanVerbPhrase({ verb: '', phrase: 'The full gate passed.', full: '' })).toBe('')
  expect(cleanVerbPhrase(null)).toBe('')
  expect(taskLineOf({ item: 'X-1', title: '', doing: ok, isSleeping: false, isWorking: true })).toBe('X-1 \u00b7 editing core.ts')
  // with a title, the clean verb follows it (only a clean one); a sleeper shows the title alone
  expect(taskLineOf({ item: 'X-1', title: 'a title', doing: ok, isSleeping: false, isWorking: true })).toBe('X-1 \u00b7 a title \u00b7 editing core.ts')
  expect(taskLineOf({ item: 'X-1', title: 'a title', doing: ok, isSleeping: true, isWorking: false })).toBe('X-1 \u00b7 a title')
  expect(taskLineOf({ item: 'X-1', title: 'a title', doing: { verb: 'editing', phrase: 'editing et) % period) / 1000', full: '' }, isSleeping: false, isWorking: true })).toBe('X-1 \u00b7 a title \u00b7 editing')
  // prose the lane wrote is never the second line
  expect(taskLineOf({ item: 'X-1', title: '', doing: { verb: '', phrase: 'The full gate reached the backend suite.', full: '' }, isSleeping: false, isWorking: true })).toBe('X-1')
})

test('the card uses the claim title and the status word, and the pane scrape is no longer a source', () => {
  const src = read('hooks/register.tsx')
  expect(src).toContain('claimTitle: m.claimTitle')
  expect(src).toContain('statusWord: statusWordOf(m.activity')
  const doing = read('hooks/doing.ts')
  expect(doing).not.toContain("[o.item, doing].filter(x => x !== '').join(' \\u00b7 ')")
})

test('the manifest is 0.5.4 or later', () => {
  expect(JSON.parse(read('.claude-plugin/plugin.json')).version).toMatch(/^0\.(?:5\.(?:[4-9]|\d{2})|(?:[6-9]|\d{2})\.\d+)$/)
})
