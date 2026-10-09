// COCKPIT-44: row 1 of the bar. The milestone title and bar fill the left; the crew count, the AUTOPILOT button and the pane button sit
// at the right, right-aligned, and the bar shortens to make room. Pure: the plan (what the right group holds and how wide it is) so the
// register code and the tests read one definition. Cells are 8 px; each Button costs its text plus a cushion of 3 cells.

import { AUTOPILOT } from './autopilot.ts'

export const HEAD_CELL = 8
export const HEAD_PANE_GLYPH = '▤'
/** Cells of cushion each pressable adds around its text. */
export const HEAD_PAD = 3
/** The gap between the crew count (and the badges before it) and the AUTOPILOT button, in cells. */
export const HEAD_GAP = 2
/** The least room the title and the bar keep in the left part, in px. Under it the right group gives up optional parts, never wraps. */
export const HEAD_LEFT_MIN_PX = 200

export type HeadIn = { px: number; total: number; working: number; erroredText: string; youN: number; problemLabel: string; hasProblems: boolean }
export type HeadPlan = {
  crewLabel: string
  showYou: boolean
  showProblems: boolean
  youLabel: string
  problemLabel: string
  /** Width of the right group in px (what the left part gives up). */
  rightPx: number
  /** Width of the progress drawing in px: the row's width minus the right group. */
  leftPx: number
}

const cellsOf = (text: string): number => text.length + HEAD_PAD

export function headPlan(i: HeadIn): HeadPlan {
  const youLabel = 'you: ' + i.youN
  const full = i.total + ' crew: ' + i.working + ' working' + (i.erroredText !== '' ? ', ' + i.erroredText : '')
  const short = i.total + ' crew: ' + i.working + ' working'
  const tiny = i.total + ' crew'
  const plan = { crew: full, you: i.youN > 0, problems: i.hasProblems }
  const cells = (): number => cellsOf(plan.crew) + HEAD_GAP + cellsOf(AUTOPILOT) + cellsOf(HEAD_PANE_GLYPH) + (plan.you ? cellsOf(youLabel) : 0) + (plan.problems ? cellsOf(i.problemLabel) : 0)
  const roomCells = (): number => Math.floor((i.px - HEAD_LEFT_MIN_PX) / HEAD_CELL)
  // What does not fit goes in this order: the "!" badge, ", N errored", "you", then the crew count shortens to "N crew".
  if (cells() > roomCells()) plan.problems = false
  if (cells() > roomCells()) plan.crew = short
  if (cells() > roomCells()) plan.you = false
  if (cells() > roomCells()) plan.crew = tiny
  const rightPx = cells() * HEAD_CELL
  return { crewLabel: plan.crew, showYou: plan.you, showProblems: plan.problems, youLabel, problemLabel: i.problemLabel, rightPx, leftPx: Math.max(40, i.px - rightPx) }
}
