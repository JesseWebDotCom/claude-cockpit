// The Status card tracks itself (cockpit v10). status.json is the coordinator's PLAN (milestone, done/total, NEXT, YOU)
// and it goes stale whenever the coordinator does not rewrite it. NOW and the stale flag come from what is live, and
// done moves when something lands. Nothing here writes status.json.
//
// Which source feeds which field (the same table is in REPORT.md):
//
//   milestone, total, NEXT, YOU ... status.json only (the plan)
//   NOW ........................... tmux lane sessions that are awake (their item from the lock, the brief heading or the
//                                   `opencode run` brief), claims/*.claim (an unreported claim under 12 h old that no awake
//                                   lane already covers), minus every item whose report is newer than its claim or lock;
//                                   status.json's own NOW is shown only while status.json is NEWER than all of that evidence
//   done .......................... status.json's done, plus one for each commit landed today (git log) whose subject starts
//                                   with an item id still listed in status.json's NOW or NEXT
//   the "stale: updated Nh ago" chip  status.json older than 30 min AND nothing live backs the card
//
// Pure: no mods API, no I/O. register.tsx reads the files and calls this. Unit tested in tests/statuslive.test.ts.

import { ageLabel, fin } from './core.ts'
import type { Status } from './board.ts'
import { STATUS_OLD_MS } from './board.ts'

const MIN = 60_000
export const CLAIM_LIVE_MS = 12 * 60 * MIN

export type LiveMember = {
  name: string
  // Not sleeping (working, asking, errored ...): the member belongs in NOW.
  awake: boolean
  // What NOW says for it: its item or brief label, else its name.
  label: string
  // The item id of its lock, '' when it has none.
  lockItem: string
  lockMtimeMs: number | null
  // How long it has been in its current state, ms; null when unknown.
  sinceMs: number | null
}
// `lane` is the tmux session named by a `lane:` line in the claim file ('' or absent: none), see hooks/laneitem.ts.
// `title`: line 3 of the claim file, a short plain title the lane's owner wrote; '' or absent for none.
// `now`: an optional `now: <plain sentence>` line of the claim file, what the lane is doing now (it wins for the open card's "Doing").
export type Claim = { id: string; mtimeMs: number; lane?: string; title?: string; now?: string; first?: string }
export type ReportMark = { id: string; mtimeMs: number }
export type LandedLite = { hash: string; subject: string }

export type LiveIn = {
  status: Status | null
  members: readonly LiveMember[]
  claims: readonly Claim[]
  reports: readonly ReportMark[]
  landed: readonly LandedLite[]
  nowMs: number
}

export type LiveStatus = {
  // 'file': status.json's own NOW is shown; 'live': the derived NOW is; 'none': nothing at all.
  nowSource: 'file' | 'live' | 'none'
  now: string[]
  // status.json's NEXT less the items that have landed.
  next: string[]
  done: number | null
  total: number | null
  // Items (ids) that landed and advanced done.
  advanced: string[]
  // 'updated 2h ago' when the stale chip applies, '' otherwise.
  stale: string
  // The newest live evidence, ms (0 when there is none); for tests and the report.
  evidenceMs: number
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

// Two ids name the same item: equal, or one ends with the other and is at least 5 characters long
// ("ui-SETTINGS-SAVE-01" ends with "SETTINGS-SAVE-01"; \"feat1\" is not \"feat10\", "b2" is not "b21").
export function sameItem(a: string, b: string): boolean {
  const x = norm(a)
  const y = norm(b)
  if (x === '' || y === '') return false
  if (x === y) return true
  return (x.length >= 5 && y.endsWith(x)) || (y.length >= 5 && x.endsWith(y))
}

// The id at the front of a label: "three fixes" -> ""; "b21 settings screen" -> "b21".
export function leadingId(label: string): string {
  const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(label)
  return m?.[1]?.replace(/[:.,;]+$/, '') ?? ''
}

// The item id a commit subject starts with ("SYNC-LINK-01: pairing reply ..."), '' when it starts with a word such as
// "feat:". An id has a hyphen and a digit or a capital run, so "fix-up" and "chore:" are not ids.
export function landedItemId(subject: string): string {
  const m = /^([A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+)(?=$|[\s:(,])/.exec(subject.trim())
  const id = m?.[1] ?? ''
  return /\d/.test(id) || /^[A-Z0-9-]+$/.test(id) ? id : ''
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// A status line (NOW or NEXT entry) names the id as a whole token: "FORMS-13" is not in "FORMS-13c".
export function lineNames(line: string, id: string): boolean {
  if (id === '') return false
  return new RegExp('(?<![A-Za-z0-9-])' + escapeRe(id) + '(?![A-Za-z0-9-])', 'i').test(line)
}

// A report newer than the item's claim or lock: the lane finished it.
const reportedAfter = (ids: readonly string[], reports: readonly ReportMark[], afterMs: number): boolean =>
  reports.some(r => r.mtimeMs > afterMs && ids.some(id => sameItem(id, r.id)))

export function deriveLive(i: LiveIn): LiveStatus {
  const s = i.status
  const now = i.nowMs
  const ageOf = (ms: number): string => ageLabel(Math.max(0, now - ms))

  // 1. Awake lanes, less the ones whose report is newer than their claim or lock.
  const live: { text: string; ids: string[]; label: string; lane: string }[] = []
  for (const m of i.members) {
    if (!m.awake) continue
    const ids = [m.lockItem, leadingId(m.label), m.name].filter(x => x !== '')
    const claim = i.claims.find(c => ids.some(id => sameItem(id, c.id)))
    const startMs = m.lockMtimeMs ?? claim?.mtimeMs ?? (m.sinceMs !== null && fin(m.sinceMs) ? now - m.sinceMs : now)
    // The member's own name never matches a report (its lock or label is the item); only item ids count.
    if (reportedAfter(ids.filter(x => x !== m.name), i.reports, startMs)) continue
    live.push({ text: m.label !== '' && m.label !== m.name ? m.label + ' (' + m.name + ')' : m.name, ids, label: m.label, lane: m.name })
  }
  // 2. Fresh claims nobody awake covers and no newer report closes.
  for (const c of i.claims) {
    if (now - c.mtimeMs > CLAIM_LIVE_MS || c.mtimeMs > now + MIN) continue
    if (reportedAfter([c.id], i.reports, c.mtimeMs)) continue
    if (live.some(l => l.ids.some(id => sameItem(id, c.id)) || lineNames(l.label, c.id) || (c.lane !== undefined && c.lane !== '' && l.lane.toLowerCase() === c.lane.toLowerCase()))) continue
    // A member that was awake but finished (its report is newer) already left the list; its claim is closed by the
    // same report, so it cannot come back here.
    // The same text the crew rows use: the claim's id and plain title, then the lane (its age only when there is no title to say what it is).
    const hasTitle = c.title !== undefined && c.title !== ''
    const laneTxt = c.lane !== undefined && c.lane !== '' ? c.lane : ''
    const text = hasTitle
      ? c.id + ': ' + c.title + (laneTxt !== '' ? ' (' + laneTxt + ')' : '')
      : c.id + (laneTxt !== '' ? ' (' + laneTxt + ', claimed ' : ' (claimed ') + ageOf(c.mtimeMs) + ' ago)'
    live.push({ text, ids: [c.id], label: c.id, lane: laneTxt })
  }
  const liveNow = live.map(l => l.text)

  // 3. The newest evidence: claims and reports and locks of the last day, and when an awake lane started this state.
  let evidenceMs = 0
  for (const c of i.claims) if (now - c.mtimeMs <= CLAIM_LIVE_MS && c.mtimeMs <= now + MIN) evidenceMs = Math.max(evidenceMs, c.mtimeMs)
  for (const r of i.reports) if (now - r.mtimeMs <= CLAIM_LIVE_MS && r.mtimeMs <= now + MIN) evidenceMs = Math.max(evidenceMs, r.mtimeMs)
  for (const m of i.members) {
    if (m.lockMtimeMs !== null && now - m.lockMtimeMs <= CLAIM_LIVE_MS) evidenceMs = Math.max(evidenceMs, m.lockMtimeMs)
    if (m.awake && m.sinceMs !== null && fin(m.sinceMs)) evidenceMs = Math.max(evidenceMs, now - m.sinceMs)
  }

  // 4. Landed commits advance done: the subject starts with an id still named in status.json's NOW or NEXT.
  const advanced: string[] = []
  const planned = [...(s?.now ?? []), ...(s?.next ?? [])]
  for (const l of i.landed) {
    const id = landedItemId(l.subject)
    if (id === '' || advanced.some(a => a.toLowerCase() === id.toLowerCase())) continue
    if (planned.some(line => lineNames(line, id))) advanced.push(id)
  }
  const gone = (line: string): boolean => advanced.some(id => lineNames(line, id))
  const next = (s?.next ?? []).filter(l => !gone(l))
  const total = s?.total ?? null
  const done = s === null || (s.done === null && total === null) ? null : Math.min(total ?? Number.POSITIVE_INFINITY, (s.done ?? 0) + advanced.length)

  // 5. NOW: the file's own while the file is newer than every piece of live evidence, else what is live.
  const fileNow = (s?.now ?? []).filter(l => !gone(l))
  const fileIsNewest = s !== null && s.updatedMs !== null && s.updatedMs >= evidenceMs
  let nowList: string[] = []
  let nowSource: LiveStatus['nowSource'] = 'none'
  if (fileIsNewest && fileNow.length > 0) {
    nowList = fileNow
    nowSource = 'file'
  } else if (liveNow.length > 0) {
    nowList = liveNow
    nowSource = 'live'
  }

  // 6. The stale chip: an old file and nothing live behind the card.
  const age = s !== null && s.updatedMs !== null ? Math.max(0, now - s.updatedMs) : null
  const isOld = s !== null && (age === null || age > STATUS_OLD_MS)
  const stale = isOld && liveNow.length === 0 ? (age === null ? 'update time unknown' : 'updated ' + ageLabel(age) + ' ago') : ''

  return { nowSource, now: nowList, next, done, total, advanced, stale, evidenceMs }
}
