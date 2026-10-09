// The crew side of the mod: who is in the crew, what powers each member, what each is doing, what it
// is working on, who waits on whom, and what the lane controls may do. Pure: no mods API, no I/O.
// Unit tested in tests/crew.test.ts.

import { autopilotArgOf } from './autopilot.ts'
import { fin, shellUserName, stripAnsi } from './core.ts'
import type { LaneState } from './core.ts'
import { stripNoise } from './text.ts'
import type { CreditView, PoolState } from './limits.ts'
import { gateCommandSource } from './config.ts'
import type { LaneKind, LaneSpec } from './config.ts'
import type { Activity } from './sprites.ts'

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim()
const MIN = 60_000

// ---------------------------------------------------------------------------
// Discovery: nobody is named in the code. A member is a tmux session listed under `lanes` in the config (its kind is given), or one
// called codex-*, opencode-* or local-* (its kind comes from the name), or any tmux session that has a lock file (kind tmux).

export type CrewKind = 'codex' | 'api' | 'local' | 'cloud' | 'max'
export type CrewMember = { name: string; kind: CrewKind; variant: number }

const PREFIXES: readonly (readonly [string, CrewKind])[] = [
  ['codex-', 'codex'],
  ['opencode-', 'api'],
  ['local-', 'local'],
]
const KIND_ORDER: readonly CrewKind[] = ['codex', 'api', 'local', 'cloud', 'max']

export function kindOfName(name: string): CrewKind | null {
  for (const [prefix, kind] of PREFIXES) if (name.startsWith(prefix) && name.length > prefix.length) return kind
  return null
}

// A stable number from a name (FNV-1a), so a Codex member keeps its hat colour: 0 to 3.
export function hatIndex(name: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h % 4
}

// `sessions` are the tmux session names; `lockNames` the names that have a lock file. 0 to N members,
// grouped by type, then by name with numbers in order (codex-2 before codex-10).
const KIND_OF_LANE: Record<LaneKind, CrewKind> = { tmux: 'max', codex: 'codex', opencode: 'api', local: 'local' }
/** The lane kind of a crew kind (the other way round). */
export const laneKindOf = (k: CrewKind): LaneKind => (k === 'codex' ? 'codex' : k === 'api' ? 'opencode' : k === 'local' ? 'local' : 'tmux')

export function discoverCrew(sessions: readonly string[], lockNames: ReadonlySet<string>, lanes: readonly LaneSpec[] = [], discover = true): CrewMember[] {
  const seen = new Set<string>()
  const out: CrewMember[] = []
  const listed = new Map(lanes.map(l => [l.name, KIND_OF_LANE[l.kind]] as const))
  for (const raw of sessions) {
    const name = raw.trim()
    if (name === '' || seen.has(name) || !/^[\w.-]+$/.test(name)) continue
    const kind = listed.get(name) ?? (discover ? kindOfName(name) : null) ?? (lockNames.has(name) ? 'max' : null)
    if (kind === null) continue
    seen.add(name)
    out.push({ name, kind, variant: kind === 'codex' ? hatIndex(name) : 0 })
  }
  return out.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name, 'en', { numeric: true }))
}

// ---------------------------------------------------------------------------
// What powers a member. One line, in plain words, never the bare word "API".

export type Powered = { text: string; isDim: boolean; badge: string }

const FAMILIES = ['sonnet', 'opus', 'fable', 'haiku']

// "claude-sonnet-5-5" -> "Sonnet 5.5"; "claude-opus-5-5" -> "Opus 5.5"; "claude-fable-5-1" -> "Fable 5.1";
// "claude-haiku-5-5" -> "Haiku 5.5". A provider prefix and a "[1m]" suffix are ignored. Unknown: the raw id.
export function claudeModelName(id: string): string {
  const bare = id.replace(/^[^/]*\//, '').replace(/\[[^\]]*\]$/, '').trim()
  const m = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(bare)
  if (m && FAMILIES.includes(m[1] ?? '')) return (m[1] ?? '').charAt(0).toUpperCase() + (m[1] ?? '').slice(1) + ' ' + m[2] + '.' + m[3]
  return id.trim()
}

const PROVIDER_NAMES: Record<string, string> = { openai: 'OpenAI', google: 'Google', openrouter: 'OpenRouter', xai: 'xAI', mistral: 'Mistral', deepseek: 'DeepSeek' }
const providerName = (p: string): string => PROVIDER_NAMES[p.toLowerCase()] ?? p.charAt(0).toUpperCase() + p.slice(1)

export type ProviderModel = { provider: string; model: string }

// The `-m <provider>/<model>` (or `--model`) of an `opencode` process, from `ps -ww -o args=` text.
export function modelFromPsArgs(psText: string): ProviderModel | null {
  for (const line of psText.split('\n')) {
    if (!/\bopencode\b/.test(line)) continue
    const m = /(?:^|\s)(?:-m|--model)(?:\s+|=)([\w.-]+)\/(\S+)/.exec(line)
    if (m) return { provider: m[1] ?? '', model: m[2] ?? '' }
  }
  return null
}

// The model file of a llama-server process, without its extension: "-m /models/qwen-27b.gguf" -> "qwen-27b".
export function localModelFromPs(psText: string): string {
  for (const line of psText.split('\n')) {
    if (!/llama-server/.test(line)) continue
    const m = /(?:^|\s)(?:-m|--model)(?:\s+|=)(\S+)/.exec(line)
    if (m) return (m[1] ?? '').replace(/^.*\//, '').replace(/\.[A-Za-z0-9]+$/, '')
  }
  return ''
}

// opencode-*: "Claude API . Sonnet 5.5" with a "$ API credit" badge. While no run is active the last model
// seen is shown, dim; with none ever seen it says so.
export function poweredOpencode(current: ProviderModel | null, last: ProviderModel | null): Powered {
  const pm = current ?? last
  const badge = '$ API credit'
  if (pm === null) return { text: 'OpenCode \u00b7 model unknown', isDim: true, badge }
  const text =
    pm.provider.toLowerCase() === 'anthropic'
      ? 'Claude API \u00b7 ' + claudeModelName(pm.model)
      : providerName(pm.provider) + ' API \u00b7 ' + pm.model
  return { text, isDim: current === null, badge }
}

// The pane's own model line: "GPT-6-Luna low . ~/Developer/..." -> "GPT-6 Luna low".
export function paneModel(lines: readonly string[]): string {
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = /^\s*([A-Za-z][\w.]*(?:-[\w.]+)+)\s+(minimal|low|medium|high|xhigh)\b\s*(?:\u00b7|$)/.exec(stripNoise(lines[i] ?? ''))
    if (m) return (m[1] ?? '').replace(/(\d)-(?=[A-Za-z])/g, '$1 ') + ' ' + m[2]
  }
  return ''
}

export function poweredCodex(model: string): Powered {
  return { text: 'Codex (ChatGPT plan)' + (model !== '' ? ' \u00b7 ' + model : ''), isDim: false, badge: '' }
}

export function poweredSession(modelId: string): Powered {
  return { text: 'Claude Max' + (modelId !== '' ? ' \u00b7 ' + claudeModelName(modelId) : ''), isDim: false, badge: '' }
}

export const poweredSub = poweredSession

export function poweredCloud(modelId: string): Powered {
  return { text: 'Claude cloud' + (modelId !== '' ? ' \u00b7 ' + claudeModelName(modelId) : ''), isDim: false, badge: '' }
}

export function poweredLocal(modelName: string): Powered {
  return { text: 'Local' + (modelName !== '' ? ' \u00b7 ' + modelName : ''), isDim: false, badge: '' }
}

// ---------------------------------------------------------------------------
// What a member is doing: one activity word, from the last 25 meaningful lines of its pane.

export const STUCK_AFTER_MS = 45 * MIN

// The last `n` meaningful lines: ANSI and noise characters out, blanks and footer hints dropped.
export function activityLines(text: string | readonly string[], n = 25): string[] {
  const raw = typeof text === 'string' ? text.split('\n') : [...text]
  const keep: string[] = []
  for (const r of raw) {
    const t = stripNoise(stripAnsi(r))
    if (t === '') continue
    if (/\? for shortcuts|f2 to view|for agents|esc to interrupt|esc interrupt/i.test(t)) continue
    keep.push(t)
  }
  return keep.slice(-n)
}

const ASKING = [
  /\(y\/n\)|\[y\/N\]|\[Y\/n\]|\(yes\/no\)/i,
  /\bAllow\b[^\n]*\?/,
  /\bWould you like to\b/i,
  /\bYes, (?:proceed|and don'?t ask again)\b/i,
  /\bapprove\b|\bapproval (?:required|needed)\b/i,
  /\bwaiting for (?:your )?(?:input|approval|confirmation|answer)\b/i,
  /\bpress enter to (?:confirm|continue)\b/i,
]
const RED = [
  /\bFAIL(?:ED)?\b/,
  /\(fail\)/,
  /\bexit(?:ed)? (?:with )?(?:code |status )?[1-9]\d*\b/i,
  /\bexit code [1-9]\d*\b/i,
  /\berror:/i,
  // ("gate red" is NOT here: it is judged by gateFailed below, on the lane's own latest gate result line only.)
  /\b[1-9]\d* fail(?:ed|ures?)?\b/i,
  /\bTraceback\b|\bpanic:/,
]
// a gate that failed counts only when it is the lane's OWN latest gate result line: a line that starts with "Gate", "Full gate" or
// the gate command from the config (after a bullet; a sentence that starts "the gate is red..." is prose) and says red, failed or a non-zero exit. The words "the gate is red" inside prose a lane merely quotes (a brief it read,
// a quoted rule, a report it printed) never count. A later gate result that is green or exit 0 clears it.
const gateResultRe = (): RegExp => new RegExp('^\\s*(?:[\\u2022\\u25cf\\u23fa*-]\\s*)?(?:(?:full )?gate|(?:bash )?(?:\\S*/)?(?:' + gateCommandSource() + '))\\b(.*)$', 'i')
const GATE_BAD = /\b(?:is )?red\b|\bfail(?:ed|s|ing)?\b|\bexit(?:ed)?(?: with)?(?: code| status)?\s*[1-9]\d*\b/i
const GATE_GOOD = /\bgreen\b|\bpass(?:ed|es)?\b|\bexit(?:ed)?(?: with)?(?: code| status)?\s*0\b/i
// A line inside a quotation: it starts with a quote mark, or is indented under a ">" block, or names a brief.
const QUOTED = /^\s*(?:[>"\u201c'`]|\|)|\bbrief-[\w.-]+\.md\b/
export function gateFailed(lines: readonly string[]): boolean {
  const gateRe = gateResultRe()
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? ''
    const m = gateRe.exec(line)
    if (m === null || QUOTED.test(line)) continue
    const rest = m[1] ?? ''
    if (GATE_BAD.test(rest)) return true
    if (GATE_GOOD.test(rest)) return false
  }
  return false
}

const LANDING = [/\bgit (?:commit|push)\b/i, /\bpushed\b/i, /\bHEAD -> /, /\bgh pr (?:create|merge)\b/i, /\bmerged\b/i]
const gateCmdRe = (): RegExp => new RegExp('\\b(?:' + gateCommandSource() + ')')
const TESTING = [/\bbun test\b/i, /\btsc\b/, /\beslint\b/i, /\bpytest\b|\bvitest\b/i, /\(pass\)/, /\b\d+ pass(?:ed)?\b/i, /\btests? (?:passed|failed)\b/i]
const REVIEWING = [/code-review|\bcode review\b/i, /\bgit diff\b/i, /\breview(?:ing|ed)?\b/i]
const CODING = [/\bapply_patch\b/, /^\s*\u2022?\s*(?:Edited|Updated|Added)\b/, /\b(?:Edited|Updated|Added) \S*[./]\S+/, /\bwriting (?:the )?(?:file|code|test)/i]
// Web search or fetch: a search, a fetch, curl to a URL, the GitHub API, browsing.
const RESEARCHING = [/\bSearching the web\b|\bweb search\b|\bWebSearch\b|\bWebFetch\b/i, /\bcurl\b[^\n]*\bhttps?:/i, /\bgh api\b/i, /^\s*\u2022?\s*Fetched\b|\bFetched\b/, /\bbrowsing\b/i]
// Design work: schemas, design notes, rules, specs, mockups.
const DESIGNING = [/\bdesign\b/i, /\bRULES\.md\b/, /\bspec\b/i, /\bjson schema\b|\.json schema\b|\bschema\b[^\n]*\.json\b/i, /\bfigma\b|\bmockups?\b|\bwireframes?\b/i]
// Where an edit lands: prose files and the docs tree, not code.
const DOC_PATH = /\.md\b|\bdocs\/|\bREADME\b|\bCHANGELOG\b|\bBACKLOG\b/
// An edit line that names a file: "Edited foo.ts (+4 -1)", "apply_patch ... docs/x.md".
const NAMES_FILE = /\.[A-Za-z0-9]{1,5}\b|\bdocs\/|\bREADME\b|\bCHANGELOG\b|\bBACKLOG\b/

// Editing prose only: at least one edit line names a doc path and none names anything else. A bare
// "apply_patch" names nothing, so it does not decide; a .ts edit anywhere in the window keeps it "coding".
function isDocsOnlyEdit(lines: readonly string[]): boolean {
  const edits = lines.filter(l => CODING.some(re => re.test(l)) && NAMES_FILE.test(l))
  return edits.length > 0 && edits.every(l => DOC_PATH.test(l))
}
const READING = [/^\s*\u2022?\s*(?:Read|Explored|Searched?)\b/, /\bRan (?:rtk )?(?:cat|rg|grep|sed -n|head|tail|ls|find|git (?:show|log|status|branch|worktree))\b/, /\b(?:sed -n|rg -n|grep -n)\b/]
const PLANNING = [/\b(?:thinking|reasoning|planning)\b/i, /\bconsidering\b/i, /^\s*\u2022?\s*I(?:\u2019|')?(?:ll|m|ve) (?:going to|checking|looking|reading|planning|thinking)/i, /\blet me\b/i]

const anyOf = (res: readonly RegExp[], lines: readonly string[]): boolean => lines.some(l => res.some(re => re.test(l)))

// States, first match wins: asking, red, stuck, landing, testing, reviewing, researching, documenting,
// designing, coding, reading, planning, then "working" (the text says nothing more) and, for an idle pane, "sleeping". A pane waiting on you
// is "asking" whatever it was doing. For an idle pane every other state is a thing it already did, so
// it is "sleeping". Text that does not support a state never claims one: it falls back to "working".
export function activityOf(paneText: string | readonly string[], mode: LaneState, secondsSinceChange: number): Activity | 'absent' {
  if (mode === 'absent') return 'absent'
  const lines = activityLines(paneText)
  const last = lines[lines.length - 1] ?? ''
  const waitsOnYou = anyOf(ASKING, lines.filter(l => !/dangerously-bypass/.test(l))) || /\?$/.test(last)
  if (waitsOnYou) return 'asking'
  if (mode === 'idle') return 'sleeping'
  if (anyOf(RED, lines) || gateFailed(lines)) return 'red'
  if (fin(secondsSinceChange) && secondsSinceChange * 1000 >= STUCK_AFTER_MS) return 'stuck'
  if (anyOf(LANDING, lines)) return 'landing'
  if (anyOf(TESTING, lines) || lines.some(l => gateCmdRe().test(l))) return 'testing'
  if (anyOf(REVIEWING, lines)) return 'reviewing'
  if (anyOf(RESEARCHING, lines)) return 'researching'
  if (isDocsOnlyEdit(lines)) return 'documenting'
  if (anyOf(DESIGNING, lines)) return 'designing'
  if (anyOf(CODING, lines)) return 'coding'
  if (anyOf(READING, lines)) return 'reading'
  if (anyOf(PLANNING, lines)) return 'planning'
  return 'working'
}

// The status words a card may show: a CLOSED list. Whatever activity the detector finds, the word on a card is one of these; "red" is
// never a status word (the detector's 'red' is a gate that failed). What a lane is doing ("editing core.ts") is in the task line, not in the status.
export const STATUS_WORDS = ['working', 'idle', 'sleeping', 'waiting', 'blocked', 'stuck', 'errored', 'gate failed', 'done'] as const
export type StatusWord = (typeof STATUS_WORDS)[number]

export function statusWordOf(activity: Activity | 'absent', o: { blocked?: boolean } = {}): StatusWord {
  if (activity === 'errored') return 'errored'
  if (activity === 'red') return 'gate failed'
  if (activity === 'stuck') return 'stuck'
  if (activity === 'cheering') return 'done'
  if (activity === 'asking') return o.blocked === true ? 'blocked' : 'waiting'
  if (activity === 'sleeping' || activity === 'absent') return o.blocked === true ? 'blocked' : 'sleeping'
  return 'working'
}

// The pill's colour for each activity (v11): anything ACTIVE is green (coding, testing, a gate, a Codex or OpenCode run,
// reading, planning, a landing, the generic "working"), waiting on someone is amber, a failing or errored lane is red,
// sleeping is grey. The word in the pill says which kind of active.
export const ACTIVE_GREEN = '#22C55E'
export const WAIT_AMBER = '#F59E0B'
export const ACTIVITY_COLOR: Record<Activity, string> = {
  asking: WAIT_AMBER,
  red: '#EF4444',
  stuck: WAIT_AMBER,
  landing: ACTIVE_GREEN,
  testing: ACTIVE_GREEN,
  reviewing: ACTIVE_GREEN,
  researching: ACTIVE_GREEN,
  documenting: ACTIVE_GREEN,
  designing: ACTIVE_GREEN,
  errored: '#B91C1C',
  cheering: '#FBBF24',
  coding: ACTIVE_GREEN,
  reading: ACTIVE_GREEN,
  planning: ACTIVE_GREEN,
  working: ACTIVE_GREEN,
  sleeping: '#8B949E',
}

// The tone of a row: 'green' for anything active, 'amber' for blocked, waiting or stuck, 'red' for a failure, '' for a
// sleeper (and for a lane out of credits): it picks the row's tint and left accent bar.
export type RowTone = '' | 'green' | 'amber' | 'red'
export function rowToneOf(o: { activity: Activity; errored: boolean; blocked: boolean; stuck: boolean; exhausted: boolean }): RowTone {
  if (o.exhausted) return ''
  if (o.errored || o.activity === 'errored' || o.activity === 'red') return 'red'
  if (o.blocked || o.stuck || o.activity === 'asking' || o.activity === 'stuck') return 'amber'
  if (o.activity === 'sleeping') return ''
  return 'green'
}

// "coding . Billing Settings", or just "coding" when there is no target.
export const activityPill = (state: string, target: string): string => (target !== '' ? state + ' \u00b7 ' + target : state)

// ---------------------------------------------------------------------------
// The target: a short name for what a member is working on, never longer than 22 characters

export const TARGET_MAX = 22

export type Targets = Record<string, string>

export function parseTargets(text: string): Targets {
  try {
    const raw: unknown = JSON.parse(text)
    const out: Targets = {}
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === 'string' && squash(v) !== '') out[k] = squash(v)
    }
    return out
  } catch {
    return {}
  }
}

export const shortTarget = (s: string, max = TARGET_MAX): string => {
  const t = squash(s)
  return t.length > max ? t.slice(0, Math.max(1, max - 1)) + '\u2026' : t
}

const lookup = (targets: Targets, key: string): string => {
  if (key === '') return ''
  const direct = targets[key]
  if (direct !== undefined) return direct
  const lower = key.toLowerCase()
  for (const [k, v] of Object.entries(targets)) if (k.toLowerCase() === lower) return v
  return ''
}

const BACKLOG_ID = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+[a-z]?\b/g
const VERBS = /^(?:land|build|implement|fix|add|write|create|make|ship|continue|finish|send|update|run|prepare|do|rework|move|wire|finalize|resend|re-send|retry|redo|deliver)\b[\s:,-]*/i

// MAP-HUB-01 -> "Place Hub": the words of the id without its number.
function titleFromId(id: string): string {
  const parts = id.split('-')
  const last = parts[parts.length - 1] ?? ''
  const words = parts.length > 1 && /^\d+[a-z]?$/.test(last) ? parts.slice(0, -1) : parts
  const text = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
  return parts.length === 2 && /^\d+[a-z]?$/.test(last) ? text + ' ' + last : text
}

// In order: crew-targets.json by the item, then by a backlog id found in the heading; then a name made
// from that id; then a Title Case name in the heading; then the heading without its "<item>:" and verbs;
// then the item. The coordinator keeps crew-targets.json; this only reads it.
export function targetOf(item: string, heading: string, targets: Targets): string {
  const id = squash(item).split(' ')[0] ?? ''
  const mapped = lookup(targets, id)
  if (mapped !== '') return shortTarget(mapped)
  const h = squash(heading)
  const ids = h.match(BACKLOG_ID) ?? []
  for (const b of ids) {
    const m = lookup(targets, b)
    if (m !== '') return shortTarget(m)
  }
  if (ids[0]) return shortTarget(titleFromId(ids[0]))
  if (h === '') return shortTarget(id)
  let rest = h
  if (id !== '' && rest.toLowerCase().startsWith(id.toLowerCase() + ':')) rest = rest.slice(id.length + 1).trim()
  rest = rest.replace(VERBS, '').replace(/^(?:the|a|an)\s+/i, '').trim()
  const title = /(?:[A-Z][a-z0-9]+)(?:\s+[A-Z][a-z0-9]+)+/.exec(rest)
  if (title) return shortTarget(title[0])
  return shortTarget(rest !== '' ? rest : id)
}

// The coordinator's own session: the first item of status.json "now".
export const sessionTarget = (now: readonly string[]): string => shortTarget(now[0] ?? '')

// ---------------------------------------------------------------------------
// Who waits on whom (deps.json in the data folder, plus a gate lock seen in a pane)

// `auto` marks an edge the mod found itself (a pane waiting for the gate lock): it is not faded by a
// missing lane lock, because whoever holds the gate need not hold a lane.
export type Edge = { member: string; on: string; why: string; auto?: boolean }

export function parseDeps(text: string): Edge[] {
  try {
    const raw: unknown = JSON.parse(text)
    const waits = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>).waits : undefined
    if (!Array.isArray(waits)) return []
    const out: Edge[] = []
    for (const w of waits) {
      if (w === null || typeof w !== 'object') continue
      const r = w as Record<string, unknown>
      const member = typeof r.member === 'string' ? squash(r.member) : ''
      const on = typeof r.on === 'string' ? squash(r.on) : ''
      if (member === '' || on === '' || member === on) continue
      out.push({ member, on, why: typeof r.why === 'string' ? squash(r.why) : '' })
    }
    return out
  } catch {
    return []
  }
}

// A pane that waits for a machine-wide gate lock says so ("waiting for the gate lock").
export const waitsForGate = (paneText: string | readonly string[]): boolean =>
  activityLines(paneText).some(l => /waiting for (?:the )?(?:machine-wide )?(?:gate )?lock/i.test(l))

// The member named in a lock script's status output, else "gate".
export function gateHolder(statusText: string, members: readonly string[]): string {
  for (const m of members) if (new RegExp('(?:^|[^\\w-])' + m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])').test(statusText)) return m
  return 'gate'
}

// The edges to draw: the file's, plus one automatic edge per member that waits for the gate lock (unless
// the file already says what that member waits on).
export function allEdges(fileEdges: readonly Edge[], gateWaiters: readonly string[], holder: string): Edge[] {
  const out = [...fileEdges]
  for (const m of gateWaiters) {
    if (out.some(e => e.member === m)) continue
    out.push({ member: m, on: m === holder ? 'gate' : holder, why: 'waiting for the machine-wide gate lock', auto: true })
  }
  return out
}

export type GNode = { id: string; kind: 'member' | 'person' | 'gate' | 'text'; label: string; bad: boolean }
export type GEdge = { from: string; to: string; why: string; faded: boolean; hot: boolean; red: boolean; inCycle: boolean }
export type Graph = { nodes: GNode[]; edges: GEdge[]; blocked: string[]; hasCycle: boolean }

export type GraphCtx = {
  members: ReadonlySet<string>
  // A blocker that is stuck or red.
  isBad: (name: string) => boolean
  // The blocker's report appeared, or its lock cleared: the edge fades out.
  isFaded: (edge: Edge) => boolean
}

// Members that are on a cycle of live edges (A waits on B waits on A), found by walking each edge's `on` chain.
function cycleMembers(live: readonly Edge[]): Set<string> {
  const next = new Map<string, string[]>()
  for (const e of live) next.set(e.member, [...(next.get(e.member) ?? []), e.on])
  const inCycle = new Set<string>()
  for (const start of next.keys()) {
    const stack: string[][] = [[start]]
    while (stack.length > 0) {
      const path = stack.pop() ?? []
      const tip = path[path.length - 1] ?? ''
      for (const n of next.get(tip) ?? []) {
        if (n === start) path.forEach(p => inCycle.add(p))
        else if (!path.includes(n) && path.length < 24) stack.push([...path, n])
      }
    }
  }
  return inCycle
}

export function buildGraph(edges: readonly Edge[], ctx: GraphCtx): Graph {
  const faded = edges.map(e => ctx.isFaded(e))
  const live = edges.filter((_, i) => !faded[i])
  const loop = cycleMembers(live)
  const froms = new Set(live.map(e => e.member))
  const tos = new Set(live.map(e => e.on))
  const names: string[] = []
  const add = (n: string) => {
    if (!names.includes(n)) names.push(n)
  }
  for (const e of edges) {
    add(e.member)
    add(e.on)
  }
  const nodes: GNode[] = names.map(id => ({
    id,
    kind: ctx.members.has(id) ? 'member' : id === 'you' ? 'person' : id === 'gate' ? 'gate' : 'text',
    label: id,
    bad: ctx.members.has(id) && ctx.isBad(id),
  }))
  const gedges: GEdge[] = edges.map((e, i) => {
    const isFaded = faded[i] === true
    return {
      from: e.member,
      to: e.on,
      why: e.why,
      faded: isFaded,
      // On a chain: A waits on B and B waits on C.
      hot: !isFaded && (froms.has(e.on) || tos.has(e.member)),
      red: !isFaded && ctx.members.has(e.on) && ctx.isBad(e.on),
      inCycle: !isFaded && loop.has(e.member) && loop.has(e.on),
    }
  })
  // Only a member the crew actually has can be shown as blocked on its row.
  const blocked = [...new Set(live.map(e => e.member))].filter(m => ctx.members.has(m))
  return { nodes, edges: gedges, blocked, hasCycle: loop.size > 0 }
}

// The first live edge a member waits on: the chip "blocked by codex-b" and its why.
export function blockedBy(g: Graph, member: string): { on: string; why: string } | null {
  const e = g.edges.find(x => x.from === member && !x.faded)
  return e ? { on: e.to, why: e.why } : null
}

// A blocker's edge fades when the lock of that member cleared or its report appeared. A blocker that is
// not a member (you, gate, free text) stays.
export function edgeIsFaded(e: Edge, ctx: { members: ReadonlySet<string>; lockItemOf: (member: string) => string; reportNames: ReadonlySet<string> }): boolean {
  if (e.auto === true || !ctx.members.has(e.on)) return false
  const item = ctx.lockItemOf(e.on)
  if (item === '') return true
  return ctx.reportNames.has(item + '-report.md')
}

// ---------------------------------------------------------------------------
// Lane controls: what each action may do, and when

export type ActionName = 'start' | 'restart' | 'clear'
export type MemberFacts = { exists: boolean; state: LaneState; sinceMs: number; hasLock: boolean }
export type ActionPlan = { ok: true; steps: string[][]; confirm: string } | { ok: false; reason: string }

export const RESTART_IDLE_MS = 5 * MIN

const CODEX_NAME = /^codex-[a-z0-9][a-z0-9-]{0,30}$/
const CREW_NAME = /^[A-Za-z0-9][\w.-]{0,30}$/

// `start` runs plain `codex` with no model or effort: those come from the user's own Codex config and the
// coordinator's routing; this mod never chooses or overrides a model. Nothing here ever acts on a working lane.
export function planAction(action: ActionName, name: string, facts: MemberFacts | null, home: string): ActionPlan {
  const startSteps = [['tmux', 'new-session', '-d', '-s', name, '-c', home, 'codex']]
  if (action === 'start') {
    if (!CODEX_NAME.test(name)) return { ok: false, reason: 'start makes a Codex session; the name must look like codex-e' }
    if (facts?.exists === true) return { ok: false, reason: name + ' is already running' }
    return { ok: true, steps: startSteps, confirm: 'start ' + name + ': a new tmux session running plain codex (its model and effort come from your Codex config)' }
  }
  if (!CREW_NAME.test(name)) return { ok: false, reason: name + ' is not a crew session name' }
  if (facts === null || !facts.exists) return { ok: false, reason: name + ' is not running' }
  if (facts.state === 'working') return { ok: false, reason: name + ' is working; it is never touched while it works' }
  if (facts.state !== 'idle') return { ok: false, reason: name + ' is not idle' }
  if (action === 'clear') {
    return { ok: true, steps: [['tmux', 'send-keys', '-t', '=' + name + ':', '/clear', 'Enter']], confirm: 'clear ' + name + ': send /clear to an idle session' }
  }
  if (!CODEX_NAME.test(name)) return { ok: false, reason: 'restart works on Codex sessions (codex-*)' }
  if (facts.hasLock) return { ok: false, reason: name + ' holds a lock file; restart needs it gone' }
  if (!(facts.sinceMs >= RESTART_IDLE_MS)) return { ok: false, reason: name + ' has not been idle for 5 minutes yet' }
  return {
    ok: true,
    steps: [['tmux', 'kill-session', '-t', '=' + name], ...startSteps],
    confirm: 'restart ' + name + ': kill the idle session (' + Math.floor(facts.sinceMs / MIN) + 'm, no lock) and start plain codex again',
  }
}

export const actionLogLine = (iso: string, action: string, name: string, result: string): string =>
  [iso, action, name, result.replace(/[\t\r\n]+/g, ' ')].join('\t') + '\n'

export type CrewCommand =
  | { cmd: 'toggle' }
  | { cmd: 'status' }
  | { cmd: 'away' | 'back' | 'confirm' | 'cancel' }
  | { cmd: 'autopilot'; arg: 'on' | 'off' | 'toggle' }
  | { cmd: 'start' | 'restart' | 'clear'; name: string }
  | { cmd: 'bug' | 'idea' | 'feature'; text: string }
  | { cmd: 'view'; mode: 'crew' | 'items' | '' }
  // "/crew usage 5h=0 wk=87 fable=32": the plan usage by hand, the last fallback (usage.ts parses the figures).
  | { cmd: 'usage'; args: string }
  | { cmd: 'unknown'; word: string }

// "/crew start codex-e" -> {cmd: 'start', name: 'codex-e'}; "/crew bug the page is blank" -> {cmd: 'bug', text}.
export function parseCrewArgs(args: string): CrewCommand {
  const t = args.trim()
  if (t === '') return { cmd: 'toggle' }
  const [word = '', ...rest] = t.split(/\s+/)
  const w = word.toLowerCase()
  const tail = t.slice(word.length).trim()
  if (w === 'status') return { cmd: 'status' }
  if (w === 'autopilot') return { cmd: 'autopilot', arg: rest[0] === undefined ? 'toggle' : autopilotArgOf(rest[0]) }
  if (w === 'away' || w === 'back' || w === 'confirm' || w === 'cancel') return { cmd: w }
  if (w === 'yes' || w === 'y') return { cmd: 'confirm' }
  if (w === 'no' || w === 'n') return { cmd: 'cancel' }
  if (w === 'start' || w === 'restart' || w === 'clear') return { cmd: w, name: rest[0] ?? '' }
  if (w === 'bug' || w === 'idea' || w === 'feature') return { cmd: w, text: tail }
  if (w === 'usage') return { cmd: 'usage', args: tail }
  if (w === 'view') {
    const m = (rest[0] ?? '').toLowerCase()
    return { cmd: 'view', mode: m === 'crew' || m === 'by-crew' ? 'crew' : m === 'items' || m === 'item' || m === 'by-item' ? 'items' : '' }
  }
  return { cmd: 'unknown', word }
}

// ---------------------------------------------------------------------------
// The "stuck?" alert: a working member whose pane has not changed for 45 minutes

export const isStuck = (state: LaneState, sinceMs: number): boolean => state === 'working' && fin(sinceMs) && sinceMs >= STUCK_AFTER_MS

// ---------------------------------------------------------------------------
// Errored: the member itself broke. Distinct from red (a gate failed), stuck (no output for a while) and
// blocked (waiting on someone). A usage or credit refusal is not errored: that member is out of credits
// (see exhaustedOf), able to work again at its reset.

export type Errored = { errored: boolean; reason: string }

// What the agent's own screen shows while it is alive.
const AGENT_UI = /\? for shortcuts|Ask Codex|esc interrupt|esc to interrupt|ctrl\+p|ctrl\+t to expand|\bWorking\b/i
// What a bare shell prompt is made of: the shell's name, the user name, git ahead/behind, a clock, a prompt mark.
const SHELL_BITS = /\b(?:zsh|bash|fish)\b|[\u2191\u2193]\s?\d+|\d{1,2}:\d{2}:\d{2}|[$%#\u276f]\s*$/

// The pane sits at a bare shell: its last lines look like a prompt and none shows the agent's screen.
export function atBareShell(lines: readonly string[]): boolean {
  const kept = lines.map(l => stripNoise(stripAnsi(l))).filter(l => l !== '')
  if (kept.length === 0) return false
  if (kept.slice(-6).some(l => AGENT_UI.test(l))) return false
  const last = kept[kept.length - 1] ?? ''
  const user = shellUserName()
  return SHELL_BITS.test(last) || (user !== '' && last.includes(user))
}

const REFUSAL = [
  /\busage limit\b/i,
  /\bhit your (?:5-?hour |weekly |usage |monthly )?limit\b/i,
  /\bout of (?:credits|usage)\b/i,
  /\binsufficient (?:credits|funds|quota)\b/i,
  /\bcredit balance (?:is )?too low\b/i,
  /\bexceeded your (?:current )?quota\b|\bquota exceeded\b/i,
  /\b(?:purchase|add) (?:more )?credits\b/i,
  // "limit reached" but not "rate limit exceeded": that is a rate-limit error, not a spent plan.
  /(?<!rate[- ])\blimit (?:reached|exceeded)\b/i,
]

// A usage-limit or credit refusal in the last lines of the pane.
export const refusalOf = (paneText: string | readonly string[]): boolean => anyOf(REFUSAL, activityLines(paneText, 8))

const AUTH = [/\b401\b|\bUnauthorized\b/, /\bauthentication (?:failed|error|required)\b/i, /\binvalid (?:api )?(?:key|token)\b/i, /\bnot logged in\b|\bplease (?:log ?in|sign in)\b|\blogin required\b/i, /\btoken (?:has )?expired\b/i]
const RATE = [/\brate[- ]limit(?:ed)?\b/i, /\b429\b/, /\btoo many requests\b/i]
const API = [/\bAPI error\b|\bAPIError\b/i, /\berror from (?:the )?API\b/i, /\boverloaded_error\b|\bService Unavailable\b|\bBad Gateway\b/i, /\bstream disconnected\b|\bECONNRESET\b|\bconnection (?:refused|reset)\b/i]
// The agent's process ended badly: a [Process exited N] line, or a crash. The cause is not known, so no reason.
const EXITED = [/\[(?:Process exited|exited)[^\]]*[1-9]\d*\]/i, /\bSegmentation fault\b|\bcore dumped\b|\bKilled: 9\b/i, /\b(?:codex|opencode|claude)\b[^\n]*\b(?:crashed|terminated unexpectedly)\b/i]

// `lines` is the pane (raw). A member whose tmux session is gone while its lock is live died; one at a bare
// shell with a live lock died too; one that is not working and shows an auth, rate-limit or API error is
// errored with that reason; one whose process exited has no known reason ("errored" alone). A refusal for
// credits is not an error here, and a member that is working is not errored (it is retrying).
export function erroredOf(lines: readonly string[], o: { state: LaneState; sessionMissing: boolean; lockLive: boolean }): Errored {
  const no: Errored = { errored: false, reason: '' }
  if (o.sessionMissing) return o.lockLive ? { errored: true, reason: 'session died' } : no
  if (o.state === 'working') return no
  if (refusalOf(lines)) return no
  if (o.lockLive && atBareShell(lines)) return { errored: true, reason: 'session died' }
  const tail = activityLines(lines, 8)
  if (anyOf(AUTH, tail)) return { errored: true, reason: 'auth error' }
  if (anyOf(RATE, tail)) return { errored: true, reason: 'rate limited' }
  if (anyOf(API, tail)) return { errored: true, reason: 'API error' }
  if (anyOf(EXITED, tail)) return { errored: true, reason: '' }
  return no
}

// ---------------------------------------------------------------------------
// Out of credits: a member whose pool is exhausted is dimmed, with its reset time. Never on "low".

export type Exhaustion = { exhausted: boolean; backAtMs: number | null; why: 'limit' | 'credit' | 'refusal' | '' }

// Codex shares one pool: exhausted when a window reads 100% used with its reset ahead; when the pool is
// readable that wins over the pane (a refusal left on screen does not keep a member dim after the reset);
// when it is not readable, a refusal in the pane decides. OpenCode and the cloud follow their credit (nothing
// left, or expired), or a refusal. Local and this session are never dimmed here.
export function exhaustedOf(
  kind: CrewKind,
  o: { codex: PoolState; codexReadable: boolean; opencode: CreditView; cloud: CreditView; refusal: boolean },
): Exhaustion {
  const none: Exhaustion = { exhausted: false, backAtMs: null, why: '' }
  if (kind === 'codex') {
    if (o.codex.exhausted) return { exhausted: true, backAtMs: o.codex.backAtMs, why: 'limit' }
    return o.refusal && !o.codexReadable ? { exhausted: true, backAtMs: null, why: 'refusal' } : none
  }
  if (kind === 'api' || kind === 'cloud') {
    const c = kind === 'api' ? o.opencode : o.cloud
    if (c.exhausted) return { exhausted: true, backAtMs: null, why: 'credit' }
    return o.refusal ? { exhausted: true, backAtMs: null, why: 'refusal' } : none
  }
  return none
}

// ---------------------------------------------------------------------------
// Crew order: a fixed rule, and stable (a member moves only when its group changes, after ~10 s).

export type CrewGroup = 'attention' | 'active' | 'sleeping' | 'exhausted'
// active cards come first (directly under the Captain), then the cards that need a look, then those out of credits, and the sleeping row last.
export const GROUP_RANK: Record<CrewGroup, number> = { active: 1, attention: 2, exhausted: 3, sleeping: 4 }
// Among the active, the most recently active first, in buckets this wide (so two lanes that both print every few seconds do not swap places on every poll).
export const RECENCY_BUCKET_MS = 30_000
export const ORDER_HYSTERESIS_MS = 10_000

// The rule, as the "?" popover prints it.
export const ORDER_RULE: readonly string[] = [
  '1. The Captain (the coordinator) is always first, its subagents under it.',
  '2. Then active members (coding, testing, reviewing, landing...), the most recently active first.',
  '3. Then errored, gate failed, stuck, waiting and blocked members.',
  '4. Then members out of credits.',
  '5. The sleeping row is last.',
  'Ties by name. A member moves only when its group has changed for about 10 seconds.',
]

export function groupOf(m: { activity: string; state: LaneState; exhausted: boolean; blocked: boolean }): CrewGroup {
  if (m.activity === 'errored') return 'attention'
  if (m.exhausted) return 'exhausted'
  if (m.activity === 'red' || m.activity === 'stuck' || m.activity === 'asking' || m.blocked) return 'attention'
  return m.state === 'working' ? 'active' : 'sleeping'
}

export type OrderState = ReadonlyMap<string, { shown: CrewGroup; pending: CrewGroup | null; since: number }>

// A member shows in its group once that has been its group for ORDER_HYSTERESIS_MS; a new member shows at
// once. Within a group, by name (numbers in order). Returns the order and the state for the next poll.
export function orderCrew(
  entries: readonly { name: string; group: CrewGroup; quietMs?: number }[],
  prev: OrderState,
  nowMs: number,
): { order: string[]; state: OrderState } {
  const next = new Map<string, { shown: CrewGroup; pending: CrewGroup | null; since: number }>()
  for (const e of entries) {
    const p = prev.get(e.name)
    if (p === undefined) {
      next.set(e.name, { shown: e.group, pending: null, since: nowMs })
    } else if (e.group === p.shown) {
      next.set(e.name, { shown: p.shown, pending: null, since: p.since })
    } else {
      const since = p.pending === e.group ? p.since : nowMs
      next.set(e.name, nowMs - since >= ORDER_HYSTERESIS_MS ? { shown: e.group, pending: null, since: nowMs } : { shown: p.shown, pending: e.group, since })
    }
  }
  const quiet = new Map(entries.map(e => [e.name, e.quietMs ?? 0]))
  const bucket = (name: string): number => ((next.get(name)?.shown ?? 'sleeping') === 'active' ? Math.floor(Math.max(0, quiet.get(name) ?? 0) / RECENCY_BUCKET_MS) : 0)
  const order = [...entries]
    .map(e => e.name)
    .sort((a, b) => GROUP_RANK[next.get(a)?.shown ?? 'sleeping'] - GROUP_RANK[next.get(b)?.shown ?? 'sleeping'] || bucket(a) - bucket(b) || a.localeCompare(b, 'en', { numeric: true }))
  return { order, state: next }
}
