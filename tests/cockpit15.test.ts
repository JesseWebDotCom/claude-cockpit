// a lane's "Doing" and "Last report" showed raw tool output (a grep hit, a code fragment) taken for prose.
// Pure rules (hooks/output.ts, hooks/doing.ts, hooks/core.ts meaningfulTail, hooks/details.ts): runs under plain `bun test`.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { test, expect } from './pure.ts'
import { meaningfulTail } from '../hooks/core.ts'
import { memberDetail } from '../hooks/details.ts'
import type { MemberCardIn } from '../hooks/details.ts'
import { commandVerb, doingOf, lastReportOf } from '../hooks/doing.ts'
import { isCodeLike, isOutputLine, isSentence, outputMask, unwrapLines } from '../hooks/output.ts'
import { xml } from '../hooks/draw.ts'
import { rowSvg } from '../hooks/look.ts'
import type { LookRow } from '../hooks/look.ts'

const ROOT = resolve(import.meta.dir, '..')
const fixture = readFileSync(resolve(ROOT, 'fixtures/pane-opencode-a-grep-output.txt'), 'utf8').split('\n')

// The exact lines Alex saw (screenshot 2026-10-09).
const GREP_HIT = 'core.ts:133:export function ageLabel(ms: number): string {'
const FRAGMENT = '&& Number.isFinite(n)'

test('the exact grep hit and the exact code fragment are output, not prose', () => {
  expect(isOutputLine(GREP_HIT)).toBe(true)
  expect(isOutputLine(FRAGMENT)).toBe(true)
  expect(isCodeLike(FRAGMENT)).toBe(true)
  expect(isSentence(GREP_HIT)).toBe(false)
  expect(isSentence(FRAGMENT)).toBe(false)
})

test('output shapes: path:line pairs, numbered file lines, diff and patch lines, comments, "(no output)"', () => {
  for (const l of ['core.ts:133', 'hooks/core.ts:134:  if (!fin(ms)) return "-"', '  hooks/doing.ts:12:5: const x', '00013| import x from "y"', '133:export const a = 1', '@@ -1,3 +1,4 @@', '+const x = 1', '-  return p', '--- a/core.ts', '+++ b/core.ts', '(+4 -1)', '/** One line saying what a call was about */', '// a comment', '(no output)', 'EOF', '  return p', 'const b = {', '  foo(a, b);', ') => x.y']) expect(isOutputLine(l)).toBe(true)
})

test('sentences and list bullets are NOT output (prose still passes through)', () => {
  for (const l of ['The full gate reached the backend suite and is running now.', '- Fixed the retry bug in the poller', '• Waiting for the gate to free up, then pushing.', 'Searching for the claim reader before wiring it in.']) {
    expect(isOutputLine(l)).toBe(false)
    expect(isSentence(l)).toBe(true)
  }
})

test('Doing: a grep hit under a Grep tool call walks up to the call: "searching for ageLabel"', () => {
  const pane = ['  \u2731 Grep "ageLabel" in hooks (3 matches)', '    ' + GREP_HIT, '    core.ts:134:  if (!fin(ms)) return "-"', '    ' + FRAGMENT]
  const d = doingOf(pane)
  expect(d?.phrase).toBe('searching for ageLabel')
  expect(d?.verb).toBe('searching')
})

test('Doing: the hit alone, with no tool line above it, says nothing (null), never the hit', () => {
  expect(doingOf([GREP_HIT])).toBe(null)
  expect(doingOf([FRAGMENT])).toBe(null)
  expect(doingOf(['  some prose that was said a while ago, before the tool ran.', GREP_HIT, FRAGMENT])?.phrase).toBe('some prose that was said a while ago, before the tool ran.')
})

test('Doing: every OpenCode marker maps to a verb phrase', () => {
  const one = (l: string) => doingOf([l])?.phrase
  expect(one('\u2731 Grep "ageLabel" (3 matches)')).toBe('searching for ageLabel')
  expect(one('\u2731 Glob "**/*.ts" (12 matches)')).toBe('finding files **/*.ts')
  expect(one('\u2192 Read hooks/core.ts [offset=120, limit=40]')).toBe('reading core.ts')
  expect(one('\u2190 Edit hooks/doing.ts')).toBe('editing doing.ts')
  expect(one('\u2190 Write hooks/output.ts')).toBe('writing output.ts')
  expect(one('\u2192 List hooks')).toBe('listing hooks')
  expect(one('% WebFetch https://example.com/docs/x')).toBe('fetching example.com')
  expect(one('% WebSearch "mods api"')).toBe('searching the web')
  expect(one('\u2022 Task Explore the codebase')).toBe('running a sub-task')
  expect(one('$ rg -n "ageLabel" hooks/core.ts')).toBe('searching for ageLabel')
  expect(one("$ cat > hooks/mask.ts <<'EOF'")).toBe('writing mask.ts')
  expect(one('$ bun test')).toBe('running tests')
  expect(commandVerb("rg -n 'foo' src | head -40")).toEqual({ verb: 'searching', object: 'for foo' })
})

test('a read call followed by the file it printed is "reading core.ts"', () => {
  expect(doingOf(['\u2192 Read hooks/core.ts', '  127  export function ageLabel(ms: number): string {', '  128    if (!fin(ms)) return "-"', GREP_HIT])?.phrase).toBe('reading core.ts')
})

test('indented lines under a tool call are output until a line back at the tool line\'s indent', () => {
  const lines = ['  $ bun test', '    12 pass', '    0 fail', '  All the tests passed on the first run.']
  expect(outputMask(lines)).toEqual([false, true, true, false])
  expect(doingOf(lines)?.phrase).toBe('All the tests passed on the first run.')
})

test('a wrapped line is one line: the pane\'s hard wrap is joined before the line is classified', () => {
  const W = 40
  const long = 'const SHELL_TOOLS = new Set(["Bash", "PowerShell"]) && more'
  const wrapped = [long.slice(0, W), long.slice(W), 'x'.repeat(W), 'y'.repeat(W)]
  expect(unwrapLines(wrapped)[0]).toBe(long)
  // A break inside a word rejoins with no space, between words with one.
  expect(unwrapLines(['a'.repeat(38) + 'Gr', 'ep rest', 'b'.repeat(40), 'c'.repeat(40)])[0]).toBe('a'.repeat(38) + 'Grep rest')
  expect(unwrapLines(['a'.repeat(39) + ',', 'next words here', 'c'.repeat(40), 'd'.repeat(40), 'e'.repeat(40)])[0]).toBe('a'.repeat(39) + ', next words here')
  // A pane where nothing reaches a common width is left alone.
  expect(unwrapLines(['one', 'two words', 'three'])).toEqual(['one', 'two words', 'three'])
  // A sentence that the pane wrapped is read whole: the phrase does not end mid-expression.
  const sentence = 'The gate reached the backend suite and the weather assertion failed only once.'
  const pane = [sentence.slice(0, 40), sentence.slice(40), 'z'.repeat(40), 'y'.repeat(40)]
  expect(unwrapLines([sentence.slice(0, 40), sentence.slice(40), 'q'.repeat(40), 'r'.repeat(40)])[0]).toBe(sentence)
  expect(doingOf(unwrapLines([sentence.slice(0, 40), sentence.slice(40), 'q'.repeat(40), 'r'.repeat(40)]).slice(0, 1))?.full).toBe(sentence)
})

test('the live pane fixture (a heredoc of code) is all output: no Doing, no tail', () => {
  expect(doingOf(fixture)).toBe(null)
  expect(meaningfulTail(fixture)).toBe('')
})

test('the tail (row.tail) skips output too: the fragment is not the tail, the sentence above it is', () => {
  expect(meaningfulTail(['Wiring the claim reader into the poll now.', GREP_HIT, FRAGMENT])).toBe('Wiring the claim reader into the poll now.')
  expect(meaningfulTail([GREP_HIT, FRAGMENT])).toBe('')
})

const CARD = (lastReport: string): MemberCardIn => ({
  name: 'opencode-a', kind: 'opencode', activity: 'working', powered: '', target: '', item: 'FEAT-15', doing: 'searching for ageLabel', description: '', lastReport,
  since: '', lockOwner: '', lockAge: '', context: '', limits: '', blockedBy: [], errored: false, errorReason: '', out: false, back: '', isStale: false, isStuck: false,
})

test('Last report: the item\'s newest report file, else a plain sentence the lane wrote; code, grep hits and tool output never', () => {
  const none = { reportText: null, item: 'FEAT-15' }
  expect(lastReportOf({ ...none, paneLines: [FRAGMENT, GREP_HIT] })).toBe('')
  expect(lastReportOf({ ...none, paneLines: ['Some prose that is not a report at all, just talk.'] })).toBe('Some prose that is not a report at all, just talk.')
  expect(lastReportOf({ ...none, paneLines: ['  PROGRESS: the doctor now decides on authentication', FRAGMENT] })).toBe('the doctor now decides on authentication')
  expect(lastReportOf({ ...none, paneLines: [FRAGMENT], progressLabel: 'wiring the claim reader' })).toBe('wiring the claim reader')
  expect(lastReportOf({ ...none, paneLines: [FRAGMENT], progressLabel: GREP_HIT })).toBe('')
  expect(lastReportOf({ ...none, paneLines: [], reportText: '# FEAT-13 report: askpass helper\n\nStatus: done, gate green\n' })).toBe('askpass helper \u00b7 done, gate green')
})

test('with no last report the open row has no "Last report" line and the card has no "last:" line', () => {
  expect(memberDetail(CARD('')).some(l => l.label === 'Last report')).toBe(false)
  expect(memberDetail(CARD('askpass done, gate green')).find(l => l.label === 'Last report')?.text).toBe('askpass done, gate green')
})

const ROW: LookRow = {
  kind: 'opencode', variant: 0, mode: 'work', activity: 'working', title: 'opencode-a', state: { text: 'working', color: '#3FB950' }, item: 'FEAT-15 \u00b7 searching for a && b',
  tag: '', since: '', trouble: null, isOut: false, indent: 0, isOpen: true, detail: [{ label: 'Doing', text: 'searching for a && b' }], bars: [], burst: '', landed: '', phase: 0, tone: '',
}

test('no entity double-escaping: draw.ts escapes once, only for svg; nothing in the rules escapes', () => {
  expect(xml('a < b && c > d "q"')).toBe('a &lt; b &amp;&amp; c &gt; d &quot;q&quot;')
  const svg = rowSvg(520, ROW)
  expect(svg).toContain('a &amp;&amp; b')
  expect(svg).not.toContain('&amp;amp;')
  const src = readFileSync(resolve(ROOT, 'hooks/doing.ts'), 'utf8') + readFileSync(resolve(ROOT, 'hooks/output.ts'), 'utf8')
  expect(src).not.toMatch(/&amp;|&lt;|&gt;|&quot;/)
})
