// Which item a lane owns (cockpit v11). A row shows the item its lane is working on, from live evidence, and shows NOTHING
// rather than a stale item. Pure: register.tsx reads the files and the pane and calls this.
//
// CLAIM FORMAT (<claims folder>/<ITEM-ID>.claim): the file name is the item id; the body is free text, and a line
// `lane: <tmux session>` (any case, e.g. `lane: lane-a`) names the lane that took it. Optional: `item: <id>` is ignored
// (the file name wins). Older claims carry only an id or a few words; they have no lane, so they are matched to a lane by
// what its pane shows (the item id, or the path of a brief whose id is the item). The coordinator adds `lane:` to new
// claims. The file's modification time is when it was claimed.
//
// A candidate (a claim, a lane lock, an `opencode run`'s brief) is IGNORED when:
//   - its item has landed in git today (a commit title starts with the item id);
//   - a report for the item is newer than the candidate (the lane finished it);
//   - it is older than 12 hours (24 for a lane that is working);
//   - the lane is sleeping and the candidate is older than the lane's last activity (the lane did something after being
//     given it, then went quiet: what it shows now is history). A working lane's pane changes all the time, so this rule
//     is only for sleepers.
// Order of trust: a claim that names this lane; for a working lane, the item its pane shows lowest on the screen (a claim
// id, its lock's item or a brief path); the `opencode run`'s brief; its lock file.

import { fin } from './core.ts'
import type { Claim, LandedLite, ReportMark } from './statuslive.ts'
import { CLAIM_LIVE_MS, leadingId, lineNames, sameItem } from './statuslive.ts'
import { briefLabelOf } from './live.ts'
import { DOING_MAX, plainTitle } from './doing.ts'
import { unwrapLines } from './output.ts'
import { atShellPrompt } from './shellprompt.ts'

export const WORKING_CLAIM_MS = 24 * 60 * 60_000
// an IDLE lane whose own claim is older than this shows "stale claim: <ITEM>" in amber, not the item as if it were work; and
// a stale claim older than STALE_CLAIM_GONE_MS is not shown at all (an old claim file is not news).
export const STALE_CLAIM_MS = 6 * 60 * 60_000
export const STALE_CLAIM_GONE_MS = 7 * 24 * 60 * 60_000

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim()

// A claim from its file name, body and time. The lane is the first word after "lane:"; '' when there is no such line.
//
// a claim's short plain title is line 3 of the file (line 1 the item id, line 2 `lane: <session>`), or a `title: ...` line anywhere. A
// third line that is itself a `key: value` line is not a title. The text must pass the plain-title gate (no code characters); '' for none.
export function claimTitleOf(body: string, id: string): string {
  const lines = body.split('\n').map(l => l.replace(/\r$/, ''))
  const keyed = /^\s*title\s*:\s*(.+)$/im.exec(body)?.[1]
  if (keyed !== undefined) return plainTitle(keyed, id)
  const third = lines[2] ?? ''
  if (/^\s*[A-Za-z_]+\s*:\s/.test(third)) return ''
  return plainTitle(third, id)
}

// an optional `now: <plain sentence>` line (line 4 by convention, any line works) is what the lane is doing now, written by the lane or the
// captain. It passes the plain-title gate; '' for none or for text that is not plain.
export function claimNowOf(body: string, id: string): string {
  const raw = /^[ \t]*now[ \t]*:[ \t]*(\S.*)$/im.exec(body)?.[1]
  return raw === undefined ? '' : plainTitle(raw.replace(/\r$/, ''), id, DOING_MAX)
}

export function parseClaim(fileName: string, body: string, mtimeMs: number): Claim {
  const id = fileName.replace(/\.claim$/, '')
  const m = /^\s*lane\s*:\s*([^\s,;]+)/im.exec(body)
  const first = body.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).find(l => l !== '') ?? ''
  return { id, mtimeMs, lane: m?.[1]?.trim() ?? '', title: claimTitleOf(body, id), now: claimNowOf(body, id), first }
}

export type BriefLite = { name: string; heading: string }

// The item a brief is about: the id at the front of its heading ("three fixes"), else the label of its file
// name ("brief-oc-feat11.md" is \"feat11\").
export function briefItem(b: BriefLite): string {
  const lead = leadingId(b.heading.replace(/^#+\s*/, ''))
  return /\d/.test(lead) && /[-]/.test(lead) ? lead : briefLabelOf(b.name)
}

export type LaneItemIn = {
  lane: string
  // Not sleeping (working, asking, ...).
  awake: boolean
  // The last time its pane changed, ms since the epoch; null when unknown (nothing is ignored for it then).
  lastActivityMs: number | null
  // The pane's last lines, oldest first.
  paneLines: readonly string[]
  lock: { item: string; mtimeMs: number | null } | null
  claims: readonly Claim[]
  // An opencode run attributed to this lane: the brief file it was given and when it started; '' for none.
  runBrief: string
  runStartedMs: number | null
  briefs: readonly BriefLite[]
  reports: readonly ReportMark[]
  landed: readonly LandedLite[]
  nowMs: number
}

export type LaneItem = { item: string; source: 'claim-lane' | 'pane' | 'run' | 'lock' | ''; mtimeMs: number | null; isStale?: boolean }
export const NO_ITEM: LaneItem = { item: '', source: '', mtimeMs: null }

// A commit title that starts with the item id, as a whole token ("SYNC-LINK-01: ..." names SYNC-LINK-01, not SYNC-LINK-0).
export function landedIt(subject: string, id: string): boolean {
  const s = subject.trim()
  if (id === '' || s.length < id.length) return false
  if (!s.toLowerCase().startsWith(id.toLowerCase())) return false
  return !/[A-Za-z0-9-]/.test(s.charAt(id.length))
}

type Cand = { item: string; mtimeMs: number | null; source: LaneItem['source']; rank: number }

// Lowest line (largest index) of the pane that names the item: its id as a token, or a brief path whose item is it. -1: none.
export function paneHit(lines: readonly string[], id: string, briefs: readonly BriefLite[]): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? ''
    if (lineNames(line, id)) return i
    for (const m of line.matchAll(/brief-([\w.-]+?)\.md/g)) {
      const name = 'brief-' + (m[1] ?? '') + '.md'
      const known = briefs.find(b => b.name === name)
      if (sameItem(known !== undefined ? briefItem(known) : briefLabelOf(name), id)) return i
    }
  }
  return -1
}

export function resolveLaneItem(i: LaneItemIn): LaneItem {
  const maxAge = i.awake ? WORKING_CLAIM_MS : CLAIM_LIVE_MS
  // an item whose claim names ANOTHER lane is never this lane's, from any source (a pane, a run, a lock). A claim naming
  // lane-b never shows on lane-a. An item with no lane on its claim is open to whichever lane shows it.
  const takenElsewhere = (item: string): boolean => {
    const named = i.claims.filter(c => sameItem(c.id, item))
    if (named.some(c => c.lane !== undefined && c.lane !== '' && c.lane.toLowerCase() === i.lane.toLowerCase())) return false
    return named.some(c => c.lane !== undefined && c.lane !== '')
  }
  const valid = (item: string, mtimeMs: number | null): boolean => {
    if (item === '') return false
    if (takenElsewhere(item)) return false
    if (mtimeMs !== null && fin(mtimeMs)) {
      if (i.nowMs - mtimeMs > maxAge) return false
      if (!i.awake && i.lastActivityMs !== null && fin(i.lastActivityMs) && mtimeMs < i.lastActivityMs) return false
    }
    if (i.landed.some(l => landedIt(l.subject, item))) return false
    if (mtimeMs !== null && i.reports.some(r => r.mtimeMs > mtimeMs && sameItem(r.id, item))) return false
    return true
  }

  const cands: Cand[] = []
  // 1. A claim that names this lane.
  const staleClaims: { item: string; mtimeMs: number }[] = []
  for (const c of i.claims) {
    if (c.lane === undefined || c.lane === '' || c.lane.toLowerCase() !== i.lane.toLowerCase()) continue
    // an idle lane's own claim older than 6 hours is a stale claim, not an item it is working on.
    const age = i.nowMs - c.mtimeMs
    if (!i.awake && fin(c.mtimeMs) && age > STALE_CLAIM_MS) {
      const done = i.landed.some(l => landedIt(l.subject, c.id)) || i.reports.some(r => r.mtimeMs > c.mtimeMs && sameItem(r.id, c.id))
      if (!done && age <= STALE_CLAIM_GONE_MS) staleClaims.push({ item: c.id, mtimeMs: c.mtimeMs })
      continue
    }
    if (valid(c.id, c.mtimeMs)) cands.push({ item: c.id, mtimeMs: c.mtimeMs, source: 'claim-lane', rank: 0 })
  }
  const lockItem = i.lock !== null ? squash(i.lock.item).split(' ')[0] ?? '' : ''
  const lockOk = i.lock !== null && valid(lockItem, i.lock.mtimeMs)
  if (i.awake) {
    // 2. What the pane shows: a claim with no lane, the lane's own lock item, or a brief it was given; the one named
    // lowest on the screen wins (the newest thing it was asked), claims before locks before briefs on a tie.
    const pool: { item: string; mtimeMs: number | null; order: number }[] = []
    for (const c of i.claims) if ((c.lane === undefined || c.lane === '') && valid(c.id, c.mtimeMs)) pool.push({ item: c.id, mtimeMs: c.mtimeMs, order: 0 })
    if (lockOk) pool.push({ item: lockItem, mtimeMs: i.lock?.mtimeMs ?? null, order: 1 })
    for (const b of i.briefs) {
      const item = briefItem(b)
      if (valid(item, null)) pool.push({ item, mtimeMs: null, order: 2 })
    }
    let best: { item: string; mtimeMs: number | null; at: number; order: number } | null = null
    for (const p of pool) {
      const at = paneHit(i.paneLines, p.item, i.briefs)
      if (at < 0) continue
      if (best === null || at > best.at || (at === best.at && p.order < best.order)) best = { ...p, at }
    }
    if (best !== null) cands.push({ item: best.item, mtimeMs: best.mtimeMs, source: 'pane', rank: 1 })
    // 3. The brief of an opencode run given to this lane.
    if (i.runBrief !== '') {
      const known = i.briefs.find(x => x.name === i.runBrief)
      const item = known !== undefined ? briefItem(known) : briefLabelOf(i.runBrief)
      // A claim for the same item gives its proper spelling.
      const claim = i.claims.find(c => sameItem(c.id, item))
      const name = claim?.id ?? item
      if (valid(name, i.runStartedMs)) cands.push({ item: name, mtimeMs: i.runStartedMs, source: 'run', rank: 2 })
    }
  }
  // 4. The lane's own lock file.
  if (lockOk) cands.push({ item: lockItem, mtimeMs: i.lock?.mtimeMs ?? null, source: 'lock', rank: 3 })

  if (cands.length === 0) {
    const stale = staleClaims.sort((a, b) => b.mtimeMs - a.mtimeMs)[0]
    return stale === undefined ? NO_ITEM : { item: stale.item, source: 'claim-lane', mtimeMs: stale.mtimeMs, isStale: true }
  }
  cands.sort((a, b) => a.rank - b.rank || (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0))
  const top = cands[0] as Cand
  return { item: top.item, source: top.source, mtimeMs: top.mtimeMs }
}

// The Captain's row (the coordinator): the item it owns, always. Its status.json NOW (the first entry is the line) while the
// file is fresh (30 minutes, or newer than the live evidence), else the milestone name; '' only when the file says neither.
// `full` is everything for the open row: every NOW entry, then the milestone. The Captain is not a lane: no claim or lock is
// looked for (the row used to be matched like a lane and found none).
export type CaptainItem = { line: string; full: string[]; source: 'now' | 'milestone' | '' }

export function captainItem(s: { milestone: string; now: readonly string[]; updatedMs: number | null } | null, nowMs: number, evidenceMs: number): CaptainItem {
  if (s === null) return { line: '', full: [], source: '' }
  const fresh = s.updatedMs !== null && (nowMs - s.updatedMs <= 30 * 60_000 || s.updatedMs >= evidenceMs)
  const entries = s.now.map(x => squash(x)).filter(x => x !== '')
  const full = [...(fresh ? entries : []), ...(s.milestone !== '' ? ['Milestone: ' + s.milestone] : [])]
  if (fresh && entries.length > 0) return { line: entries[0] ?? '', full, source: 'now' }
  return s.milestone !== '' ? { line: s.milestone, full, source: 'milestone' } : { line: '', full, source: '' }
}

// Kept for callers that want only the line.
export const coordinatorItem = (s: { milestone: string; now: readonly string[]; updatedMs: number | null } | null, nowMs: number, evidenceMs: number): string => captainItem(s, nowMs, evidenceMs).line

// ---------------------------------------------------------------------------
// Which lane an `opencode run` belongs to.

export type RunLaneCandidate = { name: string; lines: readonly string[] }

const noSpace = (s: string): string => s.replace(/\s+/g, '')

/**
 * The api lane an `opencode run` is working in, or '' when none of them shows it. The pane hard-wraps the command line, so the brief's file
 * name is looked for in the pane's UNWRAPPED text with its spaces taken out ("...brief-oc-feat1" + "8.md" is brief-oc-feat18.md); the old
 * line-by-line search missed a wrapped command and gave the run to another lane, which was idle at a shell prompt. In order:
 *   1. a lane whose pane shows the run's brief;
 *   2. a lane whose pane shows "opencode run" (not at a shell prompt);
 *   3. the only lane that is not at a shell prompt, or the first of them (the lane order) among several that are not.
 * A lane whose pane ends at a shell prompt is never the answer by itself (nothing runs in it). '' means the run belongs to no known lane.
 */
export function pickRunLane(lanes: readonly RunLaneCandidate[], brief: string): string {
  const live = lanes.filter(l => !atShellPrompt(l.lines))
  const text = (l: RunLaneCandidate): string => noSpace(unwrapLines(l.lines).join('\n'))
  if (brief !== '') {
    const hit = live.find(l => text(l).includes(noSpace(brief)))
    if (hit !== undefined) return hit.name
  }
  const running = live.filter(l => text(l).includes('opencoderun'))
  if (running.length === 1) return running[0]?.name ?? ''
  if (running.length > 0) return running[0]?.name ?? ''
  return live[0]?.name ?? ''
}
