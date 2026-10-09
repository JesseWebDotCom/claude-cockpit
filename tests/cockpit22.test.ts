// COCKPIT-22 (cockpit 0.5.5): the open card keeps "Doing" and "Last report", but only readable ones. Every candidate (a pane line, a claim line, a
// report's heading and Status line) passes plainTitle; the pane is scanned from its newest line backwards and the first line that passes is taken.
// Pure rules: runs under plain `bun test`.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { test, expect } from './pure.ts'
import { doingLineOf, lastReportOf, paneDoingOf, paneSentenceOf, reportSummaryOf } from '../hooks/doing.ts'
import { memberDetail } from '../hooks/details.ts'
import type { MemberCardIn } from '../hooks/details.ts'
import { claimNowOf, parseClaim } from '../hooks/laneitem.ts'
import { lastLines } from '../hooks/core.ts'

const ROOT = resolve(import.meta.dir, '..')
const read = (rel: string): string => readFileSync(resolve(ROOT, rel), 'utf8')
const FRAGMENT = "et) % period) / 1000) * 100) / 100 + 's'"
const PANE = lastLines(read('fixtures/pane-opencode-code-fragment.txt'), 40)

test('Doing: a code fragment on the newest line is skipped and an earlier plain line is chosen', () => {
  expect(PANE.some(l => l.includes(FRAGMENT))).toBe(true)
  expect(paneDoingOf(PANE, 'COCKPIT-19')).toBe('editing draw.ts')
  const text = doingLineOf({ pane: paneDoingOf(PANE, 'COCKPIT-19'), heading: '', item: 'COCKPIT-19', statusWord: 'working', isSleeping: false })
  expect(text).toBe('editing draw.ts')
  expect(text).not.toContain('et)')
})

test('Doing: a plain sentence the lane wrote is a candidate; a PROGRESS line is too; a status bar is not', () => {
  expect(paneDoingOf(['Wiring the claim reader into the poll now.', FRAGMENT])).toBe('Wiring the claim reader into the poll now.')
  expect(paneDoingOf(['  PROGRESS: wiring the claim reader', 'a && b'])).toBe('wiring the claim reader')
  expect(paneDoingOf(['> build \u00b7 claude-sonnet-5-5'])).toBe('')
})

test('Doing: the tail of a wrapped code or log line is not a sentence (lowercase start, snake_case, a command, an id)', () => {
  for (const bad of ['multiple and allow_current.', 'stores an entity ID, and supports clearing to null.', 'b23-report.md.', 'Resume with: claude --teleport session_01WzX9YwmdYqWwhTfNCKUpiJ', 'Done.']) {
    expect(paneDoingOf([bad])).toBe('')
    expect(paneSentenceOf([bad])).toBe('')
  }
  expect(paneDoingOf(['I stopped without committing or pushing, as instructed.'])).toBe('I stopped without committing or pushing, as instructed.')
})

test('Doing: a pane with no plain line falls back to the claim title, then the brief heading, then the status word', () => {
  const junk = [FRAGMENT, 'foo(bar) / 3', 'x => y', '{ "k": 1 }']
  expect(paneDoingOf(junk)).toBe('')
  const base = { pane: paneDoingOf(junk), item: 'COCKPIT-22', statusWord: 'working', isSleeping: false }
  expect(doingLineOf({ ...base, claimTitle: 'open card shows readable doing', heading: 'the brief heading' })).toBe('open card shows readable doing')
  expect(doingLineOf({ ...base, claimTitle: FRAGMENT, heading: 'COCKPIT-22: the brief heading' })).toBe('the brief heading')
  expect(doingLineOf({ ...base, claimTitle: '', heading: FRAGMENT })).toBe('working')
  expect(doingLineOf({ ...base, claimTitle: '', heading: '' })).toBe('working')
})

test('Doing: the claim\'s now: line wins when it is plain; when it is not, the pane is used; a sleeper skips the pane and the now: line', () => {
  const claim = parseClaim('COCKPIT-22.claim', 'COCKPIT-22\nlane: opencode-2\nopen card shows readable doing\nnow: writing the tests for the gate\n', 5)
  expect(claim.now).toBe('writing the tests for the gate')
  expect(claim.title).toBe('open card shows readable doing')
  const base = { pane: 'editing draw.ts', heading: '', item: 'COCKPIT-22', statusWord: 'working', isSleeping: false }
  expect(doingLineOf({ ...base, now: claim.now, claimTitle: claim.title })).toBe('writing the tests for the gate')
  expect(doingLineOf({ ...base, now: FRAGMENT })).toBe('editing draw.ts')
  expect(doingLineOf({ ...base, now: claim.now, claimTitle: claim.title, isSleeping: true, statusWord: 'sleeping' })).toBe('open card shows readable doing')
  expect(doingLineOf({ ...base, isSleeping: true, statusWord: 'sleeping' })).toBe('sleeping')
})

test('the claim\'s now: line: any case, CRLF, an empty or code line is nothing, a "now" inside other text is not it', () => {
  expect(claimNowOf('X-1\nlane: a\ntitle t\nNow:   fixing the retry loop\r\n', 'X-1')).toBe('fixing the retry loop')
  expect(claimNowOf('X-1\nlane: a\nnow:\nthe next line\n', 'X-1')).toBe('')
  expect(claimNowOf('X-1\nlane: a\nnow: a = b(c)\n', 'X-1')).toBe('')
  expect(claimNowOf('X-1\nlane: a\nsee now: later\n', 'X-1')).toBe('')
  expect(parseClaim('X-1.claim', 'X-1\nlane: a\n', 5).now).toBe('')
})

const REPORT = [
  '# COCKPIT-21 report: the task line never shows code or log fragments (Cockpit 0.5.4)',
  '',
  'Status: done, installed, tested as pure rules. **Not seen on the real desktop.** Model: claude-sonnet-5-5 in OpenCode. Nothing committed or pushed.',
  '',
  'More text.',
].join('\n')

test('Last report: the heading and the Status line of the newest report file, in plain words', () => {
  const t = reportSummaryOf(REPORT, 'COCKPIT-21')
  expect(t).toBe('the task line never shows code or log fragments \u00b7 done, installed, tested as pure rules. Not seen on the real desktop. Model: claude-sonnet-5-5 in OpenCode. Nothing committed or pushed.')
  expect(lastReportOf({ reportText: REPORT, item: 'COCKPIT-21', paneLines: PANE })).toBe(t)
})

test('Last report: a Status line with code in it gives its plain sentences; a heading with code is left out; neither plain is nothing', () => {
  const messy = '# a/b.ts report\n\nStatus: done in src/a.ts (3 files). Gate green.\n'
  expect(reportSummaryOf(messy)).toBe('Gate green.')
  expect(reportSummaryOf('# x\n\nStatus: a = b(c)\n')).toBe('')
  expect(reportSummaryOf('no heading and no status line here')).toBe('')
})

test('Last report: no report file falls back to the lane\'s last plain sentence (never the fragment, never the Doing line), else is omitted', () => {
  const none = { reportText: null, item: 'COCKPIT-19' }
  expect(lastReportOf({ ...none, paneLines: PANE })).toBe('')
  expect(lastReportOf({ ...none, paneLines: ['The gate is green on the second run.', FRAGMENT] })).toBe('The gate is green on the second run.')
  expect(lastReportOf({ ...none, paneLines: ['The gate is green on the second run.', FRAGMENT], skip: 'The gate is green on the second run.' })).toBe('')
  expect(paneSentenceOf(['Gate passed twice today.', 'foo(bar)'])).toBe('Gate passed twice today.')
  // a report with nothing plain in it falls through to the pane
  expect(lastReportOf({ reportText: '# a/b\nStatus: x = y\n', item: 'X-1', paneLines: ['Reading the claim files now.'] })).toBe('Reading the claim files now.')
})

const CARD = (doing: string, lastReport: string): MemberCardIn => ({
  name: 'opencode-1', kind: 'api', activity: 'working', powered: '', target: '', item: 'COCKPIT-22', doing, description: '', lastReport,
  since: '', lockOwner: '', lockAge: '', context: '', limits: '', blockedBy: [], errored: false, errorReason: '', out: false, back: '', isStale: false, isStuck: false,
})

test('the open card keeps both lines; a long Last report wraps under its label', () => {
  const rows = memberDetail(CARD('editing draw.ts', 'the task line never shows code or log fragments \u00b7 done, installed, tested as pure rules'))
  expect(rows.find(r => r.label === 'Doing')?.text).toBe('editing draw.ts')
  const at = rows.findIndex(r => r.label === 'Last report')
  expect(at).toBeGreaterThan(-1)
  expect(rows[at + 1]?.label).toBe('')
  expect(rows.slice(at, at + 3).map(r => r.text).join(' ')).toContain('done, installed')
  expect(memberDetail(CARD('', '')).some(r => r.label === 'Last report' || r.label === 'Doing')).toBe(false)
})

test('the source wires it: the card\'s doing is doingLineOf, the reader passes the report file\'s text', () => {
  const reg = read('hooks/register.tsx')
  expect(reg).toContain('doing: doingLineOf(')
  expect(reg).toContain("reportTextCache.get(r.id + '-report.md')")
})
