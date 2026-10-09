// Cockpit 0.4.0 (the Deck), panel 2: the permission gate. One cell per `tool.check`, settled by the `tool.call` that
// follows it: green = allowed without asking, blue = decided (by the auto-mode classifier or you) and then run,
// amber = pending, red = denied, dim = made inside a subagent. Totals, and a drill-down per tool family (file, shell,
// other) with the last 5 checks. Credentials are masked when a check is recorded (mask.ts describeInput).
// Pure reducers. The idea and the shape of the data are adapted from claude-flightdeck (MIT; see NOTICE).

import { isObject, shorten } from './deckfmt.ts'
import { bucketOf, describeInput, redact } from './mask.ts'
import type { Bucket } from './mask.ts'

/** rule: settings allowed it. ask: put to the decider, outcome pending. cleared: asked, then ran. deny: refused. */
export type Verdict = 'rule' | 'ask' | 'cleared' | 'deny'

export type Check = { id: string; tool: string; bucket: Bucket; verdict: Verdict; inSubagent: boolean; detail: string; at: number }
export type Tally = { rule: number; ask: number; cleared: number; deny: number }
export type Gate = { recent: Check[]; totals: Record<Bucket, Tally> }

export const BUCKETS: readonly Bucket[] = ['file', 'shell', 'other']
export const RECENT_KEEP = 120
export const DRILL_ROWS = 5

const zero = (): Tally => ({ rule: 0, ask: 0, cleared: 0, deny: 0 })
export const emptyGate = (): Gate => ({ recent: [], totals: { file: zero(), shell: zero(), other: zero() } })

const tally = (v: unknown): Tally => {
  const o = isObject(v) ? v : {}
  const n = (k: keyof Tally): number => (typeof o[k] === 'number' && Number.isFinite(o[k] as number) ? (o[k] as number) : 0)
  return { rule: n('rule'), ask: n('ask'), cleared: n('cleared'), deny: n('deny') }
}

/** A stored gate read back; every field tolerates a missing or older shape, and detail text is masked again. */
export function normalizeGate(stored: unknown): Gate {
  const g = isObject(stored) ? stored : {}
  const t = isObject(g.totals) ? g.totals : {}
  const recent: Check[] = []
  if (Array.isArray(g.recent)) {
    for (const c of g.recent) {
      if (!isObject(c) || typeof c.id !== 'string') continue
      recent.push({
        id: c.id,
        tool: String(c.tool ?? ''),
        bucket: c.bucket === 'file' || c.bucket === 'shell' ? c.bucket : 'other',
        verdict: c.verdict === 'rule' || c.verdict === 'ask' || c.verdict === 'cleared' || c.verdict === 'deny' ? c.verdict : 'rule',
        inSubagent: c.inSubagent === true,
        detail: redact(String(c.detail ?? '')),
        at: typeof c.at === 'number' ? c.at : 0,
      })
    }
  }
  return { recent, totals: { file: tally(t.file), shell: tally(t.shell), other: tally(t.other) } }
}

/** The check a `tool.check` event and its verdict make. `allow` is `rule`: nobody was asked. */
export function makeCheck(e: { id: string; tool: string; input: unknown; inSubagent: boolean; at: number }, decision: 'allow' | 'ask' | 'deny'): Check {
  return {
    id: e.id,
    tool: e.tool,
    bucket: bucketOf(e.tool),
    verdict: decision === 'allow' ? 'rule' : decision,
    inSubagent: e.inSubagent,
    detail: shorten(describeInput(e.tool, e.input), 90),
    at: e.at,
  }
}

/** Keeps the newest `max` checks, but never drops a pending ask: its settle must still find it. */
export function trimRecent(list: Check[], max: number): Check[] {
  let extra = list.length - max
  if (extra <= 0) return list
  const out: Check[] = []
  for (const c of list) {
    if (extra > 0 && c.verdict !== 'ask') {
      extra -= 1
      continue
    }
    out.push(c)
  }
  return out.slice(-max * 2)
}

export function recordCheck(g: Gate, c: Check): Gate {
  const t = g.totals[c.bucket]
  return { recent: trimRecent([...g.recent, c], RECENT_KEEP), totals: { ...g.totals, [c.bucket]: { ...t, [c.verdict]: t[c.verdict] + 1 } } }
}

/** An `ask` settled by the `tool.call` that followed it: it ran (cleared) or was refused (deny). Unchanged when nothing matches. */
export function settleCheck(g: Gate, id: string, didRun: boolean): Gate {
  const c = g.recent.find(r => r.id === id && r.verdict === 'ask')
  if (c === undefined) return g
  const verdict: Verdict = didRun ? 'cleared' : 'deny'
  const t = g.totals[c.bucket]
  return {
    recent: g.recent.map(r => (r === c ? { ...r, verdict } : r)),
    totals: { ...g.totals, [c.bucket]: { ...t, ask: Math.max(0, t.ask - 1), [verdict]: t[verdict] + 1 } },
  }
}

export function gateSummary(g: Gate): Tally & { total: number } {
  const all = BUCKETS.reduce((s, k) => ({ rule: s.rule + g.totals[k].rule, ask: s.ask + g.totals[k].ask, cleared: s.cleared + g.totals[k].cleared, deny: s.deny + g.totals[k].deny }), zero())
  return { ...all, total: all.rule + all.ask + all.cleared + all.deny }
}

export const familyTotal = (g: Gate, b: Bucket): number => g.totals[b].rule + g.totals[b].ask + g.totals[b].cleared + g.totals[b].deny

// ---------------------------------------------------------------- cells

export type Tone = 'allowed' | 'decided' | 'pending' | 'denied'
export type Cell = { glyph: string; tone: Tone; isDim: boolean }

const TONE: Record<Verdict, Tone> = { rule: 'allowed', cleared: 'decided', ask: 'pending', deny: 'denied' }

/** One check as one cell: its tone (the colour) and glyph, dim when it was made inside a subagent. */
export const cellOf = (c: Check): Cell => ({ glyph: c.verdict === 'deny' ? '\u2717' : '\u25a0', tone: TONE[c.verdict], isDim: c.inSubagent })

/** The newest `width` checks as cells, oldest first. */
export const strip = (g: Gate, width: number): Cell[] => g.recent.slice(-Math.max(0, width)).map(cellOf)

/** What a verdict is called; `decider` is who decides in this permission mode. */
export function verdictWord(v: Verdict, decider: string): string {
  return v === 'rule' ? 'allowed' : v === 'cleared' ? decider : v === 'ask' ? 'pending' : 'denied'
}

/** Who decides what the rules did not allow: the classifier in auto mode, else you. */
export const deciderOf = (mode: string): string => (mode === 'auto' ? 'classifier' : 'you')

/** The drill-down for one tool family: its last `n` checks (newest last). */
export const drill = (g: Gate, b: Bucket, n: number = DRILL_ROWS): Check[] => g.recent.filter(c => c.bucket === b).slice(-n)

/** The legend counts in one string: "12 allowed · 3 you · 1 pending · 2 denied" (pending only while there is one). */
export function totalsText(g: Gate, decider: string): string {
  const s = gateSummary(g)
  return `${s.rule} allowed \u00b7 ${s.cleared} ${decider}${s.ask > 0 ? ` \u00b7 ${s.ask} pending` : ''} \u00b7 ${s.deny} denied`
}
