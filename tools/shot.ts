// Screenshots of the Cockpit pane from the synthetic demo project:   bun tools/shot.ts [project folder] [output folder]
//
// Defaults: examples/project (write it first with `bun tools/demo.ts`) and docs/img. It reads the demo's files and panes with the plugin's own
// readers and classifiers (config, claims, reports, deps, pane markers and activity words, the item a lane owns, the task line, the Flight log
// judge) and draws the cards with the plugin's own drawing functions (statusSvg, rowSvg, flightSvg, blackBoxSvg, wrapCardSvg). No tmux, no host.
// The native Button and Text parts are simulated in HTML (the host draws those), so a picture shows the order, the colours and the cards.
// Needs Chrome: set CHROME to its path when it is not the macOS default. Writes pane-dark.png, pane-light.png and pane-open.png.

import { withToGo } from '../hooks/board.ts'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

import { wrapCardSvg, wrapHeight } from '../hooks/cards.ts'
import type { WrapEntry } from '../hooks/cards.ts'
import { parseAwayLog, parseStatus, statusCount, statusRatio } from '../hooks/board.ts'
import { blackBoxRows, blackBoxSummary } from '../hooks/blackbox.ts'
import { buildConfig, setGateCommand, setMarkers } from '../hooks/config.ts'
import { classifyKind } from '../hooks/core.ts'
import { ACTIVITY_COLOR, WAIT_AMBER, activityOf, blockedBy, buildGraph, discoverCrew, groupOf, GROUP_RANK, laneKindOf, modelFromPsArgs, paneModel, parseDeps, parseTargets, poweredCodex, poweredLocal, poweredOpencode, poweredSession, rowToneOf, statusWordOf, targetOf } from '../hooks/crew.ts'
import type { CrewMember } from '../hooks/crew.ts'
import { memberDetail, shortName } from '../hooks/details.ts'
import type { MemberCardIn } from '../hooks/details.ts'
import { doingLineOf, doingOf, lastReportOf, paneDoingOf, taskLineOf } from '../hooks/doing.ts'
import { shortTag } from '../hooks/draw.ts'
import { crewEntries, flightRows, flightSummary, parseReport } from '../hooks/flightlog.ts'
import { blackBoxHeight, blackBoxSvg, flightHeight, flightSvg } from '../hooks/flightsvg.ts'
import { briefItem, parseClaim, resolveLaneItem } from '../hooks/laneitem.ts'
import type { BriefLite } from '../hooks/laneitem.ts'
import { borderFor, rowHeight, rowSvg, statusHeight, statusSvg } from '../hooks/look.ts'
import type { LookRow, LookStatus } from '../hooks/look.ts'
import { consultEntry, doneEntry, editEntry, promptEntry, pushLog, spawnEntry, trackLanes } from '../hooks/sessionlog.ts'
import type { LogLine } from '../hooks/sessionlog.ts'
import { deriveLive } from '../hooks/statuslive.ts'
import type { Claim, ReportMark } from '../hooks/statuslive.ts'
import { emptyReading, systemSummary } from '../hooks/system.ts'
import { setTheme } from '../hooks/tokens.ts'
import { ageLabel, fmtTime } from '../hooks/core.ts'
import { blackBoxLast } from '../hooks/blackbox.ts'
import { contextCard } from '../hooks/details.ts'
import { FLIGHT_SHOWN, STATUS_HEX, STATUS_WORD, flightDetails } from '../hooks/flightlog.ts'
import { CREW_CAP_H, crewCapSvg, crewSummary, flightBodyHeight, flightBodySvg, blackBoxBodyHeight, blackBoxBodySvg, secHeadHeight, secHeadSvg, subHeight, subSvg } from '../hooks/sections.ts'
import type { BoxRowIn, FlightRowIn, SubIn } from '../hooks/sections.ts'
import { serviceRows } from '../hooks/services.ts'
import { claudeWindows, emptyCache } from '../hooks/usage.ts'
import { codexPool, parseCreditsFile } from '../hooks/limits.ts'
import { parseCodexLimits } from '../hooks/core.ts'
import { bandBarSvg, bandPx, creditsSvg, headCells, presenceSvg } from '../hooks/look.ts'
import { PILL_CSS, bandPills, limitsLine, pillsSvg } from '../hooks/planbar.ts'
import { derivePlan, footerLine, parsePlan } from '../hooks/plan.ts'
import { FONT, doc as svgDoc, textWidth } from '../hooks/draw.ts'
import { glyphFragment } from '../hooks/glyphs.ts'
import { healthIcons } from '../hooks/system.ts'
import { LEVEL_COLOR, LEVEL_TONE, gaugesOf, systemFigureParts, systemFigures, topLine } from '../hooks/system.ts'
import type { HostReading, Level } from '../hooks/system.ts'

const ROOT = resolve(import.meta.dir, '..')
const PROJECT = resolve(process.argv[2] ?? join(ROOT, 'examples', 'project'))
const OUT = resolve(process.argv[3] ?? join(ROOT, 'docs', 'img'))
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const W = 520
const RW = W - 24
const RED_HEX = '#F85149'
const AMBER_HEX = '#F0A500'

if (!existsSync(PROJECT)) throw new Error('no demo project at ' + PROJECT + ': run bun tools/demo.ts first')
if (!existsSync(CHROME)) throw new Error('Chrome not found at ' + CHROME + ': set CHROME to its path')
const PAGES = join(ROOT, 'demo-out')
mkdirSync(OUT, { recursive: true })
mkdirSync(PAGES, { recursive: true })

const now = Date.now()
const read = (p: string): string | null => (existsSync(p) ? readFileSync(p, 'utf8') : null)
const mtime = (p: string): number => statSync(p).mtimeMs
const files = (dir: string, ext: string): string[] => (existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith(ext)).sort() : [])

// ---- the configuration and the files, as the plugin reads them
const cfg = buildConfig([{ label: '.cockpit/config.json', text: read(join(PROJECT, '.cockpit', 'config.json')) }], PROJECT, '/home/alex')
setMarkers(cfg.markers)
setGateCommand(cfg.gateCommand)

const status = parseStatus(read(cfg.statusFile) ?? '')
const claims: Claim[] = files(cfg.claimsDir, '.claim').map(f => parseClaim(f, read(join(cfg.claimsDir, f)) ?? '', mtime(join(cfg.claimsDir, f))))
const reportFiles = files(cfg.reportsDir, '.md')
const reports: ReportMark[] = reportFiles.map(f => ({ id: f.replace(/-report\.md$/, ''), mtimeMs: mtime(join(cfg.reportsDir, f)) }))
const briefs: BriefLite[] = files(cfg.briefsDir, '.md').map(f => ({ name: f, heading: /^#\s+(.+)$/m.exec(read(join(cfg.briefsDir, f)) ?? '')?.[1] ?? '' }))
const targets = parseTargets(read(join(cfg.dataDir, 'targets.json')) ?? '')
const edges = parseDeps(read(join(cfg.dataDir, 'deps.json')) ?? '')
const awayLog = parseAwayLog(read(cfg.awayLog) ?? '')
const panesDir = join(PROJECT, 'panes')
const sessions = files(panesDir, '.txt').map(f => basename(f, '.txt'))
const paneOf = (name: string): string[] => (read(join(panesDir, name + '.txt')) ?? '').split('\n')

// ---- the crew
const crew: CrewMember[] = discoverCrew(sessions, new Set(), cfg.lanes, cfg.discoverLanes)
const graph = buildGraph(edges, { members: new Set(crew.map(m => m.name)), isBad: () => false, isFaded: () => false })

type Built = { m: CrewMember; lines: string[]; activity: ReturnType<typeof activityOf>; state: 'working' | 'idle' | 'absent'; item: string; claim: Claim | undefined; heading: string; group: number; since: string }

const built: Built[] = crew.map(m => {
  const lines = paneOf(m.name)
  const state = classifyKind(laneKindOf(m.kind), true, lines)
  const activity = activityOf(lines, state, 30)
  const hit = resolveLaneItem({ lane: m.name, awake: state === 'working', lastActivityMs: null, paneLines: lines, lock: null, claims, runBrief: '', runStartedMs: null, briefs, reports, landed: [], nowMs: now })
  const claim = claims.find(c => c.id === hit.item)
  const brief = briefs.find(b => briefItem(b) === hit.item)
  const blocked = blockedBy(graph, m.name) !== null
  const act = activity === 'absent' ? 'sleeping' : activity
  const group = GROUP_RANK[groupOf({ activity: act, state, exhausted: false, blocked })]
  // time in state: the claim's age for a lane at work, else the age of the newest report its pane names
  const named = reports.filter(r => lines.join(' ').includes(r.id)).sort((a, b) => b.mtimeMs - a.mtimeMs)[0]
  const sinceMs = claim !== undefined && state === 'working' ? now - claim.mtimeMs : named !== undefined ? now - named.mtimeMs : null
  return { m, lines, activity, state, item: hit.item, claim, heading: brief?.heading.replace(/^#+\s*/, '') ?? '', group, since: sinceMs === null ? '' : ageLabel(sinceMs) }
})
built.sort((a, b) => a.group - b.group || a.m.name.localeCompare(b.m.name, 'en', { numeric: true }))

const poweredOf = (b: Built) =>
  b.m.kind === 'codex' ? poweredCodex(paneModel(b.lines)) : b.m.kind === 'api' ? poweredOpencode(modelFromPsArgs('opencode run -m anthropic/claude-sonnet-5-5 brief'), null) : b.m.kind === 'local' ? poweredLocal('llama-9b-q4') : poweredSession('claude-sonnet-5-5')

function memberCardOf(b: Built): MemberCardIn {
  const blk = blockedBy(graph, b.m.name)
  const act = b.activity === 'absent' ? 'sleeping' : b.activity
  const word = statusWordOf(b.activity, { blocked: blk !== null })
  const reportName = reportFiles.find(f => f.replace(/-report\.md$/, '') === b.item)
  const reportText = reportName === undefined ? null : read(join(cfg.reportsDir, reportName))
  const doing = doingLineOf({ now: b.claim?.now ?? '', pane: paneDoingOf(b.lines, b.item), claimTitle: b.claim?.title ?? '', heading: b.heading, item: b.item, statusWord: word, isSleeping: act === 'sleeping' })
  return {
    name: b.m.name, kind: b.m.kind, activity: word, powered: poweredOf(b).text, target: targetOf(b.item, b.heading, targets), item: b.item, doing,
    description: b.claim?.title !== undefined && b.claim.title !== '' ? b.claim.title : b.heading,
    lastReport: lastReportOf({ reportText, item: b.item, paneLines: b.lines, skip: doing }), since: b.since, lockOwner: '', lockAge: '', context: '', limits: '',
    blockedBy: blk === null ? [] : [{ on: blk.on, why: blk.why }], errored: false, errorReason: '', out: false, back: '', isStale: false, isStuck: false,
  }
}

function crewRow(b: Built, open: boolean): LookRow {
  const blk = blockedBy(graph, b.m.name)
  const act = b.activity === 'absent' ? 'sleeping' : b.activity
  const working = b.state === 'working'
  const word = statusWordOf(b.activity, { blocked: blk !== null })
  const tone = rowToneOf({ activity: act, errored: false, blocked: blk !== null, stuck: false, exhausted: false })
  const asleep = !working
  const doing = doingOf(b.lines)
  return {
    kind: b.m.kind,
    variant: b.m.variant,
    mode: working ? 'work' : asleep && blk !== null ? 'work' : 'idle',
    activity: asleep && blk !== null ? 'asking' : act,
    title: shortName(b.m.name, b.m.kind),
    state: { text: word, color: blk !== null && act !== 'working' ? WAIT_AMBER : ACTIVITY_COLOR[act] },
    item: taskLineOf({ item: b.item, title: b.heading, claimTitle: b.claim?.title ?? '', statusWord: word, doing, isSleeping: act === 'sleeping', isWorking: act !== 'sleeping' && working }),
    tag: shortTag(poweredOf(b).text),
    since: b.since,
    trouble: blk !== null ? { text: 'blocked by ' + blk.on + (blk.why !== '' ? ': ' + blk.why : ''), hex: AMBER_HEX } : null,
    isOut: false,
    indent: 0,
    isOpen: open,
    detail: open ? memberDetail(memberCardOf(b)) : [],
    bars: [],
    burst: '',
    landed: '',
    phase: 0,
    tone,
  }
}

// ---- the Captain (the session Cockpit runs in): working, on the first line of status.json's NOW
const live = deriveLive({ status, members: built.map(b => ({ name: b.m.name, awake: b.state === 'working', label: b.item, lockItem: '', lockMtimeMs: null, sinceMs: null })), claims, reports, landed: [], nowMs: now })
const captainRow = (open: boolean): LookRow => ({
  kind: 'captain', variant: 0, mode: 'work', activity: 'working', title: 'Captain', state: { text: 'working', color: ACTIVITY_COLOR.working },
  item: live.now[0] ?? status?.milestone ?? '', tag: shortTag(poweredSession('claude-opus-5-5').text), since: fmtTime(4 * 60_000 + 12_000), trouble: null, isOut: false, indent: 0, isOpen: open,
  detail: open ? live.now.map((t, i) => ({ label: i === 0 ? 'Now' : '', text: t })) : [], bars: [], burst: '', landed: '', phase: 0, tone: 'green',
})

// ---- the Status card
const lookStatus = (open: boolean): LookStatus => ({
  title: 'Main status', ratio: statusRatio(status), count: statusCount(status), note: '',
  now: live.now.join(' \u00b7 '), next: live.next.join(', '), you: (status?.you ?? []).map(a => a.text + (a.blocking !== '' ? ' [blocking: ' + a.blocking + ']' : '')).join(' \u00b7 '),
  youHex: (status?.you ?? []).some(a => a.blocking !== '') ? RED_HEX : AMBER_HEX, isAway: false, presenceText: 'Active', stale: live.stale !== '' ? 'stale: ' + live.stale : '', phase: 0,
  nowItems: live.now, nextItems: live.next, youItems: (status?.you ?? []).map(a => a.text + (a.blocking !== '' ? ' [blocking: ' + a.blocking + ']' : '')),
  open: { now: open, next: open, you: open },
})

// ---- the Flight log: the judged reports, and the crew members that are blocked
const flight = flightRows(
  [
    ...reportFiles.map(f => parseReport(f, read(join(cfg.reportsDir, f)) ?? '', mtime(join(cfg.reportsDir, f)))),
    ...crewEntries(built.flatMap(b => { const k = blockedBy(graph, b.m.name); return k === null ? [] : [{ name: b.m.name, kind: 'blocked' as const, reason: 'blocked by ' + k.on + (k.why !== '' ? ': ' + k.why : ''), sinceMs: 12 * 60_000 }] }), now),
  ],
  8,
)

// ---- the Black box: this session's own events (invented for the picture)
let log: LogLine[] = []
const ev: (LogLine | null)[] = [
  promptEntry(now - 9 * 60_000, 'finish the sync client and check the settings screen'),
  spawnEntry(now - 8 * 60_000, 'explore', 'Explore', 'a1'),
  doneEntry(now - 7 * 60_000, 'explore', 'done', 14_000, 'a1', fmtTime),
  editEntry(now - 5 * 60_000, 'main', 'Edit', { file_path: 'src/client/retry.ts' }, null),
  consultEntry(now - 4 * 60_000, 'consulted \u00b7 advisor'),
  ...trackLanes({ 'codex-c': 'working' }, [{ name: 'codex-c', state: 'idle' }], now - 3 * 60_000).lines,
  editEntry(now - 2 * 60_000, 'main', 'Edit', { file_path: 'src/ui/SettingsRow.tsx' }, null),
]
for (const e of ev) if (e !== null) log = pushLog(log, e)

// ---- the page, with the native parts simulated
const img = (svg: string, w: number, h: number): string => `<img alt="" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${w}" height="${h}" style="display:block;flex:none">`
const chevron = (open: boolean): string => `<div style="width:24px;text-align:center;color:#58A6FF">${open ? '\u25be' : '\u25b8'}</div>`

type Opts = { theme: 'dark' | 'light'; file: string; statusOpen: boolean; openRows: string[]; systemOpen: boolean }

async function shoot(o: Opts): Promise<string> {
  setTheme(o.theme)
  const bg = o.theme === 'dark' ? '#1b1b1b' : '#ffffff'
  const fg = o.theme === 'dark' ? '#ececec' : '#1f1f1f'
  const line = o.theme === 'dark' ? '#3a3a3a' : '#d8d8d4'
  const link = o.theme === 'dark' ? '#58A6FF' : '#0969da'
  let height = 16
  const parts: string[] = []
  const add = (html: string, h: number): void => {
    parts.push(html)
    height += h
  }
  const btn = (t: string): string => `<span style="border:1px solid ${line};border-radius:6px;padding:1px 10px;margin-right:6px">${t}</span>`
  const section = (t: string): string => `<div style="color:${link};padding:3px 8px;height:28px;box-sizing:border-box">${t}</div>`

  const ls = lookStatus(o.statusOpen)
  const sh = statusHeight(RW, ls)
  add(`<div style="display:flex;align-items:center">${img(statusSvg(RW, ls), RW, sh)}${chevron(o.statusOpen)}</div>`, sh)
  add(`<div style="display:flex;justify-content:space-between;align-items:center;padding:0 8px;height:36px"><div>${btn('Add Bug')}${btn('Add Idea')}</div><div><span style="background:#8B949E;color:#0d1117;font-weight:700;padding:0 4px">&nbsp;OFF&nbsp;</span> <span style="color:#8B949E;margin-left:6px">AWAY</span></div></div>`, 36)

  const rows: { row: LookRow; open: boolean }[] = [{ row: captainRow(o.openRows.includes('Captain')), open: o.openRows.includes('Captain') }, ...built.map(b => ({ row: crewRow(b, o.openRows.includes(b.m.name)), open: o.openRows.includes(b.m.name) }))]
  for (const { row, open } of rows) {
    const r = { ...row, border: borderFor(row.tone, true) }
    add(`<div style="display:flex;align-items:center">${img(rowSvg(RW, r), RW, rowHeight(r))}${chevron(open)}</div>`, rowHeight(r))
  }

  const sys = systemSummary({ ...emptyReading, memFree: 58, swapMB: 0, load1: 2.1, cores: 10, diskFree: 62 }, [], false)
  add(section((o.systemOpen ? '\u25be ' : '\u25b8 ') + 'System \u00b7 ' + sys.text.replace(/^System: /, '')), 28)
  const fh = flightHeight(flight.length)
  add(img(flightSvg(W, flight, flightSummary(flight)), W, fh), fh)
  add(section('\u25b8 Black box \u00b7 ' + blackBoxSummary(log)), 28)
  const box = blackBoxRows(log, false)
  const bh = blackBoxHeight(box.length)
  add(img(blackBoxSvg(W, box, 'last 3'), W, bh), bh)
  if (awayLog.length > 0) {
    const entries: WrapEntry[] = awayLog.slice(0, 12).map(a => ({ pill: a.kind === 'blocked' ? { text: 'BLOCKED', color: '#EF4444' } : a.kind === 'decision' ? { text: 'decided', color: '#2F81F7' } : undefined, text: a.text }))
    const ah = wrapHeight(W, entries)
    add(img(wrapCardSvg(W, 'While you were away', entries), W, ah), ah)
    add(`<div style="color:${link};padding:3px 8px;height:28px;box-sizing:border-box">clear log</div>`, 28)
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:${bg};color:${fg};font:13px/1.4 -apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif}#p{width:${W}px;padding:8px}</style></head><body><div id="p">${parts.join('\n')}</div></body></html>`
  const base = join(OUT, o.file)
  writeFileSync(join(PAGES, o.file + '.html'), html)
  const p = Bun.spawn([CHROME, '--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2', `--screenshot=${base}.png`, `--window-size=${W + 16},${height + 8}`, 'file://' + join(PAGES, o.file + '.html')], { stdout: 'ignore', stderr: 'ignore' })
  await p.exited
  return base + '.png'
}

// ---- the whole pane in one picture (COCKPIT-59): every one of the five sections open, drawn with the plugin's own section builders
async function shootAll(theme: 'dark' | 'light', file: string): Promise<string> {
  setTheme(theme)
  const bg = theme === 'dark' ? '#1b1b1b' : '#ffffff'
  const fg = theme === 'dark' ? '#ececec' : '#1f1f1f'
  const line = theme === 'dark' ? '#3a3a3a' : '#d8d8d4'
  const link = theme === 'dark' ? '#58A6FF' : '#0969da'
  const WC = RW
  let height = 16
  const parts: string[] = []
  const add = (html: string, h: number): void => {
    parts.push(html)
    height += h
  }
  const chev = (open: boolean): string => `<div style="width:24px;text-align:center;color:${link}">${open ? '\u25be' : '\u25b8'}</div>`
  const withChev = (svg: string, h: number, open: boolean | null): string => `<div style="display:flex;align-items:center;height:${h}px">${img(svg, WC, h)}${open === null ? '<div style="width:24px"></div>' : chev(open)}</div>`
  const btn = (t: string): string => `<span style="border:1px solid ${line};border-radius:6px;padding:1px 10px;margin-right:6px">${t}</span>`

  // the demo clock and the limits (synthetic)
  const T = now
  const win = claudeWindows([{ kind: 'five_hour', percentUsed: 34, resetsAt: new Date(T + 3 * 3_600_000).toISOString() }, { kind: 'seven_day', percentUsed: 61, resetsAt: new Date(T + 3 * 86_400_000).toISOString() }], emptyCache, T)
  const lim = `{"rate_limits":{"primary":{"used_percent":22,"window_minutes":300,"resets_at":${Math.floor(T / 1000) + 9000}},"secondary":{"used_percent":47,"window_minutes":10080,"resets_at":${Math.floor(T / 1000) + 300000}}}}\n`
  const cr = parseCreditsFile(JSON.stringify({ opencode: { total: 200, left: 118.4, expires: '2026-11-01', source: 'console' }, cloud: { expires: '2026-11-30' } }))
  const services = serviceRows({ nowMs: T, claude: { five: win.five, week: win.week }, codex: codexPool(parseCodexLimits(lim), T, null), codexAtMs: T, credits: cr, creditsAtMs: T, apiSpendSince: { usd: 31, atMs: T }, rows: [], outages: [], localUp: true })

  // 1. Main status, expanded, with the self-filling lines
  const ls: LookStatus = {
    ...lookStatus(true),
    services,
    main: { running: '3 lanes awake, 2 agents running', landed: 'API-09: retries in the sync client, 12 min ago', report: 'api-09-report, 4 min ago', notes: '' },
    landedItems: ['API-09: retries in the sync client', 'UI-18: settings icons'],
  }
  const sh = statusHeight(WC, ls)
  add(withChev(statusSvg(WC, ls), sh, true), sh)
  add(`<div style="display:flex;justify-content:space-between;align-items:center;padding:0 8px;height:36px"><div>${btn('Add Bug')}${btn('Add Idea')}</div><div><span style="background:#8B949E;color:#0d1117;font-weight:700;padding:0 4px">&nbsp;OFF&nbsp;</span> <span style="color:#8B949E;margin-left:6px">AWAY</span></div></div>`, 36)

  // 2. Agents: the Session, two subagents, the crew
  const sleeping = built.filter(b => b.activity === 'absent' || b.state !== 'working').length
  const sum = crewSummary({
    working: built.filter(b => b.state === 'working').length,
    idle: built.filter(b => b.state !== 'working' && blockedBy(graph, b.m.name) === null).length,
    sleeping: 0, blocked: built.filter(b => blockedBy(graph, b.m.name) !== null).length, errored: 0,
  })
  void sleeping
  const accent = sum.tone === 'warn' ? LEVEL_COLOR.amber : LEVEL_COLOR.green
  add(withChev(secHeadSvg(WC, { title: 'Agents', summary: sum.text, isOpen: true, tone: sum.tone, accent }), secHeadHeight(true), true), secHeadHeight(true))
  const sub = (name: string, what: string, done: boolean, t: string, last: boolean): LookRow => ({
    kind: 'max', variant: 0, mode: done ? 'dim' : 'work', activity: 'working', title: name, state: { text: done ? 'done' : 'running', color: done ? '#8B949E' : ACTIVITY_COLOR.working },
    item: what, tag: shortTag(poweredSession('claude-haiku-4-5').text), since: t, trouble: null, isOut: false, indent: 0, branch: last ? '\u2514 ' : '\u251c ', isOpen: false, detail: [], bars: [], burst: '', landed: '', phase: 0, tone: done ? '' : 'green',
  })
  const cardRows: LookRow[] = [
    { ...captainRow(false), title: 'Session' },
    sub('atlas', 'Explore: where the sync client reads its retry settings', false, '1m', false),
    sub('juniper', 'Explore: which tests cover the settings screen', true, '3m', true),
    ...built.map(b => crewRow(b, false)),
  ]
  for (const row of cardRows) {
    const r = { ...row, inCard: true, border: borderFor(row.tone, true) }
    const h = rowHeight(r)
    add(withChev(rowSvg(WC, r), h, row.branch !== undefined ? null : false), h)
  }
  add(`<div style="display:flex;height:${CREW_CAP_H}px">${img(crewCapSvg(WC), WC, CREW_CAP_H)}</div>`, CREW_CAP_H)

  // 3. System, open: resources, services, plan limits, context, sessions
  const reading = { ...emptyReading, memFree: 41, swapMB: 0, load1: 3.4, cores: 10, diskFree: 52, top: [{ name: 'bun', mb: 1450 }, { name: 'tmux', mb: 310 }, { name: 'node', mb: 270 }] }
  const hosts: HostReading[] = [{ name: 'host-a', answered: true, mem: { totalMB: 65536, availMB: 40000, freePct: 61, swapUsedMB: 0 } as never, gpu: { usedMB: 14200, totalMB: 24576, util: 46 } }]
  const sysIcons = gaugesOf(reading, hosts)
  const worst: Level = sysIcons.some(g => g.level === 'red') ? 'red' : sysIcons.some(g => g.level === 'amber') ? 'amber' : 'green'
  add(withChev(secHeadSvg(WC, { title: 'System', summary: '', isOpen: true, tone: LEVEL_TONE[worst], accent: LEVEL_COLOR[worst], parts: systemFigureParts(reading, hosts).map(p => ({ text: p.text, tone: LEVEL_TONE[p.level] })) }), secHeadHeight(true), true), secHeadHeight(true))
  void systemFigures
  const subs: SubIn[] = [
    { title: 'Resources', gauges: sysIcons.map(x => ({ label: x.label, ratio: x.ratio, hex: LEVEL_COLOR[x.level], note: x.note, kind: x.kind, figure: x.figure })), foot: topLine(reading.top) },
    { title: 'Services', lines: [{ dot: '#3FB950', text: 'Web app', right: 'up 2d', rightCls: 'okc' }, { dot: '#3FB950', text: 'Docs site (example.com)', right: 'up 2d', rightCls: 'okc' }, { dot: '#8B949E', text: 'Build box 192.0.2.14', right: 'checking', rightCls: 's' }] },
    { title: 'Plan limits', services },
    { title: 'Context and startup cost', lines: contextCard({ used: 96_000, window: 200_000, percent: 48, handoffMtimeMs: now - 3_600_000, nowMs: now }).map(t => ({ text: t })) },
    { title: 'Sessions', lines: [{ text: 'Session', right: 'working' }, { text: 'atlas', right: 'running' }, { text: 'juniper', right: 'done' }] },
  ]
  subs.forEach((s, i) => {
    const last = i === subs.length - 1
    const h = subHeight(WC, s, last)
    add(withChev(subSvg(WC, s, last), h, null), h)
  })

  // 4. Events, open
  const flightRowsIn: FlightRowIn[] = flight.slice(0, FLIGHT_SHOWN).map(f => ({ name: f.name, detail: flightDetails(f, now), word: STATUS_WORD[f.status], hex: STATUS_HEX[f.status] }))
  const fsum = flightSummary(flight)
  add(withChev(secHeadSvg(WC, { title: 'Events', summary: fsum, isOpen: true, tone: flight.some(f => f.status === 'errored') ? 'err' : 'warn' }), secHeadHeight(true), true), secHeadHeight(true))
  const fb = flightBodyHeight(flightRowsIn.length)
  add(withChev(flightBodySvg(WC, flightRowsIn), fb, null), fb)

  // 5. System log, open
  const boxRows: BoxRowIn[] = blackBoxLast(log, 12).map(r => ({ time: r.time, label: r.label, who: r.who, text: r.text, cls: r.isProblem ? 'errc' : r.kind === 'consult' ? 'warnc' : r.kind === 'edit' || r.kind === 'done' ? 'okc' : r.kind === 'prompt' ? 't' : 'infoc', isProblem: r.isProblem }))
  add(withChev(secHeadSvg(WC, { title: 'System log', summary: blackBoxSummary(log), isOpen: true, tone: '' }), secHeadHeight(true), true), secHeadHeight(true))
  const bb = blackBoxBodyHeight(boxRows.length)
  add(withChev(blackBoxBodySvg(WC, boxRows, 'nothing recorded yet'), bb, null), bb)

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:${bg};color:${fg};font:13px/1.4 -apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif}#p{width:${W}px;padding:8px}</style></head><body><div id="p">${parts.join('\n')}</div></body></html>`
  const base = join(OUT, file)
  writeFileSync(join(PAGES, file + '.html'), html)
  const p = Bun.spawn([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2', `--screenshot=${base}.png`, `--window-size=${W + 16},${height + 8}`, 'file://' + join(PAGES, file + '.html')], { stdout: 'ignore', stderr: 'ignore' })
  await p.exited
  return base + '.png'
}

// ---- the bottom of the Claude Code screen: the status row, the input box with a typed line, and the line under it (COCKPIT-59)
async function shootRow(theme: 'dark' | 'light', file: string): Promise<string> {
  setTheme(theme)
  const dark = theme === 'dark'
  const bg = dark ? '#1b1b1b' : '#ffffff'
  const fg = dark ? '#ececec' : '#1f2328'
  const dim = dark ? '#8b8b8b' : '#6e7681'
  const box = dark ? '#6b6b6b' : '#9a9a9a'
  const W = bandPx(120) + 16
  const T = now
  const win = claudeWindows([{ kind: 'five_hour', percentUsed: 9, resetsAt: new Date(T + 3 * 3_600_000).toISOString() }, { kind: 'seven_day', percentUsed: 90, resetsAt: new Date(T + 3 * 86_400_000).toISOString() }], emptyCache, T)
  const lim = `{"rate_limits":{"primary":{"used_percent":6,"window_minutes":300,"resets_at":${Math.floor(T / 1000) + 9000}},"secondary":{"used_percent":98,"window_minutes":10080,"resets_at":${Math.floor(T / 1000) + 300000}}}}\n`
  const cr = parseCreditsFile(JSON.stringify({ opencode: { total: 200, left: 140, expires: '2026-11-30', source: 'console 2026-10-01' }, cloud: { expires: '2026-11-30' } }))
  const rows = serviceRows({ nowMs: T, claude: { five: win.five, week: win.week }, codex: codexPool(parseCodexLimits(lim), T, null), codexAtMs: T, credits: cr, creditsAtMs: T, apiSpendSince: { usd: 0, atMs: T }, rows: [], outages: [], localUp: true })
  const reading = { ...emptyReading, memFree: 41, swapMB: 0, load1: 3.4, cores: 10, diskFree: 52 }
  const icons = healthIcons(reading, [])
  const iconsSvg = `<svg width="${icons.length * 22}" height="20" xmlns="http://www.w3.org/2000/svg">${icons.map((ic, i) => glyphFragment(ic.kind, ic.hex, i * 22 + 1, 1, 18)).join('')}</svg>`
  const leftPx = W - 330
  const planFile = parsePlan(readFileSync(join(import.meta.dir, 'sample', 'plan.json'), 'utf8'), T)!
  const view = derivePlan(planFile, { nowMs: T, members: [], claims: [], reports: [], blocked: [], landed: [], aliveNames: ['codex-1', 'reika', 'sonnet-2', 'codex-2', 'sonnet-1', 'haiku-1', 'haiku-2', 'helper'] })
  const total = view.doneN + view.running.length + view.you + view.todo.length
  const count = withToGo(view.doneN + '/' + total)
  const hc = headCells(leftPx - 40 - 120, 'Ship the plan tree', count)
  const green = dark ? '#3FB950' : '#1a7f37'
  const cardBg = dark ? '#222222' : '#f1f1ee'
  const pageBg = dark ? '#171717' : '#ffffff'
  const allPills = bandPills(view)
  const tries = [pillsSvg(allPills, limitsLine(9, 90), textWidth, FONT), pillsSvg(allPills, '', textWidth, FONT), pillsSvg(allPills.slice(0, 4), '', textWidth, FONT)]
  const pill = tries.find(t => W - 32 - (t.w + 8) >= 200) ?? tries[2]!
  const pillImg = img(svgDoc(pill.w, pill.h, pill.body, PILL_CSS), pill.w, pill.h)
  const dots = icons.map(ic => `<span style="display:inline-block;width:26px;text-align:center;color:${LEVEL_COLOR.green}">&#9679;</span>`).join('')
  const row1 = `<div style="display:flex;justify-content:space-between;align-items:center;white-space:pre"><div style="display:flex;align-items:center;gap:8px">${img(bandBarSvg(112, view.doneN, view.running.length, view.you, total), 112, 20)}<b>${hc.title}</b><b>${hc.count}</b></div><div style="display:flex;align-items:center;gap:8px">${dots}${img(presenceSvg(true), 64, 20)}<span style="color:${dim}">\u25a4</span></div></div>`
  const credW = Math.max(120, W - 56 - pill.w - 8)
  const row2 = `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">${pillImg}${img(creditsSvg(credW, rows, true), credW, 28)}</div>`
  const footer = footerLine(view, T, { commit: { subject: 'Write the manual', ms: T - 12 * 60000 }, sessions: '3 sessions' }, 70)
  const ic = (d: string): string => `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="${dim}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:${pageBg};color:${fg};font:13px/20px Menlo,Monaco,monospace"><div style="width:${W}px;padding:14px 12px 12px;box-sizing:border-box"><div style="background:${cardBg};border-radius:14px;padding:14px 16px 8px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:15px">${row1}${row2}</div>
<div style="margin:8px 0 0;background:${cardBg};border:1px solid ${dark ? '#3a3a3a' : '#cfcfca'};border-radius:14px;padding:14px 16px;display:flex;gap:10px;align-items:center;font:17px -apple-system,BlinkMacSystemFont,sans-serif"><span style="flex:1;color:${dim}">Type / for commands</span><svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="${dim}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3v5a2 2 0 0 1-2 2H3"/><path d="M6 7l-3 3 3 3"/></svg></div>
<div style="padding:10px 16px 0;color:${dim};display:flex;justify-content:space-between;align-items:center;font:15px -apple-system,BlinkMacSystemFont,sans-serif"><span style="display:flex;align-items:center;gap:12px">${ic('<path d="M8 3v10M3 8h10"/>')}${ic('<rect x="6" y="1.5" width="4" height="8" rx="2"/><path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5"/>')}${ic('<path d="M4 6l4 4 4-4"/>')}<span style="color:${fg}">Auto</span></span><span style="display:flex;align-items:center;gap:14px"><span style="color:${fg};white-space:nowrap">${footer}</span><span style="color:${fg};white-space:nowrap">Sonnet 5.5</span><span style="color:${fg}">Medium</span><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#3b82f6" stroke-width="1.8" stroke-linecap="round"><circle cx="8" cy="8" r="5.5" stroke="${dim}" opacity=".5"/><path d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5"/></svg></span></div></div>`
  const base = join(OUT, file)
  writeFileSync(join(PAGES, file + '.html'), html)
  const p = Bun.spawn([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', `--blink-settings=preferredColorScheme=${dark ? 0 : 1}`, '--force-device-scale-factor=2', `--screenshot=${base}.png`, `--window-size=${W},220`, 'file://' + join(PAGES, file + '.html')], { stdout: 'ignore', stderr: 'ignore' })
  await p.exited
  return base + '.png'
}

const out: string[] = []
out.push(await shootRow('dark', 'status-row-dark'))
out.push(await shootRow('light', 'status-row-light'))
out.push(await shootAll('dark', 'pane-all-dark'))
out.push(await shootAll('light', 'pane-all-light'))
out.push(await shoot({ theme: 'dark', file: 'pane-dark', statusOpen: false, openRows: [], systemOpen: false }))
out.push(await shoot({ theme: 'light', file: 'pane-light', statusOpen: false, openRows: [], systemOpen: false }))
out.push(await shoot({ theme: 'dark', file: 'pane-open', statusOpen: true, openRows: ['codex-a'], systemOpen: false }))
console.log(out.join('\n'))
