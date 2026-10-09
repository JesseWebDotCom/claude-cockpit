// COCKPIT-31 (cockpit 0.8.3): a member whose account refused it shows a red label on its row, the matched line on its card,
// a red count in the Crew summary, and a red chip on the status card and the band.

import { test, expect } from './pure.ts'
import { OUTAGES, outageOf, outageCounts } from '../hooks/outage.ts'
import { crewSummary } from '../hooks/sections.ts'
import { rowSvg, statusSvg } from '../hooks/look.ts'
import type { LookRow, LookStatus } from '../hooks/look.ts'
import { memberDetail } from '../hooks/details.ts'
import type { MemberCardIn } from '../hooks/details.ts'
import { plainBandText } from '../hooks/ui.ts'
import { isWellFormed } from './helpers.ts'

const idle = { state: 'idle' }

const SAMPLES: Record<string, string> = {
  credit: 'Error: Your credit balance is too low to access the API. Please go to Plans & Billing.',
  quota: 'API Error: 429 {"type":"error","error":{"type":"rate_limit_error","message":"rate limit exceeded"}}',
  auth: 'Error: 401 invalid x-api-key',
}
const LABEL: Record<string, string> = { credit: 'OUT OF CREDIT', quota: 'RATE LIMITED', auth: 'AUTH FAILED' }

test('each pattern matches a real sample line and names its label', () => {
  for (const p of OUTAGES) {
    const o = outageOf(['some earlier output', SAMPLES[p.id] ?? ''], idle)
    expect(o?.id).toBe(p.id)
    expect(o?.label).toBe(LABEL[p.id])
    expect(o?.line.length).toBeLessThanOrEqual(90)
  }
  expect(outageOf(['■ You’ve hit your usage limit. Try again at 9:00.'], idle)?.id).toBe('quota')
})

test('an unrelated line, or the same words quoted from a brief or a doc, does not match', () => {
  expect(outageOf(['Ran bun test', '12 pass', 'the billing page needs a rate limit field'], idle)).toBe(null)
  expect(outageOf(['> Error: credit balance is too low'], idle)).toBe(null)
  expect(outageOf(['reading brief-oc-cockpit31.md: invalid api key error: 401'], idle)).toBe(null)
  expect(outageOf(['', ''], idle)).toBe(null)
})

test('only the latest output counts: a match above later success is ignored, and a working member is never flagged', () => {
  expect(outageOf([SAMPLES.credit ?? '', '• Ran bun test', '12 pass'], idle)).toBe(null)
  expect(outageOf([SAMPLES.credit ?? ''], { state: 'working' })).toBe(null)
  // clearing: the same pane, then newer output
  expect(outageOf([SAMPLES.credit ?? ''], idle)).not.toBe(null)
  expect(outageOf([SAMPLES.credit ?? '', 'Edited foo.ts'], idle)).toBe(null)
})

test('the Crew summary names each refusal in red, ahead of errored', () => {
  const c = { working: 1, idle: 0, sleeping: 1, blocked: 0, errored: 0 }
  const outs = outageCounts([outageOf([SAMPLES.credit ?? ''], idle), null, outageOf([SAMPLES.quota ?? ''], idle)])
  expect(crewSummary({ ...c, outages: outs })).toEqual({ text: '1 out of credit, 1 rate limited, 1 active, 1 sleeping', tone: 'err' })
  expect(crewSummary({ ...c, errored: 1, outages: [] }).text).toBe('1 errored, 1 active, 1 sleeping')
})

const o = outageOf([SAMPLES.credit ?? ''], idle)!
const row = (extra: Partial<LookRow> = {}): LookRow => ({
  kind: 'api', variant: 0, mode: 'work', activity: 'errored', title: 'Dev', state: { text: o.label, color: '#EF4444' }, item: 'COCKPIT-31', tag: 'Claude API', since: '4m',
  trouble: { text: o.line, hex: '#EF4444' }, isOut: false, indent: 0, isOpen: false, detail: [], bars: [], burst: '', landed: '', phase: 0, ...extra,
})

test('the row shows the red label and the matched line at 360, 420 and 520', () => {
  for (const w of [360, 420, 520]) {
    const svg = rowSvg(w, row())
    expect(isWellFormed(svg)).toBe(true)
    expect(svg).toContain('OUT OF CREDIT')
    expect(svg).toContain('#EF4444')
  }
})

test('the open card carries the label and the matched line', () => {
  const base: MemberCardIn = {
    name: 'opencode-a', kind: 'api', activity: 'errored', powered: 'Claude API', target: '', item: 'b21b', description: 'task', lastReport: '', since: '4m', lockOwner: '', lockAge: '',
    context: '', limits: '', blockedBy: [], errored: true, errorReason: o.phrase, out: false, back: '', isStale: false, isStuck: false,
  }
  const d = memberDetail({ ...base, outage: { label: o.label, line: o.line } })
  expect(d.some(x => x.label === 'Out of credit' && x.text === o.line && x.cls === 'errc')).toBe(true)
})

const STATUS: LookStatus = { title: 'Milestone', ratio: 0.5, count: '3/6', note: '', now: 'a', next: 'b', you: 'ship it', youHex: '#F0A500', isAway: false, presenceText: 'Active', stale: '', phase: 0 }

test('the status card shows a red chip when a member is refused, and nothing when none is', () => {
  for (const w of [360, 420, 520]) {
    const on = statusSvg(w, { ...STATUS, outage: '1 OUT OF CREDIT' })
    expect(isWellFormed(on)).toBe(true)
    expect(on).toContain('1 OUT OF CREDIT')
    expect(statusSvg(w, STATUS)).not.toContain('OUT OF CREDIT')
  }
})

test('the plain band line carries the same marker', () => {
  expect(plainBandText({ countText: '1 session, 0 agents', isAway: false, needLook: 1, outage: '1 OUT OF CREDIT' })).toContain('1 OUT OF CREDIT')
})
