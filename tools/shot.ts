// Screenshots of the Cockpit pane from the synthetic demo project:   bun tools/shot.ts [project folder] [output folder]
//
// Defaults: examples/project (write it first with `bun tools/demo.ts`) and docs/img. It reads the demo's files and panes with the plugin's own
// readers and classifiers (config, claims, reports, deps, pane markers and activity words, the item a lane owns, the task line, the Flight log
// judge) and draws the cards with the plugin's own drawing functions (statusSvg, rowSvg, flightSvg, blackBoxSvg, wrapCardSvg). No tmux, no host.
// The native Button and Text parts are simulated in HTML (the host draws those), so a picture shows the order, the colours and the cards.
// Needs Chrome: set CHROME to its path when it is not the macOS default. Writes pane-dark.png, pane-light.png and pane-open.png.

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
  add(`<div style="display:flex;justify-content:space-between;align-items:center;padding:0 8px;height:36px"><div>${btn('Add Bug')}${btn('Add Idea')}</div><div><span style="background:#8B949E;color:#0d1117;font-weight:700;padding:0 4px">&nbsp;OFF&nbsp;</span> <span style="color:#8B949E;margin-left:6px">AUTOPILOT</span></div></div>`, 36)

  const rows: { row: LookRow; open: boolean }[] = [{ row: captainRow(o.openRows.includes('Captain')), open: o.openRows.includes('Captain') }, ...built.map(b => ({ row: crewRow(b, o.openRows.includes(b.m.name)), open: o.openRows.includes(b.m.name) }))]
  for (const { row, open } of rows) {
    const r = { ...row, border: borderFor(row.tone, true) }
    add(`<div style="display:flex;align-items:center">${img(rowSvg(RW, r), RW, rowHeight(r))}${chevron(open)}</div>`, rowHeight(r))
  }

  const sys = systemSummary({ ...emptyReading, memFree: 58, swapMB: 0, load1: 2.1, cores: 10, diskFree: 62 }, null, false)
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

const out: string[] = []
out.push(await shoot({ theme: 'dark', file: 'pane-dark', statusOpen: false, openRows: [], systemOpen: false }))
out.push(await shoot({ theme: 'light', file: 'pane-light', statusOpen: false, openRows: [], systemOpen: false }))
out.push(await shoot({ theme: 'dark', file: 'pane-open', statusOpen: true, openRows: ['codex-a'], systemOpen: false }))
console.log(out.join('\n'))
