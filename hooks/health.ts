// COCKPIT-HEALTH-UI-01: the lane-health check's file (health.json) as the pane and the plan page read it. Pure: no I/O.
// The checker (data-scratch/lane-health/lane-health) writes one item per running plan step: who owns it, a state word, and the last sign of life.

export type HealthState = 'working' | 'idle' | 'finished' | 'dead' | 'stale' | 'needs-input'
export type HealthItem = { owner: string; state: HealthState; lastActivityMs: number | null; detail: string }
export type CoordState = 'working' | 'waiting' | 'idle'
/** The coordinator session (the main Claude session): working, waiting on Jesse, or idle. */
export type HealthCoordinator = { state: CoordState; lastActivityMs: number | null; detail: string }
export type Health = { checkedMs: number; intervalSec: number; items: Map<string, HealthItem>; coordinator: HealthCoordinator | null; /** Live subagents counted by the checker (claude.liveSubagents), null when it did not say. */ liveSubagents: number | null; /** Todo step ids that can be handed out now (LANE-HEALTH-02). */ ready: string[]; /** The checker's open problems, kind and plain detail. */ problems: { kind: string; detail: string }[]; /** Auto-dispatch switch from the checker (LANE-HEALTH-03); null when health.json does not say. */ autoDispatch: boolean | null }

const STATES: readonly string[] = ['working', 'idle', 'finished', 'dead', 'stale', 'needs-input']

/** Parse health.json text; null for anything that is not a usable file (the callers then fall back to the plan state). */
export function parseHealth(text: string | null): Health | null {
  if (text === null) return null
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return null }
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  const checkedMs = typeof o.checkedAt === 'string' ? Date.parse(o.checkedAt) : NaN
  if (!Number.isFinite(checkedMs)) return null
  const interval = typeof o.intervalSec === 'number' && o.intervalSec > 0 ? o.intervalSec : 60
  const items = new Map<string, HealthItem>()
  const src = typeof o.items === 'object' && o.items !== null ? (o.items as Record<string, unknown>) : {}
  for (const [id, v] of Object.entries(src)) {
    if (typeof v !== 'object' || v === null) continue
    const it = v as Record<string, unknown>
    const state = typeof it.state === 'string' && STATES.includes(it.state) ? (it.state as HealthState) : null
    if (state === null) continue
    const la = typeof it.lastActivityAt === 'string' ? Date.parse(it.lastActivityAt) : NaN
    items.set(id, { owner: typeof it.owner === 'string' ? it.owner : '', state, lastActivityMs: Number.isFinite(la) ? la : null, detail: typeof it.detail === 'string' ? it.detail : '' })
  }
  let coordinator: HealthCoordinator | null = null
  const co = o.coordinator
  if (typeof co === 'object' && co !== null) {
    const c = co as Record<string, unknown>
    const st = c.state
    if (st === 'working' || st === 'waiting' || st === 'idle') {
      const la = typeof c.lastActivityAt === 'string' ? Date.parse(c.lastActivityAt) : NaN
      coordinator = { state: st, lastActivityMs: Number.isFinite(la) ? la : null, detail: typeof c.detail === 'string' ? c.detail : '' }
    }
  }
  const cl = o.claude
  const ls = typeof cl === 'object' && cl !== null ? (cl as Record<string, unknown>).liveSubagents : undefined
  const ad = typeof o.autoDispatch === 'object' && o.autoDispatch !== null ? (o.autoDispatch as Record<string, unknown>).on : undefined
  const autoOn = typeof ad === 'boolean' ? ad : null
  const ready = Array.isArray(o.ready) ? o.ready.filter((x): x is string => typeof x === 'string') : []
  const problems = Array.isArray(o.problems)
    ? o.problems.flatMap((x): { kind: string; detail: string }[] => {
        const q = typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : {}
        return typeof q.kind === 'string' && typeof q.detail === 'string' ? [{ kind: q.kind, detail: q.detail }] : []
      })
    : []
  return { checkedMs, intervalSec: interval, items, coordinator, liveSubagents: typeof ls === 'number' && ls >= 0 ? Math.floor(ls) : null, ready, problems, autoDispatch: autoOn }
}

/** The dot colour class: green working, amber idle or stale, red dead, finished or needs-input. */
export function dotClass(s: HealthState): 'okc' | 'warnc' | 'errc' {
  return s === 'working' ? 'okc' : s === 'idle' || s === 'stale' ? 'warnc' : 'errc'
}

/** "active 40s ago", "active 3m ago", "active 2h ago"; "no activity seen" with no time. */
export function activeAgo(lastMs: number | null, nowMs: number): string {
  if (lastMs === null) return 'no activity seen'
  const s = Math.max(0, Math.floor((nowMs - lastMs) / 1000))
  if (s < 60) return 'active ' + s + 's ago'
  if (s < 3600) return 'active ' + Math.floor(s / 60) + 'm ago'
  return 'active ' + Math.floor(s / 3600) + 'h ago'
}

/** True when the checker has not written for more than twice its interval. */
export const checkStopped = (h: Health, nowMs: number): boolean => nowMs - h.checkedMs > 2 * h.intervalSec * 1000

/** "next check in 0:42"; "next check due" once the time has passed (and the check is not yet judged stopped). */
export function countdownText(h: Health, nowMs: number): string {
  const left = Math.ceil((h.checkedMs + h.intervalSec * 1000 - nowMs) / 1000)
  if (left <= 0) return 'next check due'
  return 'next check in ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0')
}

/** The header line for the plan card: the red "health check stopped" or the countdown; '' when there is no health file. */
export function healthHeader(h: Health | null, nowMs: number): { text: string; stopped: boolean } {
  if (h === null) return { text: '', stopped: false }
  if (checkStopped(h, nowMs)) return { text: 'health check stopped', stopped: true }
  return { text: countdownText(h, nowMs), stopped: false }
}

/** Is the step's owner alive? With no health file, or no entry for the step, the plan state stands (alive). Dead, finished and needs-input are not alive. */
export function ownerAlive(h: Health | null, id: string): boolean {
  if (h === null) return true
  const it = h.items.get(id)
  return it === undefined ? true : it.state !== 'dead' && it.state !== 'finished' && it.state !== 'needs-input'
}

/** The dot and the "active Ns ago" for one running step; null when there is no health entry for it. */
export function healthFor(h: Health | null, id: string, nowMs: number): { state: HealthState; cls: 'okc' | 'warnc' | 'errc'; ago: string; detail: string } | null {
  const it = h === null ? undefined : h.items.get(id)
  if (it === undefined) return null
  return { state: it.state, cls: dotClass(it.state), ago: activeAgo(it.lastActivityMs, nowMs), detail: it.detail }
}

/** The short form for the footer: "next check 0:42" or "health check stopped"; '' with no health file. */
export function healthFooter(h: Health | null, nowMs: number): string {
  const x = healthHeader(h, nowMs)
  return x.stopped ? x.text : x.text.replace('next check in ', 'next check ')
}

/** The agents count from the checker's live subagents when it gave one; the session list's count otherwise. */
export function withLiveAgents<T extends { agents: number; byState: object }>(c: T, live: number | null): T {
  return live === null ? c : { ...c, agents: live, byState: {} }
}

/** "Ready to assign: 3 · Add Tour to kit" (the first ready step's title, or its id when the title is unknown); '' when none are ready or there is no health file. */
export function readyLine(h: Health | null, titleOf: (id: string) => string | null): string {
  if (h === null || h.ready.length === 0) return ''
  const first = h.ready[0]!
  return 'Ready to assign: ' + h.ready.length + ' \u00b7 ' + (titleOf(first) ?? first)
}

/** The checker's plan-level problems as one plain line each: plan-idle ("Nothing is running...") and ready-unassigned. */
export function planProblemLines(h: Health | null): string[] {
  if (h === null) return []
  return h.problems.filter(p => p.kind === 'plan-idle' || p.kind === 'ready-unassigned' || p.kind === 'unsent-message').map(p => p.detail)
}

/** "Auto-dispatch: on" or "Auto-dispatch: off"; '' when there is no health file or it does not say. */
export function autoDispatchLine(h: Health | null): string {
  if (h === null || h.autoDispatch === null) return ''
  return 'Auto-dispatch: ' + (h.autoDispatch ? 'on' : 'off')
}
