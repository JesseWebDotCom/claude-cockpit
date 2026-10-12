// COCKPIT-44, regrouped by COCKPIT-46: row 1 of the bar. The milestone title and bar fill the left; the right group, left to right, holds the badges ("!", "you"),
// the system icons (drawn, coloured: CPU, memory, disk, GPU), the AUTOPILOT button and the pane button. The session and agent count is NOT here: it lives in
// the footer line (plain text) and the pane. Pure: the plan (what the right group holds and how wide it is) so the register code and the tests read one
// definition. Cells are 8 px; each Button costs its text plus a cushion of 3 cells.

import { AUTOPILOT } from './autopilot.ts'

export const HEAD_CELL = 8
/** 0.23.4: the pane button is a drawn icon (a window with a side panel, strokes so it needs no font) beside a bordered Button. Cells the icon adds to the right group. */
export const HEAD_PANE_ICON_CELLS = 3
export const HEAD_PANE_ICON_PX = 20
/** The icon's source: a mid-tone blue-grey that reads on the dark and the light card. */
export const paneIconSource = (): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${HEAD_PANE_ICON_PX}" height="${HEAD_PANE_ICON_PX}" viewBox="0 0 20 20"><rect x="2" y="3.5" width="16" height="13" rx="2.5" fill="none" stroke="#6E8CB8" stroke-width="1.8"/><path d="M12.2 3.5 V16.5" stroke="#6E8CB8" stroke-width="1.8"/><rect x="13.2" y="5" width="3.6" height="10" fill="#6E8CB8" fill-opacity=".55"/></svg>`
export const HEAD_PANE_GLYPH = '\u25a4'
/** The visible words on the button that opens the plan pane (short form when the card is narrow). */
export const HEAD_PANE_LABEL = 'Show plan'
export const HEAD_PANE_LABEL_SHORT = 'Plan'
/** Under this width the short label is used. */
export const HEAD_NARROW_PX = 520
export const headPaneLabel = (px: number): string => (px < HEAD_NARROW_PX ? HEAD_PANE_LABEL_SHORT : HEAD_PANE_LABEL)
/** Cells of cushion each pressable adds around its text. */
export const HEAD_PAD = 3
/** The gap between the badges, the system icons and AUTOPILOT, in cells. */
export const HEAD_GAP = 2
/** One system icon's cell, px (pools.ts BAND_ICON_CELL). */
export const HEAD_ICON_PX = 18
/** The least room the title and the bar keep in the left part, in px. Under it the right group gives up optional parts, never wraps. */
export const HEAD_LEFT_MIN_PX = 200

export type HeadIn = { px: number; iconCount: number; youN: number; problemLabel: string; hasProblems: boolean; paneLabel?: string }
export type HeadPlan = {
  showYou: boolean
  showProblems: boolean
  /** The system icons are drawn (left of AUTOPILOT). */
  showIcons: boolean
  /** AUTOPILOT is drawn; the pane button always is. */
  showAutopilot: boolean
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
  const plan = { you: i.youN > 0, problems: i.hasProblems, icons: i.iconCount > 0, autopilot: true }
  const px = (): number =>
    (plan.autopilot ? cellsOf(AUTOPILOT) : 0) * HEAD_CELL + (cellsOf(i.paneLabel ?? HEAD_PANE_GLYPH) + HEAD_PANE_ICON_CELLS) * HEAD_CELL +
    (plan.icons ? i.iconCount * HEAD_ICON_PX + HEAD_GAP * HEAD_CELL : 0) +
    (plan.you ? (cellsOf(youLabel) + HEAD_GAP) * HEAD_CELL : 0) + (plan.problems ? (cellsOf(i.problemLabel) + HEAD_GAP) * HEAD_CELL : 0)
  const room = (): number => i.px - HEAD_LEFT_MIN_PX
  // What does not fit goes in this order: the "!" badge, "you", the system icons, then AUTOPILOT. The pane button is never dropped.
  if (px() > room()) plan.problems = false
  if (px() > room()) plan.you = false
  if (px() > room()) plan.icons = false
  if (px() > room()) plan.autopilot = false
  const rightPx = px()
  return { showYou: plan.you, showProblems: plan.problems, showIcons: plan.icons, showAutopilot: plan.autopilot, youLabel, problemLabel: i.problemLabel, rightPx, leftPx: Math.max(40, i.px - rightPx) }
}
