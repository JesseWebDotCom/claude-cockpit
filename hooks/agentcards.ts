// Cockpit 0.4.0 (the Deck), panel 5: subagent cards. THIS session's Agent-tool dispatches: `agent.spawn` makes a card,
// `turn.step` feeds its tokens and steps, `tool.call` its last tool calls, `turn.complete` closes it. Each card shows the
// task, the type, live context and output tokens, steps, a running clock and `max_tokens` in red. Cards sit side by side
// while they fit; beyond that, swimlanes on one time axis. Number keys 1-9 expand a card: its full task, its last 3 tool
// calls and the start of its answer.
//
// Per-agent context is the latest request's whole input (uncached + cache read + cache write). It is a context size, not a
// cost: the API has no per-agent cost, and the deck labels it `ctx`.
// The reducers and the card/lane rules are adapted from claude-flightdeck (MIT; see NOTICE).

import { clamp, isObject, shorten } from './deckfmt.ts'
import { redact } from './mask.ts'

export type CardStatus = 'running' | 'done' | 'failed' | 'stopped'
export type ToolNote = { tool: string; text: string; isError: boolean }

export type AgentCard = {
  id: string
  type: string
  model: string
  /** The task in the agent's own words (the Agent tool's `description`); the type stands in when there is none. */
  description: string
  /** The full task (the Agent tool's `prompt`), masked and cut to 600 characters. */
  task: string
  status: CardStatus
  spawnedAt: number
  endedAt: number | null
  /** The agent's context now: input + cache read + cache write of its latest request. */
  ctx: number
  /** Output tokens summed over its requests. */
  out: number
  steps: number
  lastStop: string | null
  /** Its last 3 tool calls. */
  tools: ToolNote[]
  /** The start of its answer, masked, cut to 400 characters. */
  answer: string
}

export const CARDS_KEEP = 24
export const TASK_MAX = 600
export const ANSWER_MAX = 400

export const blankCard = (): AgentCard => ({ id: '', type: 'agent', model: '', description: '', task: '', status: 'running', spawnedAt: 0, endedAt: null, ctx: 0, out: 0, steps: 0, lastStop: null, tools: [], answer: '' })

export function normalizeCard(stored: unknown): AgentCard {
  const c = isObject(stored) ? stored : {}
  const b = blankCard()
  const n = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  return {
    id: String(c.id ?? ''),
    type: String(c.type ?? b.type),
    model: String(c.model ?? ''),
    description: String(c.description ?? ''),
    task: redact(String(c.task ?? '')),
    status: c.status === 'done' || c.status === 'failed' || c.status === 'stopped' ? c.status : 'running',
    spawnedAt: n(c.spawnedAt, 0),
    endedAt: typeof c.endedAt === 'number' ? c.endedAt : null,
    ctx: n(c.ctx, 0),
    out: n(c.out, 0),
    steps: n(c.steps, 0),
    lastStop: typeof c.lastStop === 'string' ? c.lastStop : null,
    tools: Array.isArray(c.tools) ? c.tools.filter(isObject).map(t => ({ tool: String(t.tool ?? ''), text: redact(String(t.text ?? '')), isError: t.isError === true })).slice(-3) : [],
    answer: redact(String(c.answer ?? '')),
  }
}

/** A new card for a spawned agent. The task text is masked before it is stored. */
export const spawnCard = (s: { id: string; type: string; model: string; description: string; prompt: string; at: number }): AgentCard => ({
  ...blankCard(),
  id: s.id,
  type: s.type,
  model: s.model,
  description: shorten(s.description, 80),
  task: redact(s.prompt.replace(/\s+/g, ' ').trim()).slice(0, TASK_MAX),
  spawnedAt: s.at,
})

/** The list with a card added; only the newest CARDS_KEEP stay. */
export const addCard = (cards: readonly AgentCard[], c: AgentCard): AgentCard[] => [...cards.filter(x => x.id !== c.id), c].slice(-CARDS_KEEP)

type StepUsage = { input_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; output_tokens?: number } | null | undefined

/** A card after one of its model requests: its context is the latest request's whole input; output adds up. */
export function applyStep(c: AgentCard, s: { model: string; usage: StepUsage; stopReason: string | null }): AgentCard {
  const u = s.usage ?? {}
  const ctx = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
  return { ...c, model: c.model !== '' ? c.model : s.model, steps: c.steps + 1, ctx: ctx > 0 ? ctx : c.ctx, out: c.out + (u.output_tokens ?? 0), lastStop: s.stopReason }
}

export const noteTool = (c: AgentCard, n: ToolNote): AgentCard => ({ ...c, tools: [...c.tools, { ...n, text: redact(shorten(n.text, 80)) }].slice(-3) })

/** A card closed by its `turn.complete`. */
export function finishCard(c: AgentCard, f: { reason: string; at: number; answer: string }): AgentCard {
  const status: CardStatus = f.reason === 'answer' ? 'done' : f.reason === 'aborted' ? 'stopped' : 'failed'
  return { ...c, status, endedAt: f.at, answer: redact(shorten(f.answer, ANSWER_MAX)) }
}

/** The card in a list updated by id; the list itself when none matches (so the caller can skip the write). */
export function mapCard(cards: readonly AgentCard[], id: string, fn: (c: AgentCard) => AgentCard): AgentCard[] {
  return cards.map(c => (c.id === id ? fn(c) : c))
}

export const isMaxTokens = (c: AgentCard): boolean => c.lastStop === 'max_tokens'
export const cardTitle = (c: AgentCard): string => (c.description !== '' ? c.description : c.type)
export const elapsedOf = (c: AgentCard, now: number): number => Math.max(0, (c.endedAt ?? now) - c.spawnedAt)
export const runningCount = (cards: readonly AgentCard[]): number => cards.filter(c => c.status === 'running').length

/** The glyph and word of a card's state. */
export const stateOf = (c: AgentCard): { glyph: string; word: string } =>
  isMaxTokens(c) ? { glyph: '\u2717', word: 'max_tokens' } : c.status === 'running' ? { glyph: '\u25d0', word: 'running' } : c.status === 'done' ? { glyph: '\u2713', word: 'done' } : c.status === 'failed' ? { glyph: '\u2717', word: 'failed' } : { glyph: '\u25a0', word: 'stopped' }

/** "ctx 82k \u00b7 out 3.1k \u00b7 7 st", or "starting\u2026" before the first request ends. */
export const tokensText = (c: AgentCard, k: (n: number) => string): string => (c.steps > 0 ? `ctx ${k(c.ctx)} \u00b7 out ${k(c.out)} \u00b7 ${c.steps} st` : 'starting\u2026')

// ---------------------------------------------------------------- layout

export const CARD_MIN_COLS = 20

export type AgentsLayout = { mode: 'none' | 'cards' | 'lanes'; fit: number; cardW: number; shown: AgentCard[]; hiddenEarlier: number; keys: number }

/**
 * Cards while they fit, swimlanes beyond that. `maxCards` (1 to 6) is the most side by side; the pane's width can lower it
 * (a card needs CARD_MIN_COLS columns). `shown` is the newest cards (cards: up to `fit`; lanes: up to 6), numbered 1-9 in order.
 */
export function agentsLayout(cards: readonly AgentCard[], width: number, maxCards: number): AgentsLayout {
  if (cards.length === 0) return { mode: 'none', fit: 0, cardW: width, shown: [], hiddenEarlier: 0, keys: 0 }
  const fit = clamp(Math.min(Math.round(maxCards), Math.floor((width + 1) / (CARD_MIN_COLS + 1))), 1, 6)
  if (cards.length > fit) {
    const shown = cards.slice(-6)
    return { mode: 'lanes', fit, cardW: width, shown: [...shown], hiddenEarlier: cards.length - shown.length, keys: Math.min(9, shown.length) }
  }
  const shown = cards.slice(-fit)
  return { mode: 'cards', fit, cardW: Math.max(CARD_MIN_COLS, Math.floor((width - (shown.length - 1)) / shown.length)), shown: [...shown], hiddenEarlier: cards.length - shown.length, keys: Math.min(9, shown.length) }
}

/** Swimlane geometry: each agent's bar on one shared axis from the first spawn to now, in `width` cells. */
export function lanes(cards: readonly AgentCard[], now: number, width: number): { id: string; before: number; bar: number; after: number }[] {
  const starts = cards.map(c => c.spawnedAt).filter(n => n > 0)
  const start = Math.min(...starts, now)
  const span = Math.max(1, now - start)
  return cards.map(c => {
    const from = Math.floor(((Math.max(c.spawnedAt, start) - start) / span) * width)
    const to = Math.max(from + 1, Math.ceil((((c.endedAt ?? now) - start) / span) * width))
    const a = Math.min(from, width)
    const b = Math.min(to, width)
    return { id: c.id, before: a, bar: Math.max(1, b - a), after: Math.max(0, width - b) }
  })
}

/** A title split over two rows at a word boundary: `first` cells on row one, `rest` on row two. */
export function titleLines(title: string, first: number, rest: number): [string, string] {
  const t = title.replace(/\s+/g, ' ').trim()
  if (t.length <= first) return [t, '']
  const cut = t.lastIndexOf(' ', first)
  const at = cut > 0 ? cut : first
  return [t.slice(0, at).trim(), shorten(t.slice(at), rest)]
}

export type Expanded = { title: string; head: string; task: string; tools: ToolNote[]; answer: string }

/** What an expanded card shows: its full task, its last 3 tool calls and the start of its answer. */
export function expandedOf(c: AgentCard, prettyModel: (m: string) => string): Expanded {
  return { title: cardTitle(c), head: `${c.type} \u00b7 ${prettyModel(c.model)} \u00b7 ${stateOf(c).word} \u00b7 ${c.steps} steps`, task: c.task, tools: c.tools.slice(-3), answer: c.answer }
}

/** The number key (1-9) of a card in the shown list, or null when it has none. */
export const keyOf = (shown: readonly AgentCard[], id: string): number | null => {
  const i = shown.findIndex(c => c.id === id)
  return i >= 0 && i < 9 ? i + 1 : null
}
