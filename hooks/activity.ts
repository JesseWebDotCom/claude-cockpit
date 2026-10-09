// COCKPIT-45: what an agent or session is doing, in ONE declared list, and the ONE definition of the "sessions" and "agents" counts.
// Every renderer (the bar's count, the Agents rows and chips, the Main status card, tooltips, the terminal text) reads this file. Pure; tests/cockpit45.test.ts.
//
// Words: a SESSION is a top-level conversation (this one, plus each tmux lane another tool runs). An AGENT is a subagent a session started.
// The state words are plain: Reading, Editing, Running tests, Searching, Browsing, Reviewing, Planning, Needs you, Blocked, Done, Idle.
// When the activity cannot be told, the state is Active. No other verb is invented.

import type { Activity } from './sprites.ts'

export type StateId = 'reading' | 'editing' | 'testing' | 'searching' | 'browsing' | 'reviewing' | 'planning' | 'needs-you' | 'blocked' | 'done' | 'idle' | 'active'

/** A colour token; each maps to one hex in STATE_HEX so a light and a dark theme draw the same meaning. */
export type StateTone = 'ok' | 'info' | 'warn' | 'err' | 'dim'

export type StateDef = {
  id: StateId
  /** The word on a chip or a row: "Running tests". */
  label: string
  /** The lower-case phrase in a count breakdown: "2 running tests". */
  phrase: string
  tone: StateTone
  /** One character drawn before the label where there is room. */
  icon: string
}

export const STATES: readonly StateDef[] = [
  { id: 'editing', label: 'Editing', phrase: 'editing', tone: 'ok', icon: '✎' },
  { id: 'testing', label: 'Running tests', phrase: 'running tests', tone: 'ok', icon: '▶' },
  { id: 'reading', label: 'Reading', phrase: 'reading', tone: 'ok', icon: '▭' },
  { id: 'searching', label: 'Searching', phrase: 'searching', tone: 'ok', icon: '⌕' },
  { id: 'browsing', label: 'Browsing', phrase: 'browsing', tone: 'ok', icon: '◎' },
  { id: 'reviewing', label: 'Reviewing', phrase: 'reviewing', tone: 'ok', icon: '◉' },
  { id: 'planning', label: 'Planning', phrase: 'planning', tone: 'ok', icon: '☰' },
  { id: 'active', label: 'Active', phrase: 'active', tone: 'ok', icon: '●' },
  { id: 'needs-you', label: 'Needs you', phrase: 'needs you', tone: 'warn', icon: '!' },
  { id: 'blocked', label: 'Blocked', phrase: 'blocked', tone: 'err', icon: '✕' },
  { id: 'done', label: 'Done', phrase: 'done', tone: 'info', icon: '✓' },
  { id: 'idle', label: 'Idle', phrase: 'idle', tone: 'dim', icon: '○' },
]

export const STATE_HEX: Record<StateTone, string> = { ok: '#22C55E', info: '#3B9C5F', warn: '#F59E0B', err: '#EF4444', dim: '#8B949E' }

const BY_ID: ReadonlyMap<StateId, StateDef> = new Map(STATES.map(s => [s.id, s]))
export const stateDef = (id: StateId): StateDef => BY_ID.get(id) ?? (BY_ID.get('active') as StateDef)
export const stateColor = (id: StateId): string => STATE_HEX[stateDef(id).tone]
/** Every label, in the declared order: the closed list of words a chip may show (before a Blocked reason or a Done age is added). */
export const STATE_LABELS: readonly string[] = STATES.map(s => s.label)

/** The chip text: the label, plus "(reason)" for Blocked and "(N min ago)" for Done when known. */
export function stateText(id: StateId, o: { reason?: string; agoMin?: number } = {}): string {
  const d = stateDef(id)
  if (id === 'blocked' && (o.reason ?? '') !== '') return d.label + ': ' + o.reason
  if (id === 'done' && o.agoMin !== undefined && o.agoMin >= 1) return d.label + ' (' + Math.floor(o.agoMin) + ' min ago)'
  return d.label
}

// ---------------------------------------------------------------------------
// From a tool call (a subagent's latest tool, or a host tool name) to a state.

const TEST_CMD = /(?:^|\s)(?:bun|npm|pnpm|yarn)\s+(?:run\s+)?test\b|\bvitest\b|\bpytest\b|\bjest\b|\bplugin test\b|check\.sh|\bgo test\b|\bcargo test\b|\bswift test\b/i

export function stateOfTool(tool: string, text = ''): StateId {
  const t = tool.trim().toLowerCase()
  if (t === '') return 'active'
  if (/^(?:read|view|ls|list|cat)$/.test(t)) return 'reading'
  if (/^(?:edit|multiedit|write|update|notebookedit|apply_patch|patch|applypatch)$/.test(t)) return 'editing'
  if (/^(?:grep|glob|find|search|toolsearch)$/.test(t)) return 'searching'
  if (/^(?:webfetch|websearch|browser.*|mcp__.*(?:browser|chrome|playwright).*)$/.test(t) || t.startsWith('mcp__claude-in-chrome') || t.startsWith('mcp__claude_browser')) return 'browsing'
  if (/^(?:todowrite|exitplanmode|enterplanmode|plan|question|askuserquestion)$/.test(t)) return t.startsWith('ask') || t === 'question' ? 'needs-you' : 'planning'
  if (/^(?:skill)$/.test(t)) return /review/i.test(text) ? 'reviewing' : 'active'
  if (t === 'bash' || t === 'shell' || t === 'run') {
    if (TEST_CMD.test(text)) return 'testing'
    if (/(?:^|\s|\|)(?:rg|grep|ag)\s/.test(text)) return 'searching'
    if (/(?:^|\s)(?:cat|sed\s+-n|head|tail|ls|wc|stat)\b/.test(text)) return 'reading'
    if (/\bcurl\b|\bwget\b/.test(text)) return 'browsing'
    return 'active'
  }
  if (/review/.test(t)) return 'reviewing'
  return 'active'
}

/** The state of one running subagent: its latest tool call decides; with none seen it is Active. */
export function stateOfAgent(tools: readonly { tool: string; text: string }[] | undefined): StateId {
  const last = tools !== undefined && tools.length > 0 ? tools[tools.length - 1] : undefined
  return last === undefined ? 'active' : stateOfTool(last.tool, last.text)
}

// ---------------------------------------------------------------------------
// From the lane detector's activity (sprites.ts Activity) to a state.

export function stateOfActivity(activity: Activity | 'absent', o: { blocked?: boolean } = {}): { id: StateId; reason: string } {
  switch (activity) {
    case 'coding':
    case 'documenting':
    case 'landing':
      return { id: 'editing', reason: '' }
    case 'designing':
    case 'planning':
      return { id: 'planning', reason: '' }
    case 'testing':
      return { id: 'testing', reason: '' }
    case 'reviewing':
      return { id: 'reviewing', reason: '' }
    case 'researching':
      return { id: 'searching', reason: '' }
    case 'reading':
      return { id: 'reading', reason: '' }
    case 'asking':
      return o.blocked === true ? { id: 'blocked', reason: 'waiting on another item' } : { id: 'needs-you', reason: '' }
    case 'red':
      return { id: 'blocked', reason: 'gate failed' }
    case 'stuck':
      return { id: 'blocked', reason: 'no progress' }
    case 'errored':
      return { id: 'blocked', reason: 'errored' }
    case 'cheering':
      return { id: 'done', reason: '' }
    case 'sleeping':
    case 'absent':
      return o.blocked === true ? { id: 'blocked', reason: 'waiting on another item' } : { id: 'idle', reason: '' }
    default:
      return { id: 'active', reason: '' }
  }
}

// ---------------------------------------------------------------------------
// Counts: THE definition. "sessions" and "agents" are counted here and nowhere else.

export type CountsIn = {
  /** The session this panel is in: always one. */
  mainSessions?: number
  /** The tmux lanes that are awake (not asleep or absent): each is a session another tool runs. */
  lanesAwake: number
  /** The running subagents the host reports (snapshot.subs with a running status), each with its state. */
  agents: readonly StateId[]
}

export type Counts = { sessions: number; agents: number; byState: Readonly<Partial<Record<StateId, number>>> }

export function activityCounts(i: CountsIn): Counts {
  const byState: Partial<Record<StateId, number>> = {}
  for (const s of i.agents) byState[s] = (byState[s] ?? 0) + 1
  return { sessions: (i.mainSessions ?? 1) + Math.max(0, i.lanesAwake), agents: i.agents.length, byState }
}

const plural = (n: number, one: string, many = one + 's'): string => n + ' ' + (n === 1 ? one : many)

/** "2 editing, 1 running tests, 1 needs you": the declared order, zeros omitted; '' when nothing. */
export function breakdownText(byState: Readonly<Partial<Record<StateId, number>>>): string {
  return STATES.filter(s => (byState[s.id] ?? 0) > 0).map(s => (byState[s.id] as number) + ' ' + s.phrase).join(', ')
}

/** "1 session, 5 agents (2 editing, 1 running tests)" with the breakdown, "1 session, 5 agents" without. */
export function countLine(c: Counts, withBreakdown = true): string {
  const base = plural(c.sessions, 'session') + ', ' + plural(c.agents, 'agent')
  const b = c.agents > 0 && withBreakdown ? breakdownText(c.byState) : ''
  return b === '' ? base : base + ' (' + b + ')'
}
