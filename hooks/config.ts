// Cockpit's one configuration (pure: no mods API, no I/O). Everything that depends on the user's own setup is here: where the
// project is, where the agent files live, which tmux sessions are lanes and how a lane is told to be working or idle.
//
// The file is JSON, read from (later wins):
//   1. ~/.config/cockpit/config.json            for every project
//   2. <project root>/.cockpit/config.json      for this project
// Nothing has to exist: every key has a default, and a missing or broken file falls back to the defaults (a broken file adds a
// warning that /cockpit status prints). Documented in the README and in docs/PROTOCOL.md.

import { parseExtras } from './hosts.ts'
import type { HostSpec, ServiceSpec } from './hosts.ts'

export type LaneKind = 'tmux' | 'codex' | 'opencode' | 'local'
export const LANE_KINDS: readonly LaneKind[] = ['tmux', 'codex', 'opencode', 'local']

export type LaneSpec = { name: string; kind: LaneKind }
/** Regular expression sources. A lane is working when any of the last lines of its pane matches a `working` marker, unless an `idle` marker matches the last non-empty line. */
export type KindMarkers = { working: string[]; idle: string[] }

export type Config = {
  /** The project the session runs in (git root or folder). */
  root: string
  /** The folder the agent files live in; every other path below defaults to a name inside it. */
  dataDir: string
  claimsDir: string
  statusFile: string
  reportsDir: string
  briefsDir: string
  inboxDir: string
  awayLog: string
  presenceFile: string
  locksDir: string
  progressDir: string
  /** The git repositories whose unsaved work the status line sums (default: the project root). */
  repos: string[]
  /** Lanes by name. A tmux session called codex-*, opencode-* or local-* is a lane of that kind without being listed. */
  lanes: LaneSpec[]
  discoverLanes: boolean
  markers: Record<LaneKind, KindMarkers>
  /** A regular expression for the command that runs your gate (tests, type-check, lint in one script); a line that names it is read as a gate run. */
  gateCommand: string
  /** Other computers the System card also shows, one gauge group each, read through ssh (none by default: nothing is probed). */
  hosts: HostSpec[]
  /** Web addresses the System card checks, up or down with their time (none by default: nothing is probed). */
  services: ServiceSpec[]
  /** What was wrong with the config file (shown by /cockpit status). */
  warnings: string[]
  /** Which files were read. */
  sources: string[]
}

export const DEFAULT_MARKERS: Record<LaneKind, KindMarkers> = {
  // Claude Code in a tmux session shows "esc to interrupt" under the input box while it works.
  tmux: { working: ['esc to interrupt'], idle: [] },
  codex: { working: ['Working', 'esc to interrupt'], idle: [] },
  opencode: { working: ['esc interrupt'], idle: [] },
  // A local model has no fixed footer: these are common ones; set your own under markers.local.
  local: { working: ['esc to interrupt', 'Generating', 'Thinking'], idle: [] },
}

export const DEFAULT_GATE_COMMAND = '(?:check|verify|ci)\\.sh'
let gateSource = DEFAULT_GATE_COMMAND
/** The gate command pattern in use (config.ts sets it when the config loads). */
export const gateCommandSource = (): string => gateSource
export function setGateCommand(src: string): void {
  try {
    new RegExp(src)
    gateSource = src
  } catch {
    gateSource = DEFAULT_GATE_COMMAND
  }
}

export const CONFIG_FILE_NAME = 'config.json'
export const PROJECT_CONFIG_DIR = '.cockpit'

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const strs = (v: unknown): string[] | null => (Array.isArray(v) && v.every(x => typeof x === 'string') ? (v as string[]).map(s => s.trim()).filter(s => s !== '') : null)

/** `p` as an absolute path: absolute stays, `~/x` is under `home`, anything else is under `base`. */
export function resolvePath(base: string, p: string, home: string): string {
  const b = base.replace(/\/+$/, '')
  const clean = (s: string): string => {
    const out: string[] = []
    for (const part of s.split('/')) {
      if (part === '' || part === '.') continue
      if (part === '..') out.pop()
      else out.push(part)
    }
    return '/' + out.join('/')
  }
  if (p.startsWith('/')) return clean(p)
  if (p === '~' || p.startsWith('~/')) return clean(home.replace(/\/+$/, '') + '/' + p.slice(2))
  return clean(b + '/' + p)
}

/** The folder Claude Code keeps a project's transcripts in, under `~/.claude/projects/`: the path with every non-alphanumeric character as a dash. */
export const transcriptFolderOf = (root: string): string => root.replace(/[^A-Za-z0-9]/g, '-')

type Layer = Record<string, unknown>

export function parseLayer(text: string | null, label: string, warnings: string[]): Layer {
  if (text === null) return {}
  try {
    const v: unknown = JSON.parse(text)
    if (isObj(v)) return v
    warnings.push(label + ': not a JSON object, ignored')
  } catch (e) {
    warnings.push(label + ': not valid JSON (' + String(e).replace(/^.*?: /, '').slice(0, 60) + '), ignored')
  }
  return {}
}

function lanesOf(v: unknown, warnings: string[]): LaneSpec[] | null {
  if (v === undefined) return null
  if (!Array.isArray(v)) {
    warnings.push('lanes: expected a list of {"name": ..., "kind": ...}, ignored')
    return null
  }
  const out: LaneSpec[] = []
  for (const x of v) {
    const name = isObj(x) ? str(x.name) : typeof x === 'string' ? str(x) : null
    const kind = isObj(x) && typeof x.kind === 'string' ? x.kind : 'tmux'
    if (name === null || !/^[\w.-]+$/.test(name)) {
      warnings.push('lanes: an entry has no usable name, skipped')
      continue
    }
    if (!(LANE_KINDS as readonly string[]).includes(kind)) {
      warnings.push('lanes: "' + name + '" has kind "' + kind + '"; use tmux, codex, opencode or local. Taken as tmux')
      out.push({ name, kind: 'tmux' })
      continue
    }
    out.push({ name, kind: kind as LaneKind })
  }
  return out
}

function markersOf(v: unknown, warnings: string[]): Record<LaneKind, KindMarkers> {
  const out: Record<LaneKind, KindMarkers> = {
    tmux: { working: [...DEFAULT_MARKERS.tmux.working], idle: [] },
    codex: { working: [...DEFAULT_MARKERS.codex.working], idle: [] },
    opencode: { working: [...DEFAULT_MARKERS.opencode.working], idle: [] },
    local: { working: [...DEFAULT_MARKERS.local.working], idle: [] },
  }
  if (v === undefined) return out
  if (!isObj(v)) {
    warnings.push('markers: expected an object by lane kind, ignored')
    return out
  }
  for (const kind of LANE_KINDS) {
    const k = v[kind]
    if (k === undefined) continue
    if (!isObj(k)) {
      warnings.push('markers.' + kind + ': expected {"working": [...], "idle": [...]}, ignored')
      continue
    }
    for (const field of ['working', 'idle'] as const) {
      if (k[field] === undefined) continue
      const list = strs(k[field])
      if (list === null) {
        warnings.push('markers.' + kind + '.' + field + ': expected a list of regular expressions, ignored')
        continue
      }
      const good = list.filter(src => {
        try {
          new RegExp(src)
          return true
        } catch {
          warnings.push('markers.' + kind + '.' + field + ': "' + src + '" is not a regular expression, skipped')
          return false
        }
      })
      out[kind][field] = good
    }
  }
  return out
}

function gateOf(v: unknown, warnings: string[]): string {
  const s = str(v)
  if (s === null) return DEFAULT_GATE_COMMAND
  try {
    new RegExp(s)
    return s
  } catch {
    warnings.push('gateCommand: "' + s + '" is not a regular expression, ignored')
    return DEFAULT_GATE_COMMAND
  }
}

/**
 * The configuration from the layers (global first, then the project's), the project root and the person's home folder.
 * `rootOverride` (the plugin option `root`) beats the file's own `root`.
 */
export function buildConfig(layers: { label: string; text: string | null }[], sessionRoot: string, home: string, rootOverride = ''): Config {
  const warnings: string[] = []
  const sources: string[] = []
  let merged: Layer = {}
  for (const l of layers) {
    const layer = parseLayer(l.text, l.label, warnings)
    if (l.text !== null) sources.push(l.label)
    merged = { ...merged, ...layer }
  }
  const rootRaw = rootOverride !== '' ? rootOverride : str(merged.root) ?? '.'
  const root = resolvePath(sessionRoot, rootRaw, home)
  const dataDir = resolvePath(root, str(merged.dataDir) ?? PROJECT_CONFIG_DIR, home)
  const inData = (key: string, def: string): string => resolvePath(dataDir, str(merged[key]) ?? def, home)
  const reposList = strs(merged.repos)
  const lanes = lanesOf(merged.lanes, warnings) ?? []
  const extras = parseExtras(merged, warnings)
  return {
    root,
    dataDir,
    claimsDir: inData('claimsDir', 'claims'),
    statusFile: inData('statusFile', 'status.json'),
    reportsDir: inData('reportsDir', 'reports'),
    briefsDir: inData('briefsDir', 'briefs'),
    inboxDir: inData('inboxDir', 'inbox'),
    awayLog: inData('awayLog', 'away-log.md'),
    presenceFile: inData('presenceFile', 'presence.json'),
    locksDir: inData('locksDir', 'locks'),
    progressDir: inData('progressDir', 'progress'),
    repos: (reposList !== null && reposList.length > 0 ? reposList : ['.']).map(r => resolvePath(root, r, home)),
    lanes,
    discoverLanes: typeof merged.discoverLanes === 'boolean' ? merged.discoverLanes : true,
    markers: markersOf(merged.markers, warnings),
    gateCommand: gateOf(merged.gateCommand, warnings),
    hosts: extras.hosts,
    services: extras.services,
    warnings,
    sources,
  }
}

/** Where the layers are read from, in order. */
export const configPathsOf = (root: string, home: string): { label: string; path: string }[] => [
  { label: '~/.config/cockpit/config.json', path: home.replace(/\/+$/, '') + '/.config/cockpit/' + CONFIG_FILE_NAME },
  { label: PROJECT_CONFIG_DIR + '/' + CONFIG_FILE_NAME, path: root.replace(/\/+$/, '') + '/' + PROJECT_CONFIG_DIR + '/' + CONFIG_FILE_NAME },
]

// ---------------------------------------------------------------------------
// The compiled markers, kept at module level: the lane classifiers (core.ts) read them, register.tsx sets them when the config loads.

type Compiled = { working: RegExp[]; idle: RegExp[] }
const compile = (m: KindMarkers): Compiled => ({ working: m.working.map(s => new RegExp(s)), idle: m.idle.map(s => new RegExp(s)) })
let compiled: Record<LaneKind, Compiled> = {
  tmux: compile(DEFAULT_MARKERS.tmux),
  codex: compile(DEFAULT_MARKERS.codex),
  opencode: compile(DEFAULT_MARKERS.opencode),
  local: compile(DEFAULT_MARKERS.local),
}

export function setMarkers(m: Record<LaneKind, KindMarkers>): void {
  compiled = { tmux: compile(m.tmux), codex: compile(m.codex), opencode: compile(m.opencode), local: compile(m.local) }
}

/** Working or idle for a lane of `kind` from the last lines of its pane, by the configured markers. */
export function markersSay(kind: LaneKind, lines: readonly string[]): 'working' | 'idle' {
  const c = compiled[kind]
  let last = ''
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = (lines[i] ?? '').trim()
    if (t !== '') {
      last = t
      break
    }
  }
  if (last !== '' && c.idle.some(re => re.test(last))) return 'idle'
  return lines.some(l => c.working.some(re => re.test(l))) ? 'working' : 'idle'
}

// ---------------------------------------------------------------------------
// The empty state: what the pane says when there is nothing to show, because no file the protocol names exists yet.

export type EmptyFacts = { crew: number; hasStatus: boolean; claims: number; reports: number; inbox: number }

export const isEmptyWorld = (f: EmptyFacts): boolean => f.crew === 0 && !f.hasStatus && f.claims === 0 && f.reports === 0 && f.inbox === 0

/** The lines of the empty-state card: what Cockpit looks for and what to create. Paths are shown relative to the project root when they are inside it. */
export function emptyStateLines(cfg: Config): string[] {
  const rel = (p: string): string => (p === cfg.root ? '.' : p.startsWith(cfg.root + '/') ? p.slice(cfg.root.length + 1) : p)
  return [
    'Nothing to show yet. Cockpit only shows what your agents write.',
    'Create ' + rel(cfg.statusFile) + ' (updated, milestone, done, total, now, next, you) for the Status card.',
    'Have a worker agent write ' + rel(cfg.claimsDir) + '/<ITEM>.claim and ' + rel(cfg.reportsDir) + '/<ITEM>-report.md for the crew and the Flight log.',
    'Name a tmux session codex-<x>, opencode-<x> or local-<x>, or list it under "lanes" in ' + rel(cfg.dataDir) + '/' + CONFIG_FILE_NAME + '.',
    'Formats and a paste-in CLAUDE.md block: docs/PROTOCOL.md.',
  ]
}
