// AUTOPILOT (cockpit 0.5.1) replaces Active and Away. ON is what "Away" meant (the crew keeps going, decisions are logged), OFF is what
// "Active" meant. The state file (.cockpit/presence.json, mode "away" or "active") and the away log are unchanged; only the words and the colours
// are. Pure: the words, the exact messages the captain is sent, the pills, and the files they are written to.

import { FONT, textWidth } from './draw.ts'

export const AUTOPILOT = 'AUTOPILOT'

/** "AUTOPILOT on" or "AUTOPILOT off": the words of a typed command's reply and the away-log card, never of the control itself (see autopilotSvg). */
export const autopilotWord = (on: boolean): string => AUTOPILOT + (on ? ' on' : ' off')

/** What the captain is told when Autopilot is switched on and off (exact: these are submitted as the user's own words). */
export const autopilotOnMessage = (awayLog: string): string => 'Autopilot ON: I am away. Keep working, never ask me anything, log decisions to ' + awayLog + '.'
/** The message with the default away log (the one the protocol names). */
export const AUTOPILOT_ON_MESSAGE = autopilotOnMessage('.cockpit/away-log.md')
export const AUTOPILOT_OFF_MESSAGE = 'Autopilot OFF: I am back. Summarize what happened while I was away, then ask your pending questions.'
export const autopilotMessage = (on: boolean, awayLog = '.cockpit/away-log.md'): string => (on ? autopilotOnMessage(awayLog) : AUTOPILOT_OFF_MESSAGE)

/** What Add Bug and Add Idea send: "Bug: <text>" and "Idea: <text>". */
export const inboxMessage = (kind: 'bug' | 'idea', text: string): string => (kind === 'bug' ? 'Bug: ' : 'Idea: ') + text.replace(/\s+/g, ' ').trim()

// The control shows its state ONLY by colour: the one word AUTOPILOT, grey when off and green when on, no chip, no "on" or "off". A Button takes a string
// label and no colour, so the word is a drawing (an Svg, whose `alt` says "Autopilot off" or "Autopilot on" for a reader) or, where there is no Svg (a
// terminal), a coloured Text, beside the one-glyph Button that presses it.
export type Pill = { color: 'green' | 'gray'; bold: true; text: string }
/** The word as a coloured Text, for a surface with no Svg: green when on, grey when off, no background in either state. */
export const autopilotPill = (on: boolean): Pill => ({ color: on ? 'green' : 'gray', bold: true, text: AUTOPILOT })

export const AUTOPILOT_ON_HEX = '#3FB950'
export const AUTOPILOT_OFF_HEX = '#8B949E'
export const autopilotHex = (on: boolean): string => (on ? AUTOPILOT_ON_HEX : AUTOPILOT_OFF_HEX)
/** The accessible label of the control: "Autopilot on" or "Autopilot off" (never drawn). */
export const autopilotAlt = (on: boolean): string => 'Autopilot ' + (on ? 'on' : 'off')

export const AUTOPILOT_H = 22
const AUTOPILOT_FONT = 12
/** The word's drawing width: the nine capitals in bold plus a little air. */
export const AUTOPILOT_W = Math.ceil(textWidth(AUTOPILOT, AUTOPILOT_FONT) * 1.1) + 6

/** THE drawing of the control, in the band and in the pane: the word AUTOPILOT, bold, in the state's colour; nothing else. */
export function autopilotSvg(on: boolean): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${AUTOPILOT_W}" height="${AUTOPILOT_H}" viewBox="0 0 ${AUTOPILOT_W} ${AUTOPILOT_H}"><text x="3" y="${AUTOPILOT_H / 2 + 4}" font-family="${FONT}" font-size="${AUTOPILOT_FONT}" font-weight="700" fill="${autopilotHex(on)}">${AUTOPILOT}</text></svg>`
}

/** The file a message is appended to when the host cannot submit it (and the line written). */
export const CAPTAIN_FILE = 'captain.md'
export const captainLine = (nowMs: number, text: string): string => '- ' + new Date(nowMs).toISOString() + ' ' + text.replace(/\s+/g, ' ').trim() + '\n'

/** The toast after a send: what was sent, cut to one line. */
export const sentToast = (text: string): string => 'Sent to the captain: ' + (text.length > 160 ? text.slice(0, 159) + '\u2026' : text)
export const fallbackToastFor = (captainFile: string): string => 'The host did not take the message: it is saved in ' + captainFile + ' and the prompt box holds it. Press Enter to send it.'
export const fallbackToast = fallbackToastFor('.cockpit/inbox/captain.md')

export type AutopilotArg = 'on' | 'off' | 'toggle'
/** `/cockpit autopilot on|off`; a bare `autopilot` toggles. "away" and "back" stay as working aliases. */
export function autopilotArgOf(word: string): AutopilotArg {
  const w = word.toLowerCase()
  return w === 'on' || w === 'away' ? 'on' : w === 'off' || w === 'back' ? 'off' : 'toggle'
}
