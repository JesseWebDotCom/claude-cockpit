// The cards of the Crew pane, each one svg string in the look of the old header tiles: the Status card at
// the top, the usage bars, list cards (queue, backlog, landed, health), wrapped-text cards (inbox, the
// away log) and the "Blocked by" graph. Pure string builders; unit tested in tests/cards.test.ts.

import type { YouAsk } from './board.ts'
import { fin } from './core.ts'
import type { ItemStatus } from './core.ts'
import type { Graph } from './crew.ts'
import { LEVEL_COLOR } from './system.ts'
import { glyphFragment } from './glyphs.ts'
import type { Gauge } from './system.ts'
import { AMBER, GREEN, GREY, RED, FONT, doc, dotBar, fitText, n, pillSvg, spriteSvg, textWidth, titleSvg, wrapText, xml } from './draw.ts'
import type { DrawMode } from './draw.ts'
import type { Activity } from './sprites.ts'
import { backText, liveWin, poolState, poolSummary, usedColor } from './limits.ts'
import type { CreditView, Pool } from './limits.ts'

// When an exhausted pool is back ("back Thu 9:00"), from its own windows.
const poolBack = (p: Pool, nowMs: number): string => backText(poolState(p, nowMs).backAtMs)

const P = 10

const card = (W: number, H: number, inner: string): string => `<rect class="tile" x="0" y="0" width="${n(W)}" height="${n(H)}" rx="8"/>${inner}`

// ---------------------------------------------------------------------------
// The Status card: the milestone and its bar, Now, Next, You, how old it is, and the Active/Away pill.
// Exactly the shape of the old reply footer, nothing else above the crew.

export type StatusCardIn = {
  hasStatus: boolean
  milestone: string
  ratio: number | null
  count: string
  now: string[]
  next: string[]
  you: YouAsk[]
  age: string
  isOld: boolean
  presence: { text: string; isAway: boolean; label: string }
  phase?: number
}

const ASK_LINE = 15

type Built = { body: string; H: number; css: string }

// Compact (Addendum 8): line 1 is the milestone title, a solid 8 px bar, the count, an amber dot with the
// age when the status is older than 30 minutes, and the Active/Away pill; then Now, Next and You as three
// single lines, cut with an ellipsis (the full text is the hover tooltip). About 84 px.
const STATUS_LINE = 16

function buildStatus(W: number, s: StatusCardIn): Built {
  const inner = Math.max(60, W - P * 2)
  const out: string[] = []
  const presText = (s.presence.isAway ? '\u263e ' : '') + s.presence.text
  const presW = Math.round(textWidth(presText, 11) + 16)
  let right = W - P - presW
  out.push(`<g transform="translate(${n(right)},6)">${pillSvg(0, 16, presW, presText, s.presence.isAway ? AMBER : GREEN).replace('fill="#ffffff"', s.presence.isAway ? 'fill="#1f1f1f"' : 'fill="#ffffff"')}</g>`)

  // The tooltip: everything, in full.
  const tip: string[] = [s.hasStatus ? s.milestone || 'Status' : 'No status yet']
  if (s.hasStatus) {
    tip.push('Now: ' + (s.now.length > 0 ? s.now.join(' \u00b7 ') : 'nothing'))
    tip.push('Next: ' + (s.next.length > 0 ? s.next.join(', ') : 'nothing'))
    tip.push(s.you.length === 0 ? 'You: nothing' : 'You: ' + s.you.map(a => a.text + (a.blocking !== '' ? ' [blocking: ' + a.blocking + ']' : '')).join(' | '))
    tip.push(s.age + (s.isOld ? ' \u00b7 status may be old' : ''))
  }
  if (s.presence.isAway && s.presence.label !== '') tip.push(s.presence.label)

  const body: string[] = []
  let y = 28
  if (!s.hasStatus) {
    out.push(`<text class="t" x="${P}" y="18" font-family="${FONT}" font-size="13" font-weight="600">Status</text>`)
    body.push(`<text class="m" x="${P}" y="${y + 6}" font-family="${FONT}" font-size="11">${xml(fitText('No status yet: your agent writes status.json (see docs/PROTOCOL.md).', 11, inner))}</text>`)
    y += 16
  } else {
    // Old status: the age as a small amber dot with the time, left of the pill.
    if (s.isOld) {
      const age = s.age.replace(/^updated\s+/, '')
      const w = Math.round(textWidth(age, 10) + 14)
      right -= w + 6
      out.push(`<circle cx="${n(right + 4)}" cy="14" r="3" fill="${AMBER}"/><text x="${n(right + 11)}" y="17.5" font-family="${FONT}" font-size="10" fill="${AMBER}">${xml(age)}</text>`)
    }
    const countText = s.ratio === null ? '' : s.count
    const countW = countText === '' ? 0 : Math.round(textWidth(countText, 10) + 6)
    const barW = Math.max(40, Math.min(160, Math.round(inner * 0.28)))
    const barX = right - 10 - countW - barW
    const title = fitText(s.milestone !== '' ? s.milestone : 'Status', 13, Math.max(40, barX - P - 12))
    out.push(`<text class="t" x="${P}" y="18" font-family="${FONT}" font-size="13" font-weight="600">${xml(title)}</text>`)
    const ratio = s.ratio === null ? 0 : Math.max(0, Math.min(1, s.ratio))
    if (s.ratio !== null) {
      out.push(`<rect class="k" x="${n(barX)}" y="10" width="${barW}" height="8" rx="4"/><rect x="${n(barX)}" y="10" width="${n(Math.max(8, barW * ratio))}" height="8" rx="4" fill="${GREEN}"/>`)
      out.push(`<text class="s" x="${n(barX + barW + 6)}" y="17.5" font-family="${FONT}" font-size="10" font-variant-numeric="tabular-nums">${xml(countText)}</text>`)
    } else {
      out.push(`<text class="m" x="${n(barX)}" y="17.5" font-family="${FONT}" font-size="10">no count</text>`)
    }
    const line = (text: string, cls: string, color = ''): void => {
      body.push(`<text ${color !== '' ? `fill="${color}"` : `class="${cls}"`} x="${P}" y="${y + 6}" font-family="${FONT}" font-size="11">${xml(fitText(text, 11, inner))}</text>`)
      y += STATUS_LINE
    }
    line('Now: ' + (s.now.length > 0 ? s.now.join(' \u00b7 ') : 'nothing'), 't')
    line('Next: ' + (s.next.length > 0 ? s.next.join(', ') : 'nothing'), 'm')
    if (s.you.length === 0) line('You: nothing', 's')
    else line('You: ' + s.you.map(a => a.text + (a.blocking !== '' ? ' [blocking: ' + a.blocking + ']' : '')).join(' \u00b7 '), 't', s.you.some(a => a.blocking !== '') ? RED : AMBER)
  }
  const H = y + 8
  // An old status is dimmed: the numbers may no longer be true.
  const content = s.isOld && s.hasStatus ? `<g opacity="0.6">${body.join('')}</g>` : body.join('')
  return { body: titleSvg(tip) + out.join('') + content, H, css: '' }
}

export const statusHeight = (W: number, s: StatusCardIn): number => buildStatus(W, s).H

export function statusSvg(W: number, s: StatusCardIn): string {
  const b = buildStatus(W, s)
  return doc(W, b.H, card(W, b.H, b.body), b.css, s.phase ?? 0)
}

// ---------------------------------------------------------------------------
// The Limits area (Addenda 3, 6, 8): pinned at the bottom. One block per plan with TWO thin solid bars
// (5h on top, week below), the label at the left ("Max 5h / wk"), the percent inside the bar's right
// end ("not readable here" in amber when a window cannot be read), the reset time in the hover text;
// then one line per credit pool. A pool that is out is drawn at about 45% opacity. About 90 px for
// two plans and two credits.

const BAR_H = 11
const LABEL_W = 92
const POOL_SHORT: Record<string, string> = { claude: 'Max', codex: 'Codex' }

export type LimitsAreaIn = { pools: Pool[]; credits: CreditView[]; outPools: ReadonlySet<string>; nowMs: number }

export const limitsAreaHeight = (pools: number, credits: number): number => 4 + pools * (BAR_H * 2 + 4) + credits * 14 + 4

// The hover text: the same numbers and reset times the bars carry, in words, BOTH windows of every pool.
export function limitsAlt(i: LimitsAreaIn): string {
  return ['Limits', ...i.pools.map(p => poolSummary(liveSummaryPool(p, i.nowMs)).text + (i.outPools.has(p.id) ? ' (out' + (backTextOf(p, i.nowMs) !== '' ? ', ' + backTextOf(p, i.nowMs) : '') + ')' : '')), ...i.credits.map(c => c.name + ': ' + c.text)].join('; ')
}

const liveSummaryPool = (p: Pool, nowMs: number): Pool => ({ ...p, five: liveWin(p.five, nowMs), week: liveWin(p.week, nowMs) })
const backTextOf = (p: Pool, nowMs: number): string => poolBack(p, nowMs)

export function limitsAreaSvg(W: number, i: LimitsAreaIn): string {
  const H = limitsAreaHeight(i.pools.length, i.credits.length)
  const trackX = P + LABEL_W
  const trackW = Math.max(40, W - P - trackX)
  const parts: string[] = []
  let y = 4
  for (const raw of i.pools) {
    const p = liveSummaryPool(raw, i.nowMs)
    const out = i.outPools.has(p.id)
    const label = (POOL_SHORT[p.id] ?? p.name) + ' 5h / wk'
    const bars = [p.five, p.week].map((w, k) => {
      const by = y + k * (BAR_H + 2)
      const used = w.used
      const ratio = used === null ? 0 : Math.max(0, Math.min(1, used / 100))
      const color = usedColor(used)
      const text = used === null ? 'not readable here' : Math.round(used) + '%'
      const onFill = used !== null && ratio > 0.9
      return `<rect class="k" x="${n(trackX)}" y="${by}" width="${n(trackW)}" height="${BAR_H}" rx="${BAR_H / 2}"/>${used === null ? '' : `<rect x="${n(trackX)}" y="${by}" width="${n(Math.max(BAR_H, trackW * ratio))}" height="${BAR_H}" rx="${BAR_H / 2}" fill="${color}"/>`}<text ${onFill ? 'fill="#ffffff"' : used === null ? `fill="${AMBER}"` : 'class="s"'} x="${n(trackX + trackW - 6)}" y="${by + 8.6}" text-anchor="end" font-family="${FONT}" font-size="10" font-weight="600" font-variant-numeric="tabular-nums">${xml(text)}</text>`
    })
    parts.push(`<g${out ? ' opacity="0.45"' : ''}><text class="s" x="${P}" y="${y + 17}" font-family="${FONT}" font-size="10" font-weight="600">${xml(label)}</text>${bars.join('')}</g>`)
    y += BAR_H * 2 + 4
  }
  for (const c of i.credits) {
    const text = fitText(c.name + ': ' + c.text, 10, W - P * 2)
    parts.push(`<text class="${c.exhausted ? 'm' : 's'}" x="${P}" y="${y + 10}" font-family="${FONT}" font-size="10">${xml(text)}</text>`)
    y += 14
  }
  return doc(W, H, card(W, H, parts.join('')), '')
}

// ---------------------------------------------------------------------------
// A list card: a title and rows of one line each (queue, backlog, landed, health)

export type ListRow = { dot?: string; text: string; right?: string; rightColor?: string }

const ROW_PITCH = 18

export const listHeight = (count: number): number => 28 + Math.max(1, count) * ROW_PITCH + 4

export function listCardSvg(W: number, title: string, rows: ListRow[], empty = 'nothing'): string {
  const H = listHeight(rows.length)
  const list = rows.length > 0 ? rows : [{ text: empty }]
  const body = list
    .map((r, i) => {
      const y = 30 + i * ROW_PITCH
      const rightW = r.right ? Math.round(textWidth(r.right, 11.5) + 8) : 0
      const x = P + (r.dot ? 14 : 0)
      return `${r.dot ? `<circle cx="${P + 4}" cy="${y - 4}" r="4" fill="${r.dot}"/>` : ''}<text class="${rows.length === 0 ? 'm' : 't'}" x="${x}" y="${y}" font-family="${FONT}" font-size="12">${xml(fitText(r.text, 12, W - x - P - rightW))}</text>${r.right ? `<text x="${n(W - P)}" y="${y}" text-anchor="end" font-family="${FONT}" font-size="11.5" font-weight="600" fill="${r.rightColor ?? GREY}">${xml(r.right)}</text>` : ''}`
    })
    .join('')
  return doc(W, H, card(W, H, `<text class="s" x="${P}" y="17" font-family="${FONT}" font-size="11" font-weight="600">${xml(title)}</text>${body}`))
}

// ---------------------------------------------------------------------------
// A wrapped-text card: entries with an optional pill, the text wrapped to the width (never cut off past
// `maxLines`) and a small note at the right (an age). Used for the inbox and the away log.

export type WrapEntry = { pill?: { text: string; color: string }; text: string; note?: string; textColor?: string }

const WRAP_MAX = 4

function buildWrap(W: number, entries: readonly WrapEntry[], empty: string): { rows: string; H: number } {
  const out: string[] = []
  // 36: a pill is drawn from y - 12, so it clears the title line above it
  let y = 36
  if (entries.length === 0) {
    out.push(`<text class="m" x="${P}" y="${y}" font-family="${FONT}" font-size="12">${xml(empty)}</text>`)
    return { rows: out.join(''), H: y + 14 }
  }
  for (const e of entries) {
    const pillW = e.pill ? Math.round(textWidth(e.pill.text, 10.5) + 14) : 0
    const noteW = e.note ? Math.round(textWidth(e.note, 10.5) + 6) : 0
    const x = P + (pillW > 0 ? pillW + 8 : 0)
    const lines = wrapText(e.text, 12, Math.max(40, W - x - P - noteW), WRAP_MAX)
    if (e.pill) out.push(`<g transform="translate(${P},${y - 12})">${pillSvg(0, 16, pillW, e.pill.text, e.pill.color)}</g>`)
    lines.forEach((l, i) => out.push(`<text ${e.textColor ? `fill="${e.textColor}"` : 'class="t"'} x="${x}" y="${y + i * ASK_LINE}" font-family="${FONT}" font-size="12">${xml(l)}</text>`))
    if (e.note) out.push(`<text class="m" x="${n(W - P)}" y="${y}" text-anchor="end" font-family="${FONT}" font-size="10.5">${xml(e.note)}</text>`)
    y += Math.max(1, lines.length) * ASK_LINE + 8
  }
  return { rows: out.join(''), H: y + 2 }
}

export const wrapHeight = (W: number, entries: readonly WrapEntry[]): number => buildWrap(W, entries, '').H

export function wrapCardSvg(W: number, title: string, entries: WrapEntry[], empty = 'nothing'): string {
  const b = buildWrap(W, entries, empty)
  return doc(W, b.H, card(W, b.H, `<text class="s" x="${P}" y="17" font-family="${FONT}" font-size="11" font-weight="600">${xml(title)}</text>${b.rows}`))
}

// ---------------------------------------------------------------------------
// "Blocked by": the members as small round characters in a row, a curved arrow with moving dashes from
// each blocked member to its blocker, a chain drawn thicker, red when the blocker is stuck or red, faded
// when the blocker's report appeared or its lock cleared, "deadlock?" in red on a cycle.

export type GraphSprite = { kind: string; variant: number; mode: DrawMode; activity: Activity }

const NODE_Y = 56
const MAX_EDGES = 8

const GRAPH_CSS = `<style>.ed{stroke-dasharray:5 3;animation:dsh 1s linear infinite}@keyframes dsh{to{stroke-dashoffset:-16}}@media (prefers-reduced-motion: reduce){.ed{animation:none}}</style>`

export function graphHeight(g: Graph): number {
  const lines = Math.min(MAX_EDGES, g.edges.filter(e => !e.faded).length)
  // The nodes and their labels take 100 px; each "waits on" line 15 px below that, with room for descenders.
  return g.nodes.length === 0 ? 46 : 112 + lines * 15
}

export function graphSvg(W: number, g: Graph, sprites: ReadonlyMap<string, GraphSprite>): string {
  const H = graphHeight(g)
  const title = `<text class="s" x="${P}" y="17" font-family="${FONT}" font-size="11" font-weight="600">Blocked by</text>${g.hasCycle ? `<text x="${n(W - P)}" y="17" text-anchor="end" font-family="${FONT}" font-size="11" font-weight="700" fill="${RED}">deadlock?</text>` : ''}`
  if (g.nodes.length === 0) {
    return doc(W, H, card(W, H, `${title}<text class="m" x="${P}" y="36" font-family="${FONT}" font-size="12">nothing is blocked</text>`))
  }
  const step = Math.min(120, (W - 24) / g.nodes.length)
  const cx = new Map<string, number>()
  g.nodes.forEach((nd, i) => cx.set(nd.id, 12 + step * (i + 0.5)))
  const defs = ['grey', 'amber', 'red']
    .map((c) => `<marker id="ah-${c}" viewBox="0 0 6 6" refX="5" refY="3" markerUnits="userSpaceOnUse" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L6 3L0 6z" fill="${c === 'red' ? RED : c === 'amber' ? AMBER : GREY}"/></marker>`)
    .join('')
  const nodes = g.nodes
    .map(nd => {
      const x = cx.get(nd.id) ?? 0
      const label = `<text class="s" x="${n(x)}" y="${NODE_Y + 40}" text-anchor="middle" font-family="${FONT}" font-size="10.5">${xml(fitText(nd.label, 10.5, step - 6))}</text>`
      const ring = nd.bad ? `<circle cx="${n(x)}" cy="${NODE_Y + 12}" r="17" fill="none" stroke="${RED}" stroke-width="1.5"/>` : ''
      if (nd.kind === 'member') {
        const sp = sprites.get(nd.id) ?? { kind: 'max', variant: 0, mode: 'idle' as DrawMode, activity: 'working' as Activity }
        return `${ring}${spriteSvg(x - 13, NODE_Y, sp.kind, sp.variant, sp.mode, 1, sp.activity)}${label}`
      }
      if (nd.kind === 'person') {
        return `<g fill="${GREY}"><circle cx="${n(x)}" cy="${NODE_Y + 7}" r="5"/><path d="M${n(x - 9)} ${NODE_Y + 24}a9 9 0 0 1 18 0z"/></g>${label}`
      }
      if (nd.kind === 'gate') {
        return `<g fill="none" stroke="${GREY}" stroke-width="2"><path d="M${n(x - 5)} ${NODE_Y + 9}v-4a5 5 0 0 1 10 0v4"/></g><rect x="${n(x - 8)}" y="${NODE_Y + 9}" width="16" height="12" rx="2" fill="${GREY}"/>${label}`
      }
      const w = Math.min(step - 6, Math.round(textWidth(nd.label, 10.5) + 12))
      return `<rect x="${n(x - w / 2)}" y="${NODE_Y + 4}" width="${w}" height="16" rx="8" fill="${GREY}" fill-opacity="0.25"/>${label}`
    })
    .join('')
  const edges = g.edges
    .map(e => {
      const x1 = cx.get(e.from) ?? 0
      const x2 = cx.get(e.to) ?? 0
      const dx = x2 - x1
      const lift = Math.min(40, 14 + Math.abs(dx) * 0.22)
      const y0 = NODE_Y - 2
      const color = e.inCycle || e.red ? 'red' : 'amber'
      const stroke = color === 'red' ? RED : AMBER
      const d = `M${n(x1)} ${y0} Q${n((x1 + x2) / 2)} ${n(y0 - lift * 2)} ${n(x2 - Math.sign(dx) * 3)} ${y0}`
      return `<path ${e.faded ? '' : 'class="ed" '}d="${d}" fill="none" stroke="${stroke}" stroke-width="${e.hot ? 2.4 : 1.5}" opacity="${e.faded ? 0.22 : 1}" marker-end="url(#ah-${color})"/>`
    })
    .join('')
  const live = g.edges.filter(e => !e.faded).slice(0, MAX_EDGES)
  const why = live
    .map((e, i) => `<text class="${e.hot ? 't' : 's'}" x="${P}" y="${NODE_Y + 60 + i * 15}" font-family="${FONT}" font-size="11">${xml(fitText(e.from + ' waits on ' + e.to + (e.why !== '' ? ': ' + e.why : ''), 11, W - P * 2))}</text>`)
    .join('')
  return doc(W, H, card(W, H, `<defs>${defs}</defs>${title}${edges}${nodes}${why}`), GRAPH_CSS)
}

// ---------------------------------------------------------------------------
// "By item": one row per work item, in the look of the crew rows. The status pill at the right, the members
// that hold it (mini sprite, name and what each is doing), a "blocked by" chip, how long it has been in this
// status and its gate result, and a thin progress bar.

export const ITEM_STATUS_COLOR: Record<ItemStatus, string> = {
  queued: '#8B949E',
  working: '#22C55E',
  testing: '#14B8A6',
  reviewing: '#6366F1',
  blocked: '#F59E0B',
  // Red means failed (a member in the red state, or the newest gate failed): never merely "queued".
  red: '#EF4444',
  'stale-lock': '#F59E0B',
  landed: '#3FB950',
  'done-not-landed': '#0EA5E9',
}

export const ITEM_STATUS_LABEL: Record<ItemStatus, string> = {
  queued: 'queued',
  working: 'working',
  testing: 'testing',
  reviewing: 'reviewing',
  blocked: 'blocked',
  red: 'gate failed',
  'stale-lock': 'stale lock',
  landed: 'landed',
  'done-not-landed': 'done, not landed',
}

export type ItemRowIn = {
  // The number key that selects it (1 to 9), or 0 for none.
  index: number
  title: string
  id: string
  status: ItemStatus
  assignees: { name: string; kind: string; variant: number; mode: DrawMode; activity: Activity; pill: string }[]
  blockedBy: { on: string; why: string } | null
  // "12m", or '' when unknown.
  since: string
  // "gate exit 1 (full)", or ''.
  gate: string
  ratio: number
  phase?: number
}

const ITEM_MAX_ASSIGNEES = 3

export function itemRowHeight(r: ItemRowIn): number {
  return r.blockedBy !== null || r.since !== '' || r.gate !== '' ? 92 : 72
}

export function itemRowSvg(W: number, r: ItemRowIn): string {
  const H = itemRowHeight(r)
  const color = ITEM_STATUS_COLOR[r.status]
  const label = ITEM_STATUS_LABEL[r.status]
  const pillW = Math.round(textWidth(label, 10.5) + 18)
  const idText = r.id !== '' ? r.id : ''
  const numW = r.index > 0 ? 16 : 0
  const room = Math.max(40, W - P - numW - pillW - 24)
  const idW = idText === '' ? 0 : Math.round(textWidth(idText, 11) + 8)
  const title = fitText(r.title, 13, Math.max(30, room - idW))
  const titleW = textWidth(title, 13)

  const head =
    `${r.index > 0 ? `<text class="m" x="${P}" y="18" font-family="${FONT}" font-size="11" font-weight="600">${r.index}</text>` : ''}` +
    `<text class="t" x="${P + numW}" y="18" font-family="${FONT}" font-size="13" font-weight="600">${xml(title)}</text>` +
    (idText !== '' ? `<text class="m" x="${n(P + numW + titleW + 8)}" y="18" font-family="${FONT}" font-size="11">${xml(fitText(idText, 11, Math.max(20, room - titleW - 8)))}</text>` : '') +
    `<g transform="translate(${n(W - P - pillW)},5)">${pillSvg(0, 16, pillW, label, color)}</g>`

  // The members that hold it, side by side; "unassigned" when none.
  let who = ''
  if (r.assignees.length === 0) {
    who = `<text class="m" x="${P}" y="43" font-family="${FONT}" font-size="12">unassigned</text>`
  } else {
    const shown = r.assignees.slice(0, ITEM_MAX_ASSIGNEES)
    const slot = (W - P * 2) / shown.length
    who = shown
      .map((a, i) => {
        const x = P + i * slot
        const text = fitText(a.name + ' \u00b7 ' + a.pill, 11, slot - 30)
        return `${spriteSvg(x, 27, a.kind, a.variant, a.mode, 0.75, a.activity)}<text class="s" x="${n(x + 24)}" y="43" font-family="${FONT}" font-size="11">${xml(text)}</text>`
      })
      .join('')
    if (r.assignees.length > ITEM_MAX_ASSIGNEES) who += `<text class="m" x="${n(W - P)}" y="43" text-anchor="end" font-family="${FONT}" font-size="11">+${r.assignees.length - ITEM_MAX_ASSIGNEES}</text>`
  }

  // Details: the chip, then how long and the gate.
  let details = ''
  if (r.blockedBy !== null || r.since !== '' || r.gate !== '') {
    let x = P
    if (r.blockedBy !== null) {
      const chip = fitText('blocked by ' + r.blockedBy.on, 10.5, W - P * 2 - 20)
      const cw = Math.round(textWidth(chip, 10.5) + 16)
      details += `<g transform="translate(${x},56)"><rect width="${cw}" height="16" rx="8" fill="${AMBER}"/><text x="${n(cw / 2)}" y="11.8" text-anchor="middle" font-family="${FONT}" font-size="10.5" font-weight="600" fill="#1f1f1f">${xml(chip)}</text></g>`
      x += cw + 8
    }
    const rest = [r.blockedBy !== null && r.blockedBy.why !== '' ? r.blockedBy.why : '', r.since !== '' ? 'for ' + r.since : '', r.gate].filter(Boolean).join(' \u00b7 ')
    if (rest !== '') details += `<text class="s" x="${n(x)}" y="68" font-family="${FONT}" font-size="11">${xml(fitText(rest, 11, W - x - P))}</text>`
  }

  const ratio = fin(r.ratio) ? Math.max(0, Math.min(1, r.ratio)) : 0
  const barY = H - 12
  const bar = `<rect class="k" x="${P}" y="${barY}" width="${n(W - P * 2)}" height="4" rx="2"/><rect x="${P}" y="${barY}" width="${n((W - P * 2) * ratio)}" height="4" rx="2" fill="${color}"/>`
  return doc(W, H, `${head}${who}${details}${bar}<line class="ln" x1="0" y1="${H - 0.5}" x2="${n(W)}" y2="${H - 0.5}"/>`, '', r.phase ?? 0)
}

// ---------------------------------------------------------------------------
// System resources: small disk-style gauges, the top three memory processes by name, and a hint.

export type SystemCardIn = {
  gauges: Gauge[]
  top: string
  // "gate blocked by memory?" or ''.
  hint: string
}

// The gauges: a label, a thin SOLID bar (the dotted texture is noise at this size), the note at the right.
// The section header above the card carries the title.
const GAUGE_PITCH = 28
export const GAUGE_ICON = 16
export const systemHeight = (c: SystemCardIn): number => 8 + c.gauges.length * GAUGE_PITCH + 24 + (c.hint !== '' ? 22 : 0) + 4

export function systemCardSvg(W: number, c: SystemCardIn): string {
  const H = systemHeight(c)
  const inner = Math.max(80, W - P * 2)
  // A gauge with a glyph kind shows that glyph (the same fragment the status bar draws, in the gauge's health colour) and its short figure ("62% used")
  // in place of the text label; the full label is the glyph's tooltip. One without (a host that did not answer) keeps its plain label.
  const leftOf = (g: Gauge): string => (g.kind !== undefined ? g.figure ?? '' : g.label)
  const roomOf = (g: Gauge): number => (g.kind !== undefined ? GAUGE_ICON + 6 : 0)
  // The label column is 150 px (or 38% of a narrow card), wider when a listed host's name needs it ("host-a 63% used"), never past 54% of the width.
  const widest = Math.max(0, ...c.gauges.map(g => Math.ceil(textWidth(leftOf(g), 13)) + 4 + roomOf(g)))
  const labelW = Math.min(Math.max(Math.min(150, inner * 0.38), widest), inner * 0.54)
  const noteW = Math.min(150, inner * 0.3)
  const barX = P + labelW + 8
  const barW = Math.max(30, W - P - noteW - 8 - barX)
  const rows = c.gauges.map((g, i) => {
    const y = 8 + i * GAUGE_PITCH
    const r = g.ratio === null ? 0 : Math.max(0, Math.min(1, g.ratio))
    const left =
      g.kind !== undefined
        ? `<g><title>${xml(g.label)}</title>${glyphFragment(g.kind, LEVEL_COLOR[g.level], P, y + 14 - GAUGE_ICON / 2, GAUGE_ICON)}</g><text class="t" x="${P + roomOf(g)}" y="${y + 18}" font-family="${FONT}" font-size="13">${xml(fitText(leftOf(g), 13, labelW - roomOf(g)))}</text>`
        : `<text class="t" x="${P}" y="${y + 18}" font-family="${FONT}" font-size="13">${xml(fitText(g.label, 13, labelW))}</text>`
    return `${left}<rect class="k" x="${barX}" y="${y + 11}" width="${n(barW)}" height="6" rx="3"/>${g.ratio === null ? '' : `<rect x="${barX}" y="${y + 11}" width="${n(Math.max(6, barW * r))}" height="6" rx="3" fill="${LEVEL_COLOR[g.level]}"/>`}${g.note !== '' ? `<text class="s" x="${n(W - P)}" y="${y + 18}" text-anchor="end" font-family="${FONT}" font-size="11">${xml(fitText(g.note, 11, noteW))}</text>` : ''}`
  })
  const topY = 8 + c.gauges.length * GAUGE_PITCH + 14
  const top = `<text class="m" x="${P}" y="${topY}" font-family="${FONT}" font-size="11">${xml(fitText(c.top, 11, inner))}</text>`
  const hint = c.hint !== '' ? `<text class="errc" x="${P}" y="${topY + 22}" font-family="${FONT}" font-size="11" font-weight="700">${xml(c.hint)}</text>` : ''
  return doc(W, H, card(W, H, `${rows.join('')}${top}${hint}`))
}
