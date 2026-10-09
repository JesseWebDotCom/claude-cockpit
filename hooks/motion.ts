// Cockpit 0.4.0 (the Deck), item 6: animation done right. The rules for WHEN a connector moves; the drawing itself is two
// SURFACE modules (rail.tsx, elapsed.tsx) that redraw only their own region on the surface's own frame clock, so the deck
// (and the bar above the prompt) is not redrawn for every frame. A connector moves only while work flows: a turn is running,
// an agent is running, or a lane is working. Everything else is a still, dim line. Pure.
// The idea (connectors and clocks as surface modules, motion only while work flows) is from claude-flightdeck (MIT; see NOTICE).

import type { DeckPanel } from './deckconfig.ts'

export type Flow = { turn: boolean; agents: boolean; lanes: boolean }

/** What is flowing now. */
export const flowOf = (f: { turnRunning: boolean; agentsRunning: number; lanesWorking: number }): Flow => ({ turn: f.turnRunning, agents: f.agentsRunning > 0, lanes: f.lanesWorking > 0 })

export const isFlowing = (f: Flow): boolean => f.turn || f.agents || f.lanes

/** Whether the connector that leads INTO a panel moves: the gate and the receipt follow the turn (the gate also agents), agents follow agents, the log follows the lanes. */
export function railActive(into: DeckPanel, f: Flow): boolean {
  switch (into) {
    case 'vitals':
      return false
    case 'gate':
      return f.turn || f.agents
    case 'agents':
      return f.agents
    case 'receipt':
      return f.turn
    case 'log':
      return f.lanes
  }
}

/** The connector's family colour key: which flow it shows (the view maps it to a token). */
export const railKind = (into: DeckPanel): 'turn' | 'agents' | 'lanes' => (into === 'agents' ? 'agents' : into === 'log' ? 'lanes' : 'turn')

/** One step of the frame clock, in ms: about nine frames a second. */
export const RAIL_STEP_MS = 110
/** Cells between two packets. */
export const PACKET_GAP = 24

/** The cells a packet occupies at `phase`: the head ● and the trailing • one cell behind it. Two or more packets per rail. */
export function packetCells(width: number, phase: number): Map<number, '\u25cf' | '\u2022'> {
  const lit = new Map<number, '\u25cf' | '\u2022'>()
  const span = width + PACKET_GAP
  for (let base = 0; base < span; base += PACKET_GAP) {
    const head = (base + phase) % span
    if (head < width) lit.set(head, '\u25cf')
    if (head - 1 >= 0 && head - 1 < width) lit.set(head - 1, '\u2022')
  }
  return lit
}

/** A still connector as text: `\u2500` with a branch mark at each of `marks`. */
export function stillRail(width: number, marks: readonly number[], isMerge: boolean): string {
  const cells = Array.from({ length: Math.max(1, width) }, () => '\u2500')
  for (const m of marks) if (m >= 0 && m < cells.length) cells[m] = isMerge ? '\u2534' : '\u252c'
  return cells.join('')
}
