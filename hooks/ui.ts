// UI state that survives a reload, the celebration rules, and the pinned-layout window. Pure: no mods
// API, no I/O. Unit tested in tests/ui.test.ts.

import { AUTOPILOT, autopilotPill } from './autopilot.ts'
import type { Pill } from './autopilot.ts'
import { fin } from './core.ts'

// ---------------------------------------------------------------------------
// Tabs

// Four tabs (v6). Sessions and System are sections of Health.
export type TabId = 'crew' | 'items' | 'inbox' | 'health'

export const TABS: readonly { id: TabId; label: string; hotkey: string; hint: string }[] = [
  { id: 'crew', label: 'Crew', hotkey: '1', hint: 'the Captain, its subagents and the tmux crew, with the count chips' },
  { id: 'items', label: 'Items', hotkey: '2', hint: 'work items by Now, Next and Done today' },
  { id: 'inbox', label: 'Inbox', hotkey: '3', hint: 'bugs and ideas, the away log' },
  { id: 'health', label: 'Health', hotkey: '4', hint: 'context, sessions, system, limits and credits' },
]

export const isTab = (v: unknown): v is TabId => TABS.some(t => t.id === v)

// A tab saved by an older build: Sessions and System moved into Health.
const legacyTab = (v: unknown): TabId | null => (v === 'sessions' || v === 'system' ? 'health' : isTab(v) ? v : null)

// ---------------------------------------------------------------------------
// What is remembered across reloads (.cockpit/state/ui.json)

export type UiState = {
  tab: TabId
  // "By crew" or "By item": the two tabs the toggle flips between.
  view: 'crew' | 'items'
  // "mine" (what needs me) or "all".
  mine: boolean
  expanded: string[]
  celebrations: boolean
  // The landed commits and milestones a celebration has already fired for.
  seenLanded: string[]
  seenMilestones: string[]
  // False until the first poll has recorded what had already landed (so a reload never replays it).
  baselined: boolean
}

export const defaultUi: UiState = { tab: 'crew', view: 'crew', mine: false, expanded: [], celebrations: true, seenLanded: [], seenMilestones: [], baselined: false }

const strings = (v: unknown, max: number): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-max) : [])

// Tolerant: a missing or broken file is the defaults; an unknown field is dropped.
export function parseUi(text: string | null): UiState {
  if (text === null) return { ...defaultUi }
  try {
    const r: unknown = JSON.parse(text)
    if (r === null || typeof r !== 'object' || Array.isArray(r)) return { ...defaultUi }
    const o = r as Record<string, unknown>
    return {
      tab: legacyTab(o.tab) ?? defaultUi.tab,
      view: o.view === 'items' ? 'items' : 'crew',
      mine: o.mine === true,
      expanded: strings(o.expanded, 40),
      celebrations: o.celebrations !== false,
      seenLanded: strings(o.seenLanded, 300),
      seenMilestones: strings(o.seenMilestones, 50),
      baselined: o.baselined === true,
    }
  } catch {
    return { ...defaultUi }
  }
}

export const serializeUi = (s: UiState): string => JSON.stringify({ ...s, seenLanded: s.seenLanded.slice(-300), seenMilestones: s.seenMilestones.slice(-50) }) + '\n'

// ---------------------------------------------------------------------------
// Celebrations: a landed item throws confetti once

export type Landing = { hash: string; subject: string }

// The commits that are new since the last poll. The first poll ever (not baselined) only records what has
// already landed: nothing bursts for it, and a reload never replays a landing, because the seen ids are saved.
export function landEvents(current: readonly Landing[], seen: ReadonlySet<string>, baselined: boolean): { events: Landing[]; seen: Set<string>; baselined: true } {
  const next = new Set(seen)
  const events = baselined ? current.filter(c => !seen.has(c.hash)) : []
  for (const c of current) next.add(c.hash)
  return { events, seen: next, baselined: true }
}

// A milestone is "done" when its bar is full; it celebrates once per milestone name.
export function milestoneEvent(milestone: string, done: number | null, total: number | null, seen: readonly string[]): boolean {
  return milestone !== '' && total !== null && total > 0 && done !== null && done >= total && !seen.includes(milestone)
}

export const BURST_MS = 2000
export const CHIP_MS = 10_000

export type Celebration = {
  hash: string
  subject: string
  // The item id the commit carries, or ''.
  item: string
  // The member that did it, or '' for the coordinator.
  member: string
  at: number
}

// The burst is drawn only in the first 2 s after the event (the pane redraws on the poll that found it, and
// the next poll is 5 s later), the "landed <item>" chip for 10 s.
export const burstNow = (c: Celebration, nowMs: number): boolean => fin(nowMs) && nowMs - c.at >= 0 && nowMs - c.at < BURST_MS
export const chipNow = (c: Celebration, nowMs: number): boolean => fin(nowMs) && nowMs - c.at >= 0 && nowMs - c.at < CHIP_MS

// Kept for the chip's 10 s, then dropped.
export const pruneCelebrations = (list: readonly Celebration[], nowMs: number): Celebration[] => list.filter(c => nowMs - c.at < CHIP_MS)

// ---------------------------------------------------------------------------
// Pinned layout: the Status card on top and the Limits area at the bottom never scroll; only the middle does.

export type Block = { key: string; el: unknown; h: number }

// How many pixels one "row" of the engine's scroll counts for. An assumption: the engine speaks in rows.
export const ROW_PX = 20

export type Windowed = {
  shown: Block[]
  // The offset actually used, in px (snapped to the start of a block), and the largest one.
  offset: number
  maxOffset: number
  hiddenAbove: number
  hiddenBelow: number
}

// The blocks that fit in `budgetPx` starting at the block that holds `offsetPx`; at least one block shows,
// and the window never scrolls past the point where the last block ends at the bottom.
export function windowBlocks(blocks: readonly Block[], offsetPx: number, budgetPx: number): Windowed {
  const total = blocks.reduce((s, b) => s + b.h, 0)
  // An unbounded budget (no row count from the surface) shows every block; a number that is not finite otherwise reads as no room.
  const budget = budgetPx === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : Math.max(0, fin(budgetPx) ? budgetPx : 0)
  // Largest start offset: the first block from which everything after it still fits.
  let maxStart = 0
  for (let acc = 0, i = blocks.length - 1; i >= 0; i--) {
    acc += blocks[i]?.h ?? 0
    if (acc > budget) {
      maxStart = blocks.slice(0, i + 1).reduce((s, b) => s + b.h, 0)
      break
    }
  }
  const want = Math.max(0, Math.min(maxStart, fin(offsetPx) ? offsetPx : 0))
  // Snap to the block that contains `want`.
  let start = 0
  let top = 0
  for (let i = 0; i < blocks.length; i++) {
    const h = blocks[i]?.h ?? 0
    if (top + h > want) {
      start = i
      break
    }
    top += h
    start = i + 1
  }
  const shown: Block[] = []
  let used = 0
  for (let i = start; i < blocks.length; i++) {
    const b = blocks[i]
    if (b === undefined) break
    if (shown.length > 0 && used + b.h > budget) break
    shown.push(b)
    used += b.h
  }
  const shownH = shown.reduce((s, b) => s + b.h, 0)
  return { shown, offset: top, maxOffset: maxStart, hiddenAbove: top, hiddenBelow: Math.max(0, total - top - shownH) }
}

// (0.5.1: Active and Away are now AUTOPILOT off and on, hooks/autopilot.ts; the pill below is that one, grey when off, green when on.)
// The switch in the bar above the prompt is a filled pill (v13). v16: the pill is its own
// Text BESIDE the switch Button. The real host refuses a Button whose child is not a plain string ("JSX element <Button> takes one
// string child, its label, or none"; the v13 coloured-Text child threw, the rich bar and the plain fallback both failed and nothing
// was drawn). The colour uses `inverse` with a named colour: the same Text props the bar's count pill has always used on the host.
export type PresencePill = Pill
export const presencePill = (isAway: boolean): PresencePill => autopilotPill(isAway)

// The Button that switches Active and Away: a thin string label (the pill beside it carries the colour and the word).
export const PRESENCE_SWITCH = '\u25be'

// The last resort when every drawing of the bar failed: ONE plain text line, no Button, no Box, nothing that can be refused.
export const plainBandText = (o: { working: number; idle: number; total: number; isAway: boolean; needLook: number }): string =>
  // The control's state is by colour only: plain text has no colour, so AUTOPILOT is named only while it is on, and no "off" is ever written.
  o.total + ' crew: ' + o.working + ' working, ' + o.idle + ' idle' + (o.isAway ? ' \u00b7 ' + AUTOPILOT : '') + (o.needLook > 0 ? ' \u00b7 ! ' + o.needLook : '')

// A guard for the host rule above, over a source text: every `Button({ ... })` call that carries a `children:` entry (a Button must have a
// string `label` and no other child). Returns where each one is, empty when the source is clean. Strings and comments are skipped.
export function buttonChildProblems(src: string): string[] {
  const out: string[] = []
  const re = /\bButton\(\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    let depth = 1
    let i = m.index + m[0].length
    let quote = ''
    const start = i
    for (; i < src.length && depth > 0; i++) {
      const ch = src[i] ?? ''
      if (quote !== '') {
        if (ch === '\\') i++
        else if (ch === quote) quote = ''
        continue
      }
      if (ch === "'" || ch === '"' || ch === '`') quote = ch
      else if (ch === '{' || ch === '(' || ch === '[') depth++
      else if (ch === '}' || ch === ')' || ch === ']') depth--
      else if (ch === 'c' && depth === 1 && /^children\s*:/.test(src.slice(i, i + 12)) && /[\s,{]/.test(src[i - 1] ?? ' ')) {
        out.push('Button child at line ' + (src.slice(0, i).split('\n').length) + ': ' + src.slice(start, i + 60).split('\n').pop()?.trim().slice(0, 80))
        break
      }
    }
  }
  // The JSX form: <Button ...>content</Button> with an element inside.
  // Whole-line // comments are blanked first (same length, so line numbers hold), so a comment that names the tag is not a hit.
  const code = src.replace(/^[ \t]*\/\/.*$/gm, m => ' '.repeat(m.length))
  for (const j of code.matchAll(/<Button\b[^>]*>([\s\S]*?)<\/Button>/g)) if (/<[A-Za-z]/.test(j[1] ?? '')) out.push('JSX Button with an element child at line ' + code.slice(0, j.index ?? 0).split('\n').length)
  return out
}
