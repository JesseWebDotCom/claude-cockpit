// AUTOPILOT (cockpit 0.5.1) replaces Active and Away. ON is what "Away" meant (the crew keeps going, decisions are logged), OFF is what
// "Active" meant. The state file (.cockpit/presence.json, mode "away" or "active") and the away log are unchanged; only the words and the colours
// are. Pure: the words, the exact messages the captain is sent, the pills, and the files they are written to.

export const AUTOPILOT = 'AUTOPILOT'

/** "AUTOPILOT on" or "AUTOPILOT off". */
export const autopilotWord = (on: boolean): string => AUTOPILOT + (on ? ' on' : ' off')

/** What the captain is told when Autopilot is switched on and off (exact: these are submitted as the user's own words). */
export const autopilotOnMessage = (awayLog: string): string => 'Autopilot ON: I am away. Keep working, never ask me anything, log decisions to ' + awayLog + '.'
/** The message with the default away log (the one the protocol names). */
export const AUTOPILOT_ON_MESSAGE = autopilotOnMessage('.cockpit/away-log.md')
export const AUTOPILOT_OFF_MESSAGE = 'Autopilot OFF: I am back. Summarize what happened while I was away, then ask your pending questions.'
export const autopilotMessage = (on: boolean, awayLog = '.cockpit/away-log.md'): string => (on ? autopilotOnMessage(awayLog) : AUTOPILOT_OFF_MESSAGE)

/** What Add Bug and Add Idea send: "Bug: <text>" and "Idea: <text>". */
export const inboxMessage = (kind: 'bug' | 'idea', text: string): string => (kind === 'bug' ? 'Bug: ' : 'Idea: ') + text.replace(/\s+/g, ' ').trim()

// The colour pill is a Text beside a string-label Button (a Button takes a string label only: ). Grey when off, green when on.
export type Pill = { inverse: true; color: 'green' | 'gray'; text: string }
/** The bar's pill, with the words: " AUTOPILOT on " (green) or " AUTOPILOT off " (grey). */
export const autopilotPill = (on: boolean): Pill => ({ inverse: true, color: on ? 'green' : 'gray', text: ' ' + autopilotWord(on) + ' ' })
/** The pane's state chip beside the AUTOPILOT button: " ON " (green) or " OFF " (grey). */
export const autopilotChip = (on: boolean): Pill => ({ inverse: true, color: on ? 'green' : 'gray', text: on ? ' ON ' : ' OFF ' })

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
