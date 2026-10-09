// Cockpit 0.4.0 (the Deck): the deck's whole memory and the pure reducers that turn one host event into the next memory.
// A hook in register.tsx calls ONE of these and stores the answer; nothing here reads the host, so every rule is testable
// with plain objects (tests/deck.test.ts). The memory lives in the module (it ends with the session, and with a reload).

import { addCard, applyStep, cardTitle, finishCard, mapCard, noteTool, normalizeCard, runningCount, spawnCard } from './agentcards.ts'
import type { AgentCard } from './agentcards.ts'
import { fmtDuration, shorten } from './deckfmt.ts'
import { emptyGate, familyTotal, gateSummary, makeCheck, normalizeGate, recordCheck, settleCheck } from './gate.ts'
import type { Gate } from './gate.ts'
import { EDIT_TOOLS } from './mask.ts'
import type { Bucket } from './mask.ts'
import { compactEntry, consultEntry, denyEntry, doneEntry, editEntry, errorEntry, normalizeLog, promptEntry, pushLog, spawnEntry, trackLanes } from './sessionlog.ts'
import type { LaneMemory, LaneState, LogLine } from './sessionlog.ts'
import { afterCall, emptyTurn, normalizeReceipt, receiptOf, startTurn } from './turnreceipt.ts'
import type { Receipt, Turn } from './turnreceipt.ts'
import { emptyContext, emptyMain, normalizeMain, onCompact, onMeasure, onMode, onRunning, onStep } from './vitals.ts'
import type { Context, Main } from './vitals.ts'
import type { StatusFacts } from './deckstatus.ts'

/** What the person has opened in the deck: not data, but kept with it so /cockpit reset clears both. */
export type DeckUi = {
  /** The agent card expanded (by 1-9), or null. */
  expanded: string | null
  /** The gate family drilled into, or null. */
  gateOpen: Bucket | null
  /** How many lines the log is scrolled back from the newest. */
  logBack: number
  /** The log shows 24 lines instead of 8. */
  logOpen: boolean
}

export type Deck = {
  main: Main
  ctx: Context
  gate: Gate
  cards: AgentCard[]
  log: LogLine[]
  turn: Turn
  receipt: Receipt | null
  lanes: LaneMemory
  /** Every Agent-tool dispatch this session (cards are capped; this is not). */
  spawned: number
  consultsOpen: string[]
  consultsSeen: string[]
  ui: DeckUi
}

export const emptyUi = (): DeckUi => ({ expanded: null, gateOpen: null, logBack: 0, logOpen: false })

export const emptyDeck = (): Deck => ({
  main: emptyMain(),
  ctx: emptyContext(),
  gate: emptyGate(),
  cards: [],
  log: [],
  turn: emptyTurn(),
  receipt: null,
  lanes: null,
  spawned: 0,
  consultsOpen: [],
  consultsSeen: [],
  ui: emptyUi(),
})

/**
 * `/cockpit reset` and `/clear`: the agents, the checks, the log, the turn and the receipt start over. The model, the cost, the
 * compaction count and what the lanes were last seen doing stay (they are facts about the session, not about the pane).
 */
export const resetDeck = (d: Deck): Deck => ({
  ...emptyDeck(),
  main: { ...emptyMain(), model: d.main.model, effort: d.main.effort, mode: d.main.mode },
  ctx: { ...d.ctx, pct: null, tokens: null },
  lanes: d.lanes,
})

/** A deck read back from anything stored: every part tolerates a missing or older shape. */
export function normalizeDeck(stored: unknown): Deck {
  const o = typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {}
  const base = emptyDeck()
  return {
    ...base,
    main: normalizeMain(o.main),
    gate: normalizeGate(o.gate),
    cards: Array.isArray(o.cards) ? o.cards.map(normalizeCard) : [],
    log: normalizeLog(o.log),
    receipt: normalizeReceipt(o.receipt),
  }
}

const say = (d: Deck, line: LogLine | null): Deck => (line === null ? d : { ...d, log: pushLog(d.log, line) })

/** Who an event came from, for the log: `main`, or the agent's task. */
export const whoOf = (d: Deck, agentId: string | undefined): string => {
  if (agentId === undefined || agentId === '') return 'main'
  const c = d.cards.find(x => x.id === agentId)
  return c !== undefined ? shorten(cardTitle(c), 14) : 'agent'
}

// ---------------------------------------------------------------- the main loop

/** A prompt was submitted or a turn opened with text: the log gets its first 70 characters. */
export const deckOnTurnStart = (d: Deck, e: { at: number; text: string; cost: number | null }): Deck =>
  say({ ...d, turn: startTurn(e.at, d.spawned, e.cost), main: onRunning(d.main, true) }, promptEntry(e.at, e.text))

export const deckOnMainStep = (d: Deck, e: { model: string; effort?: string | number }): Deck => ({ ...d, main: onStep(d.main, e) })
export const deckOnMode = (d: Deck, mode: string | undefined): Deck => (mode === undefined || mode === '' || mode === d.main.mode ? d : { ...d, main: onMode(d.main, mode) })
export const deckOnMeasure = (d: Deck, e: { percent: number | null; tokens: number | null; window: number; costUsd: number | null }): Deck => ({ ...d, ctx: onMeasure(d.ctx, e) })

export function deckOnCompact(d: Deck, e: { agentId?: string; trigger: string; at: number }): Deck {
  if (e.agentId !== undefined || e.trigger === 'precompute') return d
  return say({ ...d, ctx: onCompact(d.ctx) }, compactEntry(e.at, e.trigger))
}

// ---------------------------------------------------------------- the gate and the calls

/** A `tool.check` and its verdict. A query (no call id) is not a check. */
export function deckOnCheck(d: Deck, e: { id: string | undefined; tool: string; input: unknown; agentId?: string; decision: 'allow' | 'ask' | 'deny'; at: number }): Deck {
  if (e.id === undefined || e.id === '' || d.gate.recent.some(c => c.id === e.id)) return d
  const check = makeCheck({ id: e.id, tool: e.tool, input: e.input, inSubagent: e.agentId !== undefined && e.agentId !== '', at: e.at }, e.decision)
  const next = { ...d, gate: recordCheck(d.gate, check) }
  return e.decision === 'deny' ? say(next, denyEntry(e.at, whoOf(d, e.agentId), check.detail, 'rule', e.agentId ?? null)) : next
}

export type ToolCallEvent = { id: string; tool: string; input: unknown; agentId?: string; wasDenied: boolean; isError: boolean; at: number }

/**
 * A finished `tool.call`: settles its pending ask, counts it in the turn, notes it on its agent's card and puts the lines worth a
 * glance in the log (denials, errors, edits). A hand-back call (SubagentHandback) is plumbing and is not counted.
 */
export function deckOnToolCall(d: Deck, e: ToolCallEvent): Deck {
  const before = d.gate.recent.find(c => c.id === e.id)
  const gate = settleCheck(d.gate, e.id, !e.wasDenied)
  let next: Deck = { ...d, gate }
  if (e.tool === 'SubagentHandback') return next
  const inSubagent = e.agentId !== undefined && e.agentId !== ''
  const hasFailed = !e.wasDenied && e.isError
  const isEdit = !hasFailed && !e.wasDenied && EDIT_TOOLS.has(e.tool)
  next = { ...next, turn: afterCall(next.turn, { inSubagent, hasFailed, isEdit, wasDenied: e.wasDenied }) }
  const who = whoOf(d, e.agentId)
  const label = shorten(`${e.tool}`, 14)
  if (inSubagent && e.agentId !== undefined) {
    const id = e.agentId
    const detail = checkDetail(d, e)
    next = { ...next, cards: mapCard(next.cards, id, c => noteTool(c, { tool: e.tool, text: detail, isError: hasFailed || e.wasDenied })) }
  }
  if (e.wasDenied) {
    // A refusal by rule was logged when the check was made; only a refusal after an ask is new here.
    if (before === undefined || before.verdict === 'ask') next = say(next, denyEntry(e.at, who, before?.detail ?? label, 'asked', e.agentId ?? null))
  } else if (hasFailed) next = say(next, errorEntry(e.at, who, `${before?.detail ?? label} \u2717`, e.agentId ?? null))
  else if (isEdit) next = say(next, editEntry(e.at, who, e.tool, e.input, e.agentId ?? null))
  return next
}

/** The call's one-line description: the check's (already masked) when there is one, else the tool name. */
const checkDetail = (d: Deck, e: ToolCallEvent): string => d.gate.recent.find(c => c.id === e.id)?.detail ?? e.tool

// ---------------------------------------------------------------- agents

/** The main loop's turn ended (`turn.complete`, no agent id). */
export const deckOnMainComplete = (d: Deck, e: { reason: string; durationMs: number; cost: number | null }): Deck => ({
  ...d,
  main: onRunning(d.main, false),
  receipt: receiptOf(d.turn, { durationMs: e.durationMs, agentsNow: d.spawned, costNow: e.cost, reason: e.reason }),
})

/** An Agent-tool dispatch started (`agent.spawn`). `isConsult` says its type matches the consult pattern. */
export function deckOnSpawn(d: Deck, e: { id: string; type: string; model: string; description: string; prompt: string; at: number; isConsult: boolean }): Deck {
  const card = spawnCard({ id: e.id, type: e.type, model: e.model, description: e.description, prompt: e.prompt, at: e.at })
  let next: Deck = { ...d, cards: addCard(d.cards, card), spawned: d.spawned + 1 }
  next = say(next, spawnEntry(e.at, shorten(cardTitle(card), 12), card.type, e.id))
  if (e.isConsult) next = openConsult(next, e.id, `${card.type} spawned`, e.at)
  return next
}

/** One request of an agent's own loop ended: its context, output tokens and steps. */
export function deckOnAgentStep(d: Deck, e: { agentId: string; model: string; usage: Parameters<typeof applyStep>[1]['usage']; stopReason: string | null; at: number }): Deck {
  if (!d.cards.some(c => c.id === e.agentId)) return d
  const cards = mapCard(d.cards, e.agentId, c => applyStep(c, { model: e.model, usage: e.usage, stopReason: e.stopReason }))
  const next = { ...d, cards }
  return e.stopReason === 'max_tokens' ? say(next, errorEntry(e.at, whoOf(d, e.agentId), 'hit max_tokens', e.agentId)) : next
}

/** An agent's `turn.complete`: its card closes and the log says how it went. */
export function deckOnAgentComplete(d: Deck, e: { agentId: string; reason: string; answer: string; at: number }): Deck {
  const card = d.cards.find(c => c.id === e.agentId)
  if (card === undefined) return d
  const done = finishCard(card, { reason: e.reason, at: e.at, answer: e.answer })
  const next = { ...d, cards: mapCard(d.cards, e.agentId, () => done), consultsOpen: d.consultsOpen.filter(x => x !== e.agentId) }
  const was = d.consultsOpen.includes(e.agentId)
  const line = doneEntry(e.at, whoOf(d, e.agentId), done.status === 'done' ? 'done' : done.status === 'stopped' ? 'stopped' : 'failed', e.at - card.spawnedAt, e.agentId, fmtDuration)
  return say(was ? say(next, consultEntry(e.at, `${card.type} answered`)) : next, line)
}

// ---------------------------------------------------------------- consults

/** A consult began: an agent of a consulting type, or an advisor-style server tool. The log says so once per id. */
export function openConsult(d: Deck, id: string, via: string, at: number): Deck {
  if (d.consultsSeen.includes(id)) return d
  return say({ ...d, consultsSeen: [...d.consultsSeen, id].slice(-60), consultsOpen: [...d.consultsOpen, id].slice(-20) }, consultEntry(at, `consulted \u00b7 ${via}`))
}

/** A server tool's result arrived: the consult it opened ends. */
export function closeConsult(d: Deck, id: string, at: number): Deck {
  if (!d.consultsOpen.includes(id)) return d
  return say({ ...d, consultsOpen: d.consultsOpen.filter(x => x !== id) }, consultEntry(at, 'advice returned'))
}

// ---------------------------------------------------------------- lanes

/** The tmux lanes as the poll found them: a lane that changed between working, idle and absent is logged. */
export function deckOnLanes(d: Deck, seen: readonly { name: string; state: 'working' | 'idle' }[], at: number): Deck {
  const r = trackLanes(d.lanes, seen, at)
  const next: Deck = { ...d, lanes: r.next }
  return r.lines.reduce((acc, l) => say(acc, l), next)
}

export const lanesWorking = (d: Deck): number => Object.values(d.lanes ?? {}).filter((s: LaneState) => s === 'working').length

// ---------------------------------------------------------------- derived

/** The facts the status line piece is made of. */
export function statusFactsOf(d: Deck): StatusFacts {
  return { ctxPct: d.ctx.pct, agentsRunning: runningCount(d.cards), agentsTotal: d.cards.length, lanesWorking: lanesWorking(d), denied: gateSummary(d.gate).deny }
}

/** What the layout needs to know to drop an empty panel. */
export const panelFactsOf = (d: Deck): { checks: number; cards: number; isRunning: boolean; hasReceipt: boolean; logLines: number } => ({
  checks: gateSummary(d.gate).total,
  cards: d.cards.length,
  isRunning: d.main.isRunning,
  hasReceipt: d.receipt !== null,
  logLines: d.log.length,
})

/** The family totals the gate buttons show. */
export const familyCount = (d: Deck, b: Bucket): number => familyTotal(d.gate, b)

// ---------------------------------------------------------------- what the person presses

/** An agent card or lane opened (1-9), or closed when it was open. */
export const toggleExpanded = (d: Deck, id: string): Deck => ({ ...d, ui: { ...d.ui, expanded: d.ui.expanded === id ? null : id } })

/** A gate family's drill-down opened (f, s, o), or closed when it was open. */
export const toggleGate = (d: Deck, b: Bucket): Deck => ({ ...d, ui: { ...d.ui, gateOpen: d.ui.gateOpen === b ? null : b } })

export const toggleLogOpen = (d: Deck): Deck => ({ ...d, ui: { ...d.ui, logOpen: !d.ui.logOpen, logBack: 0 } })

/** The log scrolled by `delta` lines toward older (positive) or newer (negative); never past either end. */
export function scrollLog(d: Deck, delta: number, shown: number): Deck {
  const most = Math.max(0, d.log.length - shown)
  return { ...d, ui: { ...d.ui, logBack: Math.max(0, Math.min(most, d.ui.logBack + delta)) } }
}
