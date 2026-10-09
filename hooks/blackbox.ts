// The Black box card (cockpit 0.5.0): the session log, rebuilt in Cockpit from the Deck's own log (sessionlog.ts, whose
// shape and rules are adapted from claude-flightdeck's "log" panel, MIT, see NOTICE). Collapsed it shows the last 3 events; expanded the
// last 40, newest first, each with a time and a short label. Pure.

import { fmtStamp, shorten } from './deckfmt.ts'
import { isProblem } from './sessionlog.ts'
import type { LogKind, LogLine } from './sessionlog.ts'

export const BOX_COLLAPSED = 3
export const BOX_EXPANDED = 40
export const BLACK_BOX_EMPTY = 'nothing recorded yet: the box fills as this session works'

/** The short label of an event kind. */
export const KIND_LABEL: Record<LogKind, string> = { prompt: 'prompt', spawn: 'spawn', done: 'done', lane: 'lane', edit: 'edit', error: 'error', deny: 'denied', consult: 'consult', info: 'note' }

export type BoxRow = { time: string; label: string; who: string; text: string; kind: LogKind; isProblem: boolean }

/** The rows to draw: the newest `isOpen ? 40 : 3` events, newest first. */
export function blackBoxRows(log: readonly LogLine[], isOpen: boolean): BoxRow[] {
  const n = isOpen ? BOX_EXPANDED : BOX_COLLAPSED
  return log
    .slice(-n)
    .reverse()
    .map(l => ({ time: fmtStamp(l.at), label: KIND_LABEL[l.kind], who: l.who, text: shorten(l.text, 120), kind: l.kind, isProblem: isProblem(l) }))
}

/** The card's one-line summary when collapsed: how many events there are, and how many were problems. */
export function blackBoxSummary(log: readonly LogLine[]): string {
  if (log.length === 0) return 'nothing yet'
  const problems = log.filter(isProblem).length
  return log.length + ' events' + (problems > 0 ? ', ' + problems + ' problem' + (problems === 1 ? '' : 's') : '')
}
