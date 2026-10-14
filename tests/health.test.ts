// COCKPIT-HEALTH-UI-01 + COCKPIT-OFFPLAN-RUN-01: lane-health display, off-plan tracking, the coordinator row, the status row.
import { describe, expect, test } from 'bun:test'
import { activeAgo, checkStopped, countdownText, dotClass, healthFooter, healthFor, healthHeader, ownerAlive, parseHealth, planProblemLines, readyLine, autoDispatchLine, withLiveAgents } from '../hooks/health.ts'
import { COORDINATOR_ID, derivePlan, footerLine, newTracker, parsePlan, planBand, planFooterLine, presentPlan, withHealth } from '../hooks/plan.ts'
import type { PlanEvidence } from '../hooks/plan.ts'
import { bandPills, ownerChips, statusSegs } from '../hooks/planbar.ts'
import { ALONE, stepRowSvg } from '../hooks/frontpage.ts'

const NOW = Date.parse('2026-10-13T12:00:00Z')
const iso = (offSec: number): string => new Date(NOW - offSec * 1000).toISOString()
const noEv = (): PlanEvidence => ({ nowMs: NOW, members: [], claims: [], reports: [], blocked: [], landed: [], aliveNames: ['codex-w1', 'codex-w2'] })
const healthText = (extra: object = {}, checkedAgo = 18): string =>
  JSON.stringify({ checkedAt: iso(checkedAgo), intervalSec: 60, items: { 'A-1': { owner: 'codex-w1', state: 'working', lastActivityAt: iso(40), detail: 'ok' }, 'A-2': { owner: 'codex-w2', state: 'dead', lastActivityAt: iso(900), detail: 'gone' }, 'O-1': { owner: 'codex-w1', state: 'idle', lastActivityAt: iso(200), detail: '' } }, ...extra })
const plan = (): ReturnType<typeof derivePlan> => {
  const f = parsePlan(JSON.stringify({ milestone: 'G', updated: iso(60), items: [
    { id: 'A-1', title: 'one', state: 'running', owner: 'codex-w1', startedAt: iso(600) },
    { id: 'A-2', title: 'two', state: 'running', owner: 'codex-w2', startedAt: iso(600) },
    { id: 'A-3', title: 'three', state: 'todo' },
    { id: 'A-4', title: 'four', state: 'done' },
    { id: 'O-1', title: 'off run', state: 'running', owner: 'codex-w1', planned: false },
    { id: 'O-2', title: 'off blocked', state: 'blocked', owner: 'jesse', planned: false },
    { id: 'O-3', title: 'off done', state: 'done', planned: false },
  ] }), NOW)!
  return derivePlan(f, noEv())
}

describe('health file', () => {
  test('parses items and the coordinator; bad input is null', () => {
    const h = parseHealth(healthText({ coordinator: { state: 'working', lastActivityAt: iso(5), detail: 'ran a command' }, claude: { liveSubagents: 3 } }))!
    expect(h.items.get('A-1')!.state).toBe('working')
    expect(h.coordinator!.state).toBe('working')
    expect(h.liveSubagents).toBe(3)
    expect(parseHealth('nope')).toBeNull()
    expect(parseHealth(null)).toBeNull()
  })
  test('dot colours: green working, amber idle or stale, red the rest', () => {
    expect(['working', 'idle', 'stale', 'dead', 'finished', 'needs-input'].map(s => dotClass(s as never))).toEqual(['okc', 'warnc', 'warnc', 'errc', 'errc', 'errc'])
  })
  test('active ago wording', () => {
    expect(activeAgo(NOW - 40_000, NOW)).toBe('active 40s ago')
    expect(activeAgo(NOW - 180_000, NOW)).toBe('active 3m ago')
    expect(activeAgo(null, NOW)).toBe('no activity seen')
  })
  test('countdown, then stopped after twice the interval', () => {
    const h = parseHealth(healthText())!
    expect(countdownText(h, NOW)).toBe('next check in 0:42')
    expect(healthHeader(h, NOW)).toEqual({ text: 'next check in 0:42', stopped: false })
    const old = parseHealth(healthText({}, 121))!
    expect(checkStopped(old, NOW)).toBe(true)
    expect(healthHeader(old, NOW).text).toBe('health check stopped')
    expect(healthHeader(parseHealth(healthText({}, 120))!, NOW).stopped).toBe(false)
  })
  test('owner alive: dead, finished and needs-input are not; no file or no entry means alive', () => {
    const h = parseHealth(healthText())!
    expect([ownerAlive(h, 'A-1'), ownerAlive(h, 'A-2'), ownerAlive(h, 'X'), ownerAlive(null, 'A-2')]).toEqual([true, false, true, true])
    expect(healthFor(h, 'A-1', NOW)!.ago).toBe('active 40s ago')
    expect(healthFor(h, 'X', NOW)).toBeNull()
    expect(healthFooter(h, NOW)).toBe('next check 0:42')
  })
})

describe('running list and counts', () => {
  test('without health.json the plan state stands', () => {
    const sh = withHealth(presentPlan(newTracker(), plan(), NOW), null, NOW)
    expect(sh.runningAll.map(r => r.id).sort()).toEqual(['A-1', 'A-2', 'O-1'])
  })
  test('a dead owner leaves Running now; on-plan and off-plan alike', () => {
    const h = parseHealth(healthText({ items: { 'A-1': { state: 'working' }, 'A-2': { state: 'dead' }, 'O-1': { state: 'finished' } } }))!
    const sh = withHealth(presentPlan(newTracker(), plan(), NOW), h, NOW)
    expect(sh.runningAll.map(r => r.id)).toEqual(['A-1'])
    expect(sh.view.offRunning).toHaveLength(0)
  })
  test('off-plan steps are tracked and kept out of the main progress', () => {
    const v = plan()
    expect(v.offRunning.map(r => r.id)).toEqual(['O-1'])
    expect(v.offBlocked.map(r => r.id)).toEqual(['O-2'])
    expect(v.offDoneN).toBe(1)
    expect(v.planned).toBe(4)
    expect(v.doneN).toBe(1)
  })
  test('top status, band pills, plan band and owner chips include off-plan steps', () => {
    const v = plan()
    const t = statusSegs(v).map(g => g.text)
    expect(t[0]).toBe('RUNNING 3')
    expect(t.find(x => x.startsWith('DONE'))).toBe('DONE 2')
    const pills = bandPills(v).map(p => p.text)
    expect(pills).toContain('Running 3')
    expect(pills).toContain('Done 2')
    expect(planBand(presentPlan(newTracker(), v, NOW)).running).toBe(true)
    expect(ownerChips(v).reduce((n, g) => n + Number(g.text.split(' ').pop()), 0)).toBe(3)
    expect(planFooterLine(v, NOW, true, 200)).toContain('O-1')
  })
  test('needs-you counts off-plan blocked steps', () => {
    const v = plan()
    expect(bandPills(v).find(p => p.cls === 'you')!.text).toBe('Needs you ' + (v.you + v.offYou))
    expect(v.offYou).toBe(1)
  })
})

describe('coordinator row', () => {
  const co = (state: string): ReturnType<typeof parseHealth> => parseHealth(healthText({ coordinator: { state, lastActivityAt: iso(5), detail: 'ran a command' } }))
  const base = (): ReturnType<typeof presentPlan> => presentPlan(newTracker(), plan(), NOW)
  test('working: first in Running now, counted', () => {
    const sh = withHealth(base(), co('working'), NOW)
    expect(sh.runningAll[0]!.id).toBe(COORDINATOR_ID)
    expect(sh.view.running[0]!.id).toBe(COORDINATOR_ID)
    expect(statusSegs(sh.view)[0]!.text).toBe('RUNNING 3')
  })
  test('waiting: under Needs you, not running', () => {
    const b = base()
    const sh = withHealth(b, co('waiting'), NOW)
    expect(sh.runningAll.some(r => r.id === COORDINATOR_ID)).toBe(false)
    expect(sh.view.waiting[0]!.id).toBe(COORDINATOR_ID)
    expect(sh.view.you).toBe(b.view.you + 1)
    expect(bandPills(sh.view).find(p => p.cls === 'you')!.text).toBe('Needs you ' + (b.view.you + 1 + b.view.offYou))
  })
  test('idle: nothing shown', () => {
    const b = base()
    const sh = withHealth(b, co('idle'), NOW)
    expect(sh.runningAll.some(r => r.id === COORDINATOR_ID)).toBe(false)
    expect(sh.view.you).toBe(b.view.you)
  })
})

describe('status row', () => {
  test('agents come from live subagents when health has them', () => {
    const c = { agents: 5, byState: { a: 1 }, sessions: 2 }
    expect(withLiveAgents(c, 1)).toEqual({ agents: 1, byState: {}, sessions: 2 })
    expect(withLiveAgents(c, null)).toBe(c)
  })
  test('the footer keeps the health piece only when the line fits', () => {
    const v = plan()
    const wide = footerLine(v, NOW, { commit: null, sessions: '2 sessions', health: 'next check 0:42' }, 90)
    expect(wide.endsWith('next check 0:42')).toBe(true)
    const narrow = footerLine(v, NOW, { commit: null, sessions: '2 sessions', health: 'next check 0:42' }, 30)
    expect(narrow).not.toContain('next check')
    expect(narrow.length).toBeLessThanOrEqual(30)
  })
})

describe('pane row', () => {
  const o = { title: 'off step', id: 'O-1', note: '', label: 'running', cls: 'runc', time: '5m', open: false, dim: false, shell: ALONE, owner: 'codex-w1' }
  test('draws the off plan tag and the health dot with its age', () => {
    const d = stepRowSvg(360, { ...o, tag: 'off plan', health: { cls: 'okc', ago: 'active 40s ago' } })
    expect(d.svg).toContain('off plan')
    expect(d.svg).toContain('active 40s ago')
    const plain = stepRowSvg(360, o)
    expect(plain.svg).not.toContain('off plan')
    expect(plain.svg).not.toContain('active 40s ago')
  })
})

describe('LANE-HEALTH-02: ready steps and plan-idle', () => {
  const withReady = (): ReturnType<typeof parseHealth> => parseHealth(healthText({ ready: ['A-3', 'B-1'], readyCount: 2, problems: [{ id: 'plan-idle:plan', kind: 'plan-idle', since: iso(130), detail: 'Nothing is running and 2 plan steps are todo; assign the next one.' }, { id: 'idle-lane:codex-w1', kind: 'idle-lane', since: iso(10), detail: 'lane idle' }] }))

  test('parses ready ids and problems; absent fields are empty', () => {
    const h = withReady()!
    expect(h.ready).toEqual(['A-3', 'B-1'])
    expect(h.problems.length).toBe(2)
    const bare = parseHealth(healthText())!
    expect(bare.ready).toEqual([])
    expect(bare.problems).toEqual([])
  })

  test('the ready line gives the count and the first ready step title, or its id when unknown', () => {
    const h = withReady()
    expect(readyLine(h, id => (id === 'A-3' ? 'Add Tour to kit' : null))).toBe('Ready to assign: 2 \u00b7 Add Tour to kit')
    expect(readyLine(h, () => null)).toBe('Ready to assign: 2 \u00b7 A-3')
  })

  test('no ready line without a health file or without ready steps', () => {
    expect(readyLine(null, () => 't')).toBe('')
    expect(readyLine(parseHealth(healthText())!, () => 't')).toBe('')
  })

  test('plan-idle shows as a problem line; other problem kinds do not', () => {
    expect(planProblemLines(withReady())).toEqual(['Nothing is running and 2 plan steps are todo; assign the next one.'])
    expect(planProblemLines(null)).toEqual([])
    expect(planProblemLines(parseHealth(healthText())!)).toEqual([])
  })

  test('ready-unassigned also shows as a problem line', () => {
    const h = parseHealth(healthText({ problems: [{ kind: 'ready-unassigned', detail: 'A lane is idle and 1 ready steps have no owner (first: X).' }] }))
    expect(planProblemLines(h).length).toBe(1)
  })
})

describe('LANE-HEALTH-04: unsent message', () => {
  test('unsent-message shows as a problem line', () => {
    const h = parseHealth(healthText({ problems: [{ kind: 'unsent-message', detail: 'codex-w1 has text typed but not submitted for 30 s.' }] }))
    expect(planProblemLines(h)).toEqual(['codex-w1 has text typed but not submitted for 30 s.'])
  })
})

describe('LANE-HEALTH-03: auto-dispatch switch', () => {
  test('shows on or off from health.json; nothing when absent', () => {
    expect(autoDispatchLine(parseHealth(healthText({ autoDispatch: { on: true, dispatched: [], skipped: [] } })))).toBe('Auto-dispatch: on')
    expect(autoDispatchLine(parseHealth(healthText({ autoDispatch: { on: false } })))).toBe('Auto-dispatch: off')
    expect(autoDispatchLine(parseHealth(healthText()))).toBe('')
    expect(autoDispatchLine(null)).toBe('')
  })
})
