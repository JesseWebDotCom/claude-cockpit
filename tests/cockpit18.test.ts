// (cockpit 0.5.1): crew ordering, the wrong "working" card, stale claims, the unsaved-work status line, sleeping crew in grey, the Captain never
// asleep, and AUTOPILOT. Pure rules with the real pane captures as fixtures, and the module's own functions with a fake host.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { test, expect } from './pure.ts'
import { AUTOPILOT_OFF_MESSAGE, AUTOPILOT_ON_MESSAGE, autopilotArgOf, autopilotMessage, autopilotPill, autopilotWord, captainLine, inboxMessage } from '../hooks/autopilot.ts'
import { classifyLane, lastLines, meaningfulTail } from '../hooks/core.ts'
import { GROUP_RANK, groupOf, orderCrew, parseCrewArgs, RECENCY_BUCKET_MS } from '../hooks/crew.ts'
import { spriteSvg, toGray } from '../hooks/draw.ts'
import { doingOf, taskLineOf } from '../hooks/doing.ts'
import { STALE_CLAIM_MS, pickRunLane, resolveLaneItem } from '../hooks/laneitem.ts'
import type { LaneItemIn } from '../hooks/laneitem.ts'
import { isSleepingRow, rowStyleOf, rowSvg } from '../hooks/look.ts'
import type { LookRow } from '../hooks/look.ts'
import { atShellPrompt, isShellPromptLine, stripGlyphs } from '../hooks/shellprompt.ts'
import { stripNoise } from '../hooks/text.ts'
import { countPorcelain, gitCommands, parseAhead, sumUnsaved, unsavedText, unsavedTone } from '../hooks/unsaved.ts'
import { useProject, CAPTAIN_IDLE_HEX, CAPTAIN_IDLE_WORD, refreshUnsaved, resetUnsaved, sendToCaptain, sessionRowIn, setAutopilot, submitInbox, unsavedState } from '../hooks/register.tsx'
import { isWellFormed } from './helpers.ts'

useProject('/home/alex/projects/example-app', '/home/alex', ['.', '../api', '../lib', '../missing'])

const ROOT = resolve(import.meta.dir, '..')
const read = (rel: string): string => readFileSync(resolve(ROOT, rel), 'utf8')
const SRC = read('hooks/register.tsx')
const IDLE_PANE = lastLines(read('fixtures/pane-opencode-a-idle-prompt.txt'), 40)
const RUN_PANE = lastLines(read('fixtures/pane-opencode-b-run.txt'), 40)

// ---------------------------------------------------------------- 1. order

test('1) every active card sorts to the top (under the Captain), idle and attention cards next, out of credits after, the sleeping row last', () => {
  const entries = [
    { name: 'codex-s1', group: 'sleeping' as const, quietMs: 9_000_000 },
    { name: 'codex-err', group: 'attention' as const, quietMs: 1000 },
    { name: 'opencode-b', group: 'active' as const, quietMs: 2000 },
    { name: 'codex-out', group: 'exhausted' as const, quietMs: 5000 },
    { name: 'codex-a', group: 'active' as const, quietMs: 1000 },
    { name: 'codex-s2', group: 'sleeping' as const, quietMs: 8_000_000 },
  ]
  const order = orderCrew(entries, new Map(), 0).order
  expect(order).toEqual(['codex-a', 'opencode-b', 'codex-err', 'codex-out', 'codex-s1', 'codex-s2'])
  expect(GROUP_RANK.active).toBeLessThan(GROUP_RANK.attention)
  expect(GROUP_RANK.sleeping).toBe(Math.max(...Object.values(GROUP_RANK)))
})

test('1) among the active, the most recently active first (its pane quiet for the least time); lanes within one bucket keep name order so they do not swap on every poll', () => {
  const at = (a: number, b: number, c: number) => orderCrew([{ name: 'x-1', group: 'active', quietMs: a }, { name: 'x-2', group: 'active', quietMs: b }, { name: 'x-3', group: 'active', quietMs: c }], new Map(), 0).order
  expect(at(90_000, 10_000, 200_000)).toEqual(['x-2', 'x-1', 'x-3'])
  expect(at(RECENCY_BUCKET_MS - 1, 0, 5)).toEqual(['x-1', 'x-2', 'x-3'])
  expect(at(0, RECENCY_BUCKET_MS, 0)).toEqual(['x-1', 'x-3', 'x-2'])
  // the idle (sleeping) group is by name only: how long they were quiet does not matter
  expect(orderCrew([{ name: 'b', group: 'sleeping', quietMs: 1 }, { name: 'a', group: 'sleeping', quietMs: 9e9 }], new Map(), 0).order).toEqual(['a', 'b'])
  expect(groupOf({ activity: 'coding', state: 'working', exhausted: false, blocked: false })).toBe('active')
})

test('1) the crew list reads each lane\'s quiet time from its row when it orders', () => {
  expect(SRC).toContain('quietMs: m.row.sinceMs')
})

// ---------------------------------------------------------------- 2a. the idle zsh pane

test('2a) the real opencode-a pane (idle at a zsh prompt, powerline glyphs, a right prompt) is IDLE, never working', () => {
  expect(IDLE_PANE.length).toBeGreaterThan(5)
  expect(atShellPrompt(IDLE_PANE)).toBe(true)
  expect(classifyLane('opencode-a', true, IDLE_PANE)).toBe('idle')
  expect(classifyLane('codex-a', true, IDLE_PANE)).toBe('idle')
  // Even when the scrollback above the prompt still holds a working marker, a pane that ends at a prompt has nothing running.
  expect(classifyLane('opencode-a', true, ['esc interrupt', 'Working (3s \u2022 esc to interrupt)', ...IDLE_PANE])).toBe('idle')
})

test('2a) a pane that is really running is still working; the marker without a prompt below it counts', () => {
  expect(classifyLane('opencode-b', true, ['  working on it', '  esc interrupt'])).toBe('working')
  expect(classifyLane('codex-a', true, ['\u2022 Working (3s \u2022 esc to interrupt)'])).toBe('working')
  expect(classifyLane('opencode-b', true, RUN_PANE)).toBe('idle')
  expect(atShellPrompt(RUN_PANE)).toBe(false)
  expect(classifyLane('opencode-b', false, [])).toBe('absent')
})

test('2a) what a shell prompt looks like: powerline segments, the right prompt, user@host, the bare marks; a sentence is not one', () => {
  const [user, right] = IDLE_PANE.filter(l => l.trim() !== '').slice(-2)
  expect(isShellPromptLine(user!)).toBe(true)
  expect(isShellPromptLine(right!)).toBe(true)
  for (const l of ['zsh 100 10:08:42', 'alex@laptop ~/code $', '$', '\u276f', ' alex  home  main \u21931  ?1  66  26.10.0']) expect(isShellPromptLine(l)).toBe(true)
  for (const l of ['The doctor is a script, so no app restart is needed.', '\u2192 Read .cockpit/x.md', 'esc interrupt', '', '> build \u00b7 claude-sonnet-5-5', '- **Review:** no skill']) expect(isShellPromptLine(l)).toBe(false)
  expect(atShellPrompt([])).toBe(false)
  expect(atShellPrompt(['working', ''])).toBe(false)
})

test('2a) a Codex pane at a shell prompt is not promoted to working because its text changed lately', () => {
  expect(SRC).toContain("m.kind === 'codex' && !atShellPrompt(lines) && paneChangedRecently(")
})

test('2a) the run belongs to the lane that shows it: the wrapped command line is unwrapped; the idle prompt lane is never given the run', () => {
  const lanes = [{ name: 'opencode-a', lines: IDLE_PANE }, { name: 'opencode-b', lines: RUN_PANE }]
  expect(pickRunLane(lanes, 'brief-oc-feat18.md')).toBe('opencode-b')
  // The brief is split by the pane's wrap ("brief-oc-feat1" + "8.md"): a line-by-line search would miss it.
  expect(RUN_PANE.some(l => l.includes('brief-oc-feat18.md') && l.includes('opencode run'))).toBe(false)
  expect(pickRunLane(lanes, '')).toBe('opencode-b')
  expect(pickRunLane(lanes, 'brief-not-shown.md')).toBe('opencode-b')
  expect(pickRunLane([{ name: 'opencode-a', lines: IDLE_PANE }], 'brief-oc-feat18.md')).toBe('')
  expect(pickRunLane([], 'x.md')).toBe('')
  expect(pickRunLane([{ name: 'opencode-a', lines: RUN_PANE }, { name: 'opencode-b', lines: RUN_PANE }], '')).toBe('opencode-a')
  expect(SRC).toContain('pickRunLane(apis.map(')
  expect(SRC).toContain("if (apis.length > 0 && picked === '') return ''")
})

// ---------------------------------------------------------------- 2b. the task line

test('2b) the glyph strip: box drawing, block, braille and private-use glyphs out, whitespace collapsed', () => {
  expect(stripGlyphs('\ue0b6 alex \ue0b0\ue0b0 \uea83  home \u2502\u2588\u2593 \u2800\u2801 end')).toBe('alex home end')
  expect(stripGlyphs('  \ue0b0 \u2500\u2500  ')).toBe('')
  expect(stripNoise('a\ue0b0b\uf408c')).toBe('a b c')
})

test('2b) a shell prompt is never a task: no Doing from the idle pane\'s prompt lines, no tail from them', () => {
  const prompt = IDLE_PANE.filter(l => l.trim() !== '').slice(-2)
  expect(doingOf(prompt)).toBe(null)
  expect(meaningfulTail(prompt)).toBe('')
  expect(doingOf([...prompt, ...prompt])).toBe(null)
  // prose above the prompt is scrollback of a finished run: still read by the pure rule, so the caller (an idle lane) does not ask for it
  expect(SRC).toContain('doing: awake ? doingOf(ev?.lines ?? []) : null')
})

test('2b) the task line: what it is doing, else the item id and its brief title, else "idle"', () => {
  const working = { isSleeping: false, isWorking: true }
  const promptDoing = { verb: '', phrase: '\ue0b6 alex \ue0b0\ue0b0 home \ue0b0 main \u21931 ?1 66 26.10.0', full: '' }
  expect(taskLineOf({ item: 'FEAT-17', title: 'revamp the Cockpit pane', doing: promptDoing, ...working })).toBe('FEAT-17 \u00b7 revamp the Cockpit pane')
  expect(taskLineOf({ item: 'FEAT-17', title: '', doing: promptDoing, ...working })).toBe('FEAT-17')
  expect(taskLineOf({ item: 'FEAT-17', title: 'revamp', doing: { verb: 'editing', phrase: 'editing core.ts', full: '' }, ...working })).toBe('FEAT-17 \u00b7 revamp \u00b7 editing core.ts')
  expect(taskLineOf({ item: '', title: '', doing: promptDoing, isSleeping: true, isWorking: false })).toBe('idle')
  expect(taskLineOf({ item: '', title: '', doing: null, isSleeping: false, isWorking: false })).toBe('idle')
  expect(taskLineOf({ item: '', title: '', doing: null, ...working })).toBe('')
  // a sleeper shows its item and title, not what its old pane said
  expect(taskLineOf({ item: 'X-1', title: 'a brief', doing: { verb: 'editing', phrase: 'editing core.ts', full: '' }, isSleeping: true, isWorking: false })).toBe('X-1 \u00b7 a brief')
  expect(SRC).toContain('taskLineOf({ item: m.itemId, title: m.heading')
})

const BASE: LaneItemIn = {
  lane: 'opencode-a', awake: true, lastActivityMs: null, paneLines: [], lock: null, claims: [], runBrief: '', runStartedMs: null, briefs: [{ name: 'brief-oc-feat17.md', heading: '# FEAT-17: revamp the Cockpit pane' }],
  reports: [], landed: [], nowMs: 100 * 3_600_000,
}
const claim = (id: string, lane: string, ageH: number) => ({ id, lane, mtimeMs: BASE.nowMs - ageH * 3_600_000 })

test('2b) a card only takes a claim whose lane names that session: a claim naming opencode-b never shows on opencode-a, from any source', () => {
  const c17 = claim('FEAT-17', 'opencode-b', 1)
  expect(resolveLaneItem({ ...BASE, claims: [c17] }).item).toBe('')
  expect(resolveLaneItem({ ...BASE, claims: [c17], paneLines: ['Read .cockpit/FEAT-17.md', 'FEAT-17'] }).item).toBe('')
  expect(resolveLaneItem({ ...BASE, claims: [c17], runBrief: 'brief-oc-feat17.md', runStartedMs: BASE.nowMs - 60_000 }).item).toBe('')
  expect(resolveLaneItem({ ...BASE, claims: [c17], lock: { item: 'FEAT-17', mtimeMs: BASE.nowMs - 1000 } }).item).toBe('')
  // the lane it names gets it
  expect(resolveLaneItem({ ...BASE, lane: 'opencode-b', claims: [c17] })).toMatchObject({ item: 'FEAT-17', source: 'claim-lane' })
  // a claim with no lane is open to the lane that shows it
  expect(resolveLaneItem({ ...BASE, claims: [claim('FEAT-17', '', 1)], paneLines: ['working on FEAT-17'] }).item).toBe('FEAT-17')
  // the lane is compared in any case
  expect(resolveLaneItem({ ...BASE, lane: 'opencode-b', claims: [claim('FEAT-17', 'OpenCode-B', 1)] }).item).toBe('FEAT-17')
})

// ---------------------------------------------------------------- 3. stale claims

test('3) an idle lane\'s own claim older than 6 hours is a stale claim, not an item it is working on; a fresh one is not', () => {
  const idle = { ...BASE, awake: false }
  const stale = resolveLaneItem({ ...idle, claims: [claim('FEAT-17', 'opencode-a', 7)] })
  expect(stale).toMatchObject({ item: 'FEAT-17', source: 'claim-lane', isStale: true })
  expect(STALE_CLAIM_MS).toBe(6 * 3_600_000)
  expect(resolveLaneItem({ ...idle, claims: [claim('FEAT-17', 'opencode-a', 5)] }).isStale).toBeUndefined()
  expect(resolveLaneItem({ ...idle, claims: [claim('FEAT-17', 'opencode-a', 5)] }).item).toBe('FEAT-17')
  // a working lane's claim is live (its age rule is the day, as before)
  expect(resolveLaneItem({ ...BASE, claims: [claim('FEAT-17', 'opencode-a', 7)] })).toMatchObject({ item: 'FEAT-17', source: 'claim-lane' })
  expect(resolveLaneItem({ ...BASE, claims: [claim('FEAT-17', 'opencode-a', 7)] }).isStale).toBeUndefined()
})

test('3) a stale claim that landed, was reported, belongs to another lane, or is over a week old is not shown', () => {
  const idle = { ...BASE, awake: false }
  const c = claim('FEAT-17', 'opencode-a', 7)
  expect(resolveLaneItem({ ...idle, claims: [c], landed: [{ hash: 'a', subject: 'FEAT-17: done' }] }).item).toBe('')
  expect(resolveLaneItem({ ...idle, claims: [c], reports: [{ id: 'feat17', mtimeMs: c.mtimeMs + 1000 }] }).item).toBe('')
  expect(resolveLaneItem({ ...idle, claims: [claim('FEAT-17', 'opencode-a', 24 * 8)] }).item).toBe('')
  expect(resolveLaneItem({ ...idle, claims: [claim('FEAT-17', 'opencode-b', 7)] }).item).toBe('')
})

const ROW: LookRow = {
  kind: 'api', variant: 0, mode: 'idle', activity: 'sleeping', title: 'opencode-a', state: { text: 'sleeping', color: '#8B949E' }, item: '', tag: '', since: '', trouble: { text: 'stale claim: FEAT-17', hex: '#F0A500' },
  isOut: false, indent: 0, isOpen: false, detail: [], bars: [], burst: '', landed: '', phase: 0, tone: '',
}

test('3) the row shows "stale claim: <ITEM>" in amber, not working', () => {
  const svg = rowSvg(520, ROW)
  expect(svg).toMatch(/class="warnc"[^>]*>stale claim: FEAT-17</)
  expect(svg).toContain('>sleeping<')
  expect(svg).not.toContain('>working<')
  expect(SRC).toContain("{ text: 'stale claim: ' + m.staleClaim, hex: AMBER_HEX }")
  expect(SRC).toContain("itemId: li.isStale === true ? '' : li.item")
})

// ---------------------------------------------------------------- 4. the unsaved-work status line

const CLEAN = ''
const DIRTY_HOME = ' M backend/src/lib/svc/link.ts\n M backend/tests/svcLink.test.ts\n?? .cockpit/inbox/bugs.md\n'
const DIRTY_BOT = 'A  src/new.ts\n'

test('4) the text: all saved when both are 0; "unsaved: N uncommitted files, M unpushed commits" otherwise; the tone is green or amber', () => {
  const saved = sumUnsaved([{ repo: 'home', porcelain: CLEAN, ahead: '0\n' }, { repo: 'bot', porcelain: CLEAN, ahead: '0\n' }])
  expect(saved).toEqual({ files: 0, commits: 0, repos: 2 })
  expect(unsavedText(saved)).toBe('\u2713 all saved')
  expect(unsavedTone(saved)).toBe('green')
  const some = sumUnsaved([{ repo: 'home', porcelain: DIRTY_HOME, ahead: '2\n' }, { repo: 'bot', porcelain: DIRTY_BOT, ahead: '0\n' }, { repo: 'shared', porcelain: CLEAN, ahead: '1\n' }])
  expect(some).toEqual({ files: 4, commits: 3, repos: 3 })
  expect(unsavedText(some)).toBe('\u25cf unsaved: 4 uncommitted files, 3 unpushed commits')
  expect(unsavedTone(some)).toBe('amber')
  expect(unsavedText(sumUnsaved([{ repo: 'home', porcelain: CLEAN, ahead: '1\n' }]))).toContain('unsaved: 0 uncommitted files, 1 unpushed commits')
  expect(unsavedText(null)).toBeUndefined()
  expect(unsavedTone(null)).toBe('')
})

test('4) a missing repo is skipped; a repo with no upstream counts its files and no commits; nothing readable shows nothing', () => {
  expect(sumUnsaved([{ repo: 'go', porcelain: null, ahead: null }, { repo: 'home', porcelain: DIRTY_BOT, ahead: null }])).toEqual({ files: 1, commits: 0, repos: 1 })
  expect(sumUnsaved([{ repo: 'go', porcelain: null, ahead: null }])).toBe(null)
  expect(sumUnsaved([])).toBe(null)
  expect(sumUnsaved([{ repo: 'home', porcelain: DIRTY_BOT, ahead: 'fatal: no upstream configured\n' }])?.commits).toBe(0)
  expect(countPorcelain(DIRTY_HOME)).toBe(3)
  expect(countPorcelain('\n\n')).toBe(0)
  expect(parseAhead('3\n')).toBe(3)
  expect(parseAhead('fatal')).toBe(null)
  expect(gitCommands('/home/alex/projects/example-app').status).toEqual(['git', '-C', '/home/alex/projects/example-app', 'status', '--porcelain'])
  expect(gitCommands('/home/alex/projects/lib').ahead).toEqual(['git', '-C', '/home/alex/projects/lib', 'rev-list', '--count', '@{u}..HEAD'])
})

type Host = { $: any; status: (string | undefined)[]; runs: string[][]; toasts: string[]; writes: Record<string, string>; submitted: { text: string; asUser?: boolean }[]; filled: { text: string; mode: string }[]; fs: Record<string, string> }
function host(git: Record<string, { out: string; code?: number } | undefined> = {}, over: Record<string, unknown> = {}): Host {
  const h: Host = { $: null, status: [], runs: [], toasts: [], writes: {}, submitted: [], filled: [], fs: {} }
  let t = 1_000_000
  h.$ = {
    clock: { now: async () => (t += 1000), after: () => ({ cancel: () => undefined }) },
    ui: { status: (s: string | undefined) => h.status.push(s), toast: (s: string) => h.toasts.push(s), invalidate: () => undefined },
    prompt: { submit: async (i: { text: string; asUser?: boolean }) => { h.submitted.push(i) }, fill: async (i: { text: string; mode: string }) => { h.filled.push(i); return { isFilled: true } } },
    fs: { exists: async () => false, read: async () => '', list: async () => [], stat: async () => null, write: async (p: string, text: string) => { h.writes[p] = text } },
    process: {
      run: async (argv: string[], opts: { stdin?: string }) => {
        h.runs.push(argv)
        if (argv[0] === 'git') {
          const repo = argv[2]!.split('/').pop()!
          const key = repo + ' ' + argv.slice(3).join(' ')
          const g = git[key]
          return g === undefined ? { exitCode: 128, stdout: '' } : { exitCode: g.code ?? 0, stdout: g.out }
        }
        if (argv[0] === 'tee') h.writes[argv[2] ?? ''] = (h.writes[argv[2] ?? ''] ?? '') + (opts.stdin ?? '')
        return { exitCode: 0, stdout: '' }
      },
    },
    ...over,
  }
  return h
}
const gitOut: Record<string, { out: string }> = {
  'example-app status --porcelain': { out: DIRTY_HOME },
  'example-app rev-list --count @{u}..HEAD': { out: '2\n' },
  'api status --porcelain': { out: DIRTY_BOT },
  'api rev-list --count @{u}..HEAD': { out: '0\n' },
  'lib status --porcelain': { out: '' },
  'lib rev-list --count @{u}..HEAD': { out: '1\n' },
}

test('4) the status line is read from git, async, summed over the repos that exist, and ONLY unsaved work is shown', async () => {
  resetUnsaved()
  const h = host(gitOut)
  await refreshUnsaved(h.$, 1_000_000)
  expect(h.status).toEqual(['\u25cf unsaved: 4 uncommitted files, 3 unpushed commits'])
  const cmds = h.runs.filter(r => r[0] === 'git').map(r => r.slice(2).join(' '))
  expect(cmds).toContain('/home/alex/projects/example-app status --porcelain')
  expect(cmds).toContain('/home/alex/projects/example-app rev-list --count @{u}..HEAD')
  // A repo in the config that is missing here: its status failed, so it is skipped, with no error shown
  expect(h.toasts).toEqual([])
  expect(h.status.join('|')).not.toMatch(/ctx|lanes|cockpit/i)
})

test('4) it is cached for 30 seconds: no second read inside the window, a read after it; the host is told only when the text changes', async () => {
  resetUnsaved()
  const h = host(gitOut)
  await refreshUnsaved(h.$, 1_000_000)
  const first = h.runs.length
  await refreshUnsaved(h.$, 1_000_000 + 29_999)
  expect(h.runs.length).toBe(first)
  await refreshUnsaved(h.$, 1_000_000 + 30_000)
  expect(h.runs.length).toBe(first * 2)
  expect(h.status).toHaveLength(1)
  expect(unsavedState().shown).toBe('\u25cf unsaved: 4 uncommitted files, 3 unpushed commits')
})

test('4) all saved shows "all saved"; a later change updates it; every repo unreadable clears the line; a git that throws shows nothing and keeps the last value', async () => {
  resetUnsaved()
  const clean = host({ 'example-app status --porcelain': { out: '' }, 'example-app rev-list --count @{u}..HEAD': { out: '0\n' } })
  await refreshUnsaved(clean.$, 1_000_000)
  expect(clean.status).toEqual(['\u2713 all saved'])
  const dirty = host({ ...gitOut })
  await refreshUnsaved(dirty.$, 1_000_000 + 40_000)
  expect(dirty.status).toEqual(['\u25cf unsaved: 4 uncommitted files, 3 unpushed commits'])
  const none = host({})
  await refreshUnsaved(none.$, 1_000_000 + 80_000)
  expect(none.status).toEqual([undefined])
  resetUnsaved()
  const broken = host({}, { process: { run: async () => { throw new Error('git is not here') } } })
  await refreshUnsaved(broken.$, 1_000_000)
  expect(broken.status).toEqual([undefined])
  expect(broken.toasts).toEqual([])
})

test('4) it never blocks a render or a hook: the tick starts it without awaiting it, the Deck no longer writes the ctx and lane text, and the option turns it off', () => {
  // COCKPIT-44: the footer slot now shows the system icons; the tick writes it synchronously (a string compare), never awaiting a read.
  expect(SRC).toContain('refreshFooter($)')
  expect(SRC).not.toContain('statusPiece(statusFactsOf(deck))')
  expect(SRC).toContain('if (!deckCfg.statusLine || unsavedRunning || now - unsavedAt < UNSAVED_EVERY_MS) return')
})

// ---------------------------------------------------------------- 5. sleeping crew, dimmed and grey

const WORKING_ROW: LookRow = { ...ROW, mode: 'work', activity: 'coding', state: { text: 'coding', color: '#22C55E' }, item: 'X-01 \u00b7 editing core.ts', trouble: null, tone: 'green' }
const SLEEPING_ROW: LookRow = { ...ROW, kind: 'codex', trouble: null, item: 'X-01 \u00b7 a brief title' }

test('5) a sleeping crew card\'s style tokens are the dim and grayscale ones; a working card\'s are not', () => {
  expect(rowStyleOf(SLEEPING_ROW)).toEqual({ title: 'm', item: 'm', avatar: 'grayscale', isDim: true })
  expect(rowStyleOf(WORKING_ROW)).toEqual({ title: 't', item: 's', avatar: 'color', isDim: false })
  expect(isSleepingRow(SLEEPING_ROW)).toBe(true)
  expect(isSleepingRow(WORKING_ROW)).toBe(false)
  const sleepSvg = rowSvg(520, SLEEPING_ROW)
  const workSvg = rowSvg(520, WORKING_ROW)
  expect(isWellFormed(sleepSvg)).toBe(true)
  expect(sleepSvg).toMatch(/class="m"[^>]*font-weight="600">opencode-a</)
  expect(workSvg).toMatch(/class="t"[^>]*font-weight="600">opencode-a</)
  expect(sleepSvg).toMatch(/class="m"[^>]*>X-01/)
  expect(workSvg).toMatch(/class="s"[^>]*>X-01/)
})

test('5) the sleeping icon is black and white (no colour accent); a working icon keeps its colour; waking restores the colour', () => {
  const hexes = (svg: string): string[] => [...svg.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map(m => m[1]!.toLowerCase())
  const isGray = (h: string): boolean => h.slice(1, 3) === h.slice(3, 5) && h.slice(3, 5) === h.slice(5, 7)
  for (const kind of ['codex', 'api', 'max', 'cloud', 'local']) {
    const asleep = hexes(spriteSvg(0, 0, kind, 0, 'idle', 1, 'sleeping'))
    expect(asleep.length).toBeGreaterThan(5)
    expect(asleep.every(isGray)).toBe(true)
    const awake = hexes(spriteSvg(0, 0, kind, 0, 'work', 1, 'working'))
    expect(awake.some(h => !isGray(h))).toBe(true)
    // the same character, woken, is in colour again
    expect(hexes(spriteSvg(0, 0, kind, 0, 'work', 1, 'coding')).some(h => !isGray(h))).toBe(true)
  }
  expect(toGray('#E5484D')).toMatch(/^#([0-9a-f]{2})\1\1$/)
  expect(toGray('#000000')).toBe('#000000')
  expect(toGray('#FFFFFF')).toBe('#ffffff')
  // the other sleeping looks (stale, out of credits, dimmed) are grey too
  for (const mode of ['stale', 'out', 'dim'] as const) expect(hexes(spriteSvg(0, 0, 'codex', 0, mode, 1, 'sleeping')).every(isGray)).toBe(true)
  const row = rowSvg(520, SLEEPING_ROW)
  expect(row).toContain('class="sp c-codex sleep"')
})

// ---------------------------------------------------------------- 6 and 7. the Captain is never sleeping

test('6) the Captain, not working, says "idle" (not sleeping), in colour, at the top; it is never dimmed or grayscaled', () => {
  const r = sessionRowIn(1_000_000)
  expect(r.kind).toBe('captain')
  expect(r.state.text).toBe('idle')
  expect(r.state.text).toBe(CAPTAIN_IDLE_WORD)
  expect(r.state.color).toBe(CAPTAIN_IDLE_HEX)
  expect(r.tone).toBe('')
  expect(r.mode).toBe('still')
  expect(isSleepingRow(r)).toBe(false)
  expect(rowStyleOf(r)).toEqual({ title: 't', item: 's', avatar: 'color', isDim: false })
  expect(rowStyleOf({ kind: 'captain', activity: 'sleeping' })).toEqual({ title: 't', item: 's', avatar: 'color', isDim: false })
  const svg = rowSvg(520, r)
  expect(svg).toContain('>idle<')
  expect(svg).not.toContain('>sleeping<')
  expect(svg).toMatch(/class="t"[^>]*font-weight="600">Captain</)
  const hexes = [...svg.matchAll(/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+" fill="(#[0-9A-Fa-f]{6})"/g)].map(m => m[1]!.toLowerCase())
  expect(hexes.some(h => !(h.slice(1, 3) === h.slice(3, 5) && h.slice(3, 5) === h.slice(5, 7)))).toBe(true)
  expect(SRC).toContain("'Captain  ' + (isMainBusy ? 'working' : CAPTAIN_IDLE_WORD)")
  expect(SRC).toContain("mode: isMainBusy ? 'work' : 'still', activity: isMainBusy ? 'working' : 'sleeping', name: 'Captain'")
})

test('7) the Captain never plays the sleeping animation; another idle crew card still does', () => {
  for (const mode of ['idle', 'stale', 'out'] as const) {
    const cap = spriteSvg(0, 0, 'captain', 0, mode, 1, 'sleeping')
    expect(cap).not.toContain('class="zz')
    expect(cap).not.toContain('>z<')
    expect(cap).not.toMatch(/class="sp c-captain sleep/)
    expect(cap).toContain('class="sp c-captain still"')
  }
  expect(spriteSvg(0, 0, 'captain', 0, 'work', 1, 'sleeping')).not.toContain('>z<')
  const row = rowSvg(520, sessionRowIn(1_000_000))
  expect(row).not.toMatch(/class="sp c-captain sleep/)
  expect(row).not.toContain('class="zz zz0"')
  // another crew card, idle: still has its sleep frames (z, breathing)
  const other = rowSvg(520, SLEEPING_ROW)
  expect(other).toContain('class="zz zz0"')
  expect(other).toMatch(/class="sp c-codex sleep"/)
  expect(spriteSvg(0, 0, 'codex', 0, 'idle', 1, 'sleeping')).toContain('>z<')
  // a working captain still has its working pose
  expect(spriteSvg(0, 0, 'captain', 0, 'work', 1, 'working')).toContain('class="sp c-captain run"')
})

// ---------------------------------------------------------------- 8. AUTOPILOT

const PRESENCE = '/home/alex/projects/example-app/.cockpit/presence.json'
const CAPTAIN_MD = '/home/alex/projects/example-app/.cockpit/inbox/captain.md'
const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

test('8) the words and the exact messages', () => {
  expect(autopilotWord(true)).toBe('AUTOPILOT on')
  expect(autopilotWord(false)).toBe('AUTOPILOT off')
  expect(AUTOPILOT_ON_MESSAGE).toBe('Autopilot ON: I am away. Keep working, never ask me anything, log decisions to .cockpit/away-log.md.')
  expect(AUTOPILOT_OFF_MESSAGE).toBe('Autopilot OFF: I am back. Summarize what happened while I was away, then ask your pending questions.')
  expect(autopilotMessage(true)).toBe(AUTOPILOT_ON_MESSAGE)
  expect(autopilotMessage(false)).toBe(AUTOPILOT_OFF_MESSAGE)
  expect(inboxMessage('bug', '  the pane\n is blank ')).toBe('Bug: the pane is blank')
  expect(inboxMessage('idea', 'dark mode')).toBe('Idea: dark mode')
})

test('8) grey when off, green when on, by colour only, beside a string-label button', () => {
  expect(autopilotPill(false)).toEqual({ color: 'gray', bold: true, text: 'AUTOPILOT' })
  expect(autopilotPill(true).color).toBe('green')
  expect(SRC).toContain("Button({ key: 'crew-presence', label: PRESENCE_SWITCH, hotkey: 'a', plain: true,")
  expect(SRC).toContain("autopilotMark(kit, 'autopilot-state', pres.isAway)")
})

test('8) the old words are gone from what the person sees: no Active or Away label, pill, toast or help text', () => {
  const visible = [SRC, read('hooks/ui.ts'), read('hooks/board.ts')].join('\n')
  expect(visible).not.toMatch(/label: '(?:Active|Away|away|back)'/)
  expect(visible).not.toMatch(/'Away'|'Active'/)
  expect(visible).not.toContain("'away: the crew keeps going")
  expect(visible).not.toContain("'back: '")
  expect(read('.claude-plugin/plugin.json')).not.toMatch(/away\|back/)
})

test('8) /cockpit autopilot on|off (and away and back, the old words, as working aliases)', () => {
  expect(parseCrewArgs('autopilot on')).toEqual({ cmd: 'autopilot', arg: 'on' })
  expect(parseCrewArgs('autopilot off')).toEqual({ cmd: 'autopilot', arg: 'off' })
  expect(parseCrewArgs('autopilot')).toEqual({ cmd: 'autopilot', arg: 'toggle' })
  expect(parseCrewArgs('AutoPilot ON')).toEqual({ cmd: 'autopilot', arg: 'on' })
  expect(parseCrewArgs('away')).toEqual({ cmd: 'away' })
  expect(parseCrewArgs('back')).toEqual({ cmd: 'back' })
  expect([autopilotArgOf('away'), autopilotArgOf('back'), autopilotArgOf('x')]).toEqual(['on', 'off', 'toggle'])
})

test('8) switching on flips the state file to "away" and submits the exact message to the captain as the user, with a toast saying what was sent', async () => {
  const h = host()
  const reply = await setAutopilot(h.$, true)
  await flush()
  expect(JSON.parse(h.writes[PRESENCE]!.trim()).mode).toBe('away')
  expect(reply).toContain('AUTOPILOT on')
  expect(h.submitted).toEqual([{ text: AUTOPILOT_ON_MESSAGE, asUser: true }])
  expect(h.toasts).toEqual(['Sent to the captain: ' + AUTOPILOT_ON_MESSAGE])
  expect(h.filled).toEqual([])
  expect(h.writes[CAPTAIN_MD]).toBeUndefined()
})

test('8) switching off flips it back to "active" and submits the exact "I am back" message', async () => {
  const h = host()
  const reply = await setAutopilot(h.$, false)
  await flush()
  expect(JSON.parse(h.writes[PRESENCE]!.trim()).mode).toBe('active')
  expect(reply).toContain('AUTOPILOT off')
  expect(h.submitted).toEqual([{ text: AUTOPILOT_OFF_MESSAGE, asUser: true }])
  expect(h.toasts[0]).toContain('Autopilot OFF: I am back.')
})

test('8) if the host cannot submit, the instruction is appended (timestamped) to inbox/captain.md AND put in the prompt box, and the toast says so', async () => {
  const h = host({}, { prompt: { submit: async () => { throw new Error('no composer') }, fill: async (i: { text: string; mode: string }) => { h.filled.push(i); return { isFilled: true } } } })
  const how = await sendToCaptain(h.$, AUTOPILOT_ON_MESSAGE)
  expect(how).toBe('fallback')
  expect(h.writes[CAPTAIN_MD]).toMatch(/^- \d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z Autopilot ON: I am away\. Keep working/)
  expect(h.writes[CAPTAIN_MD]!.endsWith('\n')).toBe(true)
  expect(h.runs.some(r => r[0] === 'mkdir')).toBe(true)
  expect(h.filled).toEqual([{ text: AUTOPILOT_ON_MESSAGE, mode: 'replace' }])
  expect(h.toasts).toHaveLength(1)
  expect(h.toasts[0]).toContain('captain.md')
  expect(h.toasts[0]).toContain('Press Enter')
  expect(captainLine(0, 'a  b')).toBe('- 1970-01-01T00:00:00.000Z a b\n')
})

test('8) Add Bug and Add Idea: Enter appends to inbox/bugs.md or ideas.md and sends "Bug: <text>" or "Idea: <text>" to the captain; an empty field sends nothing', async () => {
  const bug = host()
  const r = await submitInbox(bug.$, 'bug', '  the pane is blank on phones ')
  await flush()
  expect(r).toContain('Saved bug')
  expect(bug.writes['/home/alex/projects/example-app/.cockpit/inbox/bugs.md']).toMatch(/^- \d{4}-.*Z the pane is blank on phones\n$/)
  expect(bug.submitted).toEqual([{ text: 'Bug: the pane is blank on phones', asUser: true }])
  expect(bug.toasts).toEqual(['Saved', 'Sent to the captain: Bug: the pane is blank on phones'])
  const idea = host()
  await submitInbox(idea.$, 'idea', 'show the black box in the Deck')
  await flush()
  expect(idea.writes['/home/alex/projects/example-app/.cockpit/inbox/ideas.md']).toContain('show the black box in the Deck')
  expect(idea.submitted).toEqual([{ text: 'Idea: show the black box in the Deck', asUser: true }])
  const empty = host()
  await submitInbox(empty.$, 'bug', '   ')
  await flush()
  expect(empty.submitted).toEqual([])
  expect(Object.keys(empty.writes)).toEqual([])
  expect(empty.toasts).toEqual(['Type /cockpit bug followed by what went wrong.'])
})

test('8) the pane has the one-line field (a kit Input) under the button row, and the buttons pre-fill only where no field exists', () => {
  expect(SRC).toContain("key: 'inbox-field'")
  expect(SRC).toContain('const hasInput = \'Input\' in kit')
  expect(SRC).toContain('if (!hasInput) {\n      void startInbox($, kind)')
  expect(SRC).toContain("submitLabel: 'send'")
  expect(SRC).toContain('void submitInbox($, kind, v)')
})

test('the manifest is 0.5.1 or later and the status line option says what it shows now', () => {
  const plugin = JSON.parse(read('.claude-plugin/plugin.json')) as { version: string; userConfig: { statusLine: { description: string } } }
  expect(plugin.version).toMatch(/^0\.\d+\.\d+$/)
  expect(plugin.userConfig.statusLine.description).toContain('system icons')
})
