// COCKPIT-31: one provider-neutral table for "this member cannot run because of its account": out of credit, rate or
// quota limited, or the key refused. Pure. The judge reads the member's latest output only: a match counts when it has
// the shape of an error (an "Error:" prefix, a JSON error object, a status line, the agent's error bullet) and no line
// after it shows the member working again. Words quoted from a brief, a doc or a prompt on screen never match.

import { activityLines } from './crew.ts'

export type OutageId = 'credit' | 'quota' | 'auth'
export type OutageSeverity = 'red'
export type OutagePattern = { id: OutageId; name: string; re: RegExp; label: string; phrase: string; severity: OutageSeverity }

// The one table. Order is priority: credit first (the most useful thing to know), then limits, then the key.
export const OUTAGES: readonly OutagePattern[] = [
  {
    id: 'credit',
    name: 'credit or billing',
    re: /credit balance (?:is )?too low|insufficient (?:credits?|funds|balance)|\bout of credits?\b|\bbilling\b|payment required|\b402\b|purchase (?:more )?credits/i,
    label: 'OUT OF CREDIT',
    phrase: 'out of credit',
    severity: 'red',
  },
  {
    id: 'quota',
    name: 'quota or rate limit',
    re: /\brate[- ]limit(?:ed)?\b|quota exceeded|exceeded your (?:current )?quota|usage limit|hit your [\w -]*limit|(?<!rate[- ])\blimit (?:reached|exceeded)\b|\b429\b|too many requests/i,
    label: 'RATE LIMITED',
    phrase: 'rate limited',
    severity: 'red',
  },
  {
    id: 'auth',
    name: 'key or sign-in',
    re: /invalid (?:x-)?(?:api[- ])?(?:key|token)|\b401\b|\bunauthorized\b|authentication (?:failed|error)|not logged in/i,
    label: 'AUTH FAILED',
    phrase: 'auth failed',
    severity: 'red',
  },
]

export type Outage = { id: OutageId; label: string; phrase: string; line: string }

// The shape of an error line, not the words alone.
const ERROR_SHAPE =
  /^\s*(?:[■⚠✗✖❗!]|⏺?\s*)?\s*(?:[\w.]*Error\b|error\b|API Error\b|fatal\b|■)|"error"\s*:|"type"\s*:\s*"[\w]*error"|\b(?:HTTP|status(?: code)?)\s*[:=]?\s*[1-5]\d\d\b|^\s*[■⚠✗✖]|\bError:/i
// Quoted or documented text: a prompt echo, a quote, a code fence, a brief or a doc being read.
const QUOTED = /^\s*(?:[>"“'`|]|\d+[.)]\s)|\b(?:brief-[\w.-]+|[\w-]+)\.(?:md|txt)\b/
// A line after the match that shows the member working again.
const RECOVERED = /^\s*[•⏺✓✔●]\s|\b(?:Ran|Read|Edited|Updated|Added|Explored|Searched|Wrote|Working|Thinking)\b|\(pass\)|\b\d+ pass(?:ed)?\b|esc to interrupt|esc interrupt/

const cut = (s: string, n = 90): string => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + '…'
}

export function outageOf(paneText: string | readonly string[], o: { state: string }): Outage | null {
  if (o.state === 'working') return null
  const tail = activityLines(paneText, 8)
  let hit: { at: number; p: OutagePattern; text: string } | null = null
  for (let i = tail.length - 1; i >= 0 && hit === null; i--) {
    const l = tail[i] ?? ''
    if (QUOTED.test(l) || !ERROR_SHAPE.test(l)) continue
    const p = OUTAGES.find(x => x.re.test(l))
    if (p !== undefined) hit = { at: i, p, text: l }
  }
  if (hit === null) return null
  // The latest output wins: anything after the match that shows the member running again clears it.
  if (tail.slice(hit.at + 1).some(l => RECOVERED.test(l) && !ERROR_SHAPE.test(l))) return null
  return { id: hit.p.id, label: hit.p.label, phrase: hit.p.phrase, line: cut(hit.text) }
}

// "2 out of credit, 1 rate limited" for the Crew summary.
export function outageCounts(list: readonly (Outage | null)[]): { id: OutageId; phrase: string; n: number }[] {
  return OUTAGES.map(p => ({ id: p.id, phrase: p.phrase, n: list.filter(x => x !== null && x.id === p.id).length })).filter(x => x.n > 0)
}
