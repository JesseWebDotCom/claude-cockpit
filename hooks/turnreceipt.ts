// Cockpit 0.4.0 (the Deck), panel 3: the turn receipt. The turn now, or the last one that finished: its duration, how many
// agents it started, how many edits and errors it had, and the cost it added. Pure reducers.
// The receipt's shape and the edit/error counting rule are adapted from claude-flightdeck (MIT; see NOTICE).
//
// Counting: an edit is a successful Write, Edit or NotebookEdit from ANY loop (delegated work counts); an error is a failed
// tool call in the MAIN loop (a subagent's failure is its own). A denied call is neither.

import { fmtDuration, fmtUsd, plural } from './deckfmt.ts'

export type Turn = { startedAt: number; edits: number; errors: number; agentsAtStart: number; costAtStart: number | null }
export type Receipt = { durationMs: number; agents: number; edits: number; errors: number; costDelta: number | null; reason: string }

export const emptyTurn = (): Turn => ({ startedAt: 0, edits: 0, errors: 0, agentsAtStart: 0, costAtStart: null })

/** A turn begins: the clock, the agent count and the cost to subtract later. */
export const startTurn = (at: number, agentsSoFar: number, cost: number | null): Turn => ({ startedAt: at, edits: 0, errors: 0, agentsAtStart: agentsSoFar, costAtStart: cost })

/** The turn after one finished tool call. */
export function afterCall(t: Turn, c: { inSubagent: boolean; hasFailed: boolean; isEdit: boolean; wasDenied: boolean }): Turn {
  if (c.wasDenied) return t
  return { ...t, errors: t.errors + (!c.inSubagent && c.hasFailed ? 1 : 0), edits: t.edits + (c.isEdit && !c.hasFailed ? 1 : 0) }
}

/** The receipt of a finished turn; `costDelta` is null when the cost is unknown or rose by under half a cent. */
export function receiptOf(t: Turn, o: { durationMs: number; agentsNow: number; costNow: number | null; reason: string }): Receipt {
  const delta = o.costNow !== null && t.costAtStart !== null ? o.costNow - t.costAtStart : null
  return {
    durationMs: o.durationMs,
    agents: Math.max(0, o.agentsNow - t.agentsAtStart),
    edits: t.edits,
    errors: t.errors,
    costDelta: delta !== null && delta >= 0.005 ? delta : null,
    reason: o.reason,
  }
}

/** A saved receipt read back, or null when it is not one. */
export function normalizeReceipt(stored: unknown): Receipt | null {
  if (typeof stored !== 'object' || stored === null) return null
  const r = stored as Record<string, unknown>
  const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  return { durationMs: n(r.durationMs), agents: n(r.agents), edits: n(r.edits), errors: n(r.errors), costDelta: typeof r.costDelta === 'number' ? r.costDelta : null, reason: String(r.reason ?? 'answer') }
}

/** "3m05s · 2 agents · 4 edits · 0 errors · +$0.42" (the cost only when there is one). */
export const receiptText = (r: Receipt): string =>
  `${fmtDuration(r.durationMs)} \u00b7 ${plural(r.agents, 'agent')} \u00b7 ${plural(r.edits, 'edit')} \u00b7 ${plural(r.errors, 'error')}${r.costDelta !== null ? ` \u00b7 +${fmtUsd(r.costDelta)}` : ''}`

/** The counts of the turn now, without the duration (a live clock draws that). */
export const runningText = (t: Turn, agentsNow: number): string => `${plural(Math.max(0, agentsNow - t.agentsAtStart), 'agent')} \u00b7 ${plural(t.edits, 'edit')} \u00b7 ${plural(t.errors, 'error')}`
