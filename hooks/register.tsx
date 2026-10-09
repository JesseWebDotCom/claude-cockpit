import type { EngineInterface, On, Register } from 'claude-code'

import {
  ageLabel,
  briefHeading,
  buildItems,
  buildRow,
  classifyKind,
  classifyLane,
  describeLane,
  describeSession,
  describeSub,
  fin,
  fmtTime,
  fmtTokens,
  HOUR_MS,
  isOpencodeLane,
  isRunning,
  itemFamily,
  itemId,
  lastLines,
  newestFile,
  oneLine,
  parseCodexLimits,
  parseFooterWeekly,
  parseLock,
  parseProgress,
  progressIsNewer,
  progressRatio,
  trackChange,
} from './core.ts'
import type { CodexLimits, Item, ItemBriefIn, ItemLockIn, ItemReportIn, LaneRow, Lock, Progress, Seen, SubRow } from './core.ts'
import {
  awayLabel,
  backlogSummary,
  backlogTop,
  buildHandoff,
  contextPressure,
  creditsLines,
  ctxBarLabel,
  ctxPercent,
  diskColor,
  gateExit,
  gateScope,
  reportGateExit,
  handoffName,
  hasBlocking,
  healthSummary,
  inboxAddLine,
  inboxNewCount,
  inboxSummary,
  landedSummary,
  localDate,
  newInboxItems,
  parseAwayLog,
  parseBacklog,
  parseCredits,
  parseHttpCode,
  parseInbox,
  parseLanded,
  parsePresence,
  parseSessionUsage,
  parseStatus,
  presenceText,
  queueItems,
  queueSummary,
  statusAge,
  statusCount,
  statusRatio,
} from './board.ts'
import type { AwayEntry, Backlog, Credits, Dot, InboxItem, Presence, SessionUsage, Status } from './board.ts'
import {
  ACTIVITY_COLOR,
  WAIT_AMBER,
  statusWordOf,
  rowToneOf,
  shortTarget,
  actionLogLine,
  activityOf,
  activityPill,
  allEdges,
  blockedBy,
  buildGraph,
  discoverCrew,
  laneKindOf,
  edgeIsFaded,
  erroredOf,
  exhaustedOf,
  groupOf,
  isStuck,
  ORDER_RULE,
  orderCrew,
  refusalOf,
  localModelFromPs,
  modelFromPsArgs,
  paneModel,
  parseCrewArgs,
  parseDeps,
  parseTargets,
  planAction,
  poweredCloud,
  poweredCodex,
  poweredLocal,
  poweredOpencode,
  poweredSession,
  poweredSub,
  sessionTarget,
  targetOf,
  waitsForGate,
} from './crew.ts'
import { crewSummary } from './crew.ts'
import { outageOf, outageCounts, type Outage } from './outage.ts'
import { creditIcons, type CreditIcon } from './credit.ts'
import type { ActionName, CrewKind, Edge, Errored, Exhaustion, Graph, OrderState, Powered, ProviderModel, Targets } from './crew.ts'
import { castH, castSvg, compactSvg, shortTag, COMPACT_H } from './draw.ts'
import type { Badge, DrawMode } from './draw.ts'
import { STATUS_FIELDS, bandPx, fieldCanOpen, fieldItems } from './look.ts'
import type { StatusField } from './look.ts'
import { deriveLive } from './statuslive.ts'
import { doingLineOf, doingOf, itemLineOf, lastReportOf, paneDoingOf, taskLineOf, wrapChars } from './doing.ts'
import { DOING_LINES, DOING_WIDTH } from './details.ts'
import type { Doing } from './doing.ts'
import { bandFit, bandLogLine, estimateRows } from './bandfit.ts'
import type { BandLevel } from './bandfit.ts'
import { modelOfPowered, providerOfKind, summaryFull } from './summary.ts'
import { briefItem, captainItem, parseClaim, pickRunLane, resolveLaneItem } from './laneitem.ts'
import { atShellPrompt } from './shellprompt.ts'
import { AUTOPILOT, AUTOPILOT_H, AUTOPILOT_W, CAPTAIN_FILE, autopilotAlt, autopilotMessage, autopilotSvg, autopilotWord, captainLine, fallbackToastFor, inboxMessage, sentToast } from './autopilot.ts'
import { sameItem } from './statuslive.ts'
import type { Claim, LiveStatus } from './statuslive.ts'
import { borderFor, GROUP_H, cardHeight, cardSvg, statusHeight as lookStatusHeight, PROGRESS_H, progressSvg, groupSvg2, STRIP_H, groupSvg, itemHeight, itemSvg, limitsHeight, limitsSvg, rowHeight, rowSvg, sleepersSvg, statusSvg as lookStatusSvg } from './look.ts'
import type { DetailBar, DetailLine, LookRow, LookStatus } from './look.ts'
import { ROW_HEIGHT } from './tokens.ts'
import {
  graphHeight,
  graphSvg,
  ITEM_STATUS_COLOR,
  ITEM_STATUS_LABEL,
  itemRowHeight,
  itemRowSvg,
  limitsAlt,
  listCardSvg,
  listHeight,
  systemCardSvg,
  systemHeight,
  wrapCardSvg,
  wrapHeight,
} from './cards.ts'
import {
  apiLimitOf,
  backText,
  claudePool,
  codexPool,
  creditView,
  creditViews,
  parseCreditsFile,
  poolState,
  poolSummary,
  poolsLine,
  usedColor,
} from './limits.ts'
import type { CreditsFile, Pool } from './limits.ts'
import { contextCard, memberCard, memberDetail, shortName, systemCard, systemDots } from './details.ts'
import type { MemberCardIn } from './details.ts'
import { setTheme, themeFromSetting } from './tokens.ts'
import { BAND_ICON, BAND_ICON_CELL, PRESS_GLYPH, apiRow, apiText, claudeRow, cloudRow, codexRow, localRow, stripOf, systemRow } from './pools.ts'
import { glyphDoc } from './glyphs.ts'
import { applyManual, asOfText, claudeWindows, debugLine, emptyCache, mergeLive, parseUsageArgs, parseUsageCache, serializeUsageCache } from './usage.ts'
import type { Source, UsageCache } from './usage.ts'
import type { PoolId, PoolRow, Strip, StripGroup } from './pools.ts'
import { IDLE_TICK_MS, TICK_MS, briefLabelOf, fileBusy, mainIsBusy, paneChangedRecently, parseEtime, parsePgrep, parseSessionEntry, pollDue, redrawDue } from './live.ts'
import type { OpencodeRun, SessionEntry } from './live.ts'
import { costArgv, costSince, monthStartUtcMs, parseBuckets, parseSpend, spendArgv } from './spend.ts'
import type { Bucket, CostWindow, Spend } from './spend.ts'
import { TABS, plainBandText, PRESENCE_SWITCH, burstNow, chipNow, landEvents, milestoneEvent, parseUi, pruneCelebrations, serializeUi, windowBlocks, ROW_PX, defaultUi } from './ui.ts'
import type { Block, Celebration, TabId, UiState } from './ui.ts'
import type { GraphSprite, ItemRowIn, ListRow, WrapEntry } from './cards.ts'
import {
  LEVEL_COLOR,
  emptyReading,
  gaugesOf,
  healthIcons,
  parseCores,
  parseDf,
  parseFreeM,
  parseLoadAvg,
  parseMemoryPressure,
  parseNvidia,
  parseSwapUsedMB,
  parseTopMemory,
  systemSummary,
  topLine,
} from './system.ts'
import type { HealthIcon, HostReading, SystemReading } from './system.ts'
import { hostCommand, serviceCommand, serviceFrom, serviceRunMs, serviceWord } from './hosts.ts'
import type { ServiceState } from './hosts.ts'
import { SPRITES } from './sprites.ts'
import type { Activity } from './sprites.ts'
// Cockpit 0.5.0: the Flight log, the Black box, the bug and idea files, and the cards' drawings.
import { BOX_COLLAPSED, blackBoxRows, blackBoxSummary } from './blackbox.ts'
import { FLIGHT_EXPANDED, FLIGHT_READ, FLIGHT_SHOWN, STATUS_WORD, crewEntries, flightRows, flightSummary, parseReport } from './flightlog.ts'
import type { CrewTrouble, FlightEntry } from './flightlog.ts'
import { blackBoxHeight, blackBoxSvg, flightHeight, flightSvg } from './flightsvg.ts'
import { inboxKindOf, inboxMdFile, inboxMdLine, promptStarter, typeHint } from './inboxmd.ts'
import type { InboxKind } from './inboxmd.ts'
// v14 (0.4.0): the Deck. Every rule is in these pure files; this file only hooks the events and draws.
import { effectiveLayout, effectiveMotion, effectivePanels, emptyView, normalizeView, parseDeckArgs, parseDeckConfig, resolveLayout, visiblePanels, DECK_USAGE, MINI_ROWS } from './deckconfig.ts'
import type { DeckConfig, DeckView } from './deckconfig.ts'
import { deckOnAgentComplete, deckOnAgentStep, deckOnCheck, deckOnCompact, deckOnLanes, deckOnMainComplete, deckOnMainStep, deckOnMeasure, deckOnMode, deckOnSpawn, deckOnToolCall, deckOnTurnStart, closeConsult, emptyDeck, lanesWorking, openConsult, panelFactsOf, resetDeck, scrollLog, statusFactsOf, toggleExpanded, toggleGate, toggleLogOpen } from './deckstate.ts'
import type { Deck } from './deckstate.ts'
import { drawDeck } from './deckview.ts'
import { setShellUser } from './core.ts'
import { buildConfig, configPathsOf, emptyStateLines, isEmptyWorld, resolvePath, setGateCommand, setMarkers, transcriptFolderOf } from './config.ts'
import type { Config } from './config.ts'
import { UNSAVED_EVERY_MS, gitCommands, sumUnsaved, unsavedText } from './unsaved.ts'
import type { RepoReading } from './unsaved.ts'
import { LOG_EXPANDED, LOG_SHOWN } from './sessionlog.ts'
import { flowOf } from './motion.ts'
import { paletteOf } from './tokens.ts'

// ---------------------------------------------------------------------------
// Constants: every path and name this mod reads or writes lives here.

// The configuration (config.ts) decides every path. They are `let`s so a changed config file is picked up (applyConfig) without a reload.
let cfg: Config = buildConfig([], '/', '/')
let REPO_ROOT = cfg.root
let DATA = cfg.dataDir
let LOCK_DIR = cfg.locksDir
let PROGRESS_DIR = cfg.progressDir
let QUEUE_DIR = cfg.briefsDir
let REPORTS_DIR = cfg.reportsDir
let CLAIMS_DIR = cfg.claimsDir
let STATUS_PATH = cfg.statusFile
let PRESENCE_PATH = cfg.presenceFile
let AWAY_LOG_PATH = cfg.awayLog
let CREDITS_PATH = ''
let UI_PATH = ''
let USAGE_CACHE_PATH = ''
let USAGE_DEBUG_PATH = ''
let TARGETS_PATH = ''
let DEPS_PATH = ''
let INBOX_PATH = ''
let INBOX_DIR = cfg.inboxDir
let ACTIONS_LOG_PATH = ''
let HANDOFF_DIR = ''
let BACKLOG_PATH = ''
let DECK_VIEW_PATH = ''
let LOG_DIR = ''
// Under $HOME. Read only: the newest Codex session log's tail (rate limits), and the live Claude session's (the folder is the project root with every
// non-alphanumeric character as a dash).
const CODEX_SESSIONS_SUBDIR = '/.codex/sessions'
let CLAUDE_PROJECT_SUBDIR = '/.claude/projects/' + transcriptFolderOf(cfg.root)

function applyConfig(c: Config): void {
  cfg = c
  REPO_ROOT = c.root
  DATA = c.dataDir
  LOCK_DIR = c.locksDir
  PROGRESS_DIR = c.progressDir
  QUEUE_DIR = c.briefsDir
  REPORTS_DIR = c.reportsDir
  CLAIMS_DIR = c.claimsDir
  STATUS_PATH = c.statusFile
  PRESENCE_PATH = c.presenceFile
  AWAY_LOG_PATH = c.awayLog
  INBOX_DIR = c.inboxDir
  // What the mod keeps for itself, beside the agent files.
  CREDITS_PATH = c.dataDir + '/credits.json'
  UI_PATH = c.dataDir + '/state/ui.json'
  USAGE_CACHE_PATH = c.dataDir + '/state/usage-cache.json'
  DECK_VIEW_PATH = c.dataDir + '/state/deck.json'
  LOG_DIR = c.dataDir + '/logs'
  USAGE_DEBUG_PATH = LOG_DIR + '/usage-debug.log'
  ACTIONS_LOG_PATH = LOG_DIR + '/actions.log'
  TARGETS_PATH = c.dataDir + '/targets.json'
  DEPS_PATH = c.dataDir + '/deps.json'
  INBOX_PATH = c.dataDir + '/inbox.jsonl'
  HANDOFF_DIR = c.dataDir + '/handoffs'
  BACKLOG_PATH = c.dataDir + '/backlog.md'
  CLAUDE_PROJECT_SUBDIR = '/.claude/projects/' + transcriptFolderOf(c.root)
  setMarkers(c.markers)
  setGateCommand(c.gateCommand)
}

/** Use a project root without reading any file (tests, and a host that has no `session.root`). */
export function useProject(root: string, home = '/home/alex', repos: string[] = [], extra: Record<string, unknown> = {}): void {
  const layer = { ...(repos.length > 0 ? { repos } : {}), ...extra }
  applyConfig(buildConfig(Object.keys(layer).length > 0 ? [{ label: 'test', text: JSON.stringify(layer) }] : [], root, home))
}

// Test hooks: read this computer and the listed hosts, and the listed services, through a given engine; put a reading in the page's snapshot.
export const probesForTest = { readSystem: (...a: Parameters<typeof readSystem>) => readSystem(...a), readHealth: (...a: Parameters<typeof readHealth>) => readHealth(...a) }
export function setReadingsForTest(system: SystemState, health: Snapshot['health']): void {
  snapshot = { ...snapshot, system, health }
}

/** A path shown to the person: relative to the project root when it is inside it. */
const relPath = (p: string): string => (p.startsWith(cfg.root + '/') ? p.slice(cfg.root.length + 1) : p)

let configText = ''
// The plugin option `root` (empty: the session's project root).
let rootOption = ''
// Read the config layers and apply them when they changed. `home` and `sessionRoot` come from the engine; `rootOption` is the plugin option `root`.
async function loadConfig($: EngineInterface): Promise<void> {
  try {
    const home = (await $.env.get('HOME')) ?? ''
    const user = (await $.env.get('USER')) ?? ''
    setShellUser(user)
    const sessionRoot = await $.session.root().catch(() => '/')
    const root0 = resolvePath(sessionRoot, rootOption !== '' ? rootOption : '.', home)
    const layers: { label: string; text: string | null }[] = []
    const first = configPathsOf(root0, home)[0]
    const second = configPathsOf(root0, home)[1]
    if (first !== undefined) layers.push({ label: first.label, text: await readText($, first.path) })
    if (second !== undefined) layers.push({ label: second.label, text: await readText($, second.path) })
    const key = JSON.stringify([sessionRoot, home, rootOption, layers])
    if (key === configText) return
    configText = key
    applyConfig(buildConfig(layers, sessionRoot, home, rootOption))
  } catch {
    // The defaults stay.
  }
}

const CLAUDE_PROJECTS_SUBDIR = '/.claude/projects'
const SQLITE_TIMEOUT_MS = 3000
const COST_EVERY_MS = 60000
const COST_TIMEOUT_MS = 150000
const COST_BATCH = 25

const PANE = 'crew'
// the Captain's word when it is not working, and its chip colour (blue: awake, in colour).
export const CAPTAIN_IDLE_WORD = 'idle'
export const CAPTAIN_IDLE_HEX = '#2F81F7'
const PANE_TITLE = 'Cockpit'
const SLOW_EVERY_MS = 30000
const USAGE_EVERY_MS = 15000
const SYSTEM_EVERY_MS = 15000
const HOSTS_EVERY_MS = 60000
const DAY_MS = 24 * 60 * 60 * 1000
const SSH_EVERY_MS = 60000
const PS_EVERY_MS = 15000
const TAIL_BYTES = 200000
const PANE_LINES = 40
const TMUX_TIMEOUT_MS = 4000
const GIT_TIMEOUT_MS = 8000
const MAX_SUBAGENTS = 5
const PANE_ROWS = 44
const CONFIRM_TTL_MS = 120000

// ---------------------------------------------------------------------------
// State: module level, so it resets on reload; the timers in session.start refill it.

// One crew member as the panel shows it.
type Member = {
  name: string
  kind: CrewKind
  variant: number
  row: LaneRow
  activity: Activity
  target: string
  powered: Powered
  heading: string
  desc: string
  progress: Progress | null
  isStuck: boolean
  lockMtimeMs: number | null
  // The member itself broke (session died, auth or API error): a red chip with its short reason.
  errored: Errored
  // COCKPIT-31: its account refused it (out of credit, rate limited, key refused), judged from its latest output.
  outage: Outage | null
  // Its pool is exhausted (Codex week or 5h at 100%, a credit at 0 or expired, a refusal in the pane): dimmed.
  exhaustion: Exhaustion
  lockOwner: string
  lockAgeMs: number | null
  // v11: the item this lane owns now, from live evidence only ('' shows nothing), and what its pane says it is doing.
  itemId: string
  doing: Doing | null
  // what the lane itself reported (a PROGRESS or REPORT line, its progress file, its item's newest report file); '' = none, the row is omitted.
  lastReport: string
  // the item of this lane's own claim when the lane is idle and the claim is over 6 hours old ('' for none): shown amber as "stale claim: <ITEM>", never as work.
  staleClaim: string
  // line 3 of this lane's claim file (a short plain title), '' for none.
  claimTitle: string
  // the claim's `now:` line and the newest plain pane line (both through plainTitle), for the open card's "Doing".
  claimNow: string
  paneDoing: string
}

type Landed = { hash: string; subject: string; gate: number | null }

// This computer and each listed host (config `hosts`), as last read (this computer every 15 s; the hosts every 60 s).
type SystemState = { at: number; reading: SystemReading; hosts: HostReading[]; hostsAt: number }

type Snapshot = {
  at: number
  crew: Member[]
  subs: SubRow[]
  status: Status | null
  presence: Presence
  awayLog: AwayEntry[]
  inbox: InboxItem[]
  edges: Edge[]
  lockItems: Map<string, string>
  lockTimes: { item: string; mtimeMs: number | null }[]
  usage: SessionUsage | null
  // The windows the engine's last API response reported for this Claude plan ($.session.usage().rateLimits).
  rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[]
  // OpenCode's measured spend on the Claude API (since the credit start, or all time without one); null = unread.
  // OpenCode's measured spend on the Claude API for THIS calendar month (UTC), read from its own database (v9).
  apiSpend: { measured: Spend | null; state: 'unread' | 'ok' | 'unreadable' }
  // The dollar estimate per Claude window (API rates), or null until the scan has run.
  cost: { five: CostWindow | null; week: CostWindow | null } | null
  // A local model server is up (a local lane's ps shows llama-server), down, or unknown (no local lane).
  localUp: boolean | null
  // .cockpit/credits.json, read only.
  creditsFile: CreditsFile | null
  handoffMtimeMs: number | null
  limits: CodexLimits | null
  footerWeek: number | null
  queue: { items: { id: string; heading: string }[]; total: number }
  backlog: Backlog | null
  landed: Landed[]
  health: { at: number; services: ServiceState[]; credits: Credits | null }
  reportNames: Set<string>
  // For the "By item" view: every lock file, the briefs, the reports of the last 24 h.
  allLocks: ItemLockIn[]
  briefs: ItemBriefIn[]
  itemReports: ItemReportIn[]
  // v17: the Flight log's reports, judged (flightlog.ts), newest first; the errored and blocked crew are added when it is drawn.
  flight: FlightEntry[]
  // v10: .cockpit/claims/*.claim with their times (an item a lane has taken), for the self-updating Status card.
  claims: Claim[]
  system: SystemState
  // A pane is waiting for the gate lock (for the "gate blocked by memory?" hint).
  gateWaiting: boolean
  note: string
}

const emptyPresence: Presence = { mode: 'active', since: '', sinceMs: null }

let snapshot: Snapshot = {
  at: 0,
  crew: [],
  subs: [],
  status: null,
  presence: emptyPresence,
  awayLog: [],
  inbox: [],
  edges: [],
  lockItems: new Map(),
  lockTimes: [],
  usage: null,
  rateLimits: [],
  apiSpend: { measured: null, state: 'unread' },
  cost: null,
  localUp: null,
  creditsFile: null,
  handoffMtimeMs: null,
  limits: null,
  footerWeek: null,
  queue: { items: [], total: 0 },
  backlog: null,
  landed: [],
  health: { at: 0, services: [], credits: null },
  reportNames: new Set(),
  allLocks: [],
  briefs: [],
  itemReports: [],
  flight: [],
  claims: [],
  system: { at: 0, reading: emptyReading, hosts: [], hostsAt: -Infinity },
  gateWaiting: false,
  note: 'waiting for the first poll',
}

const seenByMember = new Map<string, Seen>()
// What the mods API reports per subagent beyond agent.list(): model, tokens, start and end.
type Run = { startedAt: number; endedAt?: number; tokens: number; model: string }
const runs = new Map<string, Run>()
let inflight: Promise<void> | null = null

let targets: Targets = {}
let slowAt = -Infinity
let usageAt = -Infinity
let systemAt = -Infinity
let sshAt = -Infinity
let backlogCache: { mtimeMs: number; value: Backlog | null } | null = null
let lastOpencodeModel: ProviderModel | null = null
const psCache = new Map<string, { at: number; text: string }>()
const reportTextCache = new Map<string, { mtimeMs: number; text: string }>()

// The panel's own state. What is remembered across reloads (the tab, the view, "mine", the open sections, the
// celebrations toggle, the landed ids already celebrated) is `ui`, loaded from .cockpit/state/ui.json.
let ui: UiState = { ...defaultUi }
let selectedItem = ''
let isCompact = false
let isCastOpen = false
let castMode: DrawMode = 'work'
let isMainBusy = false
// Liveness (v9). The last time an event said a turn, tool or prompt is running (null: none, or it completed); this
// session's own entry in the sessions folder; the opencode runs and the pane first-sight times; the timer's marks.
let eventBusyAt: number | null = null
let sessionId = ''
let sessionIdAt = -Infinity
let sessionFile: { busy: boolean; sinceMs: number | null } | null = null
let sessionFileBusySince: number | null = null
const sessionEntryCache = new Map<string, { mtimeMs: number; entry: SessionEntry | null }>()
let opencodeRuns: OpencodeRun[] = []
let opencodeAt = -Infinity
let opencodeEtimeMs = new Map<number, number>()
const paneFirstSeen = new Map<string, number>()
let lastPollAt = -Infinity
let lastDrawAt = -Infinity
let lastStatusMtime: number | null = null
// v10: the folders the live Status card reads (claims, reports, lane locks); a moved time re-reads at once.
let liveMarks = ''
let forceLive = false
// v10: which Status card lines are open (NOW, NEXT, YOU); kept while the module lives, so while the panel is open and after.
const statusOpen = new Set<StatusField>()
let paneSurface = ''
// The set of open sections mirrors `ui.expanded`.
const expanded = new Set<string>()
// The scroll offset of the middle of the pane, in px (the Status card and the Limits area are pinned).
let midOffset = 0
// The crew order: each member's shown group, so a member moves only when its group changes for ~10 s.
let orderState: OrderState = new Map()
// Landings still celebrating (the burst for 2 s, the chip for 10 s).
let celebrations: Celebration[] = []
// The card open by click (where there is no hover): a member name, 'sys', 'ctx', or ''.
let openCard = ''
let helpOpen = false
let sleepersOpen = false
// The strip's open details card: a pool id ('claude', 'codex', ...) or ''.
// The one member row open in place (accordion): a member name, or 'this session'; '' for none.
let openRow = ''
// The Items groups that show every row instead of the first 12.
const itemsAll = new Set<string>()
// The Inbox's inline field: 'bug', 'idea' or ''.
let adding: '' | 'bug' | 'idea' = ''
let pending: { action: ActionName; name: string; confirm: string; at: number } | null = null
let replyLine = ''

// ---------------------------------------------------------------------------
// Readers. Reading is all the poll does: tmux list-sessions, capture-pane, display-message, ps, tail,
// git log (local refs only), curl and ssh for health, and file reads. Writes happen only on a command.

type Ran = { ok: boolean; code: number | null; stdout: string }

async function run($: EngineInterface, argv: string[], timeoutMs = TMUX_TIMEOUT_MS, stdin?: string): Promise<Ran> {
  try {
    const r = await $.process.run(argv, stdin === undefined ? { timeoutMs } : { timeoutMs, stdin })
    return { ok: r.exitCode === 0, code: r.exitCode, stdout: r.stdout }
  } catch {
    return { ok: false, code: null, stdout: '' }
  }
}

const tmux = ($: EngineInterface, args: string[]): Promise<Ran> => run($, ['tmux', ...args])

async function readText($: EngineInterface, path: string): Promise<string | null> {
  try {
    if (!(await $.fs.exists(path))) return null
    return await $.fs.read(path)
  } catch {
    return null
  }
}

async function mtimeOf($: EngineInterface, path: string): Promise<number | null> {
  try {
    const st = await $.fs.stat(path)
    return Number.isFinite(st.mtimeMs) ? st.mtimeMs : null
  } catch {
    return null
  }
}

// Append one line to a file without reading it: `tee -a` takes the text on stdin, so nothing is run.
async function appendLine($: EngineInterface, path: string, line: string, makeDir = true): Promise<boolean> {
  if (makeDir) await run($, ['mkdir', '-p', path.replace(/\/[^/]*$/, '')])
  return (await run($, ['tee', '-a', path], TMUX_TIMEOUT_MS, line)).ok
}

// Write a file the mod keeps (its folder is made when missing).
async function writeFile($: EngineInterface, path: string, text: string): Promise<void> {
  await run($, ['mkdir', '-p', path.replace(/\/[^/]*$/, '')])
  await $.fs.write(path, text)
}

async function readLock($: EngineInterface, name: string): Promise<{ lock: Lock | null; mtimeMs: number | null }> {
  const path = LOCK_DIR + '/' + name + '.lock'
  const text = await readText($, path)
  return text === null ? { lock: null, mtimeMs: null } : { lock: parseLock(text), mtimeMs: await mtimeOf($, path) }
}

async function readProgress($: EngineInterface, name: string): Promise<{ progress: Progress | null; mtimeMs: number | null }> {
  const path = PROGRESS_DIR + '/' + name + '.json'
  const text = await readText($, path)
  return text === null ? { progress: null, mtimeMs: null } : { progress: parseProgress(text), mtimeMs: await mtimeOf($, path) }
}

// Brief headings, read once per file version (path and mtime): the poll runs every 5 s.
const headings = new Map<string, { mtimeMs: number; heading: string }>()

async function headingOf($: EngineInterface, path: string, mtimeMs: number, item: string): Promise<string> {
  const key = path + '|' + item
  const hit = headings.get(key)
  if (hit !== undefined && hit.mtimeMs === mtimeMs) return hit.heading
  let heading = ''
  try {
    heading = briefHeading((await $.fs.read(path)).slice(0, 4000), item)
  } catch {
    heading = ''
  }
  headings.set(key, { mtimeMs, heading })
  return heading
}

async function readSubagents($: EngineInterface): Promise<SubRow[]> {
  try {
    const list = await $.agent.list()
    return list.map(a => {
      const r = runs.get(a.id)
      return {
        id: a.id,
        name: a.name || a.description || a.id,
        description: a.description || '',
        type: a.type,
        model: r?.model ?? '',
        status: a.status,
        tokens: r?.tokens,
        startedAt: r?.startedAt,
        endedAt: r?.endedAt,
      }
    })
  } catch {
    return []
  }
}

// The args of what runs in a member's pane, `ps -ww -o args=` for its tty; cached for 15 s.
async function psArgs($: EngineInterface, name: string, now: number): Promise<string> {
  const hit = psCache.get(name)
  if (hit !== undefined && now - hit.at < PS_EVERY_MS) return hit.text
  let text = ''
  const tty = await tmux($, ['display-message', '-p', '-t', '=' + name + ':', '#{pane_tty}'])
  const dev = tty.stdout.trim().replace(/^\/dev\//, '')
  if (tty.ok && /^[\w]+$/.test(dev)) text = (await run($, ['ps', '-ww', '-o', 'args=', '-t', dev])).stdout
  psCache.set(name, { at: now, text })
  return text
}

async function poweredOf($: EngineInterface, kind: CrewKind, name: string, lines: readonly string[], now: number): Promise<Powered> {
  if (kind === 'codex') return poweredCodex(paneModel(lines))
  if (kind === 'api') {
    const current = modelFromPsArgs(await psArgs($, name, now))
    if (current !== null) lastOpencodeModel = current
    return poweredOpencode(current, lastOpencodeModel)
  }
  if (kind === 'local') return poweredLocal(localModelFromPs(await psArgs($, name, now)))
  if (kind === 'cloud') return poweredCloud('')
  return { text: '', isDim: false, badge: '' }
}

async function dirsDesc($: EngineInterface, path: string): Promise<string[]> {
  const entries = await $.fs.list(path)
  return entries
    .filter(e => e.kind === 'dir')
    .map(e => e.name)
    .sort((a, b) => b.localeCompare(a))
}

// The newest *.jsonl files (by mtime) of the newest non-empty day folder, YYYY/MM/DD.
async function newestSessionFiles($: EngineInterface, root: string): Promise<string[]> {
  for (const y of (await dirsDesc($, root)).slice(0, 2)) {
    for (const m of (await dirsDesc($, root + '/' + y)).slice(0, 3)) {
      for (const d of (await dirsDesc($, root + '/' + y + '/' + m)).slice(0, 3)) {
        const dir = root + '/' + y + '/' + m + '/' + d
        const logs = (await $.fs.list(dir)).filter(e => e.kind === 'file' && e.name.endsWith('.jsonl'))
        if (logs.length === 0) continue
        const stats = await Promise.all(logs.map(async f => ({ path: dir + '/' + f.name, mtimeMs: (await $.fs.stat(dir + '/' + f.name)).mtimeMs })))
        return stats.sort((a, b) => b.mtimeMs - a.mtimeMs).map(s => s.path)
      }
    }
  }
  return []
}

// Reads only the last TAIL_BYTES of a log, through tail, and keeps the rate_limits numbers.
async function readCodexLimits($: EngineInterface): Promise<CodexLimits | null> {
  try {
    const home = await $.env.get('HOME')
    if (!home) return null
    const files = await newestSessionFiles($, home + CODEX_SESSIONS_SUBDIR)
    for (const file of files.slice(0, 2)) {
      const r = await run($, ['tail', '-c', String(TAIL_BYTES), file])
      if (!r.ok) continue
      const found = parseCodexLimits(r.stdout)
      if (found !== null) return found
    }
    return null
  } catch {
    return null
  }
}

// The live session's context numbers and model: the last 200 KB of the newest *.jsonl in its project
// folder. Only the usage counts and the model id are kept. Read only; nothing is sent anywhere.
async function readSessionUsage($: EngineInterface): Promise<SessionUsage | null> {
  try {
    const home = await $.env.get('HOME')
    if (!home) return null
    const dir = home + CLAUDE_PROJECT_SUBDIR
    const files = (await $.fs.list(dir)).filter(e => e.kind === 'file' && e.name.endsWith('.jsonl'))
    const stats = await Promise.all(files.map(async f => ({ path: dir + '/' + f.name, mtimeMs: (await mtimeOf($, dir + '/' + f.name)) ?? Number.NaN })))
    const newest = newestFile(stats)
    if (newest === null) return null
    const r = await run($, ['tail', '-c', String(TAIL_BYTES), newest.path])
    return r.ok ? parseSessionUsage(r.stdout) : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Liveness (v9): cheap reads only. This session's own entry in ~/.claude/sessions/<pid>.json (a file is read again
// only when its mtime moved), `pgrep` for opencode runs, and the pane first-sight times. No transcript is scanned.

const CLAUDE_SESSIONS_SUBDIR = '/.claude/sessions'
const OPENCODE_EVERY_MS = 5000

async function readMainState($: EngineInterface, now: number): Promise<void> {
  const before = isMainBusy
  try {
    if (sessionId === '' || now - sessionIdAt >= 30000) {
      sessionId = (await $.session.id()) ?? ''
      sessionIdAt = now
    }
    const home = await $.env.get('HOME')
    if (home) {
      const dir = home + CLAUDE_SESSIONS_SUBDIR
      const names = (await $.fs.list(dir)).filter(e => e.kind === 'file' && e.name.endsWith('.json')).map(e => e.name)
      const entries: SessionEntry[] = []
      for (const name of names) {
        const mtimeMs = await mtimeOf($, dir + '/' + name)
        const hit = sessionEntryCache.get(name)
        let entry: SessionEntry | null
        if (hit !== undefined && hit.mtimeMs === mtimeMs) entry = hit.entry
        else {
          const text = await readText($, dir + '/' + name)
          entry = text === null ? null : parseSessionEntry(text)
          sessionEntryCache.set(name, { mtimeMs: mtimeMs ?? Number.NaN, entry })
        }
        if (entry !== null) entries.push(entry)
      }
      for (const k of [...sessionEntryCache.keys()]) if (!names.includes(k)) sessionEntryCache.delete(k)
      const mine = fileBusy(entries, sessionId)
      if (mine !== null && mine.busy && (sessionFile === null || !sessionFile.busy)) sessionFileBusySince = mine.sinceMs ?? now
      if (mine === null || !mine.busy) sessionFileBusySince = null
      sessionFile = mine
    }
  } catch {
    // Not readable: nothing is known from the file; the events still say.
  }
  isMainBusy = mainIsBusy({ eventBusyAt, fileBusy: sessionFile === null ? null : sessionFile.busy, now })
  if (isMainBusy !== before) $.ui.invalidate('ui.render')
}

// When this session's current busy stretch began: the earlier of what the file and the events say; null when idle.
function mainBusySince(): number | null {
  if (!isMainBusy) return null
  const starts = [sessionFile?.busy ? sessionFileBusySince : null, eventBusyAt].filter((x): x is number => x !== null)
  return starts.length === 0 ? null : Math.min(...starts)
}

// A turn, tool or prompt event says the main session is busy now; `false` (a turn completed) says it is not.
async function noteMain($: EngineInterface, busy: boolean): Promise<void> {
  const now = await $.clock.now()
  const before = isMainBusy
  eventBusyAt = busy ? now : null
  isMainBusy = mainIsBusy({ eventBusyAt, fileBusy: sessionFile === null ? null : sessionFile.busy, now })
  if (isMainBusy !== before) $.ui.invalidate('ui.render')
}

// `pgrep -fl "opencode run"`; a process seen for the first time gets its elapsed time from `ps -o etime=` once.
async function readOpencodeRuns($: EngineInterface, now: number): Promise<boolean> {
  const before = opencodeRuns.length > 0
  const r = await run($, ['pgrep', '-fl', 'opencode run'])
  opencodeRuns = r.ok ? parsePgrep(r.stdout) : []
  opencodeAt = now
  const alive = new Set(opencodeRuns.map(x => x.pid))
  for (const pid of [...opencodeEtimeMs.keys()]) if (!alive.has(pid)) opencodeEtimeMs.delete(pid)
  for (const x of opencodeRuns) {
    if (opencodeEtimeMs.has(x.pid)) continue
    const e = await run($, ['ps', '-o', 'etime=', '-p', String(x.pid)])
    const ms = e.ok ? parseEtime(e.stdout) : null
    opencodeEtimeMs.set(x.pid, now - (ms ?? 0))
  }
  return before !== opencodeRuns.length > 0
}

// An opencode run is the OpenCode member working. There may be no tmux session for it: then the member is made here
// ("opencode"), so "0 working" never shows while a run is up. The run belongs to ONE lane: the api lane whose pane
// shows the run's brief, else the first api lane; every other opencode lane keeps its own state (an earlier version
// gave the newest brief to all of them). Returns that lane's name, '' for no run.
async function applyOpencode($: EngineInterface, members: Member[], now: number, evidence: Map<string, { lines: string[] }>): Promise<string> {
  const top = opencodeRuns[0]
  if (top === undefined) return ''
  const startedAt = opencodeEtimeMs.get(top.pid) ?? now
  const sinceMs = Math.max(0, now - startedAt)
  const apis = members.filter(m => m.kind === 'api')
  // the run belongs to the lane whose pane shows it (the wrapped command line is unwrapped first); a lane at a shell prompt is
  // never given a run it does not show. With api lanes present and none showing the run, it belongs to no lane and none is marked working.
  const picked = pickRunLane(apis.map(m => ({ name: m.name, lines: evidence.get(m.name)?.lines ?? [] })), top.brief)
  if (apis.length > 0 && picked === '') return ''
  const chosen = apis.find(m => m.name === picked)
  const index = chosen === undefined ? -1 : members.indexOf(chosen)
  const base: Member =
    chosen !== undefined
      ? chosen
      : {
          name: 'opencode',
          kind: 'api',
          variant: 0,
          row: buildRow('opencode', 'working', null, [], undefined, now),
          activity: 'working',
          target: '',
          powered: await poweredOf($, 'api', 'opencode', [], now),
          heading: '',
          desc: '',
          itemId: '',
          doing: null,
          lastReport: '',
          staleClaim: '',
          claimTitle: '',
          claimNow: '',
          paneDoing: '',
          progress: null,
          isStuck: false,
          lockMtimeMs: null,
          errored: { errored: false, reason: '' },
          outage: null,
          exhaustion: { exhausted: false, backAtMs: null, why: '' },
          lockOwner: '',
          lockAgeMs: null,
        }
  const next: Member = {
    ...base,
    activity: 'working',
    errored: { errored: false, reason: '' },
    outage: null,
    isStuck: false,
    row: { ...base.row, state: 'working', sinceMs, tail: base.row.tail === '' ? 'opencode run' : base.row.tail },
  }
  if (index >= 0) members[index] = next
  else members.push(next)
  return next.name
}

// v11: each lane's item, its heading, its task text and what it is doing, from live evidence (hooks/laneitem.ts has the
// rules and the claim format); a lane with no live item shows none.
function headingForItem(item: string, briefs: readonly { name: string; heading: string }[]): string {
  if (item === '') return ''
  return briefs.find(b => sameItem(briefItem(b), item) || sameItem(briefLabelOf(b.name), item))?.heading ?? ''
}

function resolveItems(members: Member[], evidence: Map<string, { lines: string[]; lockItem: string; lockMtimeMs: number | null; fresh: Progress | null; tail: string; lastActivityMs: number }>, runLane: string, claims: readonly Claim[], now: number): void {
  const briefs = snapshot.briefs.map(b => ({ name: 'brief-' + b.id + '.md', heading: b.heading }))
  const run = opencodeRuns[0]
  members.forEach((m, i) => {
    const ev = evidence.get(m.name)
    const awake = m.activity !== 'sleeping'
    const isRun = run !== undefined && m.name === runLane
    const li = resolveLaneItem({
      lane: m.name,
      awake,
      lastActivityMs: ev?.lastActivityMs ?? null,
      paneLines: ev?.lines ?? [],
      lock: ev !== undefined && ev.lockItem !== '' ? { item: ev.lockItem, mtimeMs: ev.lockMtimeMs } : null,
      claims,
      runBrief: isRun ? run.brief : '',
      runStartedMs: isRun ? now - m.row.sinceMs : null,
      briefs,
      reports: snapshot.itemReports.map(r => ({ id: r.id, mtimeMs: r.mtimeMs })),
      landed: snapshot.landed.map(l => ({ hash: l.hash, subject: l.subject })),
      nowMs: now,
    })
    const heading = headingForItem(li.item, briefs)
    const paneDoing = awake ? paneDoingOf(ev?.lines ?? [], li.item) : ''
    members[i] = {
      ...m,
      itemId: li.isStale === true ? '' : li.item,
      staleClaim: li.isStale === true ? li.item : '',
      heading,
      target: li.item === '' || li.isStale === true ? '' : targetOf(li.item, heading, targets),
      doing: awake ? doingOf(ev?.lines ?? []) : null,
      claimTitle: li.item === '' || li.isStale === true ? '' : claims.find(c => sameItem(c.id, li.item) && (c.title ?? '') !== '')?.title ?? '',
      claimNow: li.item === '' || li.isStale === true ? '' : claims.find(c => sameItem(c.id, li.item) && (c.now ?? '') !== '')?.now ?? '',
      paneDoing,
      lastReport: lastReportOf({
        reportText: (() => {
          const r = li.item === '' ? undefined : snapshot.itemReports.find(x => sameItem(x.id, li.item))
          return r === undefined ? null : reportTextCache.get(r.id + '-report.md')?.text ?? null
        })(),
        item: li.item,
        paneLines: ev?.lines ?? [],
        progressLabel: ev?.fresh?.label ?? '',
        skip: paneDoing,
      }),
      // A pane at a shell prompt has no task text of its own: its tail is scrollback.
      desc: describeLane(null, li.isStale === true ? '' : heading !== '' ? heading : li.item, ev?.fresh ?? null, atShellPrompt(ev?.lines ?? []) ? '' : ev?.tail ?? m.row.tail),
    }
  })
}

// The person's theme (the engine's `theme` setting), so every drawing uses the dark or the light token set and
// never a default fill. No answer means "auto": the svg follows the system.
async function readTheme($: EngineInterface): Promise<void> {
  try {
    const row = (await $.config.list()).find(r => r.key === 'theme')
    setTheme(themeFromSetting(row?.value))
  } catch {
    setTheme('auto')
  }
}

// The Claude plan's windows (five_hour, seven_day) the last API response reported: the status line's figures.
// Empty off a subscription or before the first response; nothing is invented.
async function readRateLimits($: EngineInterface): Promise<Snapshot['rateLimits']> {
  return (await readUsageNow($)).rateLimits
}

// What this Claude session reports right now ($.session.usage(): the context and the rate-limit windows, the
// status line's figures). Empty off a subscription or before the first response; nothing is invented.
type ClaudeLive = { rateLimits: Snapshot['rateLimits']; tokens: number | null; window: number | null; model: string }
let claudeLive: ClaudeLive = { rateLimits: [], tokens: null, window: null, model: '' }

async function readUsageNow($: EngineInterface): Promise<{ rateLimits: Snapshot['rateLimits']; tokens: number | null; window: number | null }> {
  try {
    const u = await $.session.usage()
    const list = u?.rateLimits ?? []
    const c = u?.context
    return {
      rateLimits: list.filter(r => fin(r.percentUsed)).map(r => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt })),
      tokens: c !== undefined && fin(c.tokens) ? c.tokens ?? null : null,
      window: c !== undefined && fin(c.window) && c.window > 0 ? c.window : null,
    }
  } catch {
    return { rateLimits: [], tokens: null, window: null }
  }
}

// The usage cache (usage.ts): every reading that arrives is saved with its time; the last known value shows
// "as of HH:MM" when the live one is missing. The debug log says which API answered.
let usageCache: UsageCache = emptyCache
const lastDebug = new Map<Source, string>()

async function noteUsage($: EngineInterface, source: Source, r: { rateLimits: Snapshot['rateLimits']; tokens: number | null; window: number | null }, now: number): Promise<void> {
  const ctxPct = r.tokens !== null && r.window !== null && r.window > 0 ? Math.round((r.tokens * 100) / r.window) : null
  const key = JSON.stringify([r.rateLimits.map(x => x.kind + x.percentUsed), ctxPct])
  if (lastDebug.get(source) !== key) {
    lastDebug.set(source, key)
    await appendLine($, USAGE_DEBUG_PATH, debugLine(new Date(now).toISOString(), source, r.rateLimits, ctxPct))
  }
  const merged = mergeLive(usageCache, r.rateLimits, now)
  if (merged.changed) {
    usageCache = merged.cache
    try {
      await writeFile($, USAGE_CACHE_PATH, serializeUsageCache(usageCache))
    } catch {
      // The cache is a convenience: it stays in memory.
    }
  }
}

// The context the panel shows: the call's own figures (tokens over window) when it has them; the model id is
// the one thing only the transcript knows.
const claudeUsage = (): SessionUsage | null => (claudeLive.tokens !== null && claudeLive.window !== null ? { used: claudeLive.tokens, window: claudeLive.window, model: claudeLive.model } : null)

// Put what the call reported into the snapshot. True when something changed (a redraw is then due).
export function applyClaude(next: { rateLimits?: Snapshot['rateLimits']; tokens?: number | null; window?: number | null }): boolean {
  const before = JSON.stringify(claudeLive)
  if (next.rateLimits !== undefined && next.rateLimits.length > 0) claudeLive = { ...claudeLive, rateLimits: next.rateLimits }
  if (next.tokens !== undefined && next.tokens !== null && next.window !== undefined && next.window !== null) claudeLive = { ...claudeLive, tokens: next.tokens, window: next.window }
  if (JSON.stringify(claudeLive) === before) return false
  snapshot = { ...snapshot, rateLimits: claudeLive.rateLimits, usage: claudeUsage() ?? snapshot.usage }
  return true
}

// ---------------------------------------------------------------------------
// Measured spend: OpenCode's own cost records (sqlite3, read only) and the dollar estimate of the Claude windows
// (an awk filter over the transcripts, once a minute, off the poll, only the files that changed). Both fail soft.

// v9: only what the database measures, since the 1st of this month at 00:00 UTC. sqlite3 or the file missing or
// unreadable is "unreadable" (the line says so and how to fix it), never a made-up figure.
async function readApiSpend($: EngineInterface, now: number): Promise<Snapshot['apiSpend']> {
  try {
    const home = await $.env.get('HOME')
    if (!home) return { measured: null, state: 'unreadable' }
    const r = await run($, spendArgv(home, monthStartUtcMs(now)), SQLITE_TIMEOUT_MS)
    const spend = r.ok ? parseSpend(r.stdout) : null
    return spend === null ? { measured: null, state: 'unreadable' } : { measured: spend, state: 'ok' }
  } catch {
    return { measured: null, state: 'unreadable' }
  }
}

type CostFile = { mtime: number; size: number; buckets: Bucket[] }
const costFiles = new Map<string, CostFile>()
let costAt = -Infinity
let costBusy = false

async function scanCost($: EngineInterface, now: number): Promise<void> {
  if (costBusy || now - costAt < COST_EVERY_MS) return
  const lim = claudeLive.rateLimits
  const reset = (kind: string): number => Date.parse(lim.find(r => r.kind === kind)?.resetsAt ?? '')
  const fiveStart = reset('five_hour') - 5 * HOUR_MS
  const weekStart = reset('seven_day') - 7 * 24 * HOUR_MS
  if (!Number.isFinite(fiveStart) && !Number.isFinite(weekStart)) return
  costBusy = true
  costAt = now
  try {
    const home = await $.env.get('HOME')
    if (!home) return
    const listed = await run($, ['find', home + CLAUDE_PROJECTS_SUBDIR, '-type', 'f', '-name', '*.jsonl', '-mtime', '-8', '-exec', 'stat', '-f', '%m %z %N', '{}', '+'], COST_TIMEOUT_MS)
    if (!listed.ok) return
    const seen = new Set<string>()
    const changed: string[] = []
    for (const line of listed.stdout.split('\n')) {
      const m = /^(\d+) (\d+) (.+)$/.exec(line)
      if (m === null) continue
      const path = m[3] ?? ''
      seen.add(path)
      const have = costFiles.get(path)
      if (have === undefined || have.mtime !== Number(m[1]) || have.size !== Number(m[2])) {
        changed.push(path)
        costFiles.set(path, { mtime: Number(m[1]), size: Number(m[2]), buckets: [] })
      }
    }
    for (const p of [...costFiles.keys()]) if (!seen.has(p)) costFiles.delete(p)
    for (let i = 0; i < changed.length; i += COST_BATCH) {
      const r = await run($, costArgv(changed.slice(i, i + COST_BATCH)), COST_TIMEOUT_MS)
      if (!r.ok) continue
      for (const b of parseBuckets(r.stdout)) costFiles.get(b.file)?.buckets.push(b)
    }
    const all = [...costFiles.values()].flatMap(f => f.buckets)
    snapshot = { ...snapshot, cost: { five: Number.isFinite(fiveStart) ? costSince(all, fiveStart) : null, week: Number.isFinite(weekStart) ? costSince(all, weekStart) : null } }
    $.ui.invalidate('ui.render')
  } catch {
    // The estimate is optional: no scan, no dollars, nothing invented.
  } finally {
    costBusy = false
  }
}

async function readQueue($: EngineInterface, heldIds: ReadonlySet<string>): Promise<Snapshot['queue']> {
  try {
    const entries = await $.fs.list(QUEUE_DIR)
    const reportNames = new Set((await $.fs.list(REPORTS_DIR)).map(e => e.name))
    const held = new Set([...heldIds].map(s => s.toLowerCase()))
    // Stat only the briefs nobody reported on and no lane holds.
    const open = entries.filter(e => e.kind === 'file' && /^brief-.+\.md$/.test(e.name) && !/^brief-oc-/.test(e.name))
      .filter(e => !reportNames.has(e.name.replace(/^brief-/, '').replace(/\.md$/, '') + '-report.md'))
      .filter(e => !held.has(e.name.replace(/^brief-/, '').replace(/\.md$/, '').toLowerCase()))
    const stats = await Promise.all(open.map(async e => ({ name: e.name, mtimeMs: (await mtimeOf($, QUEUE_DIR + '/' + e.name)) ?? 0 })))
    const q = queueItems(stats, reportNames, heldIds)
    const items = await Promise.all(
      q.items.map(async i => ({ id: i.id, heading: await headingOf($, QUEUE_DIR + '/' + i.name, i.mtimeMs, i.id) })),
    )
    return { items, total: q.total }
  } catch {
    return { items: [], total: 0 }
  }
}

async function readBacklog($: EngineInterface): Promise<Backlog | null> {
  const mtimeMs = await mtimeOf($, BACKLOG_PATH)
  if (mtimeMs === null) return null
  if (backlogCache !== null && backlogCache.mtimeMs === mtimeMs) return backlogCache.value
  const text = await readText($, BACKLOG_PATH)
  const value = text === null ? null : parseBacklog(text)
  backlogCache = { mtimeMs, value }
  return value
}

// Today's reports, read once per version: what "Gate exit code" each says for the hashes that landed.
async function todaysReports($: EngineInterface, midnight: number): Promise<{ text: string }[]> {
  try {
    const entries = (await $.fs.list(REPORTS_DIR)).filter(e => e.kind === 'file' && e.name.endsWith('.md'))
    const stats = await Promise.all(entries.map(async e => ({ name: e.name, mtimeMs: (await mtimeOf($, REPORTS_DIR + '/' + e.name)) ?? 0 })))
    const recent = stats.filter(s => s.mtimeMs >= midnight).sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 60)
    const out: { text: string }[] = []
    for (const s of recent) {
      const hit = reportTextCache.get(s.name)
      if (hit !== undefined && hit.mtimeMs === s.mtimeMs) {
        out.push({ text: hit.text })
        continue
      }
      const text = (await readText($, REPORTS_DIR + '/' + s.name)) ?? ''
      reportTextCache.set(s.name, { mtimeMs: s.mtimeMs, text })
      out.push({ text })
    }
    return out
  } catch {
    return []
  }
}

// The reports of the last 24 h as items see them: the id from "<id>-report.md", the gate exit code and the
// scope word. Read once per file version.
async function readItemReports($: EngineInterface, now: number): Promise<ItemReportIn[]> {
  try {
    const entries = (await $.fs.list(REPORTS_DIR)).filter(e => e.kind === 'file' && /^.+-report\.md$/.test(e.name))
    const stats = await Promise.all(entries.map(async e => ({ name: e.name, mtimeMs: (await mtimeOf($, REPORTS_DIR + '/' + e.name)) ?? 0 })))
    const out: ItemReportIn[] = []
    for (const s of stats.filter(x => now - x.mtimeMs <= DAY_MS).sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 80)) {
      let hit = reportTextCache.get(s.name)
      if (hit === undefined || hit.mtimeMs !== s.mtimeMs) {
        hit = { mtimeMs: s.mtimeMs, text: (await readText($, REPORTS_DIR + '/' + s.name)) ?? '' }
        reportTextCache.set(s.name, hit)
      }
      out.push({ id: s.name.replace(/-report\.md$/, ''), mtimeMs: s.mtimeMs, gate: reportGateExit(hit.text), scope: gateScope(hit.text) })
    }
    return out
  } catch {
    return []
  }
}

// The Flight log's source: the newest reports in .cockpit/reports, each judged by flightlog.ts (heading, Status line, final gate exit).
// A report's text is read once per file version (the same cache the items use).
async function readFlightReports($: EngineInterface): Promise<FlightEntry[]> {
  try {
    const entries = (await $.fs.list(REPORTS_DIR)).filter(e => e.kind === 'file' && e.name.endsWith('.md'))
    const stats = await Promise.all(entries.map(async e => ({ name: e.name, mtimeMs: (await mtimeOf($, REPORTS_DIR + '/' + e.name)) ?? 0 })))
    const out: FlightEntry[] = []
    for (const st of stats.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, FLIGHT_READ)) {
      let hit = reportTextCache.get(st.name)
      if (hit === undefined || hit.mtimeMs !== st.mtimeMs) {
        hit = { mtimeMs: st.mtimeMs, text: (await readText($, REPORTS_DIR + '/' + st.name)) ?? '' }
        reportTextCache.set(st.name, hit)
      }
      out.push(parseReport(st.name, hit.text, st.mtimeMs))
    }
    return out
  } catch {
    return []
  }
}

// Every brief with its heading, for the items: the ones nobody reported on, the ones with a recent report,
// and the newest OpenCode briefs. Headings are read once per file version.
async function readItemBriefs($: EngineInterface, now: number, reports: readonly ItemReportIn[], reportNames: ReadonlySet<string>): Promise<ItemBriefIn[]> {
  try {
    const names = (await $.fs.list(QUEUE_DIR)).filter(e => e.kind === 'file' && /^brief-.+\.md$/.test(e.name)).map(e => e.name)
    const recentIds = new Set(reports.map(r => r.id.toLowerCase()))
    const out: ItemBriefIn[] = []
    const stats = await Promise.all(names.map(async name => ({ name, mtimeMs: (await mtimeOf($, QUEUE_DIR + '/' + name)) ?? 0 })))
    const ocNames = stats.filter(s => /^brief-oc-/.test(s.name) && now - s.mtimeMs <= DAY_MS).sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 8)
    for (const s of stats) {
      const id = s.name.replace(/^brief-/, '').replace(/\.md$/, '')
      const isOc = /^brief-oc-/.test(s.name)
      const reported = reportNames.has(id + '-report.md')
      if (isOc ? !ocNames.some(o => o.name === s.name) : reported && !recentIds.has(id.toLowerCase())) continue
      out.push({ id, heading: await headingOf($, QUEUE_DIR + '/' + s.name, s.mtimeMs, id), mtimeMs: s.mtimeMs, isOpencode: isOc })
    }
    return out
  } catch {
    return []
  }
}

// Every lock file, not only those of live sessions: a lock names an item whether or not its tmux session is up.
async function readAllLocks($: EngineInterface): Promise<ItemLockIn[]> {
  try {
    const out: ItemLockIn[] = []
    for (const e of (await $.fs.list(LOCK_DIR)).filter(x => x.kind === 'file' && x.name.endsWith('.lock'))) {
      const path = LOCK_DIR + '/' + e.name
      const lock = parseLock((await readText($, path)) ?? '')
      if (lock !== null && lock.item !== '') out.push({ member: lock.lane !== '' ? lock.lane : e.name.slice(0, -5), item: lock.item, mtimeMs: await mtimeOf($, path) })
    }
    return out
  } catch {
    return []
  }
}

// .cockpit/claims/<ITEM>.claim: the file name is the item id, its time is when a lane took it, and a `lane: <session>`
// line in the body names the lane (hooks/laneitem.ts has the format). Read only; a body is read once per file version, and
// only for claims under 24 hours old (an older one can name nobody).
const claimBodies = new Map<string, { mtimeMs: number; claim: Claim }>()
async function readClaims($: EngineInterface, now: number): Promise<Claim[]> {
  try {
    const out: Claim[] = []
    for (const e of (await $.fs.list(CLAIMS_DIR)).filter(x => x.kind === 'file' && x.name.endsWith('.claim'))) {
      const path = CLAIMS_DIR + '/' + e.name
      const mtimeMs = await mtimeOf($, path)
      if (mtimeMs === null) continue
      if (now - mtimeMs > 24 * 60 * 60_000) {
        out.push(parseClaim(e.name, '', mtimeMs))
        continue
      }
      const hit = claimBodies.get(e.name)
      if (hit !== undefined && hit.mtimeMs === mtimeMs) {
        out.push(hit.claim)
        continue
      }
      const claim = parseClaim(e.name, (await readText($, path)) ?? '', mtimeMs)
      claimBodies.set(e.name, { mtimeMs, claim })
      out.push(claim)
    }
    return out
  } catch {
    return []
  }
}

// What the Mac and the box say about their resources. Read only: nothing is killed or changed. The Mac's
// commands run every 15 s; the box (one ssh, cached) every 60 s.
async function readSystem($: EngineInterface, now: number): Promise<SystemState> {
  const prev = snapshot.system
  const [pressure, swap, load, df, ps] = await Promise.all([
    run($, ['memory_pressure', '-Q']),
    run($, ['sysctl', '-n', 'vm.swapusage']),
    run($, ['sysctl', '-n', 'vm.loadavg']),
    run($, ['df', '-k', '/']),
    run($, ['ps', '-Ao', 'rss=,comm=']),
  ])
  let cores = prev.reading.cores
  if (cores === null) cores = parseCores((await run($, ['sysctl', '-n', 'hw.ncpu'])).stdout)
  const reading: SystemReading = {
    memFree: parseMemoryPressure(pressure.stdout),
    swapMB: parseSwapUsedMB(swap.stdout),
    load1: parseLoadAvg(load.stdout)?.[0] ?? null,
    cores,
    diskFree: parseDf(df.stdout)?.freePct ?? null,
    top: parseTopMemory(ps.stdout),
  }
  const listed = cfg.hosts
  let hosts = prev.hosts.filter(h => listed.some(l => l.name === h.name))
  let hostsAt = prev.hostsAt
  if (listed.length === 0) {
    hosts = []
    hostsAt = -Infinity
  } else if (now - hostsAt >= HOSTS_EVERY_MS || hosts.length !== listed.length) {
    hostsAt = now
    hosts = await Promise.all(
      listed.map(async (h): Promise<HostReading> => {
        const r = await run($, hostCommand(h), 6000)
        return r.ok ? { name: h.name, answered: true, mem: parseFreeM(r.stdout), gpu: h.gpu ? parseNvidia(r.stdout) : null } : { name: h.name, answered: false, mem: null, gpu: null }
      }),
    )
  }
  return { at: now, reading, hosts, hostsAt }
}

// `git log --since=midnight origin/main`, local refs only (no fetch), with each one's gate result.
async function readLanded($: EngineInterface, now: number): Promise<Landed[]> {
  const log = await run($, ['git', '-C', REPO_ROOT, 'log', '--since=midnight', '--format=%h %s', 'origin/main'], 8000)
  if (!log.ok) return []
  const items = parseLanded(log.stdout)
  const midnight = new Date(now).setHours(0, 0, 0, 0)
  const reports = items.length > 0 ? await todaysReports($, midnight) : []
  return items.map(i => ({ ...i, gate: gateExit(i.hash, reports) }))
}

// Each listed service (config `services`) answers one HTTP GET (made on a listed host when the service says `ssh`): up on a 2xx or 3xx, with its time.
// None listed: nothing is probed. And the optional credits file (credits.json in the data folder).
async function readHealth($: EngineInterface, now: number): Promise<Snapshot['health']> {
  const services = await Promise.all(
    cfg.services.map(async (s): Promise<ServiceState> => {
      const r = await run($, serviceCommand(s), serviceRunMs(s))
      return serviceFrom(s, r.stdout, r.code)
    }),
  )
  const text = await readText($, CREDITS_PATH)
  return { at: now, services, credits: text === null ? null : parseCredits(text) }
}

// Anything working now: this session, a crew member, a running subagent, an opencode run.
function anyWorkingNow(): boolean {
  return isMainBusy || opencodeRuns.length > 0 || snapshot.crew.some(m => m.row.state === 'working') || snapshot.subs.some(s => isRunning(s.status))
}

let ticking = false
let tickTimer: { cancel: () => void } | null = null

// The next tick: 1 s while anything works (elapsed times and animations move), 5 s when nothing does; never zero,
// never waiting for an event. A reload cancels the timer and session.start schedules a fresh one.
function scheduleTick($: EngineInterface): void {
  tickTimer?.cancel()
  tickTimer = $.clock.after(anyWorkingNow() ? TICK_MS : IDLE_TICK_MS, () => {
    // The next one is set BEFORE this one runs, so a slow tick never makes the clock stall (a tick still running
    // makes the next one skip: `ticking`).
    scheduleTick($)
    void tick($)
  })
}

// The tick (v9). Cheap reads, then what is due: a poll, or a redraw.
async function tick($: EngineInterface): Promise<void> {
  if (ticking) return
  ticking = true
  try {
    const now = await $.clock.now()
    // The unsaved-work status line: not awaited, at most every 30 s (refreshUnsaved checks).
    void refreshUnsaved($, now).catch(() => undefined)
    const wasWorking = anyWorkingNow()
    const mainBefore = isMainBusy
    await readMainState($, now)
    let runsChanged = false
    if (now - opencodeAt >= OPENCODE_EVERY_MS) runsChanged = await readOpencodeRuns($, now)
    const statusMtime = await mtimeOf($, STATUS_PATH)
    const statusMoved = statusMtime !== lastStatusMtime
    lastStatusMtime = statusMtime
    // v10: a claim, a report or a lock appearing or going moves its folder's time; that is a change to draw now.
    const marks = [statusMtime, await mtimeOf($, CLAIMS_DIR), await mtimeOf($, REPORTS_DIR), await mtimeOf($, LOCK_DIR)].join('|')
    const marksMoved = liveMarks !== '' && marks !== liveMarks
    liveMarks = marks
    if (marksMoved) forceLive = true
    const working = anyWorkingNow()
    if (runsChanged || statusMoved || marksMoved || pollDue(now, lastPollAt, working || wasWorking)) {
      await refresh($)
    } else if (redrawDue(now, lastDrawAt, working) || isMainBusy !== mainBefore) {
      lastDrawAt = now
      $.ui.invalidate('ui.render')
    }
  } catch {
    // A tick that fails is skipped; the next one runs in a second.
  } finally {
    ticking = false
  }
}

// One poll at a time: a caller that arrives mid-poll waits for the one in flight.
function refresh($: EngineInterface): Promise<void> {
  if (inflight === null) {
    inflight = poll($).finally(() => {
      inflight = null
    })
  }
  return inflight
}

async function poll($: EngineInterface): Promise<void> {
  try {
    const now = await $.clock.now()
    lastPollAt = now
    lastDrawAt = now
    await readMainState($, now)
    const listed = await tmux($, ['list-sessions', '-F', '#{session_name}'])
    const names = listed.stdout.split('\n').map(s => s.trim()).filter(s => s !== '')
    let lockNames = new Set<string>()
    try {
      lockNames = new Set((await $.fs.list(LOCK_DIR)).filter(e => e.kind === 'file' && e.name.endsWith('.lock')).map(e => e.name.slice(0, -5)))
    } catch {
      // No lock folder: no crew from locks.
    }

    // Small files, every poll.
    const status = parseStatus((await readText($, STATUS_PATH)) ?? '')
    const presenceText0 = await readText($, PRESENCE_PATH)
    const presence = presenceText0 === null ? emptyPresence : parsePresence(presenceText0)
    const awayLog = parseAwayLog((await readText($, AWAY_LOG_PATH)) ?? '')
    const inbox = parseInbox((await readText($, INBOX_PATH)) ?? '')
    const edgesFile = parseDeps((await readText($, DEPS_PATH)) ?? '')
    targets = parseTargets((await readText($, TARGETS_PATH)) ?? '')
    const handoffMtimeMs = await mtimeOf($, HANDOFF_DIR + '/' + handoffName(now))

    // What is spent, from the last reads: the Codex pool (both windows), the OpenCode and cloud credits.
    const codexP = codexPool(snapshot.limits, now, snapshot.footerWeek)
    const codexState = poolState(codexP, now)
    const codexReadable = codexP.five.used !== null || codexP.week.used !== null
    // v9: the file's balance and expiry no longer say anything about OpenCode (the figure is measured): never dimmed by them.
    const ocCredit = creditView('opencode', 'OpenCode (Claude API)', null, now)
    const cloudCredit = creditView('cloud', 'Claude cloud', snapshot.creditsFile?.cloud ?? null, now)

    // v11: claims and the opencode runs are read BEFORE the lanes, so each lane's item is resolved from this poll's evidence.
    let claims = snapshot.claims
    if (now - slowAt >= SLOW_EVERY_MS || forceLive) claims = await readClaims($, now)
    if (now - opencodeAt >= OPENCODE_EVERY_MS) await readOpencodeRuns($, now)
    const evidence = new Map<string, { lines: string[]; lockItem: string; lockMtimeMs: number | null; fresh: Progress | null; tail: string; lastActivityMs: number }>()

    let localSeen = false
    let localUp = false
    const members: Member[] = []
    const lockItems = new Map<string, string>()
    const lockTimes: { item: string; mtimeMs: number | null }[] = []
    const gateWaiters: string[] = []
    let footerWeek: number | null = null
    const live = new Set<string>()
    for (const m of discoverCrew(names, lockNames, cfg.lanes, cfg.discoverLanes)) {
      live.add(m.name)
      const cap = await tmux($, ['capture-pane', '-p', '-t', m.name])
      const lines = lastLines(cap.stdout, PANE_LINES)
      const state0 = classifyKind(laneKindOf(m.kind), true, lines)
      const seen = trackChange(seenByMember.get(m.name), lines, now)
      seenByMember.set(m.name, seen)
      if (!paneFirstSeen.has(m.name)) paneFirstSeen.set(m.name, now)
      // v9: a Codex pane whose text changed in the last 60 s is working, whatever its own markers say.
      const state = state0 === 'idle' && m.kind === 'codex' && !atShellPrompt(lines) && paneChangedRecently(seen.since, paneFirstSeen.get(m.name) ?? null, now) ? 'working' : state0
      if (m.kind === 'codex' && footerWeek === null) footerWeek = parseFooterWeekly(lines)
      const prog = await readProgress($, m.name)
      const locked = await readLock($, m.name)
      const row = buildRow(m.name, state, locked.lock, lines, seen, now, locked.mtimeMs)
      const item = itemId(locked.lock)
      if (locked.lock !== null) {
        lockTimes.push({ item: locked.lock.item, mtimeMs: locked.mtimeMs })
        if (item !== '') lockItems.set(m.name, item)
      }
      // v11: the item, its heading and the task text are resolved after all lanes are read (below), from live evidence
      // only; a lock or a newest-brief guess no longer names a lane's item.
      const fresh = prog.progress !== null && progressIsNewer(prog.mtimeMs, locked.mtimeMs) ? prog.progress : null
      evidence.set(m.name, { lines, lockItem: locked.lock === null ? '' : locked.lock.item, lockMtimeMs: locked.mtimeMs, fresh, tail: row.tail, lastActivityMs: seen.since })
      const activity = activityOf(lines, state, row.sinceMs / 1000)
      if (waitsForGate(lines)) gateWaiters.push(m.name)
      // A local lane: is a model server behind it? (its terminal's process list, cached)
      if (m.kind === 'local') {
        localSeen = true
        if (/llama-server|ollama serve|mlx_lm/.test(await psArgs($, m.name, now))) localUp = true
      }
      const outage = outageOf(lines, { state })
      const erroredBase = erroredOf(lines, { state, sessionMissing: !names.includes(m.name), lockLive: locked.lock !== null })
      const errored = outage !== null && !erroredBase.errored ? { errored: true, reason: outage.phrase } : erroredBase
      const exhaustion = exhaustedOf(m.kind, { codex: codexState, codexReadable, opencode: ocCredit, cloud: cloudCredit, refusal: refusalOf(lines) })
      members.push({
        name: m.name,
        kind: m.kind,
        variant: m.variant,
        row,
        activity: errored.errored ? 'errored' : activity === 'absent' ? 'sleeping' : activity,
        errored,
        outage,
        exhaustion,
        lockOwner: locked.lock?.owner ?? '',
        lockAgeMs: locked.mtimeMs === null ? null : Math.max(0, now - locked.mtimeMs),
        target: '',
        powered: await poweredOf($, m.kind, m.name, lines, now),
        heading: '',
        desc: '',
        itemId: '',
        doing: null,
        lastReport: '',
        staleClaim: '',
        claimTitle: '',
        claimNow: '',
        paneDoing: '',
        progress: prog.progress,
        isStuck: isStuck(state, row.sinceMs),
        lockMtimeMs: locked.mtimeMs,
      })
    }
    for (const k of [...seenByMember.keys()]) if (!live.has(k)) seenByMember.delete(k)
    for (const k of [...paneFirstSeen.keys()]) if (!live.has(k)) paneFirstSeen.delete(k)
    // An opencode run is the OpenCode member working (v9), even with no tmux session for it.
    if (now - opencodeAt >= OPENCODE_EVERY_MS) await readOpencodeRuns($, now)
    const runLane = await applyOpencode($, members, now, evidence)
    resolveItems(members, evidence, runLane, claims, now)

    // Context numbers and the Claude plan's rate-limit windows of this session, every 15 s.
    // The call's figures win; the transcript gives the model id (and the numbers when the call has none yet).
    if (now - usageAt >= USAGE_EVERY_MS) {
      usageAt = now
      const file = await readSessionUsage($)
      if (file !== null && file.model !== '') claudeLive = { ...claudeLive, model: file.model }
      const api = await readUsageNow($)
      if (api.tokens === null && file !== null) applyClaude({ tokens: file.used, window: file.window })
      applyClaude(api)
      await noteUsage($, 'session.usage@poll', api, now)
    }
    const usage = claudeUsage() ?? snapshot.usage
    const rateLimits = claudeLive.rateLimits

    let reportNames = snapshot.reportNames
    try {
      reportNames = new Set((await $.fs.list(REPORTS_DIR)).map(e => e.name))
    } catch {
      // Keep the last list.
    }

    // System resources, every 15 s (not every 5): the Mac's own commands, the box through one cached ssh.
    let system = snapshot.system
    if (now - systemAt >= SYSTEM_EVERY_MS) {
      systemAt = now
      system = await readSystem($, now)
    }

    // Slower things, every 30 s: limits, queue, backlog, landed, health and credits, and what the items need.
    let { limits, queue, backlog, landed, health, allLocks, briefs, itemReports, flight, creditsFile, apiSpend } = {
      apiSpend: snapshot.apiSpend,
      creditsFile: snapshot.creditsFile,
      limits: snapshot.limits,
      queue: snapshot.queue,
      backlog: snapshot.backlog,
      landed: snapshot.landed,
      health: snapshot.health,
      allLocks: snapshot.allLocks,
      briefs: snapshot.briefs,
      itemReports: snapshot.itemReports,
      flight: snapshot.flight,
    }
    if (now - slowAt >= SLOW_EVERY_MS) {
      slowAt = now
      await loadConfig($)
      await readTheme($)
      limits = await readCodexLimits($)
      queue = await readQueue($, new Set(lockItems.values()))
      backlog = await readBacklog($)
      landed = await readLanded($, now)
      health = await readHealth($, now)
      const creditsText = await readText($, CREDITS_PATH)
      creditsFile = creditsText === null ? null : parseCreditsFile(creditsText)
      apiSpend = await readApiSpend($, now)
      allLocks = await readAllLocks($)
      itemReports = await readItemReports($, now)
      flight = await readFlightReports($)
      briefs = await readItemBriefs($, now, itemReports, reportNames)
      forceLive = false
    } else if (forceLive) {
      // v10: a claim, report or lock moved: only what the Status card and the items need is re-read (not git, curl or ssh).
      forceLive = false
      itemReports = await readItemReports($, now)
      flight = await readFlightReports($)
      allLocks = await readAllLocks($)
      briefs = await readItemBriefs($, now, itemReports, reportNames)
    }
    const holder = 'gate'
    snapshot = {
      at: now,
      crew: members,
      subs: await readSubagents($),
      status,
      presence,
      awayLog,
      inbox,
      edges: allEdges(edgesFile, gateWaiters, holder),
      lockItems,
      lockTimes,
      usage: claudeUsage() ?? usage,
      rateLimits: claudeLive.rateLimits,
      apiSpend,
      cost: snapshot.cost,
      localUp: localSeen ? localUp : null,
      creditsFile,
      handoffMtimeMs,
      limits,
      footerWeek,
      queue,
      backlog,
      landed,
      health,
      reportNames,
      allLocks,
      briefs,
      itemReports,
      flight,
      claims,
      system,
      gateWaiting: gateWaiters.length > 0,
      note: listed.ok ? '' : 'tmux not reachable: no sessions listed',
    }
    await afterPoll($, now)
    // The dollar estimate runs beside the poll (never inside it), at most once a minute.
    void scanCost($, now)
  } catch (err) {
    snapshot = { ...snapshot, note: 'poll failed: ' + oneLine(String(err), 60) }
  } finally {
    $.ui.invalidate('ui.render')
  }
}

// After a poll: put the crew in its fixed order (a member moves only when its group has changed for ~10 s),
// and start a celebration for every landing the first sight of which this is (once per landed id, saved).
async function afterPoll($: EngineInterface, now: number): Promise<void> {
  const g = graphOf()
  const entries = snapshot.crew.map(m => ({
    name: m.name,
    group: groupOf({ activity: m.activity, state: m.row.state, exhausted: m.exhaustion.exhausted, blocked: blockedBy(g, m.name) !== null }),
    // How long its pane has been quiet: the smaller, the more recently it was active.
    quietMs: m.row.sinceMs,
  }))
  const ordered = orderCrew(entries, orderState, now)
  orderState = ordered.state
  const rank = new Map(ordered.order.map((name, i) => [name, i]))
  snapshot = { ...snapshot, crew: [...snapshot.crew].sort((a, b) => (rank.get(a.name) ?? 0) - (rank.get(b.name) ?? 0)) }
  // v14: lane state changes (working, idle, absent) go to the deck's session log; the first poll only sets the baseline.
  const before = JSON.stringify(deck.lanes)
  deck = deckOnLanes(deck, snapshot.crew.filter(m => m.row.state !== 'absent').map(m => ({ name: m.name, state: m.row.state === 'working' ? ('working' as const) : ('idle' as const) })), now)
  if (JSON.stringify(deck.lanes) !== before) void deckChanged($)

  // Celebrations. The first poll only records what had already landed; nothing replays on reload.
  const found = landEvents(snapshot.landed.map(l => ({ hash: l.hash, subject: l.subject })), new Set(ui.seenLanded), ui.baselined)
  // Only a celebration writes the file; the first poll after a load (the baseline) and every other poll only read.
  let changed = found.events.length > 0
  celebrations = pruneCelebrations(celebrations, now)
  for (const ev of found.events) {
    const item = /\b([A-Z][A-Z0-9]+(?:-[A-Z0-9]+)+)\b/.exec(ev.subject)?.[1] ?? ''
    const owner = snapshot.crew.find(m => item !== '' && (snapshot.lockItems.get(m.name) ?? '') !== '' && ev.subject.toLowerCase().includes((snapshot.lockItems.get(m.name) ?? '').toLowerCase()))
    celebrations.push({ hash: ev.hash, subject: ev.subject, item, member: owner?.name ?? '', at: now })
  }
  const s = displayStatus(now)
  if (s !== null && milestoneEvent(s.milestone, s.done, s.total, ui.seenMilestones)) {
    if (ui.baselined) celebrations.push({ hash: 'milestone:' + s.milestone, subject: s.milestone + ' done', item: '', member: '', at: now })
    ui = { ...ui, seenMilestones: [...ui.seenMilestones, s.milestone] }
    changed = true
  }
  ui = { ...ui, seenLanded: [...found.seen], baselined: true }
  if (changed) await saveUi($)
}

// Remember the tab, view, open sections and toggles across reloads. Written on a person's change and on a
// celebration, never on a plain poll.
async function saveUi($: EngineInterface): Promise<void> {
  ui = { ...ui, expanded: [...expanded] }
  try {
    await writeFile($, UI_PATH, serializeUi(ui))
  } catch {
    // The state is kept in memory; the file is a convenience.
  }
}

async function togglePane($: EngineInterface): Promise<boolean> {
  const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
  if (isOpen) {
    await $.ui.close({ id: PANE })
    return false
  }
  await $.ui.open({ id: PANE, title: PANE_TITLE, focus: true, closeOnEscape: true, rows: PANE_ROWS })
  return true
}

async function openPane($: EngineInterface): Promise<void> {
  if (!(await $.ui.panes()).some(p => p.id === PANE)) await $.ui.open({ id: PANE, title: PANE_TITLE, focus: true, closeOnEscape: true, rows: PANE_ROWS })
}

// ---------------------------------------------------------------------------
// Derived views of the snapshot

const NO_CHIP = null

const stateWord = (a: Activity): string => a

// Who waits on whom, for the chips, the graph and the band.
export function graphOf(): Graph {
  const members = new Set(snapshot.crew.map(m => m.name))
  const bad = new Set(snapshot.crew.filter(m => m.activity === 'red' || m.isStuck).map(m => m.name))
  return buildGraph(snapshot.edges, {
    members,
    isBad: n => bad.has(n),
    isFaded: e => edgeIsFaded(e, { members, lockItemOf: n => snapshot.lockItems.get(n) ?? '', reportNames: snapshot.reportNames }),
  })
}

const modeOf = (m: Member): DrawMode => (m.row.state === 'working' ? 'work' : m.row.isStale ? 'stale' : 'idle')

const ageText = (ms: number): string => ageLabel(ms)

function pressureNow(now: number) {
  return contextPressure(ctxPercent(snapshot.usage), snapshot.handoffMtimeMs, now)
}

// The celebration of a member (or of the coordinator, member ''), while its 10 s last.
const celebrationOf = (member: string, now: number): Celebration | null => celebrations.find(c => c.member === member && chipNow(c, now)) ?? null
const celebrateChip = (c: Celebration): { text: string; color: string; inline: boolean } => ({ text: c.hash.startsWith('milestone:') ? 'milestone done' : 'landed ' + (c.item !== '' ? c.item : 'an item'), color: '#FBBF24', inline: true })

// The character's pose: a blocked or errored sleeper is drawn awake in its own pose, a landing cheers.
function poseOf(m: Member, blocked: boolean, burst: boolean): { mode: DrawMode; activity: Activity } {
  if (burst) return { mode: 'work', activity: 'cheering' }
  if (m.exhaustion.exhausted) return { mode: 'out', activity: m.activity }
  if (m.activity === 'errored') return { mode: 'work', activity: 'errored' }
  if (blocked && modeOf(m) !== 'work') return { mode: 'work', activity: 'asking' }
  return { mode: modeOf(m), activity: m.activity }
}

const RED_HEX = '#F85149'
const AMBER_HEX = '#F0A500'

// The row of one crew member (v6): 36 px, the state in its own chip, the item in muted text, the tag and the time
// at the right; a row with trouble shows its reason on a second line; an open row shows its detail.
function memberRowIn(m: Member, g: Graph, now: number): LookRow {
  const b = blockedBy(g, m.name)
  const out = m.exhaustion.exhausted
  const cel = ui.celebrations ? celebrationOf(m.name, now) : null
  const burst = cel !== null && burstNow(cel, now)
  const pose = poseOf(m, b !== null, burst)
  const trouble: LookRow['trouble'] = m.outage !== null
    ? { text: m.outage.line, hex: RED_HEX }
    : m.errored.errored
    ? { text: 'errored' + (m.errored.reason !== '' ? ' \u00b7 ' + m.errored.reason : ''), hex: RED_HEX }
    : b !== null
      ? { text: 'blocked by ' + b.on + (b.why !== '' ? ': ' + b.why : ''), hex: AMBER_HEX }
      : m.isStuck
        ? { text: 'stuck? no change for a long while', hex: AMBER_HEX }
        : m.staleClaim !== ''
          ? { text: 'stale claim: ' + m.staleClaim, hex: AMBER_HEX }
          : out
          ? { text: 'out of credits' + (m.exhaustion.backAtMs !== null ? ' \u00b7 ' + backText(m.exhaustion.backAtMs) : ''), hex: '#8B949E' }
          : m.row.isStale
            ? { text: 'stale? idle with an old lock', hex: AMBER_HEX }
            : null
  const open = openRow === m.name
  const card = memberCardIn(m, g, now)
  return {
    kind: m.kind,
    variant: m.variant,
    mode: pose.mode,
    activity: pose.activity,
    title: shortName(m.name, m.kind),
    // the status word is from the closed list (crew.ts STATUS_WORDS); what the lane is doing is in the task line.
    state: m.outage !== null ? { text: m.outage.label, color: RED_HEX } : { text: statusWordOf(m.activity, { blocked: b !== null }), color: b !== null && m.activity !== 'working' ? WAIT_AMBER : ACTIVITY_COLOR[m.activity] },
    item: taskLineOf({ item: m.itemId, title: m.heading, claimTitle: m.claimTitle, statusWord: statusWordOf(m.activity, { blocked: b !== null }), doing: m.doing, isSleeping: m.activity === 'sleeping', isWorking: m.activity !== 'sleeping' && m.row.state === 'working' }),
    tag: shortTag(m.powered.text),
    since: ageText(m.row.sinceMs),
    // COCKPIT-33: provider, model and time as one line at the upper right.
    provider: providerOfKind(m.kind),
    model: modelOfPowered(m.powered.text),
    trouble,
    isOut: out,
    indent: 0,
    isOpen: open,
    // The limits line says what the bars say; with bars it is left out.
    detail: open ? memberDetail(card).filter(d => d.label !== 'Limits' || memberBars(m, now).length === 0) : [],
    bars: open ? memberBars(m, now) : [],
    burst: burst ? cel?.hash ?? '' : '',
    landed: cel !== null ? celebrateChip(cel).text : '',
    phase: now,
    tone: rowToneOf({ activity: m.activity, errored: m.errored.errored, blocked: b !== null, stuck: m.isStuck, exhausted: out }),
  }
}

// The limit bars an open row shows: the Codex pool for a Codex member, the credit for an OpenCode or cloud one.
function memberBars(m: Member, now: number): DetailBar[] {
  if (m.kind === 'codex') {
    const p = poolsNow(now)[1]
    return p === undefined ? [] : [p.five, p.week].map(w => ({ label: 'Codex ' + w.label, ratio: w.used === null ? null : w.used / 100, text: w.used === null ? 'not readable' : Math.round(w.used) + '%', hex: usedColor(w.used) }))
  }
  if (m.kind === 'api') {
    // v9: the API bar is what OpenCode logged this month against the monthly limit, coloured green, amber, red.
    const spent = snapshot.apiSpend.measured?.usd
    const limit = apiLimitOf(snapshot.creditsFile)
    return spent === undefined ? [] : [{ label: 'API this month', ratio: Math.min(1, spent / limit), text: apiLineNow().replace(/^API: /, ''), hex: usedColor((spent / limit) * 100) }]
  }
  if (m.kind === 'cloud') {
    const c = cloudCredits(now)[0]
    return c === undefined || c.ratio === null ? [] : [{ label: 'Credit spent', ratio: c.ratio, text: c.text, hex: '#58A6FF' }]
  }
  return []
}

// v9: the API line is measured only (this month, logged by OpenCode); the credits file's OpenCode balance and expiry
// are not shown any more. The cloud credit keeps its expiry.
const apiLineNow = (): string => 'API: ' + apiText({ measured: snapshot.apiSpend.measured, limit: apiLimitOf(snapshot.creditsFile) })
const cloudCredits = (now: number) => creditViews(snapshot.creditsFile, now).filter(v => v.id === 'cloud')

// Plain text for a row's accessible description and its details card: one source (details.ts).
function memberCardIn(m: Member, g: Graph, now: number): MemberCardIn {
  const b = blockedBy(g, m.name)
  const pools = poolsNow(now)
  const cloud = cloudCredits(now)[0]
  const limits =
    m.kind === 'codex'
      ? poolSummary(pools[1] ?? pools[0] ?? codexPool(null, now)).text
      : m.kind === 'api'
        ? apiLineNow()
        : m.kind === 'cloud'
          ? (cloud?.name ?? '') + ': ' + (cloud?.text ?? '')
          : ''
  return {
    name: m.name,
    kind: m.kind,
    activity: statusWordOf(m.activity, { blocked: b !== null }),
    powered: m.powered.text,
    target: m.target,
    item: m.staleClaim !== '' ? 'stale claim: ' + m.staleClaim : m.itemId,
    doing: doingLineOf({ now: m.claimNow, pane: m.paneDoing, claimTitle: m.claimTitle, heading: m.heading, item: m.itemId, statusWord: statusWordOf(m.activity, { blocked: b !== null }), isSleeping: m.activity === 'sleeping' }),
    description: m.desc,
    lastReport: m.lastReport,
    since: ageText(m.row.sinceMs),
    lockOwner: m.lockOwner,
    lockAge: m.lockAgeMs === null ? '' : ageText(m.lockAgeMs) + ' ago',
    context: '',
    limits,
    blockedBy: b === null ? [] : [{ on: b.on, why: b.why }],
    errored: m.errored.errored,
    errorReason: m.errored.reason,
    outage: m.outage === null ? undefined : { label: m.outage.label, line: m.outage.line },
    out: m.exhaustion.exhausted,
    back: m.exhaustion.backAtMs !== null ? backText(m.exhaustion.backAtMs) : '',
    isStale: m.row.isStale,
    isStuck: m.isStuck,
  }
}

// The open Captain row's first lines: every NOW entry in full (the first line of an entry says "Now", the rest of it
// wraps under a blank label), then the milestone.
function captainDetail(full: readonly string[]): DetailLine[] {
  const out: DetailLine[] = []
  for (const entry of full) {
    const isMilestone = entry.startsWith('Milestone: ')
    const text = isMilestone ? entry.slice('Milestone: '.length) : entry
    wrapChars(text, DOING_WIDTH, DOING_LINES).forEach((l, i) => out.push({ label: i === 0 ? (isMilestone ? 'Milestone' : 'Now') : '', text: l }))
  }
  return out
}

// The Captain (the coordinator; the row used to be called "this session"): always first, a thin context line under it, the
// percent from 70%. It always shows the item it owns: its status.json NOW, else the milestone (hooks/laneitem.ts, captainItem).
export function sessionRowIn(now: number): LookRow {
  const pct = ctxPercent(snapshot.usage)
  const pr = pressureNow(now)
  // the Captain is never "sleeping": when it is not working it is idle, still in colour, at the top.
  const act: Activity = isMainBusy ? 'working' : 'sleeping'
  const cel = ui.celebrations ? celebrationOf('', now) : null
  const burst = cel !== null && burstNow(cel, now)
  const open = openRow === 'Captain'
  const pools = poolsNow(now)
  const cap = captainItem(snapshot.status, now, liveStatusNow(now).evidenceMs)
  return {
    kind: 'captain',
    variant: 0,
    mode: burst ? 'work' : isMainBusy ? 'work' : 'still',
    activity: burst ? 'cheering' : act,
    title: 'Captain',
    state: isMainBusy ? { text: stateWord(act), color: ACTIVITY_COLOR[act] } : { text: CAPTAIN_IDLE_WORD, color: CAPTAIN_IDLE_HEX },
    // The line is the first NOW entry or the milestone, cut to the row; the open row has all of it, wrapped.
    item: cap.line,
    tag: shortTag(poweredSession(snapshot.usage?.model ?? '').text),
    // The live elapsed timer of the current turn (v9); the 1 s tick redraws it.
    since: mainBusySince() === null ? '' : fmtTime(now - (mainBusySince() ?? now)),
    provider: 'MAX',
    model: modelOfPowered(poweredSession(snapshot.usage?.model ?? '').text),
    colon: true,
    trouble: pr.level === 'none' ? null : { text: pr.badge, hex: pr.level === 'red' ? RED_HEX : AMBER_HEX },
    isOut: false,
    indent: 0,
    isOpen: open,
    detail: open ? [...captainDetail(cap.full), ...memberDetail(sessionCardData(now))] : [],
    bars: open
      ? [
          ...(pct === null ? [] : [{ label: 'Context', ratio: Math.min(1, pct / 100), text: ctxBarLabel(snapshot.usage).replace(/^ctx \d+% \u00b7 /, ''), hex: usedColor(pct) }]),
          // The plan usage (a different thing from the context): live, else the last known "as of".
          ...[
            { name: 'Max 5h', p: claudeWindows(snapshot.rateLimits, usageCache, now).five },
            { name: 'Max wk', p: claudeWindows(snapshot.rateLimits, usageCache, now).week },
            ...(claudeWindows(snapshot.rateLimits, usageCache, now).fable === null ? [] : [{ name: 'Fable wk', p: claudeWindows(snapshot.rateLimits, usageCache, now).fable! }]),
          ].map(({ name, p }) => ({ label: name, ratio: p.win.used === null ? null : p.win.used / 100, text: p.win.used === null ? 'unknown' : Math.round(p.win.used) + '% used' + (p.asOfMs !== null ? ' ' + asOfText(p.asOfMs) : ''), hex: usedColor(p.win.used) })),
        ]
      : [],
    burst: burst ? cel?.hash ?? '' : '',
    landed: cel !== null ? celebrateChip(cel).text : '',
    phase: now,
    tone: isMainBusy ? 'green' : '',
  }
}

// COCKPIT-33: the row's upper-right line as accessible text, ", codex GPT-6 Luna 12m"; '' when nothing is known.
function rowSummaryAlt(r: LookRow): string {
  const t = summaryFull({ provider: r.provider ?? '', model: r.model ?? '', time: r.since, colon: r.colon })
  return t === '' ? '' : ', ' + t
}

function sessionCardData(now: number): MemberCardIn {
  const pools = poolsNow(now)
  return {
    name: 'Captain',
    kind: 'captain',
    activity: isMainBusy ? 'working' : CAPTAIN_IDLE_WORD,
    powered: poweredSession(snapshot.usage?.model ?? '').text,
    target: sessionTarget(snapshot.status?.now ?? []),
    item: '',
    description: describeSession(snapshot.lockTimes, isMainBusy),
    lastReport: '',
    since: '',
    lockOwner: '',
    lockAge: '',
    context: ctxBarLabel(snapshot.usage) + (pressureNow(now).advice !== null ? ' \u00b7 ' + (pressureNow(now).advice?.text ?? '') : ''),
    limits: poolSummary(pools[0] ?? claudePool(null)).text,
    blockedBy: [],
    errored: false,
    errorReason: '',
    out: false,
    back: '',
    isStale: false,
    isStuck: false,
  }
}

const sessionCardIn = (now: number): string[] => memberCard(sessionCardData(now))

// A subagent sits under its owner, indented; its description is the item text.
function subRowIn(s: SubRow, now: number): LookRow {
  const running = isRunning(s.status)
  const failed = s.status === 'failed' || s.status === 'killed'
  const time = s.startedAt !== undefined ? fmtTime((s.endedAt ?? now) - s.startedAt) : ''
  const title = oneLine(s.name, 40)
  return {
    kind: 'max',
    variant: 0,
    mode: running ? 'work' : 'dim',
    activity: 'working',
    title,
    state: { text: running ? 'working' : failed ? 'errored' : 'done', color: running ? ACTIVITY_COLOR.working : failed ? '#EF4444' : '#3B9C5F' },
    item: describeSub(s.description ?? '', s.type, title),
    tag: shortTag(poweredSub(s.model).text),
    since: time,
    trouble: failed ? { text: 'failed', hex: RED_HEX } : null,
    isOut: false,
    indent: 16,
    isOpen: false,
    detail: [],
    bars: [],
    burst: '',
    landed: '',
    phase: now,
    tone: running ? 'green' : failed ? 'red' : '',
  }
}

// The band's characters: this session first, then the crew in its order. `short` labels the press target.
function charsOf(g: Graph, _now: number): { kind: string; variant: number; mode: DrawMode; activity: Activity; name: string; short: string }[] {
  const blocked = new Set(g.blocked)
  return [
    { kind: 'captain', variant: 0, mode: isMainBusy ? 'work' : 'still', activity: isMainBusy ? 'working' : 'sleeping', name: 'Captain', short: 'me' },
    ...snapshot.crew.map(m => {
      const pose = poseOf(m, blocked.has(m.name), false)
      return { kind: m.kind, variant: m.variant, mode: pose.mode, activity: pose.activity, name: m.name, short: (m.name.split('-').pop() ?? m.name).slice(0, 3) }
    }),
  ]
}

// Open the pane on a tab, with a member's row open or a Health section open (the band's click targets).
async function openPaneOn($: EngineInterface, tab: TabId, row: string, section = ''): Promise<void> {
  ui = { ...ui, tab, view: tab === 'items' ? 'items' : tab === 'crew' ? 'crew' : ui.view }
  openRow = row
  midOffset = 0
  if (section !== '') expanded.add(section)
  await saveUi($)
  await openPane($)
  $.ui.invalidate('ui.render')
}

const systemDotsNow = () => (snapshot.system.at === 0 ? [] : systemDots(snapshot.system.reading, snapshot.system.hosts))

function contextCardNow(now: number): string[] {
  const u = snapshot.usage
  return contextCard({ used: u?.used ?? null, window: u?.window ?? null, percent: ctxPercent(u), handoffMtimeMs: snapshot.handoffMtimeMs, nowMs: now })
}

// The plans the mod can read, Claude Max first then Codex: BOTH windows of each, always (limits.ts).
function poolsNow(now: number): Pool[] {
  return [claudePool(snapshot.rateLimits), codexPool(snapshot.limits, now, snapshot.footerWeek)]
}

// The six pools, in the strip's order, from what the snapshot holds. One model for the strip above the prompt, the
// Limits area and the cards. Nothing here reads a file or runs a command.
// The System pool's health icons (CPU, memory, disk, GPU when a listed host reports one), from the same gauges the card draws, grey until read.
const systemIconsNow = () => healthIcons(snapshot.system.reading, snapshot.system.hosts, snapshot.system.at !== 0)

function poolRowsNow(now: number): PoolRow[] {
  const sysSummary = snapshot.system.at === 0 ? { text: '' } : systemSummary(snapshot.system.reading, snapshot.system.hosts, snapshot.gateWaiting)
  const cr = snapshot.creditsFile
  const gpu = snapshot.system.hosts.find(h => h.gpu !== null)?.gpu ?? null
  const gpuPct = gpu !== null && gpu.totalMB > 0 ? (gpu.usedMB / gpu.totalMB) * 100 : null
  const crewOf = (kind: string): Member[] => snapshot.crew.filter(m => m.kind === kind)
  const cloudRunning = crewOf('cloud').filter(m => m.row.state === 'working').length
  const localRunning = crewOf('local').filter(m => m.row.state === 'working').length
  const u = snapshot.usage
  const rows: PoolRow[] = [
    systemRow({ dots: systemDotsNow(), summary: sysSummary.text.replace(/^System: /, ''), card: snapshot.system.at === 0 ? [] : systemCard(snapshot.system.reading, snapshot.system.hosts), icons: systemIconsNow() }),
    claudeRow({ ctx: { percent: ctxPercent(u), tokens: u?.used ?? null, window: u?.window ?? null }, windows: claudeWindows(snapshot.rateLimits, usageCache, now), cost: snapshot.cost, nowMs: now }),
    codexRow(codexPool(snapshot.limits, now, snapshot.footerWeek), now),
  ]
  // A pool with nothing to say is not drawn at all: no "other", no empty names (v8).
  // API (v9): measured only, this calendar month; drawn once the first read has answered.
  if (snapshot.apiSpend.state !== 'unread') rows.push(apiRow({ measured: snapshot.apiSpend.measured, limit: apiLimitOf(cr) }))
  if ((cr?.cloud?.expires ?? '') !== '' || cloudRunning > 0) rows.push(cloudRow(cr?.cloud?.expires ?? '', cloudRunning, now))
  if (snapshot.localUp !== null || gpuPct !== null || localRunning > 0) rows.push(localRow({ up: snapshot.localUp, gpuPct, running: localRunning }))
  return rows
}

// The plans whose pool is exhausted now; their bars are dimmed in the Limits area.
const outPools = (now: number): Set<string> => new Set(poolsNow(now).filter(p => poolState(p, now).exhausted).map(p => p.id))

function counts() {
  const working = snapshot.crew.filter(m => m.row.state === 'working').length
  return { working, idle: snapshot.crew.length - working, stuck: snapshot.crew.filter(m => m.isStuck), errored: snapshot.crew.filter(m => m.errored.errored) }
}

// The badges the band shows, most important first.
function badgesOf(g: Graph, now: number): Badge[] {
  const out: Badge[] = []
  const you = snapshot.status?.you ?? []
  if (you.length > 0) out.push({ text: 'you: ' + you.length, color: hasBlocking(you) ? '#F85149' : '#F0A500' })
  const stuck = counts().stuck
  if (stuck.length > 0) out.push({ text: stuck.length === 1 ? 'stuck?: ' + (stuck[0]?.name ?? '') : stuck.length + ' stuck?', color: '#F0A500' })
  // Errored sits next to blocked.
  const errored = counts().errored
  if (errored.length > 0) out.push({ text: errored.length === 1 ? 'errored: ' + shortName(errored[0]?.name ?? '', errored[0]?.kind ?? '') : errored.length + ' errored', color: '#B91C1C' })
  if (g.blocked.length > 0) out.push({ text: g.blocked.length + ' blocked', color: '#F0A500' })
  const pr = pressureNow(now)
  if (pr.level !== 'none') out.push({ text: 'context ' + (ctxPercent(snapshot.usage) ?? 0) + '%: handoff', color: pr.level === 'red' ? '#F85149' : '#F0A500' })
  const fresh = inboxNewCount(snapshot.inbox)
  if (fresh > 0) out.push({ text: fresh + ' new', color: '#2F81F7' })
  return out
}

// 0.5.1: Active and Away are AUTOPILOT off and on (the state file and its modes are unchanged: "away" is on, "active" is off).
const presenceView = () => ({ text: autopilotWord(snapshot.presence.mode === 'away'), isAway: snapshot.presence.mode === 'away', label: awayLabel(snapshot.presence, snapshot.at) })

function statusCardIn(now: number) {
  const s = displayStatus(now)
  const age = statusAge(s, now)
  return {
    hasStatus: s !== null,
    milestone: s?.milestone ?? '',
    ratio: statusRatio(s),
    count: statusCount(s),
    now: s?.now ?? [],
    next: s?.next ?? [],
    you: s?.you ?? [],
    age: age.label,
    isOld: age.isOld,
    presence: { ...presenceView(), label: awayLabel(snapshot.presence, now) },
    phase: now,
  }
}

// ---------------------------------------------------------------------------
// Commands

async function logAction($: EngineInterface, action: string, name: string, result: string): Promise<void> {
  const iso = new Date(await $.clock.now()).toISOString()
  await appendLine($, ACTIONS_LOG_PATH, actionLogLine(iso, action, name, result))
}

const factsOf = (name: string) => {
  const m = snapshot.crew.find(x => x.name === name)
  return m === undefined ? null : { exists: true, state: m.row.state, sinceMs: m.row.sinceMs, hasLock: m.row.lock !== null }
}

// Shows the confirm line; nothing happens until the person presses y (or runs /crew confirm).
async function proposeAction($: EngineInterface, action: ActionName, name: string): Promise<string> {
  await refresh($)
  const plan = planAction(action, name, factsOf(name), REPO_ROOT)
  if (!plan.ok) {
    await logAction($, action, name, 'refused: ' + plan.reason)
    return 'not done: ' + plan.reason
  }
  pending = { action, name, confirm: plan.confirm, at: await $.clock.now() }
  await openPane($)
  $.ui.invalidate('ui.render')
  return 'press y to confirm: ' + plan.confirm + ' (y in the Cockpit pane, or /cockpit confirm; n cancels)'
}

async function confirmPending($: EngineInterface): Promise<string> {
  const p = pending
  if (p === null) return 'nothing to confirm'
  pending = null
  const now = await $.clock.now()
  if (now - p.at > CONFIRM_TTL_MS) {
    await logAction($, p.action, p.name, 'expired')
    return 'that confirmation expired; ask again'
  }
  // The lane may have changed since the question: look again, and never act on a working one.
  await refresh($)
  const plan = planAction(p.action, p.name, factsOf(p.name), REPO_ROOT)
  if (!plan.ok) {
    await logAction($, p.action, p.name, 'refused at confirm: ' + plan.reason)
    return 'not done: ' + plan.reason
  }
  for (const step of plan.steps) {
    const r = await run($, step)
    if (!r.ok) {
      await logAction($, p.action, p.name, 'failed: ' + step.slice(0, 3).join(' '))
      return 'failed: ' + step.slice(0, 3).join(' ')
    }
  }
  await logAction($, p.action, p.name, 'done')
  await refresh($)
  return 'done: ' + p.action + ' ' + p.name
}

async function cancelPending($: EngineInterface): Promise<string> {
  if (pending === null) return 'nothing to cancel'
  const p = pending
  pending = null
  await logAction($, p.action, p.name, 'cancelled')
  $.ui.invalidate('ui.render')
  return 'cancelled: ' + p.action + ' ' + p.name
}

async function setPresence($: EngineInterface, mode: 'active' | 'away'): Promise<string> {
  const now = await $.clock.now()
  await writeFile($, PRESENCE_PATH, presenceText(mode, now))
  snapshot = { ...snapshot, presence: { mode, since: new Date(now).toISOString(), sinceMs: now } }
  $.ui.invalidate('ui.render')
  if (mode === 'away') return autopilotWord(true) + ': the crew keeps going; decisions and blocked items go to ' + relPath(AWAY_LOG_PATH)
  const n = snapshot.awayLog.length
  return autopilotWord(false) + ': ' + (n > 0 ? n + ' entr' + (n === 1 ? 'y' : 'ies') + ' in the away log (open /cockpit)' : 'nothing in the away log')
}

// Telling the captain (the session running in this pane). The mods API has a supported way: `$.prompt.submit({ text, asUser: true })` submits the
// text as the person's own words (read bare, no "plugin sent a message" frame; the transcript still names the plugin); it runs as a turn of its own
// once the session is idle, or queues behind the running one. If the host refuses or fails, the instruction is appended to
// .cockpit/inbox/captain.md and put in the prompt box (`$.prompt.fill`), and the toast says so. Either way a toast says what was sent.
export async function sendToCaptain($: EngineInterface, text: string): Promise<'submitted' | 'fallback'> {
  try {
    await $.prompt.submit({ text, asUser: true })
    $.ui.toast(sentToast(text))
    return 'submitted'
  } catch {
    // Fall back below: no terminal hacking, a file and the prompt box.
  }
  const now = await $.clock.now()
  await run($, ['mkdir', '-p', INBOX_DIR])
  await appendLine($, INBOX_DIR + '/' + CAPTAIN_FILE, captainLine(now, text), false)
  try {
    await $.prompt.fill({ text, mode: 'replace' })
  } catch {
    // The file has it.
  }
  $.ui.toast(fallbackToastFor(relPath(INBOX_DIR + '/' + CAPTAIN_FILE)))
  return 'fallback'
}

// AUTOPILOT: flip the presence state (the same file and hook behaviour as Away and Active had), then tell the captain. The click does not wait for
// the host to take the message (a turn may be running): the toast comes when it has.
export async function setAutopilot($: EngineInterface, on: boolean): Promise<string> {
  const reply = await setPresence($, on ? 'away' : 'active')
  void sendToCaptain($, autopilotMessage(on, relPath(AWAY_LOG_PATH))).catch(() => undefined)
  return reply + ' Telling the captain.'
}

// Add Bug and Add Idea, after Enter in the one-line field: append to inbox/bugs.md or ideas.md (and the Inbox tab's list), then send "Bug: <text>"
// or "Idea: <text>" to the captain. Empty text sends nothing and toasts what to type.
export async function submitInbox($: EngineInterface, kind: InboxKind, raw: string): Promise<string> {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (text === '') {
    $.ui.toast(typeHint(kind))
    return typeHint(kind)
  }
  const saved = await addInbox($, kind, text)
  if (!saved.startsWith('Saved')) return saved
  void sendToCaptain($, inboxMessage(kind, text)).catch(() => undefined)
  return saved + ' Telling the captain.'
}

// `/cockpit bug <text>` and `/cockpit idea <text>` (and the Inbox tab's field): one line "- <ISO time> <text>" appended to
// .cockpit/inbox/bugs.md or ideas.md (the folder and file are made when missing), then a toast "Saved". Empty text is refused with a toast
// that says what to type. The Inbox tab still reads inbox.jsonl, so the same item is added there too.
export async function addInbox($: EngineInterface, kindWord: string, text: string): Promise<string> {
  const kind = inboxKindOf(kindWord)
  if (kind === null) return 'not added: kind must be bug or idea'
  const now = await $.clock.now()
  const md = inboxMdLine(kind, text, now)
  if (!md.ok) {
    $.ui.toast(md.error)
    return md.error
  }
  const file = INBOX_DIR + '/' + inboxMdFile(kind)
  await run($, ['mkdir', '-p', INBOX_DIR])
  if (!(await appendLine($, file, md.line, false))) {
    const msg = 'Not saved: could not write ' + file + '. Check that ' + relPath(INBOX_DIR) + ' can be written, then try again.'
    $.ui.toast(msg)
    return msg
  }
  const items = parseInbox((await readText($, INBOX_PATH)) ?? '')
  const r = inboxAddLine(kind === 'idea' ? 'idea' : 'bug', text, now, new Set(items.map(i => i.id)))
  if (r.ok) await appendLine($, INBOX_PATH, r.line + '\n')
  await refresh($)
  $.ui.toast('Saved')
  return 'Saved ' + kind + ': ' + md.shown + ' (' + relPath(INBOX_DIR) + '/' + inboxMdFile(kind) + ')'
}

// The Add Bug and Add Idea buttons: put "/cockpit bug " (or idea) in the prompt box, ready for the text. If the host cannot fill the box (a dialog
// is up, or no composer), a one-line toast says what to type instead.
export async function startInbox($: EngineInterface, kind: InboxKind): Promise<void> {
  try {
    const r = await $.prompt.fill({ text: promptStarter(kind), mode: 'replace' })
    if (r.isFilled) {
      $.ui.toast('Prompt ready: type the ' + kind + ' after /cockpit ' + kind + ' and press Enter.')
      return
    }
  } catch {
    // fall through to the hint
  }
  $.ui.toast(typeHint(kind))
}

async function writeHandoff($: EngineInterface): Promise<string> {
  await refresh($)
  const now = await $.clock.now()
  const path = HANDOFF_DIR + '/' + handoffName(now)
  const text = buildHandoff({
    nowMs: now,
    status: displayStatus(now),
    locks: snapshot.crew.filter(m => m.row.lock !== null).map(m => ({ member: m.name, item: m.row.lock?.item ?? '', heading: m.heading })),
    queue: snapshot.queue,
    landed: snapshot.landed,
  })
  await writeFile($, path, text)
  snapshot = { ...snapshot, handoffMtimeMs: now }
  return path
}

// What exists for the empty-state check (config.ts isEmptyWorld).
const emptyFacts = () => ({ crew: snapshot.crew.length, hasStatus: snapshot.status !== null, claims: snapshot.claims.length, reports: snapshot.flight.length, inbox: snapshot.inbox.length })

function statusText(now: number): string {
  const s = displayStatus(now)
  const g = graphOf()
  const out: string[] = []
  if (isEmptyWorld(emptyFacts())) out.push(...emptyStateLines(cfg))
  out.push('Config: ' + (cfg.sources.length > 0 ? cfg.sources.join(', ') : 'none (defaults)') + '; project ' + cfg.root + '; data ' + cfg.dataDir)
  for (const w of cfg.warnings) out.push('Config warning: ' + w)
  const age = statusAge(s, now)
  out.push((s?.milestone || 'Status') + (statusCount(s) !== '' ? ' (' + statusCount(s) + ')' : '') + '  ' + age.label + (age.isOld ? ' (status may be old)' : ''))
  out.push('Now: ' + ((s?.now ?? []).join(' | ') || 'nothing'))
  out.push('Next: ' + ((s?.next ?? []).join(', ') || 'nothing'))
  out.push('You: ' + ((s?.you ?? []).length > 0 ? (s?.you ?? []).map(a => a.text + (a.blocking !== '' ? ' [blocking: ' + a.blocking + ']' : '')).join(' | ') : 'nothing'))
  out.push(snapshot.presence.mode === 'away' ? awayLabel(snapshot.presence, now) : presenceView().text)
  if (snapshot.crew.length === 0) out.push('no crew running')
  for (const m of snapshot.crew) {
    const b = blockedBy(g, m.name)
    out.push(
      m.name + '  ' + activityPill(statusWordOf(m.activity, { blocked: b !== null }), m.target) + '  ' + m.powered.text + (b ? '  blocked by ' + b.on : '') + (m.isStuck ? '  stuck?' : '') +
        (m.errored.errored ? '  errored' + (m.errored.reason !== '' ? ': ' + m.errored.reason : '') : '') +
        (m.exhaustion.exhausted ? '  out of credits' + (m.exhaustion.backAtMs !== null ? ', ' + backText(m.exhaustion.backAtMs) : '') : '') +
        '  ' + m.desc,
    )
  }
  out.push(queueSummary(snapshot.queue.total) + '  ' + backlogSummary(snapshot.backlog) + '  ' + inboxSummary(inboxNewCount(snapshot.inbox)))
  out.push(landedSummary(snapshot.landed) + '  ' + healthSummary({ services: snapshot.health.services, credits: snapshot.health.credits }))
  out.push(...poolsNow(now).map(p => poolSummary(p).text))
  out.push(apiLineNow(), ...cloudCredits(now).map(c => c.name + ': ' + c.text))
  out.push(snapshot.system.at === 0 ? 'System: checking' : systemSummary(snapshot.system.reading, snapshot.system.hosts, snapshot.gateWaiting).text)
  if (snapshot.note) out.push(snapshot.note)
  return out.join('\n')
}

async function runCrew($: EngineInterface, args: string): Promise<{ text: string }> {
  ensureStarted($)
  // v14: the Deck's verbs (layout, reset, deck, motion, panels) are tried first; they are not crew verbs.
  const dc = parseDeckArgs(args)
  if (dc !== null) return { text: await runDeck($, dc) }
  const c = parseCrewArgs(args)
  if (c.cmd === 'toggle') return { text: (await togglePane($)) ? 'Cockpit opened.' : 'Cockpit closed.' }
  if (c.cmd === 'status') {
    await refresh($)
    return { text: statusText(await $.clock.now()) }
  }
  if (c.cmd === 'usage') {
    // The last fallback: the plan usage by hand. Written to the cache like a live reading, marked manual.
    const now = await $.clock.now()
    const parsed = parseUsageArgs(c.args, now)
    if (!parsed.ok) return { text: 'not done: ' + parsed.error }
    usageCache = applyManual(usageCache, parsed.set, now)
    await writeFile($, USAGE_CACHE_PATH, serializeUsageCache(usageCache))
    await appendLine($, USAGE_DEBUG_PATH, new Date(now).toISOString() + '\tmanual\t' + parsed.set.map(s => s.slot + '=' + s.pct).join(' ') + '\n')
    $.ui.invalidate('ui.render')
    return { text: 'usage saved (' + parsed.set.map(s => (s.slot === 'fiveHour' ? '5h' : s.slot === 'week' ? 'wk' : 'fable') + ' ' + s.pct + '%').join(', ') + '), ' + asOfText(now) }
  }
  if (c.cmd === 'autopilot') return { text: await setAutopilot($, c.arg === 'toggle' ? snapshot.presence.mode !== 'away' : c.arg === 'on') }
  if (c.cmd === 'away') return { text: await setAutopilot($, true) }
  if (c.cmd === 'back') return { text: await setAutopilot($, false) }
  if (c.cmd === 'confirm') return { text: await confirmPending($) }
  if (c.cmd === 'cancel') return { text: await cancelPending($) }
  if (c.cmd === 'start' || c.cmd === 'restart' || c.cmd === 'clear') {
    if (c.name === '') return { text: 'usage: /cockpit ' + c.cmd + ' <session name>, for example /cockpit ' + c.cmd + ' codex-e' }
    return { text: await proposeAction($, c.cmd, c.name) }
  }
  if (c.cmd === 'bug' || c.cmd === 'idea' || c.cmd === 'feature') return { text: await addInbox($, c.cmd, c.text) }
  if (c.cmd === 'view') {
    // "/crew view crew" or "items" sets it; "/crew view" alone flips it. It is remembered across reloads.
    const mode = c.mode !== '' ? c.mode : ui.view === 'crew' ? 'items' : 'crew'
    ui = { ...ui, view: mode, tab: mode }
    await saveUi($)
    $.ui.invalidate('ui.render')
    return { text: 'view: ' + (ui.view === 'crew' ? 'by crew' : 'by item') }
  }
  const word = c.cmd === 'unknown' ? c.word : ''
  return {
    text: 'unknown: /cockpit ' + word + '. Try /cockpit, /cockpit status, layout auto|compact|wide|mini, reset, deck, motion on|off, panels <list>, view crew|items, autopilot on|off, start|restart|clear <name>, confirm, cancel, bug <text>, idea <text>, usage 5h=<pct> wk=<pct> fable=<pct>.',
  }
}

// ---------------------------------------------------------------------------
// Drawing

type KitFn = (props: any) => any
// Box, Text and Button exist on every surface; Svg only on the desktop.
type Kit = { Box: KitFn; Text: KitFn; Button: KitFn; Svg: KitFn; [k: string]: KitFn }

/**
 * The Autopilot control's word, everywhere it is drawn (the band and the pane's button row): the word AUTOPILOT in grey when off and green when on, no
 * chip, no "on" or "off". On a surface with an Svg it is that drawing, whose `alt` is "Autopilot off" or "Autopilot on"; on one without (a terminal) a
 * coloured Text. The one-glyph Button beside it does the pressing.
 */
export function autopilotMark(kit: Kit, key: string, on: boolean, hasSvg = 'Svg' in kit): unknown {
  return hasSvg
    ? kit.Svg({ key, source: autopilotSvg(on), alt: autopilotAlt(on), width: AUTOPILOT_W, height: AUTOPILOT_H })
    : kit.Text({ key, color: on ? 'green' : 'gray', bold: true, wrap: 'truncate-end', children: [AUTOPILOT] })
}

// Whether the band's icons ask the host to draw them in its script-less frame (`isInteractive`), which is what lets a `<title>` tooltip show on hover.
// Off: each icon is a plain image whose `alt` carries "CPU load 3.1, healthy" for a screen reader; the frame's background on a dark theme is unverified.
export const ICON_TOOLTIPS = false

/**
 * COCKPIT-32: the band's icon groups, one definition. The credit icons (cloud, coin) end the middle row; the System icons (CPU, memory, disk, GPU) end the
 * bottom row. Each icon is its own small Svg with an accessible label; an Svg takes no press, so ONE native one-glyph Button follows each group
 * (no press target: nothing in the bar is an expand control).
 */
export function creditNodes(kit: Kit, icons: readonly CreditIcon[]): unknown {
  return kit.Box({
    key: 'strip-credit',
    flexDirection: 'row',
    alignItems: 'center',
    children: [
      ...icons.map(ic => kit.Svg({ key: 'ci-' + ic.id, source: glyphDoc(ic.kind, ic.hex, BAND_ICON_CELL, STRIP_H, BAND_ICON, ic.tip), alt: ic.tip, width: BAND_ICON_CELL, height: STRIP_H })),
    ],
  })
}
export function systemNodes(kit: Kit, icons: readonly HealthIcon[]): unknown[] {
  if (icons.length === 0) return []
  return [
    kit.Box({
      key: 'strip-system',
      flexDirection: 'row',
      alignItems: 'center',
      children: [
        ...icons.map(ic => kit.Svg({ key: 'hi-' + ic.kind, source: glyphDoc(ic.kind, ic.hex, BAND_ICON_CELL, STRIP_H, BAND_ICON, ic.tip), alt: ic.tip, width: BAND_ICON_CELL, height: STRIP_H })),
      ],
    }),
  ]
}


// One chevron column for every row: 3 cells wide, the glyph centered in it and with its row, the same x on every
// row (a row with nothing to open gets an empty column). The Svg is `rowWidth` wide beside it.
const CHEV_COLS = 3
const rowWidth = (W: number): number => W - CHEV_COLS * 8
const chevronCol = (kit: Kit, key: string, button: unknown): unknown =>
  kit.Box({ key: 'chev-' + key, width: CHEV_COLS, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', children: button === null ? [] : [button] })

const toggleBtn = (kit: Kit, $: EngineInterface, key: string, label: string, hotkey: string) =>
  kit.Button({
    key,
    label,
    ...(hotkey !== '' ? { hotkey } : {}),
    plain: true,
    onPress: () => {
      if (expanded.has(key)) expanded.delete(key)
      else expanded.add(key)
      void saveUi($)
      $.ui.invalidate('ui.render')
    },
  })

// ---------------------------------------------------------------------------
// "By item": the work items from the locks, briefs, reports, what landed, who waits on whom and the crew.

const idOfItem = (s: string): string => itemId({ owner: '', lane: '', time: '', item: s }).toLowerCase()

function itemsNow(g: Graph, now: number): Item[] {
  const crew = snapshot.crew.map(m => ({ name: m.name, kind: m.kind, variant: m.variant, state: m.row.state, activity: m.activity as string, sinceMs: m.row.sinceMs, ratio: progressRatio(m.progress), isStale: m.row.isStale }))
  // Locks of live members are fresh (every 5 s); the other lock files come from the slower read.
  const fresh: ItemLockIn[] = snapshot.crew.filter(m => m.row.lock !== null).map(m => ({ member: m.name, item: m.row.lock?.item ?? '', mtimeMs: m.lockMtimeMs }))
  const locks = [...fresh, ...snapshot.allLocks.filter(l => !fresh.some(f => f.member === l.member && idOfItem(f.item) === idOfItem(l.item)))]
  const deps = g.edges.filter(e => !e.faded).map(e => ({ member: e.from, on: e.to, why: e.why }))
  const allReportIds = new Set([...snapshot.reportNames].filter(n => n.endsWith('-report.md')).map(n => n.replace(/-report\.md$/, '').toLowerCase()))
  return buildItems(locks, snapshot.briefs, snapshot.itemReports, snapshot.landed, deps, crew, {
    nowMs: now,
    allReportIds,
    // The name of the whole family: crew-targets.json by "b21" even when the latest variant is "b21c".
    nameOf: (id, heading) => {
      const family = itemFamily(id).family
      return targetOf(Object.keys(targets).some(k => k.toLowerCase() === family) ? family : id, heading, targets)
    },
    statusNow: snapshot.status?.now,
    statusNext: snapshot.status?.next,
  })
}

function itemRowIn(it: Item, index: number, now: number): ItemRowIn {
  return {
    index,
    title: it.title,
    id: it.latest,
    status: it.status,
    assignees: it.assignees.map(a => ({
      name: a.name,
      kind: a.kind,
      variant: a.variant,
      mode: (a.state === 'working' ? 'work' : 'idle') as DrawMode,
      activity: a.activity as Activity,
      pill: statusWordOf(a.activity as Activity),
    })),
    blockedBy: it.blockedBy,
    since: it.sinceAt !== null ? ageLabel(now - it.sinceAt) : '',
    gate: it.gate === null ? '' : 'gate exit ' + it.gate.exit + (it.gate.scope !== '' ? ' (' + it.gate.scope + ')' : ''),
    ratio: it.ratio,
    phase: now,
  }
}

const SECTION: Record<Item['group'], string> = { now: 'Now', next: 'Next', other: 'Other' }

// The By item part of the pane: sections (Now, Next, the rest), one svg per item, landed collapsed under a
// summary line, number keys to pick an item and see its brief and report paths.
// An item held by an errored member comes first (Addendum 2), then the rest in their sections.
const itemIsErrored = (it: Item): boolean => it.assignees.some(a => a.activity === 'errored')

// "Mine": the items that wait on the person (blocked on "you" or "you").
const itemIsMine = (it: Item): boolean => it.blockedBy !== null && /^(you|you)$/i.test(it.blockedBy.on)

function itemsPart(kit: Kit, $: EngineInterface, W: number, now: number, g: Graph): Block[] {
  const { Box, Text, Button } = kit
  const draw = (key: string, source: string, alt: string, height: number) => kit.Svg({ key, source, alt, width: W, height })
  const out: Block[] = []
  const put = (key: string, el: unknown, h: number) => out.push({ key, el, h })
  const all = itemsNow(g, now)
  const wanted = (i: Item) => !ui.mine || itemIsMine(i)
  const open = all.filter(i => i.status !== 'landed' && wanted(i))
  const landed = all.filter(i => i.status === 'landed' && wanted(i))
  const shown = [...open.filter(itemIsErrored), ...open.filter(i => !itemIsErrored(i))].slice(0, 40)
  put('h-items', Text({ key: 'h-items', bold: true, children: ['Items (' + open.length + ' open, ' + landed.length + ' landed today' + (ui.mine ? ', mine' : '') + ')'] }), ROW_PX)
  if (all.length === 0) put('no-items', Text({ key: 'no-items', dimColor: true, children: ['no items'] }), ROW_PX)
  let group: Item['group'] | '' | 'errored' = ''
  shown.forEach((it, i) => {
    const g2: Item['group'] | 'errored' = itemIsErrored(it) ? 'errored' : it.group
    if (g2 !== group) {
      group = g2
      put('h-g-' + group, Text({ key: 'h-g-' + group, dimColor: true, children: [group === 'errored' ? 'Errored' : SECTION[group]] }), ROW_PX)
    }
    const row = itemRowIn(it, i < 9 ? i + 1 : 0, now)
    put('svg-item-' + it.family, draw('svg-item-' + it.family, itemRowSvg(W, row), 'Item ' + it.family + ' ' + ITEM_STATUS_LABEL[it.status] + ': ' + it.title, itemRowHeight(row)), itemRowHeight(row))
  })
  if (open.length > shown.length) put('items-more', Text({ key: 'items-more', dimColor: true, children: ['+' + (open.length - shown.length) + ' more'] }), ROW_PX)

  // A visible button per item picks it (its brief and report paths are shown as plain text); no number hotkeys,
  // which belong to the tabs.
  if (shown.length > 0) {
    put(
      'item-keys',
      Box({
        key: 'item-keys',
        flexDirection: 'row',
        columnGap: 2,
        children: shown.slice(0, 9).map((it, i) => Button({ key: 'item-' + (i + 1), label: it.family, plain: true, onPress: () => { selectedItem = it.family; $.ui.invalidate('ui.render') } })),
      }),
      ROW_PX,
    )
  }
  const picked = all.find(i => i.family === selectedItem)
  if (picked !== undefined) {
    put('pick-title', Text({ key: 'pick-title', bold: true, children: [picked.family + ': ' + picked.title + ' (' + picked.status + ')'] }), ROW_PX)
    put('pick-brief', Text({ key: 'pick-brief', wrap: 'truncate-end', children: ['brief: ' + (picked.briefName !== '' ? QUEUE_DIR + '/' + picked.briefName : 'none')] }), ROW_PX)
    put('pick-report', Text({ key: 'pick-report', wrap: 'truncate-end', children: ['report: ' + (picked.reportName !== '' ? REPORTS_DIR + '/' + picked.reportName : 'none')] }), ROW_PX)
    if (picked.hashes.length > 0) put('pick-hashes', Text({ key: 'pick-hashes', wrap: 'truncate-end', children: ['landed: ' + picked.hashes.join(', ')] }), ROW_PX)
  }

  // Landed today: one line, opens on a click.
  put('landed-items', toggleBtn(kit, $, 'landed-items', 'Landed items: ' + landed.length, 'l'), ROW_PX)
  if (expanded.has('landed-items')) {
    for (const it of landed) {
      const row = itemRowIn(it, 0, now)
      put('svg-item-' + it.family, draw('svg-item-' + it.family, itemRowSvg(W, row), 'Item ' + it.family + ' landed: ' + it.title, itemRowHeight(row)), itemRowHeight(row))
    }
  }
  return out
}

// The section cards: only the sections in `ids`, each shown when it is open (a chip opened it) or `forceOpen`
// (its own tab). The chips row and the tabs carry the toggles, so there are no toggle lines here.
function detailCards(kit: Kit, $: EngineInterface, W: number, now: number, g: Graph, ids: readonly string[], forceOpen: boolean): Block[] {
  const els: unknown[] = []
  let height = 0
  // Every card is pushed with its pixel height, so the pinned layout can count them.
  const out = {
    push: (el: unknown): void => {
      els.push(el)
    },
  }
  const draw = (key: string, source: string, alt: string, h: number) => {
    height += h
    // Drawn as an image, never in a frame: a frame paints its own white canvas on a dark theme.
    return kit.Svg({ key, source, alt, width: W, height: h })
  }
  const open = (id: string): boolean => ids.includes(id) && (forceOpen || expanded.has(id))

  if ((ids.includes('away') || open('inbox')) && snapshot.presence.mode === 'active' && snapshot.awayLog.length > 0) {
    const entries: WrapEntry[] = snapshot.awayLog.slice(0, 12).map(a => ({
      pill: a.kind === 'blocked' ? { text: 'BLOCKED', color: '#EF4444' } : a.kind === 'decision' ? { text: 'decided', color: '#2F81F7' } : undefined,
      text: a.text,
    }))
    height += ROW_PX
    out.push(draw('svg-away', wrapCardSvg(W, 'While you were away', entries), 'While you were away: ' + entries.length + ' entries', wrapHeight(W, entries)))
    out.push(kit.Button({ key: 'away-clear', label: 'clear log', hotkey: 'x', plain: true, onPress: () => void $.fs.write(AWAY_LOG_PATH, '').then(() => { snapshot = { ...snapshot, awayLog: [] }; $.ui.invalidate('ui.render') }) }))
  }

  // In the By item view the queue is the queued items: its own summary and the landed commits are left out.
  if (open('queue')) {
    const rows: ListRow[] = snapshot.queue.items.map(i => ({ text: i.id + (i.heading !== '' ? ': ' + i.heading : '') }))
    out.push(draw('svg-queue', listCardSvg(W, 'Queue (newest first)', rows, 'nothing waiting'), queueSummary(snapshot.queue.total), listHeight(rows.length)))
  }

  if (open('backlog') && snapshot.backlog !== null) {
    const b = snapshot.backlog
    const top = backlogTop(b, 8)
    const rows: ListRow[] = top.map(i => ({ dot: i.state === 'progress' ? '#F0A500' : '#8B949E', text: i.id + ': ' + i.title }))
    out.push(draw('svg-backlog', listCardSvg(W, 'Backlog: ' + b.open + ' open, ' + b.progress + ' in progress, ' + b.done + ' done', rows, 'nothing open'), 'Backlog: ' + (b.open + b.progress) + ' open', listHeight(rows.length)))
  }

  const fresh = newInboxItems(snapshot.inbox, 6)
  if (open('inbox')) {
    const filed = snapshot.inbox.filter(i => i.status === 'filed').slice(-3)
    const entries: WrapEntry[] = [
      ...fresh.map(i => ({ pill: { text: i.kind, color: i.kind === 'bug' ? '#EF4444' : '#2F81F7' }, text: i.text, note: i.atMs !== null ? ageText(now - i.atMs) : '' })),
      ...filed.map(i => ({ pill: { text: 'filed: ' + (i.ref || 'yes'), color: '#3B9C5F' }, text: i.text, note: i.atMs !== null ? ageText(now - i.atMs) : '' })),
    ]
    out.push(draw('svg-inbox', wrapCardSvg(W, 'Inbox', entries, 'nothing new'), inboxSummary(inboxNewCount(snapshot.inbox)), wrapHeight(W, entries)))
  }

  const h = snapshot.health
  const hSummary = h.at === 0 ? 'Health: checking' : healthSummary({ services: h.services, credits: h.credits })
  if (open('health')) {
    const color = (d: Dot) => (d === 'green' ? '#3FB950' : d === 'red' ? '#F85149' : '#8B949E')
    const pools = poolsNow(now)
    const rows: ListRow[] = [
      // Each service the config lists, by its own name, up (with its time), down or unknown; none listed, none shown.
      ...h.services.map(s => ({ dot: color(s.dot), text: s.name, right: serviceWord(s), rightColor: color(s.dot) })),
      // BOTH windows of every plan, never one alone, in the worse of the two colours.
      ...pools.map(p => ({ dot: poolSummary(p).color, text: poolSummary(p).text })),
      { text: apiLineNow() },
      ...cloudCredits(now).map(c => ({ text: c.name + ': ' + c.text })),
    ]
    out.push(draw('svg-health', listCardSvg(W, 'Health and limits', rows), 'Health: ' + hSummary + '; ' + poolsLine(pools), listHeight(rows.length)))
  }

  // System resources: the gauges.
  const sys = systemSummary(snapshot.system.reading, snapshot.system.hosts, snapshot.gateWaiting)
  const sysText = snapshot.system.at === 0 ? 'System: checking' : sys.text
  if (open('system')) {
    const card = {
      gauges: gaugesOf(snapshot.system.reading, snapshot.system.hosts),
      top: topLine(snapshot.system.reading.top),
      hint: sys.gateHint ? 'gate blocked by memory?' : '',
    }
    out.push(draw('svg-system', systemCardSvg(W, card), sysText, systemHeight(card)))
  }

  const landedText = landedSummary(snapshot.landed)
  if (open('landed')) {
    const rows: ListRow[] = snapshot.landed.map(l => ({
      text: l.hash + ' ' + l.subject,
      right: l.gate === null ? '' : 'gate ' + l.gate,
      rightColor: l.gate === 0 ? '#3FB950' : '#F85149',
    }))
    out.push(draw('svg-landed', listCardSvg(W, 'Landed today (origin/main, local refs)', rows, 'nothing yet today'), landedText, listHeight(rows.length)))
  }

  if (open('deps')) {
    const sprites = new Map<string, GraphSprite>(snapshot.crew.map(m => [m.name, { kind: m.kind, variant: m.variant, mode: modeOf(m), activity: m.activity }]))
    out.push(draw('svg-deps', graphSvg(W, g, sprites), 'Blocked by: ' + g.blocked.length, graphHeight(g)))
  }
  // The away log's "clear log" button is one text row; the open sections are one block, as tall as they are.
  return els.length === 0 ? [] : [{ key: 'sections-' + ids.join('-'), el: kit.Box({ key: 'sections-' + ids.join('-'), flexDirection: 'column', children: els }), h: height }]
}

// ---------------------------------------------------------------------------
// The v6 pane (desktop): the Status card pinned on top, the tab strip, the tab's content (windowed), the Limits
// area pinned at the bottom. The Svgs are the look; everything pressable is a native Button.

const ITEM_CAP = 12
// One mapping for the Items pills: red means failed, never queued; queued is muted grey, a stale lock is amber.
const itemPill = (s: Item['status']): { text: string; color: string } => ({ text: ITEM_STATUS_LABEL[s], color: ITEM_STATUS_COLOR[s] })

// What the Status card shows: status.json when there is one, else what the live sources say (the members that
// are awake, the first open BACKLOG rows, the inbox), else "Today" with what landed.
// The progress bar grows from where it was when the done count rises (a one-shot animation, redrawn for a few seconds).
// v10: the Status card tracks itself. status.json is the plan; NOW, the stale chip and the done count come from what is
// live (hooks/statuslive.ts has the rules and the table of sources). Nothing here writes status.json.
function liveStatusNow(now: number): LiveStatus {
  return deriveLive({
    status: snapshot.status,
    members: snapshot.crew.map(m => ({
      name: m.name,
      awake: m.activity !== 'sleeping',
      label: m.target !== '' ? m.target : m.name,
      lockItem: m.itemId,
      // The live item's own time comes from its claim; a lane lock's time no longer stands for it (it may be old).
      lockMtimeMs: null,
      sinceMs: m.row.sinceMs,
    })),
    claims: snapshot.claims,
    reports: snapshot.itemReports.map(r => ({ id: r.id, mtimeMs: r.mtimeMs })),
    landed: snapshot.landed.map(l => ({ hash: l.hash, subject: l.subject })),
    nowMs: now,
  })
}

// The status as the card shows it: the file's plan fields, with NOW from what is live and done moved by what landed.
function displayStatus(now: number): Status | null {
  const s = snapshot.status
  if (s === null) return null
  const live = liveStatusNow(now)
  return { ...s, now: live.now, next: live.next, done: live.done }
}

let lastDone: { done: number; ratio: number } | null = null
let grew: { from: number; at: number } | null = null
const GROW_MS = 4000
function progressGrewFrom(now: number): number | null {
  const s = displayStatus(now)
  const done = s?.done ?? null
  const ratio = statusRatio(s)
  if (done !== null && ratio !== null) {
    if (lastDone !== null && done > lastDone.done) grew = { from: lastDone.ratio, at: now }
    if (lastDone === null || done !== lastDone.done) lastDone = { done, ratio }
  }
  return grew !== null && now - grew.at < GROW_MS ? grew.from : null
}
// COCKPIT-31: "1 OUT OF CREDIT" (or "2 RATE LIMITED") for the status card and the band; '' when no member is refused.
function outageChipText(): string {
  const top = outageCounts(snapshot.crew.map(m => m.outage))
  const first = top[0]
  if (first === undefined) return ''
  return top.length === 1 ? first.n + ' ' + first.phrase.toUpperCase() : top.reduce((a, o) => a + o.n, 0) + ' REFUSED'
}
function lookStatusIn(now: number): LookStatus {
  const live = liveStatusNow(now)
  const s = displayStatus(now)
  const pres = presenceView()
  const claimed = new Set([...snapshot.lockItems.values()].map(v => v.toLowerCase()))
  const derivedNext = snapshot.backlog === null ? [] : snapshot.backlog.items.filter(i => i.state === 'open' && !claimed.has(i.id.toLowerCase())).slice(0, 3).map(i => i.id + ': ' + i.title)
  const nowList = live.now
  const nextList = live.next.length > 0 ? live.next : derivedNext
  const you = s?.you ?? []
  const inboxNew = inboxNewCount(snapshot.inbox)
  const youItems = you.length > 0 ? you.map(a => a.text + (a.blocking !== '' ? ' [blocking: ' + a.blocking + ']' : '')) : inboxNew > 0 ? [inboxNew + ' new in the inbox'] : []
  const hasMilestone = s !== null && s.milestone !== ''
  return {
    title: hasMilestone ? s?.milestone ?? '' : 'Today',
    ratio: hasMilestone ? statusRatio(s) : null,
    count: statusCount(s),
    note: hasMilestone ? '' : snapshot.landed.length + ' landed',
    now: nowList.join(' \u00b7 '),
    next: nextList.join(', '),
    you: youItems.join(' \u00b7 '),
    youHex: hasBlocking(you) ? RED_HEX : AMBER_HEX,
    isAway: pres.isAway,
    presenceText: pres.text,
    // v10: stale only when status.json is over 30 minutes old AND nothing live backs the card (a lane awake, a fresh claim).
    stale: live.stale !== '' ? 'stale: ' + live.stale : '',
    outage: outageChipText(),
    phase: now,
    nowItems: nowList,
    nextItems: nextList,
    youItems,
    // v17: the card opens whole, like a crew card: NOW, NEXT and YOU each as a wrapped, multi-line section.
    open: { now: expanded.has('status') || statusOpen.has('now'), next: expanded.has('status') || statusOpen.has('next'), you: expanded.has('status') || statusOpen.has('you') },
  }
}

// The Flight log's entries: the judged reports, and the crew members the crew module detects as errored or blocked.
function flightEntriesNow(g: Graph, now: number): FlightEntry[] {
  const troubles: CrewTrouble[] = snapshot.crew.flatMap((m): CrewTrouble[] => {
    const blk = blockedBy(g, m.name)
    return m.errored.errored ? [{ name: m.name, kind: 'errored', reason: m.errored.reason, sinceMs: m.row.sinceMs }] : blk !== null ? [{ name: m.name, kind: 'blocked', reason: 'blocked by ' + blk.on + (blk.why !== '' ? ': ' + blk.why : ''), sinceMs: m.row.sinceMs }] : []
  })
  return [...snapshot.flight, ...crewEntries(troubles, now)]
}

// COCKPIT-35: the fixed top-to-bottom order of the cards below the crew rows: the expand id that opens each and the block keys it draws.
export const LOWER_CARDS = [
  { open: 'c-system', keys: ['cs-system'] },
  { open: 'flight-all', keys: ['svg-flight', 'flight-more'] },
  { open: 'c-blackbox', keys: ['cs-blackbox', 'svg-blackbox'] },
] as const

export function paneSvgTree($: EngineInterface, kit: Kit, bodyColumns: number, bodyRows: number | undefined, now: number, g: Graph, pendingLine: unknown[], reply: unknown[]): unknown {
  const { Box, Text, Button } = kit
  const W = Math.max(240, Math.min(900, (bodyColumns || 40) * 8 - 8))
  const draw = (key: string, source: string, alt: string, height: number, width = W) => kit.Svg({ key, source, alt, width, height })
  const pres = presenceView()
  const subs = snapshot.subs.slice(-MAX_SUBAGENTS).reverse()
  // An ACTIVE row (tone green), the Captain's included, gets the animated border; with motion off (/cockpit motion off) it is a still coloured one.
  const motionOn = effectiveMotion(deckCfg, deckView)
  const bordered = (row: LookRow): LookRow => ({ ...row, border: borderFor(row.tone, motionOn) })

  // ---- Pinned top: a) the Status card (expandable, no Active chip), b) the button row, then the tab strip, the confirm and reply lines.
  const wS = rowWidth(W)
  const status = lookStatusIn(now)
  const isStatusOpen = expanded.has('status')
  const statusH = lookStatusHeight(wS, status)
  const statusAlt = 'Status: ' + status.title + '. Now: ' + (status.now || 'nothing') + '. Next: ' + (status.next || 'nothing') + '. You: ' + (status.you || 'nothing')
  const head = Box({
    key: 'status-row',
    flexDirection: 'row',
    alignItems: 'center',
    children: [
      draw('svg-status', lookStatusSvg(wS, status), statusAlt, statusH, wS),
      chevronCol(kit, 'status', Button({ key: 'status-open', label: isStatusOpen ? '\u25be' : '\u25b8', plain: true, onPress: () => { if (expanded.has('status')) expanded.delete('status'); else expanded.add('status'); void saveUi($); $.ui.invalidate('ui.render') } })),
    ],
  })
  // AUTOPILOT replaces Active and Away: the word AUTOPILOT drawn in the state's colour (grey off, green on, no chip) beside a one-glyph Button. Add Bug and Add Idea open a one-line field under the row (where a field
  // exists on the surface; otherwise they put the command in the prompt box as before).
  const hasInput = 'Input' in kit
  const openField = (kind: InboxKind): void => {
    if (!hasInput) {
      void startInbox($, kind)
      return
    }
    adding = adding === kind ? '' : kind
    $.ui.invalidate('ui.render')
  }
  const inboxField =
    adding !== '' && hasInput
      ? [
          Box({
            key: 'inbox-field',
            flexDirection: 'row',
            paddingX: 1,
            children: [
              Input_(kit, {
                key: 'inbox-input',
                label: (adding === 'bug' ? 'Bug' : 'Idea') + ':',
                placeholder: adding === 'bug' ? 'what went wrong' : 'what you would like',
                autoFocus: true,
                submitLabel: 'send',
                onSubmit: (v: string) => {
                  const kind: InboxKind = adding === 'idea' ? 'idea' : 'bug'
                  adding = ''
                  void submitInbox($, kind, v).then(t => { replyLine = t; $.ui.invalidate('ui.render') })
                },
              }),
            ],
          }),
        ]
      : []
  const buttonRow = Box({
    key: 'button-row',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingX: 1,
    children: [
      Box({
        key: 'button-row-left',
        flexDirection: 'row',
        alignItems: 'center',
        columnGap: 1,
        children: [
          Button({ key: 'add-bug', label: 'Add Bug', variant: adding === 'bug' ? 'primary' : 'secondary', onPress: () => openField('bug') }),
          Button({ key: 'add-idea', label: 'Add Idea', variant: adding === 'idea' ? 'primary' : 'secondary', onPress: () => openField('idea') }),
        ],
      }),
      Box({
        key: 'button-row-right',
        flexDirection: 'row',
        alignItems: 'center',
        columnGap: 1,
        children: [
          autopilotMark(kit, 'autopilot-state', pres.isAway),
          Button({ key: 'crew-presence', label: PRESENCE_SWITCH, hotkey: 'a', plain: true, onPress: () => void setAutopilot($, !pres.isAway) }),
        ],
      }),
    ],
  })
  // One scrolling page, no tab strip and no counter-chip row. What the tabs showed lives in the cards below.
  const pinnedTop: unknown[] = [head, buttonRow, ...inboxField, ...pendingLine, ...reply, ...(snapshot.note ? [Text({ color: 'red', children: [snapshot.note] })] : [])]
  const topH = statusH + ROW_PX * 1.5 + (inboxField.length > 0 ? ROW_PX * 1.5 : 0) + (pending !== null ? ROW_PX : 0) + (replyLine !== '' ? ROW_PX : 0) + (snapshot.note ? ROW_PX : 0)

  // ---- The middle.
  const blocks: Block[] = []
  const put = (key: string, el: unknown, h: number) => blocks.push({ key, el, h })
  const cast = [
    { kind: 'captain', variant: 0, label: 'Captain' },
    { kind: 'max', variant: 0, label: 'Max' },
    { kind: 'codex', variant: 0, label: 'Codex' },
    { kind: 'api', variant: 0, label: 'API' },
    { kind: 'cloud', variant: 0, label: 'Cloud' },
    { kind: 'local', variant: 0, label: 'Local' },
  ]
  // The "?" help is a CARD (an Svg on a tile) with its buttons in the tabs' own style beneath; it is not pasted
  // into the page, and there are no loose key-hint rows.
  if (helpOpen) {
    const lines = [...ORDER_RULE, 'Keys: h this help, r refresh, c compact, k cast, a AUTOPILOT on or off.', 'Press a row\'s arrow to open it in place. The bar above the prompt: press the crew line to open this panel.']
    const hw = rowWidth(W)
    put(
      'help',
      Box({
        key: 'help',
        flexDirection: 'column',
        children: [
          kit.Svg({ key: 'svg-help', source: cardSvg(W, 'Crew order and keys', lines), alt: 'Crew order and keys: ' + lines.join(' '), width: W, height: cardHeight(W, lines) }),
          Box({
            key: 'help-tools',
            flexDirection: 'row',
            columnGap: 1,
            flexWrap: 'wrap',
            paddingX: 1,
            children: [
              Button({ key: 'crew-away', label: AUTOPILOT, hotkey: 'a', variant: 'secondary', onPress: () => void setAutopilot($, !pres.isAway) }),
              Button({ key: 'ui-celebrations', label: ui.celebrations ? 'celebrations: on' : 'celebrations: off', variant: 'secondary', onPress: () => { ui = { ...ui, celebrations: !ui.celebrations }; void saveUi($); $.ui.invalidate('ui.render') } }),
              Button({ key: 'crew-refresh', label: 'refresh', hotkey: 'r', variant: 'secondary', onPress: () => void refresh($) }),
              Button({ key: 'crew-compact', label: isCompact ? 'expand' : 'compact', hotkey: 'c', variant: 'secondary', onPress: () => { isCompact = !isCompact; $.ui.invalidate('ui.render') } }),
              Button({ key: 'crew-cast', label: isCastOpen ? 'hide cast' : 'cast', hotkey: 'k', variant: 'secondary', onPress: () => { isCastOpen = !isCastOpen; $.ui.invalidate('ui.render') } }),
            ],
          }),
        ],
      }),
      cardHeight(W, lines) + ROW_PX * 2,
    )
    void hw
  }

  // A row: the Svg (the look) and a native chevron button at its right (the press target: an Svg takes no press).
  const rowBox = (key: string, name: string, svg: string, alt: string, h: number, isOpen: boolean, actions: unknown[]): void => {
    const w = rowWidth(W)
    const chevron = Button({ key: 'row-' + key, label: isOpen ? '\u25be' : '\u25b8', plain: true, onPress: () => { openRow = openRow === name ? '' : name; $.ui.invalidate('ui.render') } })
    const line = Box({ key: 'rowline-' + key, flexDirection: 'row', alignItems: 'center', children: [kit.Svg({ key: 'svg-r-' + key, source: svg, alt, width: w, height: h }), chevronCol(kit, 'r-' + key, chevron)] })
    // The actions are real small buttons in the tabs' own style (secondary), not bare text.
    put('r-' + key, Box({ key: 'rowbox-' + key, flexDirection: 'column', children: [line, ...(isOpen && actions.length > 0 ? [Box({ key: 'acts-' + key, flexDirection: 'row', columnGap: 1, children: actions })] : [])] }), h + (isOpen && actions.length > 0 ? ROW_PX * 1.5 : 0))
  }

  // The whole pane is the crew page: a, b above; then c crew rows, d System (collapsed), e Flight log, f Black box.
  {
    if (isCompact) {
      put('svg-compact', draw('svg-compact', compactSvg(W, charsOf(g, now), counts().working + ' working, ' + counts().idle + ' idle', now), 'crew', COMPACT_H), COMPACT_H)
    } else {
      const w = rowWidth(W)
      // COCKPIT-30: the Captain and the crew sit under one collapsible "Crew" line, open unless it was shut (saved as 'c-crew-shut').
      const crewOpen = !expanded.has('c-crew-shut')
      const crewSum = crewSummary({
        working: snapshot.crew.filter(m => m.row.state === 'working').length,
        idle: snapshot.crew.filter(m => m.row.state !== 'working' && m.activity !== 'sleeping' && !m.errored.errored && blockedBy(g, m.name) === null).length,
        sleeping: snapshot.crew.filter(m => m.activity === 'sleeping').length,
        blocked: snapshot.crew.filter(m => !m.errored.errored && blockedBy(g, m.name) !== null).length,
        errored: snapshot.crew.filter(m => (m.errored.errored && m.outage === null) || (m.isStuck && m.outage === null)).length,
        outages: outageCounts(snapshot.crew.map(m => m.outage)),
      })
      put('cs-crew', Button({ key: 'cs-crew', label: (crewOpen ? '\u25be ' : '\u25b8 ') + 'Crew \u00b7 ' + crewSum, plain: true, onPress: () => { if (expanded.has('c-crew-shut')) expanded.delete('c-crew-shut'); else expanded.add('c-crew-shut'); void saveUi($); $.ui.invalidate('ui.render') } }), ROW_PX * 1.5)
      if (crewOpen) {
      // The coordinator first, its subagents under it (indented), then the crew in its fixed order.
      const sess = sessionRowIn(now)
      rowBox('session', 'Captain', rowSvg(w, bordered(sess)), 'Captain: ' + sess.state.text + rowSummaryAlt(sess) + '; ' + sessionCardIn(now).join('; '), rowHeight(sess), sess.isOpen, [])
      for (const s of subs) {
        const row = subRowIn(s, now)
        // A subagent has nothing to open: an empty chevron column keeps its row on the same grid as the others.
        put('svg-sub-' + s.id, Box({ key: 'subline-' + s.id, flexDirection: 'row', alignItems: 'center', children: [draw('svg-sub-' + s.id, rowSvg(w, bordered(row)), s.name + ': ' + s.status + ', ' + row.item, rowHeight(row), w), chevronCol(kit, 'sub-' + s.id, null)] }), rowHeight(row))
      }
      if (snapshot.crew.length === 0) {
        // The empty state: nothing the protocol names exists yet, so say what to create (config.ts, docs/PROTOCOL.md).
        const empty = isEmptyWorld(emptyFacts())
        const lines = emptyStateLines(cfg).slice(1)
        if (empty) put('empty-state', kit.Svg({ key: 'svg-empty', source: cardSvg(W, 'Nothing to show yet', lines), alt: emptyStateLines(cfg).join(' '), width: W, height: cardHeight(W, lines) }), cardHeight(W, lines))
        else put('no-crew', Text({ key: 'no-crew', dimColor: true, children: ['no crew running'] }), ROW_PX)
      }
      const isSleeper = (m: Member): boolean => !m.exhaustion.exhausted && !m.errored.errored && m.activity === 'sleeping' && !m.isStuck && blockedBy(g, m.name) === null
      const sleepers = snapshot.crew.filter(isSleeper)
      const collapse = sleepers.length >= 2 && !sleepersOpen
      let slept = false
      for (const m of snapshot.crew) {
        if (collapse && isSleeper(m)) {
          if (!slept) {
            slept = true
            const label = sleepers.length + ' sleeping: ' + sleepers.map(x => shortName(x.name, x.kind)).join(', ')
            const sw = rowWidth(W)
            put(
              'sleepers',
              Box({
                key: 'sleepers',
                flexDirection: 'row',
                alignItems: 'center',
                children: [
                  kit.Svg({ key: 'svg-sleepers', source: sleepersSvg(sw, sleepers.map(x => ({ kind: x.kind, variant: x.variant, name: shortName(x.name, x.kind) }))), alt: label, width: sw, height: ROW_HEIGHT }),
                  chevronCol(kit, 'sleepers', Button({ key: 'sleepers-open', label: '\u25b8', plain: true, onPress: () => { sleepersOpen = true; $.ui.invalidate('ui.render') } })),
                ],
              }),
              ROW_HEIGHT,
            )
          }
          continue
        }
        const row = memberRowIn(m, g, now)
        const wrong = row.trouble !== null && !m.exhaustion.exhausted
        const actions =
          row.isOpen && m.kind !== 'cloud'
            ? [
                Button({ key: 'act-restart-' + m.name, label: 'restart lane', variant: 'secondary', onPress: () => void proposeAction($, 'restart', m.name).then(t => { replyLine = t; $.ui.invalidate('ui.render') }) }),
                ...(m.row.lock !== null ? [Button({ key: 'act-clear-' + m.name, label: 'clear stale lock', variant: 'secondary', onPress: () => void proposeAction($, 'clear', m.name).then(t => { replyLine = t; $.ui.invalidate('ui.render') }) })] : []),
              ]
            : []
        void wrong
        rowBox(m.name, m.name, rowSvg(w, bordered(row)), m.name + ' ' + row.state.text + rowSummaryAlt(row) + '; ' + memberCard(memberCardIn(m, g, now)).join('; '), rowHeight(row), row.isOpen, actions)
      }
      if (sleepersOpen && sleepers.length >= 2) put('sleepers-close', Button({ key: 'sleepers-close', label: '\u25be collapse the sleeping', plain: true, onPress: () => { sleepersOpen = false; $.ui.invalidate('ui.render') } }), ROW_PX)
      }
    }
    // d) the System card: collapsed until opened (its figures are in the status row above); e) the Flight log; f) the Black box.
    const toggleId = (id: string): void => {
      if (expanded.has(id)) expanded.delete(id)
      else expanded.add(id)
      void saveUi($)
      $.ui.invalidate('ui.render')
    }
    const sysNow = systemSummary(snapshot.system.reading, snapshot.system.hosts, snapshot.gateWaiting)
    const isSysOpen = expanded.has('c-system')
    put('cs-system', Button({ key: 'cs-system', label: (isSysOpen ? '\u25be ' : '\u25b8 ') + 'System' + (snapshot.system.at === 0 ? ' \u00b7 checking' : ' \u00b7 ' + sysNow.text.replace(/^System: /, '')), plain: true, onPress: () => toggleId('c-system') }), ROW_PX * 1.5)
    // The Health content (the plan limits, context, sessions, credits) lives inside the System card, shown only when it is open.
    if (isSysOpen) {
      for (const b of detailCards(kit, $, W, now, g, ['system', 'health'], true)) put(b.key, b.el, b.h)
      for (const b of healthBlocks(kit, $, W, now, g, draw, ['h-system', 'h-credits'])) put(b.key, b.el, b.h)
      // The keys, the crew order and the options (celebrations, refresh, compact, cast) open from here.
      put('cs-help', Button({ key: 'ui-help', label: helpOpen ? 'close keys and options' : 'keys and options', plain: true, hotkey: 'h', onPress: () => { helpOpen = !helpOpen; $.ui.invalidate('ui.render') } }), ROW_PX * 1.5)
    }
    const allFlight = flightEntriesNow(g, now)
    const isFlightAll = expanded.has('flight-all')
    const flightShown = flightRows(allFlight, isFlightAll ? FLIGHT_EXPANDED : FLIGHT_SHOWN)
    const flightSum = flightSummary(flightShown)
    put('svg-flight', draw('svg-flight', flightSvg(W, flightShown, flightSum, now), 'Flight log: ' + (flightSum || 'no reports yet'), flightHeight(flightShown.length)), flightHeight(flightShown.length))
    if (allFlight.length > FLIGHT_SHOWN) put('flight-more', Button({ key: 'flight-more', label: isFlightAll ? 'show fewer' : 'show ' + (Math.min(FLIGHT_EXPANDED, allFlight.length) - FLIGHT_SHOWN) + ' more', variant: 'secondary', onPress: () => toggleId('flight-all') }), ROW_PX * 1.5)
    const isBoxOpen = expanded.has('c-blackbox')
    const boxRows = blackBoxRows(deck.log, isBoxOpen)
    put('cs-blackbox', Button({ key: 'cs-blackbox', label: (isBoxOpen ? '\u25be ' : '\u25b8 ') + 'Black box \u00b7 ' + blackBoxSummary(deck.log), plain: true, onPress: () => toggleId('c-blackbox') }), ROW_PX * 1.5)
    put('svg-blackbox', draw('svg-blackbox', blackBoxSvg(W, boxRows, isBoxOpen ? 'last ' + boxRows.length + ', newest first' : 'last ' + BOX_COLLAPSED), 'Black box: ' + blackBoxSummary(deck.log), blackBoxHeight(boxRows.length)), blackBoxHeight(boxRows.length))
    // The away log shows only while it has entries.
    for (const b of detailCards(kit, $, W, now, g, ['away'], false)) put(b.key, b.el, b.h)
    if (isCastOpen) {
      put('h-cast', Text({ key: 'h-cast', bold: true, children: ['Cast (' + castMode + ')'] }), ROW_PX)
      put('svg-cast', draw('svg-cast', castSvg(W, cast, castMode, now), 'every character', castH(cast.length, W)), castH(cast.length, W))
      put('crew-cast-mode', Button({ key: 'crew-cast-mode', label: castMode === 'work' ? 'show asleep' : 'show working', hotkey: 'm', plain: true, onPress: () => { castMode = castMode === 'work' ? 'idle' : 'work'; $.ui.invalidate('ui.render') } }), ROW_PX)
    }
  }

  // The room: the pane's rows, less the pinned parts. Only the middle scrolls. COCKPIT-34: while the System card is closed, its header, the Flight log
  // and the Black box (header and its few rows) are pinned in view at the bottom, so the one card that is open scrolls in the space left.
  // COCKPIT-35: the order is ONE declared list (LOWER_CARDS); only the closed cards at the END of it are pinned, so a closed card with an open card after it
  // keeps its place and collapsing or opening never puts one card above another.
  const roomAll = fin(bodyRows) && (bodyRows ?? 0) > 0 ? (bodyRows ?? 0) * ROW_PX - topH - ROW_PX * 2 : Number.POSITIVE_INFINITY
  let pinFrom = LOWER_CARDS.length
  while (pinFrom > 0 && !expanded.has((LOWER_CARDS[pinFrom - 1] as { open: string }).open)) pinFrom--
  const pinKeys: string[] = LOWER_CARDS.slice(pinFrom).flatMap(c => [...c.keys])
  const lower = roomAll !== Number.POSITIVE_INFINITY ? blocks.filter(b => pinKeys.includes(b.key)) : []
  const scrolledBlocks = lower.length > 0 ? blocks.filter(b => !lower.includes(b)) : blocks
  const budget = roomAll === Number.POSITIVE_INFINITY ? roomAll : Math.max(ROW_PX * 2, roomAll - lower.reduce((n, b) => n + b.h, 0))
  const win = windowBlocks(scrolledBlocks, midOffset, budget)
  midOffset = win.offset
  const starts: number[] = []
  for (const b of scrolledBlocks) starts.push(starts.length === 0 ? 0 : (starts[starts.length - 1] ?? 0) + (scrolledBlocks[starts.length - 1]?.h ?? 0))
  const startIdx = Math.max(0, starts.indexOf(win.offset))
  const more = (nPx: number, up: boolean) =>
    nPx > 0
      ? [
          Button({
            key: up ? 'more-up' : 'more-down',
            label: (up ? '\u25b2 ' : '\u25bc ') + Math.ceil(nPx / ROW_PX) + ' more ' + (up ? 'above' : 'below'),
            plain: true,
            onPress: () => {
              midOffset = starts[Math.max(0, Math.min(scrolledBlocks.length - 1, startIdx + (up ? -1 : 1)))] ?? 0
              $.ui.invalidate('ui.render')
            },
          }),
        ]
      : []
  void pres
  return Box({ flexDirection: 'column', rowGap: 0, children: [...pinnedTop, ...more(win.hiddenAbove, true), ...win.shown.map(b => b.el), ...more(win.hiddenBelow, false), ...lower.map(b => b.el)] })
}

const Input_ = (kit: Kit, props: Record<string, unknown>): unknown => (kit as unknown as { Input: KitFn }).Input(props)
const liveFor = (w: Pool['five'], now: number): Pool['five'] => (w.resetsAtMs !== null && w.resetsAtMs <= now ? { ...w, used: null, resetsAtMs: null } : w)

// The Items tab: Now, Next and Done today, one 36 px row each, 12 per group with "show N more"; an open item shows its
// brief, report and landed lines. An item held by an errored member comes first in Now.
function itemsBlocks(kit: Kit, $: EngineInterface, W: number, now: number, g: Graph): Block[] {
  const { Box, Text, Button } = kit
  const out: Block[] = []
  const put = (key: string, el: unknown, h: number) => out.push({ key, el, h })
  const all = itemsNow(g, now).filter(i => !ui.mine || itemIsMine(i))
  void Button
  const groups: { id: string; label: string; items: Item[] }[] = [
    // An item held by an errored member comes first, whatever its group.
    { id: 'now', label: 'Now', items: [...all.filter(i => i.status !== 'landed' && itemIsErrored(i)), ...all.filter(i => i.status !== 'landed' && i.group === 'now' && !itemIsErrored(i))] },
    { id: 'next', label: 'Next', items: all.filter(i => i.status !== 'landed' && i.group !== 'now' && !itemIsErrored(i)) },
    { id: 'done', label: 'Done today', items: all.filter(i => i.status === 'landed') },
  ]
  if (all.length === 0) put('no-items', Text({ key: 'no-items', dimColor: true, children: ['no items'] }), ROW_PX)
  const w = rowWidth(W)
  for (const grp of groups) {
    if (grp.items.length === 0) continue
    put('g-' + grp.id, kit.Svg({ key: 'svg-g-' + grp.id, source: groupSvg(W, grp.label, grp.items.length), alt: grp.label + ' ' + grp.items.length, width: W, height: GROUP_H }), GROUP_H)
    const shown = itemsAll.has(grp.id) ? grp.items : grp.items.slice(0, ITEM_CAP)
    for (const it of shown) {
      const a = it.assignees[0]
      const open = selectedItem === it.family
      const detail: { label: string; text: string; cls?: string }[] = open
        ? [
            { label: 'Brief', text: it.briefName !== '' ? it.briefName : 'none' },
            { label: 'Report', text: it.reportName !== '' ? it.reportName : 'none' },
            ...(it.hashes.length > 0 ? [{ label: 'Landed', text: it.hashes.join(', ') }] : []),
            ...(it.blockedBy !== null ? [{ label: 'Blocked by', text: it.blockedBy.on + (it.blockedBy.why !== '' ? ': ' + it.blockedBy.why : ''), cls: 'warnc' }] : []),
          ]
        : []
      const row = { name: it.title, state: itemPill(it.status), owner: a === undefined ? null : { kind: a.kind, variant: a.variant, mode: a.state === 'working' ? ('work' as DrawMode) : ('idle' as DrawMode), activity: a.activity as Activity }, isOpen: open, detail, phase: now }
      const h = itemHeight(row)
      const chevron = Button({ key: 'item-' + it.family, label: open ? '\u25be' : '\u25b8', plain: true, onPress: () => { selectedItem = selectedItem === it.family ? '' : it.family; $.ui.invalidate('ui.render') } })
      put('i-' + it.family, Box({ key: 'itembox-' + it.family, flexDirection: 'row', alignItems: 'center', children: [kit.Svg({ key: 'svg-i-' + it.family, source: itemSvg(w, row), alt: 'Item ' + it.family + ' ' + it.status + ': ' + it.title, width: w, height: h }), chevronCol(kit, 'i-' + it.family, chevron)] }), h)
    }
    if (grp.items.length > shown.length) put('more-' + grp.id, Button({ key: 'items-more-' + grp.id, label: 'show ' + (grp.items.length - shown.length) + ' more', variant: 'secondary', onPress: () => { itemsAll.add(grp.id); $.ui.invalidate('ui.render') } }), ROW_PX)
    else if (itemsAll.has(grp.id) && grp.items.length > ITEM_CAP) put('less-' + grp.id, Button({ key: 'items-less-' + grp.id, label: 'show fewer', variant: 'secondary', onPress: () => { itemsAll.delete(grp.id); $.ui.invalidate('ui.render') } }), ROW_PX)
  }
  return out
}

// The Health tab: collapsible sections, each a header button with a one-line summary.
function healthBlocks(kit: Kit, $: EngineInterface, W: number, now: number, g: Graph, draw: (key: string, source: string, alt: string, height: number) => unknown, skip: readonly string[] = []): Block[] {
  const { Text, Button } = kit
  const out: Block[] = []
  const put = (key: string, el: unknown, h: number) => out.push({ key, el, h })
  const sys = systemSummary(snapshot.system.reading, snapshot.system.hosts, snapshot.gateWaiting)
  const sysText = snapshot.system.at === 0 ? 'System: checking' : sys.text
  const u = snapshot.usage
  const pools = poolsNow(now)
  const w = W - 28
  const section = (id: string, title: string, summary: string, body: Block[]): void => {
    if (skip.includes(id)) return
    const isOpen = expanded.has(id)
    put('hs-' + id, Button({ key: 'hs-' + id, label: (isOpen ? '\u25be ' : '\u25b8 ') + title + (summary !== '' ? ' \u00b7 ' + summary : ''), plain: true, onPress: () => { if (expanded.has(id)) expanded.delete(id); else expanded.add(id); void saveUi($); $.ui.invalidate('ui.render') } }), ROW_PX * 1.5)
    if (isOpen) for (const b of body) out.push(b)
  }
  const listBlock = (key: string, title: string, rows: ListRow[]): Block => ({ key, el: draw('svg-' + key, listCardSvg(W, title, rows), title, listHeight(rows.length)), h: listHeight(rows.length) })
  section('h-context', 'Context and startup cost', ctxPercent(u) === null ? 'no data' : 'context ' + ctxPercent(u) + '%', [listBlock('ctx', 'Context and startup cost', contextCardNow(now).map(t => ({ text: t })))])
  const sessRows: Block[] = []
  const sess = sessionRowIn(now)
  sessRows.push({ key: 'hs-sess', el: draw('svg-session', rowSvg(W, sess), 'Captain: ' + sess.state.text, rowHeight(sess)), h: rowHeight(sess) })
  for (const s of snapshot.subs.slice().reverse()) {
    const row = subRowIn(s, now)
    sessRows.push({ key: 'svg-sub-' + s.id, el: draw('svg-sub-' + s.id, rowSvg(W, row), s.name + ': ' + s.status + ', ' + row.item, rowHeight(row)), h: rowHeight(row) })
  }
  section('h-sessions', 'Sessions', snapshot.subs.length + ' subagents', sessRows)
  section('h-system', 'System resources', sysText.replace(/^System: /, ''), detailCards(kit, $, W, now, g, ['system'], true))
  // Both windows of every plan, short: "Max 31/62%, Codex 52/80%".
  const short = pools.map(p => (p.id === 'claude' ? 'Max' : p.name) + ' ' + [p.five, p.week].map(x => (x.used === null ? '?' : String(Math.round(x.used)))).join('/') + '%').join(', ')
  section('h-credits', 'Credits and limits detail', short, detailCards(kit, $, W, now, g, ['health'], true))
  section('h-memory', 'Memory and config counts', 'not read here', [listBlock('mem', 'Memory and config counts', [{ text: 'the mod has no source for these counts yet' }])])
  void Text
  void w
  return out
}

// Switch tab; the Crew and Items tabs are also the "by crew" and "by item" views. Remembered across reloads.
async function setTab($: EngineInterface, tab: TabId): Promise<void> {
  ui = { ...ui, tab, view: tab === 'items' ? 'items' : tab === 'crew' ? 'crew' : ui.view }
  midOffset = 0
  await saveUi($)
  $.ui.invalidate('ui.render')
}

// ONE row of small count chips: "Q 28 · B 468 · Inbox 0 · Web app down · Landed 8 · 2 blocked · 3 red". Red or
// amber ones are coloured, healthy ones are grey; a click opens its section under the row.
type Chip = { id: string; text: string; color: string; red: boolean; rank: number }

// The counts row as ONE line: every chip, then dropped by rank (the healthy and grey ones first, a problem last)
// until what is left fits `cols` terminal cells. What is dropped stays reachable as buttons in the "?" popover.
export function planChips(now: number, g: Graph, cols: number): { shown: Chip[]; dropped: Chip[]; red: number } {
  void now
  const h = snapshot.health
  const fresh = inboxNewCount(snapshot.inbox)
  const bl = snapshot.backlog
  const red = snapshot.crew.filter(m => m.activity === 'red' || m.errored.errored).length
  const chips: Chip[] = [
    { id: 'queue', text: 'Q ' + snapshot.queue.total, color: 'gray', red: false, rank: 2 },
    { id: 'backlog', text: 'B ' + (bl === null ? '?' : bl.open + bl.progress), color: 'gray', red: false, rank: 3 },
    { id: 'inbox', text: 'Inbox ' + fresh, color: fresh > 0 ? 'blue' : 'gray', red: false, rank: fresh > 0 ? 8 : 4 },
    { id: 'landed', text: 'Landed ' + snapshot.landed.length, color: 'gray', red: false, rank: 1 },
    { id: 'deps', text: g.blocked.length + ' blocked', color: g.blocked.length > 0 ? 'yellow' : 'gray', red: false, rank: g.blocked.length > 0 ? 10 : 6 },
  ]
  const cost = (c: Chip): number => c.text.length + 4
  const redCost = red > 0 ? String(red).length + 7 : 0
  const room = cols - 4 - redCost
  const shown = [...chips]
  const dropped: Chip[] = []
  const total = (): number => shown.reduce((s, c) => s + cost(c), 0)
  while (shown.length > 0 && total() > room) {
    const worst = shown.reduce((a, b) => (b.rank < a.rank ? b : a))
    shown.splice(shown.indexOf(worst), 1)
    dropped.push(worst)
  }
  return { shown, dropped, red }
}

function summaryChips(kit: Kit, $: EngineInterface, plan: ReturnType<typeof planChips>): unknown {
  return kit.Box({
    key: 'chips',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    columnGap: 2,
    children: [
      ...plan.shown.map(c => kit.Box({ key: 'chip-' + c.id, flexDirection: 'row', children: [kit.Text({ color: c.color, children: [expanded.has(c.id) ? '\u25be ' : '\u25cf '] }), toggleBtn(kit, $, c.id, c.text, '')] })),
      ...(plan.red > 0 ? [kit.Text({ key: 'chip-red', color: 'red', bold: true, children: [plan.red + ' red'] })] : []),
      kit.Button({ key: 'ui-help', label: helpOpen ? 'close ?' : '?', hotkey: 'h', plain: true, onPress: () => { helpOpen = !helpOpen; $.ui.invalidate('ui.render') } }),
    ],
  })
}

// ---------------------------------------------------------------------------

// v10: the band and the commands must not depend on `session.start` having run for THIS copy of the module: after a
// /reload-plugins the module is new and the event may not come again, which left the timer, the poll and the band's data
// unstarted. `started` is set by the first of: session.start, the band's first draw, a command, a pane open or close.
let started = false
function ensureStarted($: EngineInterface): void {
  if (started) return
  started = true
  void startUp($).catch(() => undefined)
}

// v12: the last bar that drew without an error; a failing draw returns it instead of a different bar or none.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lastGoodBand: any = null

// The bar's fill animation (stripes, shimmer, edge pulse) is off: it was a different drawing while anything worked, and the
// bar came and went with the coordinator's turns. The drawing code and its tests stay; set true to bring it back.
export const BAND_ANIMATED = false

// A line in logs/band.log (in the data folder) whenever what the bar decided changes (its layout, the host's rows, the engine's
// content, whether the host says a turn is running), so the next time it flickers the log says what the host gave it.
// At most 300 lines a session, fire and forget.
let bandLogKey = ''
let bandLogCount = 0
function noteBandDraw($: EngineInterface, o: { level: BandLevel | 'yield'; maxRows: number | undefined; theirsRows: number; embedded: boolean; hostWorking: boolean; columns: number; px: number }): void {
  const key = [o.level, o.maxRows, o.theirsRows, o.embedded, o.hostWorking].join('|')
  if (key === bandLogKey || bandLogCount >= 300) return
  bandLogKey = key
  bandLogCount++
  void (async () => {
    const at = await $.clock.now()
    await appendLine($, LOG_DIR + '/band.log', bandLogLine({ atIso: new Date(at).toISOString(), level: o.level, maxRows: o.maxRows, theirsRows: o.theirsRows, embedded: o.embedded, hostWorking: o.hostWorking, modBusy: isMainBusy, columns: o.columns, px: o.px, crewWorking: counts().working }))
  })().catch(() => undefined)
}

export const BAND_REDRAW_AGAIN_MS = 400
function redrawBandSoon($: EngineInterface): void {
  $.ui.invalidate('ui.render')
  $.clock.after(BAND_REDRAW_AGAIN_MS, () => $.ui.invalidate('ui.render'))
}

// One line, once per distinct message, to logs/band-fault.log (in the data folder): why the rich band fell back to the plain one.
const bandFaults = new Set<string>()
async function noteBandFault($: EngineInterface, err: unknown): Promise<void> {
  const msg = oneLine(String(err), 160)
  if (bandFaults.has(msg)) return
  bandFaults.add(msg)
  await appendLine($, LOG_DIR + '/band-fault.log', new Date(await $.clock.now()).toISOString() + '\t' + msg + '\n')
}

async function startUp($: EngineInterface): Promise<void> {
  await loadConfig($)
  // What is remembered across reloads: the tab, the view, "mine", the open sections, the celebrations toggle.
  // The landed baseline is NOT restored: the first poll records what had already landed, so nothing replays.
  await readTheme($)
  ui = { ...parseUi(await readText($, UI_PATH)), baselined: false }
  expanded.clear()
  for (const id of ui.expanded) expanded.add(id)
  // The plan usage and the context, at once (not waiting for the first poll); session.measure keeps them fresh.
  claudeLive = { rateLimits: [], tokens: null, window: null, model: '' }
  usageCache = parseUsageCache(await readText($, USAGE_CACHE_PATH))
  lastDebug.clear()
  const first = await readUsageNow($)
  applyClaude(first)
  await noteUsage($, 'session.usage@start', first, await $.clock.now())
  // v9: ONE real timer (1 s), not a wait for an event. Each tick reads only cheap things (this session's entry in
  // the sessions folder, one status file's mtime, pgrep) and then does what is due: a full poll every 5 s while
  // anything works and every 30 s otherwise, or just a redraw (1 s while anything works, 5 s otherwise).
  eventBusyAt = null
  sessionId = ''
  sessionIdAt = -Infinity
  sessionFile = null
  sessionEntryCache.clear()
  opencodeRuns = []
  opencodeAt = -Infinity
  opencodeEtimeMs = new Map()
  paneFirstSeen.clear()
  lastPollAt = -Infinity
  lastDrawAt = -Infinity
  lastStatusMtime = null
  liveMarks = ''
  forceLive = false
  statusOpen.clear()
  resetUnsaved()
  scheduleTick($)
  // v14: what the person set for the Deck (layout, motion, panels) outlives a reload; the Deck may open by itself (openOnStart).
  deckView = normalizeView(safeJson(await readText($, DECK_VIEW_PATH)))
  deckOpenNow = (await $.ui.panes().catch(() => [])).some(p => p.id === DECK_PANE)
  if (deckCfg.openOnStart && !deckOpenNow) void openDeck($, false).catch(() => undefined)
  // The band draws from the first moment (with what is known), not after the first poll or a /crew.
  $.ui.invalidate('ui.render')
  void refresh($)
  const immediate = true as const
  // A failed registration (say a second one after a reload) must not stop the timer and the band above.
  // v13: the mod is "Cockpit". /cockpit is the command; /crew, /lanes and their -status forms stay as aliases.
  for (const def of [
    { name: 'cockpit', description: 'Show or hide the Cockpit panel; /cockpit view crew|items, autopilot on|off, start|restart|clear <name>, bug <text>, idea <text>', argumentHint: '[status|view crew|items|autopilot on|off|layout auto|compact|wide|mini|reset|deck|motion on|off|panels <list>|start <name>|restart <name>|clear <name>|bug <text>|idea <text>]', immediate },
    { name: 'cockpit-status', description: 'Poll once and print the Cockpit as text (works where no panel can draw)', immediate },
    { name: 'crew', description: 'Alias of /cockpit', immediate },
    { name: 'crew-status', description: 'Alias of /cockpit-status', immediate },
    { name: 'lanes', description: 'Alias of /cockpit', immediate },
    { name: 'lanes-status', description: 'Alias of /cockpit-status', immediate },
    { name: 'handoff', description: 'Write .cockpit/handoffs/HANDOFF-<date>.md from the status, the locks, the queue and what landed', immediate },
  ]) {
    try {
      await $.command.register(def)
    } catch {
      // Already registered by an earlier copy of this module: nothing to do.
    }
  }
}

// ---------------------------------------------------------------------------
// The Deck (cockpit 0.4.0): the session's own events as panels in a second pane ("Deck"): the main vitals, the permission gate, the
// subagent cards, the turn receipt and the session log, with connectors and clocks that animate only while work flows. The rules are
// pure (deckstate.ts and the files it composes); this section hooks the events, keeps the memory and draws it (deckview.ts).
// It adds a pane and a status line piece; the Cockpit panel and the bar above the prompt are not changed by it.

const DECK_PANE = 'deck'
const DECK_TITLE = 'Deck'
// A change redraws the Deck at most this often, and only while the Deck is open: an event that arrives while it is closed redraws nothing.
const DECK_REDRAW_MS = 400

let deck: Deck = emptyDeck()
let deckCfg: DeckConfig = parseDeckConfig({})
let deckView: DeckView = emptyView()
let deckOpenNow = false
let deckDrawnAt = -Infinity
let deckTimer: { cancel: () => void } | null = null

const safeJson = (text: string | null): unknown => {
  try {
    return text === null ? null : JSON.parse(text)
  } catch {
    return null
  }
}

// The status line under the input box shows UNSAVED WORK only: "all saved", or "unsaved: N uncommitted files, M unpushed commits",
// summed over the repositories under /home/alex/projects. It is read asynchronously, at most every 30 s, and is
// never awaited by a render or a hook: what is shown is the last value, and a failed read leaves it as it was (all repos unreadable clears it).
let unsavedAt = -Infinity
let unsavedRunning = false
let unsavedShown: string | undefined | null = null
export const unsavedState = (): { at: number; shown: string | undefined | null } => ({ at: unsavedAt, shown: unsavedShown })
export function resetUnsaved(): void {
  unsavedAt = -Infinity
  unsavedRunning = false
  unsavedShown = null
}

export async function refreshUnsaved($: EngineInterface, now: number): Promise<void> {
  if (!deckCfg.statusLine || unsavedRunning || now - unsavedAt < UNSAVED_EVERY_MS) return
  unsavedRunning = true
  unsavedAt = now
  try {
    const readings: RepoReading[] = await Promise.all(
      cfg.repos.map(async (repo): Promise<RepoReading> => {
        const cmd = gitCommands(repo)
        const status = await run($, cmd.status, GIT_TIMEOUT_MS)
        if (!status.ok) return { repo, porcelain: null, ahead: null }
        const ahead = await run($, cmd.ahead, GIT_TIMEOUT_MS)
        return { repo, porcelain: status.stdout, ahead: ahead.ok ? ahead.stdout : null }
      }),
    )
    const text = unsavedText(sumUnsaved(readings))
    if (text !== unsavedShown) {
      unsavedShown = text
      $.ui.status(text)
    }
  } catch {
    // A failure shows nothing new: the last value stays.
  } finally {
    unsavedRunning = false
  }
}

// A change to the deck: the status line piece (only when its text changed), and a redraw of the Deck (only while it is open, at most
// every DECK_REDRAW_MS; one trailing redraw is scheduled so the last change always shows).
async function deckChanged($: EngineInterface): Promise<void> {
  if (!deckOpenNow) return
  const now = await $.clock.now()
  if (now - deckDrawnAt >= DECK_REDRAW_MS) {
    deckDrawnAt = now
    $.ui.invalidate('ui.render')
    return
  }
  if (deckTimer === null) {
    deckTimer = $.clock.after(DECK_REDRAW_MS, () => {
      deckTimer = null
      void $.clock.now().then(t => {
        deckDrawnAt = t
        $.ui.invalidate('ui.render')
      })
    })
  }
}

async function openDeck($: EngineInterface, focus: boolean): Promise<{ isPlaced: boolean; reason?: string }> {
  // columns apply when docked beside the transcript, rows when seated inline above the prompt.
  const r = await $.ui.open({ id: DECK_PANE, title: DECK_TITLE, columns: 66, rows: MINI_ROWS, ...(focus ? { focus: true, closeOnEscape: true } : {}) })
  deckOpenNow = r.isPlaced || deckOpenNow
  return r as { isPlaced: boolean; reason?: string }
}

async function saveDeckView($: EngineInterface): Promise<void> {
  try {
    await writeFile($, DECK_VIEW_PATH, JSON.stringify(deckView) + '\n')
  } catch {
    // Kept in memory; the file is a convenience.
  }
}

// The session's cost read fresh: the turn receipt subtracts two of these.
async function deckCostNow($: EngineInterface): Promise<number | null> {
  const u = await $.session.usage().catch(() => null)
  return u?.cost?.usd ?? null
}

async function runDeck($: EngineInterface, c: NonNullable<ReturnType<typeof parseDeckArgs>>): Promise<string> {
  if (c.cmd === 'reset') {
    deck = resetDeck(deck)
    await deckChanged($)
    if (deckOpenNow) $.ui.invalidate('ui.render')
    return 'Deck reset: agents, checks, log and turn cleared (model, cost and compactions stay).'
  }
  if (c.cmd === 'deck') {
    const isOpen = (await $.ui.panes().catch(() => [])).some(p => p.id === DECK_PANE)
    if (c.action === 'close' || (c.action === 'toggle' && isOpen)) {
      await $.ui.close({ id: DECK_PANE })
      deckOpenNow = false
      return 'Deck closed.'
    }
    const r = await openDeck($, true)
    return r.isPlaced ? 'Deck opened.' : 'The Deck is not shown yet: ' + (r.reason ?? 'no room for it here')
  }
  if (c.cmd === 'layout') {
    if (c.layout === null) return DECK_USAGE
    deckView = { ...deckView, layout: c.layout }
    await saveDeckView($)
    const r = await openDeck($, false)
    $.ui.invalidate('ui.render')
    return r.isPlaced ? 'Deck layout: ' + c.layout + '.' : 'Deck layout set to ' + c.layout + '; the Deck is not shown yet: ' + (r.reason ?? 'no room for it here')
  }
  if (c.cmd === 'motion') {
    if (c.motion === null) return DECK_USAGE
    deckView = { ...deckView, motion: c.motion }
    await saveDeckView($)
    $.ui.invalidate('ui.render')
    return 'Deck motion: ' + (c.motion ? 'on (connectors move only while work flows)' : 'off') + '.'
  }
  if (c.panels === null) return DECK_USAGE
  deckView = { ...deckView, panels: c.panels === 'all' ? null : c.panels }
  await saveDeckView($)
  $.ui.invalidate('ui.render')
  return 'Deck panels: ' + (c.panels === 'all' ? deckCfg.panels.join(', ') + ' (the option)' : c.panels.join(', ')) + '.'
}

// The Deck's drawing: the pure deck and the host's elements. A surface that cannot draw a Client module gets a still rule and a static time.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function renderDeck($: EngineInterface, e: any): Promise<unknown> {
  const kit = $.ui.resolve(e) as unknown as Kit
  const now = await $.clock.now()
  const hasClient = 'Client' in kit
  const clientEl = (kit as unknown as { Client: KitFn }).Client
  const placement = e.props.placement === 'inline' ? 'inline' : 'dock'
  const width = Math.max(40, e.props.bodyColumns ?? 66)
  const layout = resolveLayout(effectiveLayout(deckCfg, deckView), placement, width)
  const wins = claudeWindows(snapshot.rateLimits, usageCache, now)
  const shownN = deck.ui.logOpen ? LOG_EXPANDED : LOG_SHOWN
  const redraw = (): void => $.ui.invalidate('ui.render')
  return drawDeck({
    kit,
    deck,
    layout,
    panels: visiblePanels(effectivePanels(deckCfg, deckView), panelFactsOf(deck)),
    width,
    maxRows: MINI_ROWS,
    maxCards: deckCfg.maxCards,
    now,
    mode: deck.main.mode,
    wins: [wins.five.win, wins.week.win],
    motion: effectiveMotion(deckCfg, deckView),
    flow: flowOf({ turnRunning: deck.main.isRunning, agentsRunning: deck.cards.filter(c => c.status === 'running').length, lanesWorking: lanesWorking(deck) }),
    pal: paletteOf(),
    viewedAgent: e.props.view?.agentId ?? null,
    // The two surface modules draw on the surface's own frame clock, so only their own region redraws (rail.tsx, elapsed.tsx).
    client: hasClient
      ? {
          rail: (key, p) => clientEl({ key, module: './rail.tsx', width: p.width, height: 1, props: p }),
          clock: (key, p) => clientEl({ key, module: './elapsed.tsx', props: p }),
        }
      : null,
    act: {
      expand: id => { deck = toggleExpanded(deck, id); redraw() },
      gate: b => { deck = toggleGate(deck, b); redraw() },
      logOlder: () => { deck = scrollLog(deck, shownN, shownN); redraw() },
      logNewer: () => { deck = scrollLog(deck, -shownN, shownN); redraw() },
      logToggle: () => { deck = toggleLogOpen(deck); redraw() },
    },
  })
}

// The events the Deck listens to. Every handler passes its event on unchanged (`next(e)`) and never denies, rewrites or delays anything.
// An event the Cockpit already hooks (turn.start, turn.step, tool.call, session.measure, agent.spawn, turn.complete) is NOT hooked a second time:
// the host refuses two hooks on one event without a matcher, so those existing hooks call the deck functions below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ev = any

async function deckTurnStart($: EngineInterface, e: Ev): Promise<void> {
  deck = deckOnTurnStart(deck, { at: await $.clock.now(), text: e.text ?? '', cost: await deckCostNow($) })
  await deckChanged($)
}
async function deckMainStep($: EngineInterface, e: Ev): Promise<void> {
  deck = deckOnMainStep(deck, { model: e.model, effort: e.effort })
  await deckChanged($)
}
async function deckAgentStep($: EngineInterface, e: Ev, result: Ev): Promise<void> {
  deck = deckOnAgentStep(deck, { agentId: e.agentId, model: e.model, usage: result.usage, stopReason: result.stopReason ?? null, at: await $.clock.now() })
  await deckChanged($)
}
async function deckMeasure($: EngineInterface, e: Ev): Promise<void> {
  const c = e.context
  deck = deckOnMeasure(deck, { percent: c !== undefined && fin(c.percent) ? c.percent : null, tokens: c !== undefined && fin(c.tokens) ? c.tokens : null, window: c !== undefined && fin(c.window) ? c.window : 0, costUsd: e.cost?.usd ?? null })
  await deckChanged($)
}
async function deckToolCall($: EngineInterface, e: Ev, ran: Ev): Promise<void> {
  deck = deckOnToolCall(deck, { id: e.tool_use_id, tool: String(e.tool), input: e, agentId: e.agentId, wasDenied: ran.deny !== undefined, isError: ran.isError === true, at: await $.clock.now() })
  await deckChanged($)
}
async function deckSpawn($: EngineInterface, e: Ev, started: Ev): Promise<void> {
  if (!e.parentAgentId) deck = deckOnMode(deck, e.permissionMode)
  if (started.deny === undefined && started.agentId !== undefined) deck = deckOnSpawn(deck, { id: started.agentId, type: e.name ?? e.subagentType, model: started.model, description: e.description, prompt: e.prompt, at: await $.clock.now(), isConsult: deckCfg.consult.test(e.subagentType) })
  await deckChanged($)
}
async function deckTurnComplete($: EngineInterface, e: Ev): Promise<void> {
  const at = await $.clock.now()
  deck = e.agentId === undefined ? deckOnMainComplete(deck, { reason: e.reason, durationMs: e.durationMs, cost: await deckCostNow($) }) : deckOnAgentComplete(deck, { agentId: e.agentId, reason: e.reason, answer: e.answer, at })
  await deckChanged($)
}

// Events only the Deck hooks. The deck is an observer: whatever it does with an event, the event goes on (`next`), and a failure in the deck is swallowed.
function registerDeck(on: On): void {
  on('classic.UserPromptSubmit', async ($, e, next) => {
    try {
      deck = deckOnMode(deck, e.permission_mode)
    } catch {
      // the deck never stops a prompt
    }
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    const done = await next(e)
    try {
      deck = deckOnCompact(deck, { agentId: e.agentId, trigger: e.trigger, at: await $.clock.now() })
      await deckChanged($)
    } catch {
      // observer only
    }
    return done
  })

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    try {
      deck = deckOnCheck(deck, { id: e.tool_use_id, tool: e.tool, input: e.input, agentId: e.agentId, decision: verdict.decision, at: await $.clock.now() })
      await deckChanged($)
    } catch {
      // observer only
    }
    return verdict
  })

  // A server-side advisor tool never reaches tool.call: it shows only in the assistant's rows. Its start and its result are consults in the log.
  on('session.append', async ($, e, next) => {
    try {
      if (!e.agentId && e.message.type === 'assistant') {
        const at = await $.clock.now()
        for (const block of e.message.content as unknown as readonly { type: string; id?: string; name?: string; tool_use_id?: string }[]) {
          if (block.type === 'server_tool_use' && block.id !== undefined && block.name !== undefined && deckCfg.consult.test(block.name)) deck = openConsult(deck, block.id, block.name + ' tool', at)
          else if (block.type.endsWith('_tool_result') && block.tool_use_id !== undefined) deck = closeConsult(deck, block.tool_use_id, at)
        }
        await deckChanged($)
      }
    } catch {
      // observer only
    }
    return next(e)
  })

  // /clear starts the Deck fresh along with the conversation.
  on('session.end', async ($, e, next) => {
    try {
      if (e.reason === 'clear') {
        deck = resetDeck(deck)
        await deckChanged($)
      }
    } catch {
      // observer only
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: DECK_PANE }, async ($, e) => (await renderDeck($, e)) as any)
}

export const register: Register = (on, options) => {
  deckCfg = parseDeckConfig(options)
  rootOption = typeof options.root === 'string' ? options.root.trim() : ''
  registerDeck(on)
  on('session.start', async ($, e, next) => {
    started = true
    await startUp($)
    return next(e)
  })

  // v10: the panel opening or closing changes the room beside the band (a docked pane takes columns), and /crew used to be the
  // only moment the band's tree was re-asked for. After either, the band is drawn again at once and once more a moment later,
  // so /crew close and open never leaves the bar above the prompt undrawn.
  on('ui.open', async ($, e, next) => {
    ensureStarted($)
    const result = await next(e)
    if (e.id === PANE) redrawBandSoon($)
    if (e.id === DECK_PANE) deckOpenNow = true
    return result
  })
  on('ui.close', async ($, e, next) => {
    ensureStarted($)
    const result = await next(e)
    if (e.id === PANE) redrawBandSoon($)
    if (e.id === DECK_PANE) deckOpenNow = false
    return result
  })

  for (const name of ['cockpit', 'crew', 'lanes']) on('command.run', { command: name }, async ($, e) => runCrew($, e.args))
  for (const name of ['cockpit-status', 'crew-status', 'lanes-status']) {
    on('command.run', { command: name }, async $ => {
      await refresh($)
      return { text: statusText(await $.clock.now()) }
    })
  }
  on('command.run', { command: 'handoff' }, async $ => ({ text: await writeHandoff($) }))

  // Subagents: remember the model and the start time of each one.
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.deny === undefined && started.agentId !== undefined) {
      runs.set(started.agentId, { startedAt: await $.clock.now(), tokens: 0, model: started.model })
      void refresh($)
    }
    await deckSpawn($, e, started).catch(() => undefined)
    return started
  })

  // Real token numbers of a subagent's requests.
  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      await noteMain($, true)
      await deckMainStep($, e).catch(() => undefined)
    }
    const result = yield* next(e)
    if (e.agentId) await deckAgentStep($, e, result).catch(() => undefined)
    const usage = result.usage
    if (e.agentId && usage) {
      const r = runs.get(e.agentId)
      if (r) {
        r.model = usage.model || r.model
        r.tokens += (usage.input_tokens || 0) + (usage.output_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0)
      }
    }
    return result
  })

  // v9: every event the plugin types offer that says the main session is busy: a prompt submitted, a turn started,
  // a model step, a tool about to run. `turn.complete` (below) says it stopped. A subagent's own events do not count.
  on('prompt.submit', async ($, e, next) => {
    await noteMain($, true)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (!(e as { agentId?: string }).agentId) await noteMain($, true)
    await deckTurnStart($, e).catch(() => undefined)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (!(e as { agentId?: string }).agentId) await noteMain($, true)
    const ran = await next(e)
    await deckToolCall($, e, ran).catch(() => undefined)
    return ran
  })

  // After each response the engine measures the session: the same rate-limit windows and context as
  // $.session.usage(). Only a changed reading is written (each write redraws the band and the pane).
  on('session.measure', async ($, e, next) => {
    const c = e.context
    const reading = {
      rateLimits: e.rateLimits.filter(r => fin(r.percentUsed)).map(r => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt })),
      tokens: c !== undefined && fin(c.tokens) ? c.tokens ?? null : null,
      window: c !== undefined && fin(c.window) && c.window > 0 ? c.window : null,
    }
    const changed = applyClaude(reading)
    const before = JSON.stringify(usageCache)
    await noteUsage($, 'session.measure', reading, await $.clock.now())
    if (changed || JSON.stringify(usageCache) !== before) $.ui.invalidate('ui.render')
    await deckMeasure($, e).catch(() => undefined)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) {
      const r = runs.get(e.agentId)
      if (r) r.endedAt = await $.clock.now()
      void refresh($)
    } else {
      await noteMain($, false)
    }
    const done = await next(e)
    await deckTurnComplete($, e).catch(() => undefined)
    return done
  })

  // The pane's own scroll: the Status card and the Limits area are pinned, only the middle moves. The tree is
  // drawn to fit the room, so the engine has nothing to scroll; a wheel or arrow moves the window of blocks.
  on('ui.scroll', { component: 'Pane', requestId: PANE }, async ($, e) => {
    midOffset = Math.max(0, midOffset + e.by * ROW_PX)
    $.ui.invalidate('ui.render')
    return {}
  })

  // The band: counts, Active/Away, the characters, the system dots, the badges that need a look.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // v10: the band must survive anything: it starts the module when a reload skipped session.start, yields to a survey,
    // and if the rich drawing throws it falls back to the plain band, and if that throws to the engine's own.
    ensureStarted($)
    if (e.props.hasSurvey) {
      noteBandDraw($, { level: 'yield', maxRows: e.props.maxRows, theirsRows: 0, embedded: false, hostWorking: e.props.isWorking, columns: e.props.bodyColumns, px: 0 })
      return next(e)
    }
    const theirs = await next(e)
    // v12: the room the host gives the bar (it shrinks while a turn runs) decides how much of the bar is drawn, so it is
    // always within its window: full, compact or one line (hooks/bandfit.ts). The engine's own content goes in only if both fit.
    const theirsRows = estimateRows(theirs)
    const fit0 = bandFit(e.props.maxRows, theirsRows, 0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const draw = async (isRich: boolean): Promise<any> => {
      const kit = $.ui.resolve(e) as unknown as Kit
      const { Box, Text, Button } = kit
      const now = await $.clock.now()
      const c = counts()
      const g = graphOf()
      const badges = badgesOf(g, now)
      const pillText = c.working + ' working \u00b7 ' + c.idle + ' idle'
      const pres = presenceView()
      // v13: a filled pill, Active green and Away amber. v16: the pill is its own Text BESIDE the Button. The real host refuses a
      // Button whose child is not a plain string ("JSX element <Button> takes one string child, its label, or none"; the v13
      // coloured-Text child threw and the bar vanished), so every Button here carries a string label and nothing else.
      // The word AUTOPILOT alone, grey when off and green when on (no chip, no "on" or "off"): a drawing with an accessible label where there is an Svg.
      const presencePillEl = autopilotMark(kit, 'crew-presence-pill', pres.isAway, isRich && e.surface !== 'terminal' && 'Svg' in kit)
      const presenceButton = Button({ key: 'crew-presence', label: PRESENCE_SWITCH, plain: true, onPress: () => void setAutopilot($, !pres.isAway) })
      const panelButton = Button({ key: 'crew-open', label: '\u25a4', plain: true, onPress: () => void togglePane($) })

      const wide = isRich && e.surface !== 'terminal' && 'Svg' in kit
      if (wide && fit0.level !== 'line') {
        // The bar above the prompt (cockpit v8), three thin lines, never wider than the pane:
        //  1. the milestone progress, always visible (title, a filling animated bar with 3/6, "now <item>");
        //  2. health and usage: one group per pool (System, Claude, Codex, API, Cloud, Local) with real labels and
        //     12 px gaps, fitted to the width by dropping Local, Cloud, API first; nothing overlaps;
        //  3. the crew: "7 crew: 0 working, 2 errored", a few state dots, Active or Away, you: N, the panel icon.
        // Everything pressable is a native Button (an Svg takes no press). A pool label opens that pool's card under
        // the bar, RIGHT-ALIGNED to the bar's right edge. The crew button opens the panel.
        const cols = e.props.bodyColumns || 100
        const px = bandPx(cols)
        const youN = (snapshot.status?.you ?? []).length
        const st = lookStatusIn(now)
        const prog = progressSvg(px, {
          title: st.title,
          ratio: st.ratio,
          count: st.count,
          // v13: no "now <item>" text in the bar (the Status card and the Captain row say what is happening).
          now: '',
          // v12: the bar's content does not depend on the turn: the animated fill (stripes, shimmer) is a different drawing
          // while anything works, and the bar was seen to come and go with the coordinator's turns, so it stays still.
          isWorking: BAND_ANIMATED && (c.working > 0 || isMainBusy),
          grewFrom: progressGrewFrom(now),
        })
        const needLook = c.errored.length + g.blocked.length + c.stuck.length
        const total = snapshot.crew.length
        const outBits = outageCounts(snapshot.crew.map(m => m.outage)).map(o => o.n + ' ' + o.phrase)
        const otherErr = c.errored.filter(m => m.outage === null).length
        const errBits = [...outBits, otherErr > 0 ? otherErr + ' errored' : ''].filter(b => b !== '')
        const fullText = total + ' crew: ' + c.working + ' working' + (errBits.length > 0 ? ', ' + errBits.join(', ') : '')
        const shortText = total + ' crew: ' + c.working + ' working'
        const dotsOf: { color: string; key: string }[] = [
          ...c.errored.map(m => ({ color: 'red', key: m.name })),
          ...snapshot.crew.filter(m => !m.errored.errored && blockedBy(g, m.name) !== null).map(m => ({ color: 'yellow', key: m.name })),
          ...snapshot.crew.filter(m => !m.errored.errored && blockedBy(g, m.name) === null && m.row.state === 'working').map(m => ({ color: 'green', key: m.name })),
          ...snapshot.crew.filter(m => !m.errored.errored && blockedBy(g, m.name) === null && m.row.state !== 'working').map(m => ({ color: 'gray', key: m.name })),
        ].slice(0, 10)
        // Line 3 never wraps or clips: what does not fit goes in this order: the dots, the "!" count, ", N errored",
        // then "you". Cells are 8 px; each button costs its text plus a cushion of 3.
        const youLabel = 'you: ' + youN
        const problemLabel = '! ' + (outageChipText() !== '' ? outageChipText() : needLook)
        const cells = Math.floor((px - 8) / 8)
        const cost = (parts: { on: boolean; text: string }[]): number => parts.filter(x => x.on).reduce((a, x) => a + x.text.length + 3, 0)
        const sysIcons = systemIconsNow()
        const plan = { dots: dotsOf.length > 0, problems: needLook > 0, errored: c.errored.length > 0, you: youN > 0, icons: sysIcons.length > 0 }
        const need = (): number => cost([{ on: true, text: plan.errored ? fullText : shortText }, { on: true, text: pres.text }, { on: plan.you, text: youLabel }, { on: plan.problems, text: problemLabel }, { on: true, text: '\u25a4' }]) + (plan.dots ? dotsOf.length + 2 : 0) + (plan.icons ? Math.ceil((sysIcons.length * BAND_ICON_CELL) / 8) + 4 : 0)
        for (const drop of ['dots', 'problems', 'errored', 'you', 'icons'] as const) {
          if (need() <= cells) break
          plan[drop] = false
        }
        const line3: unknown[] = [
          Button({ key: 'band-crew', label: plan.errored ? fullText : shortText, plain: true, onPress: () => void openPaneOn($, 'crew', '') }),
          ...(plan.dots ? [Text({ key: 'band-dots', wrap: 'truncate-end', children: dotsOf.map(d => Text({ key: 'bd-' + d.key, color: d.color, children: ['\u25cf'] })) })] : []),
          // v16: coloured Text, not a Button with a Text child (the host refuses that); the crew button beside opens the panel.
          ...(plan.you ? [Text({ key: 'band-you', color: hasBlocking(snapshot.status?.you ?? []) ? 'red' : 'yellow', bold: true, children: [youLabel] })] : []),
          ...(plan.problems ? [Text({ key: 'band-problems', color: c.errored.length > 0 ? 'red' : 'yellow', bold: true, children: [problemLabel] })] : []),
        ]
        const crewBand = Box({
          key: 'crew-band',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'nowrap',
          children: [
            Box({ key: 'crew-band-left', flexDirection: 'row', alignItems: 'center', columnGap: 1, flexWrap: 'nowrap', children: line3 }),
            Box({ key: 'crew-band-right', flexDirection: 'row', alignItems: 'center', columnGap: 1, flexWrap: 'nowrap', children: [...(plan.icons ? systemNodes(kit, sysIcons) : []), presencePillEl, presenceButton, panelButton] }),
          ],
        })
        const progress = kit.Svg({ key: 'band-progress', source: prog, alt: 'Milestone ' + st.title + (st.count !== '' ? ' ' + st.count : ''), width: px, height: PROGRESS_H })
        if (fit0.level === 'compact') {
          // v12: a tight slot (a turn is running): the progress line and the crew line, no usage strip, no card.
          noteBandDraw($, { level: 'compact', maxRows: e.props.maxRows, theirsRows, embedded: fit0.embedTheirs, hostWorking: e.props.isWorking, columns: cols, px })
          return Box({ flexDirection: 'column', children: [progress, crewBand, ...(fit0.embedTheirs && theirs ? [theirs] : [])] })
        }
        const creditIconsNow = creditIcons(poolRowsNow(now), snapshot.crew.map(m => ({ kind: m.kind, outage: m.outage })))
        const line2 = creditIconsNow.length > 0 ? [creditNodes(kit, creditIconsNow)] : []
        const fit = bandFit(e.props.maxRows, theirsRows, 0)
        noteBandDraw($, { level: 'full', maxRows: e.props.maxRows, theirsRows, embedded: fit.embedTheirs, hostWorking: e.props.isWorking, columns: cols, px })
        return Box({
          flexDirection: 'column',
          children: [progress, ...(line2.length > 0 ? [Box({ key: 'crew-strip', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', columnGap: 1, flexWrap: 'nowrap', children: line2 })] : []), crewBand, ...(fit.embedTheirs && theirs ? [theirs] : [])],
        })
      }

      // v12: the one-row bar, for a slot with no room for more (or a terminal): the milestone with its count, the crew
      // line, Active or Away, the panel icon. Text and Buttons only, so it is one row on every surface.
      if (wide) {
        const cols = e.props.bodyColumns || 100
        const st = lookStatusIn(now)
        const total = snapshot.crew.length
        noteBandDraw($, { level: 'line', maxRows: e.props.maxRows, theirsRows, embedded: fit0.embedTheirs, hostWorking: e.props.isWorking, columns: cols, px: bandPx(cols) })
        return Box({
          flexDirection: 'column',
          children: [
            Box({
              key: 'crew-band',
              flexDirection: 'row',
              alignItems: 'center',
              columnGap: 1,
              flexWrap: 'nowrap',
              children: [
                Text({ key: 'band-line-title', wrap: 'truncate-end', bold: true, children: [st.title + (st.count !== '' ? '  ' + st.count : '')] }),
                Button({ key: 'band-crew', label: total + ' crew: ' + c.working + ' working', plain: true, onPress: () => void openPaneOn($, 'crew', '') }),
                presencePillEl,
                presenceButton,
                panelButton,
              ],
            }),
            ...(fit0.embedTheirs && theirs ? [theirs] : []),
          ],
        })
      }

      const line = Box({
        key: 'crew-band',
        flexDirection: 'row',
        columnGap: 2,
        children: [
          Text({ inverse: true, color: c.working > 0 ? 'green' : undefined, wrap: 'truncate-end', children: [' ' + pillText + ' '] }),
          Text({ color: pres.isAway ? 'yellow' : 'green', children: [pres.text] }),
          ...badges.map(b => Text({ key: 'b-' + b.text, color: b.color === '#F85149' ? 'red' : b.color === '#2F81F7' ? 'blue' : 'yellow', children: [b.text] })),
          presenceButton,
          panelButton,
        ],
      })
      noteBandDraw($, { level: 'line', maxRows: e.props.maxRows, theirsRows, embedded: fit0.embedTheirs, hostWorking: e.props.isWorking, columns: e.props.bodyColumns || 100, px: 0 })
      return Box({ flexDirection: 'column', children: fit0.embedTheirs && theirs ? [line, theirs] : [line] })
    }
    try {
      const tree = await draw(true)
      lastGoodBand = tree
      return tree
    } catch (err) {
      await noteBandFault($, err)
      // v12: a draw that fails keeps the last good frame (the bar does not blink to a plainer one or to nothing).
      if (lastGoodBand !== null) return lastGoodBand
      try {
        return await draw(false)
      } catch (err2) {
        await noteBandFault($, err2)
        // v16: the last resort is ONE plain Text line (no Button, no Box): counts and Active or Away as words. If even that
        // fails, the engine's own content.
        try {
          const { Text: PlainText } = $.ui.resolve(e) as unknown as Kit
          const pc = counts()
          return PlainText({ key: 'crew-band-plain', wrap: 'truncate-end', children: [plainBandText({ working: pc.working, idle: pc.idle, total: snapshot.crew.length, isAway: presenceView().isAway, needLook: pc.errored.length + pc.stuck.length, outage: outageChipText() })] })
        } catch {
          return theirs
        }
      }
    }
  })

  // The panel: the Status card, the crew, the one-line summaries, what the person opened.
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const kit = $.ui.resolve(e) as unknown as Kit
    const { Box, Text, Button } = kit
    const isSvg = e.surface !== 'terminal' && 'Svg' in kit
    paneSurface = isSvg ? 'desktop' : 'terminal'
    const now = await $.clock.now()
    const g = graphOf()
    const running = snapshot.subs.filter(s => isRunning(s.status)).length
    const subs = snapshot.subs.slice(-MAX_SUBAGENTS).reverse()
    const pres = presenceView()

    const pendingLine =
      pending === null
        ? []
        : [
            Box({
              key: 'confirm',
              flexDirection: 'row',
              columnGap: 2,
              children: [
                Text({ color: 'yellow', bold: true, wrap: 'truncate-end', children: ['press y to confirm: ' + pending.confirm] }),
                Button({ key: 'confirm-y', label: 'yes', hotkey: 'y', plain: true, onPress: () => void confirmPending($).then(t => { replyLine = t; $.ui.invalidate('ui.render') }) }),
                Button({ key: 'confirm-n', label: 'no', hotkey: 'n', plain: true, onPress: () => void cancelPending($).then(t => { replyLine = t; $.ui.invalidate('ui.render') }) }),
              ],
            }),
          ]
    const reply = replyLine === '' ? [] : [Text({ key: 'reply', dimColor: true, wrap: 'truncate-end', children: [replyLine] })]

    const buttons = Box({
      key: 'buttons',
      flexDirection: 'row',
      columnGap: 2,
      children: [
        Button({ key: 'crew-view', label: ui.view === 'crew' ? 'by crew' : 'by item', hotkey: 'v', plain: true, onPress: () => void setTab($, ui.view === 'crew' ? 'items' : 'crew') }),
        Button({ key: 'crew-refresh', label: 'refresh', hotkey: 'r', plain: true, onPress: () => void refresh($) }),
        Button({ key: 'crew-compact', label: isCompact ? 'expand' : 'compact', hotkey: 'c', plain: true, onPress: () => { isCompact = !isCompact; $.ui.invalidate('ui.render') } }),
        Button({ key: 'crew-cast', label: isCastOpen ? 'hide cast' : 'cast', hotkey: 'k', plain: true, onPress: () => { isCastOpen = !isCastOpen; $.ui.invalidate('ui.render') } }),
        ...(isCastOpen
          ? [Button({ key: 'crew-cast-mode', label: castMode === 'work' ? 'show asleep' : 'show working', hotkey: 'm', plain: true, onPress: () => { castMode = castMode === 'work' ? 'idle' : 'work'; $.ui.invalidate('ui.render') } })]
          : []),
        Button({ key: 'crew-away', label: AUTOPILOT, hotkey: 'a', plain: true, dimColor: !pres.isAway, onPress: () => void setAutopilot($, !pres.isAway) }),
      ],
    })

    if (isSvg) return paneSvgTree($, kit, e.props.bodyColumns, e.props.scroll?.bodyRows, now, g, pendingLine, reply)

    // Terminal: the same things as plain text rows.
    const s = displayStatus(now)
    const lines: string[] = [
      'Now: ' + ((s?.now ?? []).join(' | ') || 'nothing'),
      'Next: ' + ((s?.next ?? []).join(', ') || 'nothing'),
      'You: ' + ((s?.you ?? []).length > 0 ? (s?.you ?? []).map(a => a.text + (a.blocking !== '' ? ' [blocking: ' + a.blocking + ']' : '')).join(' | ') : 'nothing'),
    ]
    return Box({
      flexDirection: 'column',
      children: [
        Text({ key: 't-status', bold: true, wrap: 'truncate-end', children: [(s?.milestone || 'Status') + (statusCount(s) !== '' ? '  ' + statusCount(s) : '') + '  ' + statusAge(s, now).label] }),
        ...lines.map((l, i) => Text({ key: 't-l' + i, wrap: 'truncate-end', children: [l] })),
        Text({ key: 't-pres', color: pres.isAway ? 'yellow' : 'green', children: [pres.text + (pres.isAway ? ' (' + pres.label + ')' : '')] }),
        ...pendingLine,
        ...reply,
        buttons,
        ...(snapshot.note ? [Text({ color: 'red', children: [snapshot.note] })] : []),
        Text({ key: 't-crew', bold: true, children: [ui.view === 'crew' ? 'Crew' : 'Items'] }),
        ...(ui.view === 'crew' && snapshot.crew.length === 0 ? [Text({ key: 'no-crew', dimColor: true, children: ['no crew running'] })] : []),
        ...(ui.view === 'items'
          ? itemsNow(g, now)
              .filter(it => it.status !== 'landed')
              .slice(0, 40)
              .map((it, i) =>
                Text({
                  key: 't-i-' + it.family,
                  wrap: 'truncate-end',
                  children: [(i < 9 ? i + 1 + ' ' : '  ') + it.title + ' [' + it.latest + ']  ' + ITEM_STATUS_LABEL[it.status] + '  ' + (it.assignees.map(a => a.name + ' \u00b7 ' + statusWordOf(a.activity as Activity)).join(', ') || 'unassigned') + (it.blockedBy ? '  blocked by ' + it.blockedBy.on : '')],
                }),
              )
          : []),
        ...(ui.view === 'items' ? [] : snapshot.crew).map(m => {
          const b = blockedBy(g, m.name)
          return Box({
            key: 't-m-' + m.name,
            flexDirection: 'column',
            children: [
              Text({
                wrap: 'truncate-end',
                color: m.errored.errored ? 'red' : undefined,
                dimColor: m.exhaustion.exhausted,
                children: [
                  m.name + '  ' + activityPill(statusWordOf(m.activity, { blocked: b !== null }), m.target) + (b ? '  blocked by ' + b.on : '') + (m.isStuck ? '  stuck?' : '') + (m.row.isStale ? '  stale?' : '') +
                    (m.errored.errored ? '  errored' + (m.errored.reason !== '' ? ': ' + m.errored.reason : '') : '') +
                    (m.exhaustion.exhausted ? '  out of credits' + (m.exhaustion.backAtMs !== null ? ', ' + backText(m.exhaustion.backAtMs) : '') : ''),
                ],
              }),
              Text({ dimColor: true, wrap: 'truncate-end', children: ['  ' + (m.powered.text !== '' ? m.powered.text + '  ' : '') + m.desc] }),
            ],
          })
        }),
        Text({ key: 't-system', wrap: 'truncate-end', children: [snapshot.system.at === 0 ? 'System: checking' : systemSummary(snapshot.system.reading, snapshot.system.hosts, snapshot.gateWaiting).text] }),
        Text({ key: 't-sess', wrap: 'truncate-end', children: ['Captain  ' + (isMainBusy ? 'working' : CAPTAIN_IDLE_WORD) + '  ' + describeSession(snapshot.lockTimes, isMainBusy) + '  ' + ctxBarLabel(snapshot.usage)] }),
        // The limits: BOTH windows of every plan, in one line each, then the credits.
        ...poolsNow(now).map(p => Text({ key: 't-lim-' + p.id, color: poolSummary(p).color === '#F85149' ? 'red' : poolSummary(p).color === '#F0A500' ? 'yellow' : undefined, dimColor: poolSummary(p).color === '#3FB950', wrap: 'truncate-end', children: [poolSummary(p).text] })),
        Text({ key: 't-cred-api', dimColor: true, wrap: 'truncate-end', children: [apiLineNow()] }),
        ...cloudCredits(now).map(c => Text({ key: 't-cred-' + c.id, dimColor: true, wrap: 'truncate-end', children: [c.name + ': ' + c.text] })),
        Text({ key: 't-sum', dimColor: true, wrap: 'truncate-end', children: [queueSummary(snapshot.queue.total) + '  ' + backlogSummary(snapshot.backlog) + '  ' + inboxSummary(inboxNewCount(snapshot.inbox)) + '  ' + landedSummary(snapshot.landed)] }),
        // v17: the Flight log (8) and the Black box (3) as plain text.
        Text({ key: 't-flight', bold: true, children: ['Flight log'] }),
        ...flightRows(flightEntriesNow(g, now), FLIGHT_SHOWN).map((f, i) => Text({ key: 't-flight-' + i, wrap: 'truncate-end', color: f.status === 'errored' ? 'red' : f.status === 'blocked' ? 'yellow' : f.status === 'done' ? 'green' : undefined, children: [STATUS_WORD[f.status] + '  ' + f.name + (f.detail !== '' ? '  ' + f.detail : '')] })),
        Text({ key: 't-box', bold: true, children: ['Black box'] }),
        ...blackBoxRows(deck.log, false).map((r, i) => Text({ key: 't-box-' + i, wrap: 'truncate-end', color: r.isProblem ? 'red' : undefined, children: [r.time + ' ' + r.label + ' ' + r.who + ' ' + r.text] })),
      ],
    })
  })
}
