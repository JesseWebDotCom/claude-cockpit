// The v6 drawings: every pixel of the pane that is an svg. Colours, sizes and spacing come from tokens.ts only.
// Pure string builders; unit tested in tests/look.test.ts and looked at through tools/render.ts.
//
// Rules: 13 px body text, 11 px captions, 15 px titles; 36 px member rows with 8 px gaps; a 12 px gutter in
// cards; state and item are two separate elements; every chip text reads at 4.5:1 or better.

import { doc, fitText, FONT, n, spriteSvg, textWidth, wrapText, xml } from './draw.ts'
import type { Activity } from './sprites.ts'
import type { DrawMode } from './draw.ts'
import { CHAR_PX, GAP, GUTTER, RADIUS, ROW_HEIGHT, pillTone } from './tokens.ts'
import { summaryFit } from './summary.ts'
import { GROUP_PAD, METER_W, meterShowsPct } from './pools.ts'
import type { PoolRow, StripGroup } from './pools.ts'
import { markerOf } from './services.ts'
import { SERVICE_GLYPH, glyphFragment } from './glyphs.ts'
import type { ServiceRow } from './services.ts'
import { CREDIT_STEPS, creditSegments } from './services.ts'
import type { CreditSeg, CreditStep } from './services.ts'

const BODY = 13
// COCKPIT-48: the milestone title and the done count on the status row, about 1.4x the service row text.
const HEAD_FS = 18
const CAP = 11
const TITLE = 15
// A trouble line (the reason under a row), and a line of expanded detail.
export const TROUBLE_H = 22
export const DETAIL_H = 22
const CHAR_SCALE = CHAR_PX / 26

// A coloured chip with the state word only: dark or white ink, whichever reads at 4.5:1 or better.
export function chip(x: number, y: number, text: string, color: string): { svg: string; w: number } {
  const tone = pillTone(color)
  const w = Math.round(textWidth(text, CAP) + 16)
  return {
    w,
    svg: `<rect x="${n(x)}" y="${n(y)}" width="${w}" height="20" rx="10" fill="${tone.fill}"/><text x="${n(x + w / 2)}" y="${n(y + 14.2)}" text-anchor="middle" font-family="${FONT}" font-size="${CAP}" font-weight="600" fill="${tone.ink}">${xml(text)}</text>`,
  }
}

// The class of a state colour: the token class that follows the theme (never a fixed hex on a surface).
const toneClass = (hex: string): string => {
  const h = hex.toLowerCase()
  if (h === '#3fb950' || h === '#22c55e' || h === '#1a7f37') return 'okc'
  if (h === '#f0a500' || h === '#f59e0b' || h === '#9a6700') return 'warnc'
  if (h === '#f85149' || h === '#b91c1c' || h === '#ef4444' || h === '#cf222e') return 'errc'
  return 'm'
}

const text = (x: number, y: number, s: string, cls: string, size = BODY, extra = ''): string =>
  `<text class="${cls}" x="${n(x)}" y="${n(y)}" font-family="${FONT}" font-size="${size}"${extra}>${xml(s)}</text>`

const bar = (x: number, y: number, w: number, ratio: number | null, cls: string, h = 6): string => {
  const r = ratio === null ? 0 : Math.max(0, Math.min(1, ratio))
  return `<rect class="k" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${h}" rx="${h / 2}"/>${ratio === null ? '' : `<rect class="${cls}" x="${n(x)}" y="${n(y)}" width="${n(Math.max(h, w * r))}" height="${h}" rx="${h / 2}"/>`}`
}

// ---------------------------------------------------------------------------
// A member row

export type DetailLine = { label: string; text: string; cls?: string }
export type DetailBar = { label: string; ratio: number | null; text: string; hex: string }

export type LookRow = {
  kind: string
  variant: number
  mode: DrawMode
  activity: Activity
  title: string
  // The state word, in its own chip ("coding", "sleeping", "errored").
  state: { text: string; color: string }
  // The item, in muted text after the chip (a target, truncated).
  item: string
  // Right-aligned: the short model tag and the time in state.
  tag: string
  since: string
  // COCKPIT-33: when either is set (even to ''), the upper right is the one summary line "provider model time" (summary.ts) in place of tag and since.
  provider?: string
  model?: string
  // The captain's shape: "Claude: Sonnet 5.5 4m".
  colon?: boolean
  // The reason a row with trouble shows after the item on line 2, with its colour hex.
  trouble: { text: string; hex: string } | null
  isOut: boolean
  indent: number
  // COCKPIT-40: a subagent's tree connector ('\u251c ' or '\u2514 '), drawn dim in the text column before the title; the character does not move.
  branch?: string
  // Open (accordion): the row sits on a card with its detail lines and bars below it.
  isOpen: boolean
  detail: DetailLine[]
  bars: DetailBar[]
  // A confetti seed, '' for none; a landed chip text, '' for none.
  burst: string
  landed: string
  phase: number
  // v11: a row that is not asleep sits on a faint tint of its tone with a bar at its left edge (green: active, amber:
  // blocked or waiting, red: failed); '' or absent: a plain row (sleeping, out of credits).
  tone?: '' | 'green' | 'amber' | 'red'
  // v17: an ACTIVE row (tone green) has a border in its green: 'pulse' travels and pulses (CSS, motion on), 'still' is a plain coloured
  // border (motion off, or reduced motion on the surface); '' or absent: no border.
  border?: '' | 'pulse' | 'still'
  // COCKPIT-30: the row sits inside the Crew card: it is drawn on the card's own straight-sided tile with a hairline at its top, never as a tile of its own.
  inCard?: boolean
}

// The tint's strength and the accent bar's width (the colour is a theme class, so light and dark each get their own).
export const TONE_OPACITY = 0.1
export const TONE_BAR_W = 3
export const toneClassOf = (t: LookRow['tone']): string => (t === 'green' ? 'okc' : t === 'amber' ? 'warnc' : t === 'red' ? 'errc' : '')

// A crew row is TWO lines (v8): line 1 the character, the name, the state pill and, right-aligned, the model tag and
// the time in state; line 2 the item it works on, then the reason when something is wrong (errored, blocked, out of
// credits, stuck). Never one cramped line. 52 px.
export const MEMBER_ROW = 52

// The open card's limit bars (COCKPIT-25): the label column, the least width a bar keeps, the gap between the bar and its figure.
export const BAR_LABEL_W = 84
export const BAR_MIN_W = 40
export const BAR_FIG_GAP = 10

export function rowHeight(r: Pick<LookRow, 'isOpen' | 'detail' | 'bars'>): number {
  return MEMBER_ROW + (r.isOpen ? 8 + (r.detail.length + r.bars.length) * DETAIL_H + 4 : 0)
}

// A sleeping crew row (COCKPIT-18) is dimmed: its title and item use the dim text classes and its icon is drawn black and white (draw.ts
// spriteSvg draws every asleep character in grey). Working, errored and blocked rows keep their colour. The Session is never a sleeping row.
export type RowStyle = { title: string; item: string; avatar: 'color' | 'grayscale'; isDim: boolean }
export const isSleepingRow = (r: Pick<LookRow, 'kind' | 'activity'>): boolean => r.kind !== 'captain' && r.activity === 'sleeping'
export const rowStyleOf = (r: Pick<LookRow, 'kind' | 'activity'>): RowStyle => (isSleepingRow(r) ? { title: 'm', item: 'm', avatar: 'grayscale', isDim: true } : { title: 't', item: 's', avatar: 'color', isDim: false })

// Which border a row gets: an ACTIVE row (tone green) has one, animated while motion is on, still when it is off; any other row has none.
export const borderFor = (tone: LookRow['tone'], motionOn: boolean): NonNullable<LookRow['border']> => (tone === 'green' ? (motionOn ? 'pulse' : 'still') : '')

// The active row's border (v17). `still`: one ring in the theme's green. `pulse`: a dim ring and, over it, a bright stretch that travels once
// round the row every 5 s (pathLength 100, a dash of 14 that the keyframes move). The drawing is replaced every second while anything works,
// so draw.ts phaseCss gives `.bt` a negative delay from the wall clock (COCKPIT-20): the lap carries on across redraws instead of restarting.
// Reduced motion shows the still ring (draw.ts hides the travelling part).
export function borderSvg(W: number, H: number, mode: '' | 'pulse' | 'still'): string {
  if (mode === '') return ''
  const rect = (cls: string, extra: string): string => `<rect class="${cls}" x="1" y="1" width="${n(W - 2)}" height="${n(H - 2)}" rx="${RADIUS}" fill="none" stroke-width="1.5"${extra}/>`
  if (mode === 'still') return rect('okcs', ' stroke-opacity="0.85"')
  return rect('okcs bring', '') + rect('okcs bt', ' pathLength="100" stroke-dasharray="14 86" stroke-linecap="round"')
}

// COCKPIT-30: a row of the Crew card: the card's tile continued (straight sides, no corners) with the hairline that divides it from the row above.
const cardTile = (W: number, H: number): string => `<rect class="tile" x="0" y="0" width="${n(W)}" height="${H}"/><line class="ln" x1="${GUTTER}" y1="0.5" x2="${n(W - GUTTER)}" y2="0.5"/>`

export function rowSvg(W: number, r: LookRow): string {
  const H = rowHeight(r)
  const x0 = GAP + r.indent
  const parts: string[] = []
  // The open row's card goes UNDER the character, so it is drawn first.
  const tile = r.inCard === true ? cardTile(W, H) : r.isOpen ? `<rect class="tile" x="0" y="0" width="${n(W)}" height="${H}" rx="${RADIUS}"/>` : ''
  const toneCls = toneClassOf(r.tone)
  const tint =
    toneCls === ''
      ? ''
      : `<rect class="${toneCls}" x="0" y="0" width="${n(W)}" height="${n(r.isOpen ? H : MEMBER_ROW)}" rx="${RADIUS}" opacity="${TONE_OPACITY}"/><rect class="${toneCls}" x="0" y="6" width="${TONE_BAR_W}" height="${MEMBER_ROW - 12}" rx="${TONE_BAR_W / 2}"/>`
  const y1 = 17
  const y2 = 40
  const out = r.isOut
  // The character spans both lines, centered on the row.
  const sprite = spriteSvg(x0, (MEMBER_ROW - 21) / 2, r.kind, r.variant, r.mode, CHAR_SCALE, r.activity)
  const tx = x0 + CHAR_PX + GAP
  // Line 1, right end first: the time, then the tag.
  let right = W - GAP
  const summarised = r.provider !== undefined || r.model !== undefined
  if (summarised) {
    const sIn = { provider: r.provider ?? '', model: r.model ?? '', time: r.since, colon: r.colon }
    // Leave the name (at least 70 px) and the state chip their room; the line takes the rest, never over half the row.
    const chipW = chip(0, 0, r.state.text, r.state.color).w
    const budget = Math.min(W * 0.5, W - GAP - tx - 70 - chipW - 2 * GAP)
    const line = summaryFit(sIn, Math.max(textWidth(r.since === '' ? 'Claude' : r.since, CAP) + 4, budget), CAP)
    if (line !== '') {
      parts.push(text(right, y1 + 4, line, 'm', CAP, ' text-anchor="end" font-variant-numeric="tabular-nums"'))
      right -= Math.ceil(textWidth(line, CAP)) + GAP
    }
  } else {
    const since = r.since === '' ? '' : fitText(r.since, CAP, 48)
    if (since !== '') {
      parts.push(text(right, y1 + 4, since, 's', CAP, ' text-anchor="end" font-variant-numeric="tabular-nums"'))
      right -= Math.ceil(textWidth(since, CAP)) + GAP
    }
    const tag = r.tag === '' || W < 360 ? '' : fitText(r.tag, CAP, 84)
    if (tag !== '') {
      parts.push(text(right, y1 + 4, tag, 'm', CAP, ' text-anchor="end"'))
      right -= Math.ceil(textWidth(tag, CAP)) + GAP
    }
  }
  let x = tx
  const style = rowStyleOf(r)
  const branch = r.branch ?? ''
  if (branch !== '') {
    parts.push(text(x, y1 + 4.5, branch, 'm', BODY))
    x += Math.ceil(textWidth(branch.trimEnd(), BODY)) + 5
  }
  const name = fitText(r.title, BODY, Math.max(56, (right - x) * 0.5))
  parts.push(text(x, y1 + 4.5, name, style.title, BODY, ' font-weight="600"'))
  x += Math.ceil(textWidth(name, BODY)) + GAP
  const c = chip(x, y1 - 10, r.state.text, r.state.color)
  parts.push(c.svg)
  x += c.w + GAP
  if (r.landed !== '') {
    const l = chip(x, y1 - 10, r.landed, '#FBBF24')
    if (x + l.w < right) parts.push(l.svg)
  }
  // Line 2: the item (muted), then the reason in its colour; together they are cut to the row.
  const room = W - GAP - tx
  const item = r.item === '' ? '' : fitText(r.item, BODY, room)
  let lx = tx
  if (item !== '') {
    parts.push(text(lx, y2, item, style.item, BODY))
    lx += Math.ceil(textWidth(item, BODY)) + 6
  }
  if (r.trouble !== null) {
    const sep = item !== '' ? '\u00b7 ' : ''
    const left = W - GAP - lx
    if (left > 24) parts.push(text(lx, y2, fitText(sep + r.trouble.text, BODY, left), toneClass(r.trouble.hex), BODY))
  }
  let y = MEMBER_ROW
  if (r.isOpen) {
    y += 8
    for (const d of r.detail) {
      parts.push(text(GUTTER, y + 14, d.label, 'm', CAP))
      parts.push(text(GUTTER + 84, y + 15, fitText(d.text, BODY, W - GUTTER * 2 - 84), d.cls ?? 't', BODY))
      y += DETAIL_H
    }
    // COCKPIT-25: the figure's room is measured (the widest one of the card, kept to what leaves the bar BAR_MIN_W), the bar takes what is left,
    // so the label, the bar and the figure never overlap at any width. Bars of one card end at the same x.
    const barsW = W - GUTTER * 2 - BAR_LABEL_W
    const figW = Math.min(Math.max(0, ...r.bars.map(b => Math.ceil(textWidth(b.text, CAP)))), Math.max(0, barsW - BAR_MIN_W - BAR_FIG_GAP))
    for (const b of r.bars) {
      parts.push(text(GUTTER, y + 14, fitText(b.label, CAP, BAR_LABEL_W - 4), 'm', CAP))
      parts.push(bar(GUTTER + BAR_LABEL_W, y + 8, Math.max(BAR_MIN_W, barsW - figW - BAR_FIG_GAP), b.ratio, toneClass(b.hex), 6))
      parts.push(text(W - GUTTER, y + 15, fitText(b.text, CAP, figW), 's', CAP, ' text-anchor="end"'))
      y += DETAIL_H
    }
  } else {
    parts.push(`<line class="ln" x1="${x0}" y1="${H - 0.5}" x2="${n(W - GAP)}" y2="${H - 0.5}"/>`)
  }
  const burst = r.burst === '' ? '' : confetti(r.burst, x0 + CHAR_PX / 2, MEMBER_ROW / 2, 60, 22)
  return doc(W, H, `${tile}${tint}<g${out ? ' opacity="0.45"' : ''}>${sprite}${parts.join('')}</g>${borderSvg(W, r.isOpen ? H : MEMBER_ROW, r.border ?? '')}${burst}`, '', r.phase)
}

// ---------------------------------------------------------------------------
// Confetti: a 2 s burst of 24 small pieces, CSS only, once; reduced motion hides it.

const CONFETTI = ['#F5C518', '#EF4444', '#3B82F6', '#22C55E', '#A855F7', '#F472B6', '#06B6D4', '#F97316']

function rng(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return () => {
    h ^= h << 13
    h >>>= 0
    h ^= h >>> 17
    h ^= h << 5
    h >>>= 0
    return h / 4294967296
  }
}

export function confetti(seed: string, cx: number, cy: number, spread: number, rise: number, count = 24): string {
  const rand = rng(seed || 'burst')
  const pieces: string[] = []
  const css: string[] = []
  for (let i = 0; i < count; i++) {
    const dx = (rand() - 0.5) * 2 * spread
    const dy = -rand() * rise - 6 + rand() * 18
    const rot = Math.round((rand() - 0.5) * 720)
    const w = 2 + Math.round(rand() * 2)
    const h = 2 + Math.round(rand() * 3)
    const delay = Math.round(rand() * 20) / 100
    css.push(`@keyframes cf${i}{from{transform:translate(0,0) rotate(0deg);opacity:1}to{transform:translate(${n(dx)}px,${n(dy)}px) rotate(${rot}deg);opacity:0}}.cfp${i}{animation:cf${i} 2s ease-out ${delay}s 1 forwards;opacity:0}`)
    pieces.push(`<rect class="cfp${i}" x="${n(cx)}" y="${n(cy)}" width="${w}" height="${h}" fill="${CONFETTI[i % CONFETTI.length] ?? '#F5C518'}"/>`)
  }
  return `<style>${css.join('')}@media (prefers-reduced-motion: reduce){.cf{display:none}}</style><g class="cf">${pieces.join('')}</g>`
}

// ---------------------------------------------------------------------------
// The sleeping summary row: "5 sleeping" and the sleepers as tiny characters with names, one line.

export type Sleeper = { kind: string; variant: number; name: string }

export function sleepersSvg(W: number, members: readonly Sleeper[], inCard = false): string {
  const cy = ROW_HEIGHT / 2
  const label = members.length + ' sleeping'
  const parts: string[] = [...(inCard ? [cardTile(W, ROW_HEIGHT)] : []), text(GAP, cy + 4.5, label, 't', BODY, ' font-weight="600"')]
  let x = GAP + textWidth(label, BODY) + 12
  for (const m of members) {
    const nm = fitText(m.name, CAP, 84)
    const w = 18 + 4 + textWidth(nm, CAP) + 10
    if (x + w > W - GAP) {
      parts.push(text(x, cy + 4, '\u2026', 'm', CAP))
      break
    }
    parts.push(spriteSvg(x, cy - 7, m.kind, m.variant, 'dim', 18 / 26, 'sleeping'))
    parts.push(text(x + 22, cy + 4, nm, 's', CAP))
    x += w
  }
  if (!inCard) parts.push(`<line class="ln" x1="${GAP}" y1="${ROW_HEIGHT - 0.5}" x2="${n(W - GAP)}" y2="${ROW_HEIGHT - 0.5}"/>`)
  return doc(W, ROW_HEIGHT, parts.join(''))
}

// ---------------------------------------------------------------------------
// An item row (Items tab): the item, its state chip, the owner's character at the right. No bars.

export type LookItem = {
  name: string
  state: { text: string; color: string }
  owner: { kind: string; variant: number; mode: DrawMode; activity: Activity } | null
  isOpen: boolean
  // The lines an open item shows (brief, report, landed).
  detail: DetailLine[]
  phase: number
}

export const itemHeight = (i: Pick<LookItem, 'isOpen' | 'detail'>): number => ROW_HEIGHT + (i.isOpen ? 8 + i.detail.length * DETAIL_H + 4 : 0)

export function itemSvg(W: number, i: LookItem): string {
  const H = itemHeight(i)
  const cy = ROW_HEIGHT / 2
  const parts: string[] = []
  if (i.isOpen) parts.push(`<rect class="tile" x="0" y="0" width="${n(W)}" height="${H}" rx="${RADIUS}"/>`)
  let right = W - GAP
  if (i.owner !== null) {
    parts.push(spriteSvg(right - CHAR_PX, cy - 10.5, i.owner.kind, i.owner.variant, i.owner.mode, CHAR_SCALE, i.owner.activity))
    right -= CHAR_PX + GAP
  }
  const c = chip(0, 0, i.state.text, i.state.color)
  parts.push(`<g transform="translate(${n(right - c.w)},${cy - 10})">${c.svg}</g>`)
  right -= c.w + GAP
  parts.push(text(GAP, cy + 4.5, fitText(i.name, BODY, Math.max(40, right - GAP * 2)), 't', BODY, ' font-weight="600"'))
  if (i.isOpen) {
    let y = ROW_HEIGHT + 8
    for (const d of i.detail) {
      parts.push(text(GUTTER, y + 14, d.label, 'm', CAP))
      parts.push(text(GUTTER + 84, y + 15, fitText(d.text, BODY, W - GUTTER * 2 - 84), d.cls ?? 't', BODY))
      y += DETAIL_H
    }
  } else {
    parts.push(`<line class="ln" x1="${GAP}" y1="${H - 0.5}" x2="${n(W - GAP)}" y2="${H - 0.5}"/>`)
  }
  return doc(W, H, parts.join(''), '', i.phase)
}

// ---------------------------------------------------------------------------
// A group header ("Now . 5") for the Items tab

export const GROUP_H = 28
export function groupSvg(W: number, label: string, count: number): string {
  return doc(W, GROUP_H, text(GAP, 19, label.toUpperCase(), 'm', CAP, ' font-weight="700" letter-spacing="0.6"') + text(GAP + textWidth(label.toUpperCase(), CAP) + 12, 19, String(count), 's', CAP))
}

// ---------------------------------------------------------------------------
// The Status card: title, thin progress and count on one line, the Active or Away chip at the right; then
// Now, Next and You, each a labelled single line (label muted, text normal).

export type LookStatus = {
  title: string
  /** COCKPIT-42: the short description of the current milestone or work: the label before the bar above the prompt. */
  short?: string
  ratio: number | null
  count: string
  // 'Today' with a landed count has a note instead of a ratio.
  note: string
  now: string
  next: string
  you: string
  youHex: string
  isAway: boolean
  presenceText: string
  // Only a status older than 30 minutes is stale (v9): an amber chip on the NOW line says "stale: updated 2h ago", so
  // a card nobody keeps up to date does not look idle. '' while the file is fresh.
  stale: string
  // COCKPIT-31: a red chip on the YOU line when a crew member's account refused it ("1 OUT OF CREDIT"); '' or absent when none.
  outage?: string
  phase: number
  // v10, expandable lines. The entries of each line (NEXT is one item per row when open) and which lines are open: an
  // open line shows every entry in full, wrapped, instead of one line cut with "...". All optional: absent, the card
  // is the single-line card it was.
  nowItems?: readonly string[]
  nextItems?: readonly string[]
  youItems?: readonly string[]
  open?: { now?: boolean; next?: boolean; you?: boolean; landed?: boolean }
  // COCKPIT-46: what landed today, one entry per commit; the LANDED line shows them one per row (wrapped, capped, then "N more") while the card is expanded.
  landedItems?: readonly string[]
  // COCKPIT-38: the card that fills itself. When present: NOW is drawn only when there are work items, then RUNNING, LANDED and REPORT lines (each only
  // when it has text), then NEXT and YOU, which are hand-written; `notes` ("notes from 2d ago") is a small dim note on NEXT and YOU only. Never a stale chip.
  main?: { running: string; landed: string; report: string; notes: string }
}

export type StatusField = 'now' | 'next' | 'you'
export const STATUS_FIELDS: readonly StatusField[] = ['now', 'next', 'you']
const EXPAND_LINE = 18
const LABEL_W = 40
const MAIN_LABEL_W = 62
const labelWOf = (s: LookStatus): number => (s.main !== undefined ? MAIN_LABEL_W : LABEL_W)
const LINE_H = 22

// The entries of a field: the given list, else the joined text as one entry; none when it says nothing.
export function fieldItems(s: LookStatus, f: StatusField): string[] {
  const given = f === 'now' ? s.nowItems : f === 'next' ? s.nextItems : s.youItems
  if (given !== undefined) return given.filter(x => x !== '')
  const text = s[f]
  return text === '' ? [] : [text]
}

// Does a field have more to show than its one line? A closed line is cut with "...", so any field with an entry can
// open; a field that says nothing cannot.
export const fieldCanOpen = (s: LookStatus, f: StatusField): boolean => fieldItems(s, f).length > 0

// The wrapped rows of an OPEN field (every entry in full, one entry per row at least); null when the field is closed
// or has nothing to show.
function openRows(W: number, s: LookStatus, f: StatusField): string[] | null {
  if (s.open?.[f] !== true) return null
  const items = fieldItems(s, f)
  if (items.length === 0) return null
  const chipW = f === 'now' && s.stale !== '' ? chip(0, 0, s.stale, '#F0A500').w + GAP : f === 'you' && (s.outage ?? '') !== '' ? chip(0, 0, s.outage ?? '', '#EF4444').w + GAP : 0
  const room = Math.max(60, W - GUTTER * 2 - labelWOf(s) - chipW)
  return items.flatMap(it => wrapText(it, BODY, room, 30))
}

/** How many landed entries the expanded LANDED line shows before its own "N more" line. */
export const LANDED_CAP = 5
/** The rows of the expanded LANDED line: one wrapped entry per commit, the first LANDED_CAP, then "N more"; null while collapsed or with fewer than two entries. */
export function landedRows(W: number, s: LookStatus): string[] | null {
  const items = (s.landedItems ?? []).filter(x => x !== '')
  if (s.main === undefined || s.open?.landed !== true || items.length < 2) return null
  const room = Math.max(60, W - GUTTER * 2 - labelWOf(s))
  const rows = items.slice(0, LANDED_CAP).flatMap(it => wrapText(it, BODY, room, 3))
  if (items.length > LANDED_CAP) rows.push(items.length - LANDED_CAP + ' more')
  return rows
}

const expandedExtra = (W: number, s: LookStatus): number => STATUS_FIELDS.reduce((a, f) => a + Math.max(0, (openRows(W, s, f)?.length ?? 1) - 1) * EXPAND_LINE, 0) + Math.max(0, (landedRows(W, s)?.length ?? 1) - 1) * EXPAND_LINE

// The card is 118 px, with an 8 px gap under it (transparent) before the tab strip.
export const STATUS_H = 12 + 24 + 8 + 3 * 22 + 10 + 8
const TITLE_LINE = 20

// The title wraps to two lines instead of being cut with "...": the room is what is left of line 1 (before the bar).
function titleLayout(W: number, s: LookStatus): { lines: string[]; barX: number; right: number; countText: string; barW: number; presW: number; ageW: number } {
  const presW = 0
  const right = W - GUTTER
  const ageW = 0
  const countText = s.ratio !== null ? s.count : s.note
  const countW = countText === '' ? 0 : Math.ceil(textWidth(countText, CAP)) + GAP
  const barW = s.ratio === null ? 0 : Math.max(36, Math.min(120, W * 0.2))
  const barX = right - countW - barW
  const room = Math.max(60, barX - GUTTER - 12)
  return { lines: wrapText(s.title, TITLE, room, 2), barX, right, countText, barW, presW, ageW }
}

// ---------------------------------------------------------------------------
// COCKPIT-39: the services block. One compact row per service, always all of them, never dropped by width (the text wraps instead): the name with a tiny
// "auto" or "manual" marker under it, a bar of what is LEFT, then the figure and its reset or expiry. Colours follow the credit icons' states.

const SVC_NAME_W = 104
const SVC_ICON = 14
const SVC_LINE = 14
const SVC_MIN_H = 20

// COCKPIT-46: ONE compact line per service: icon, name, figure, reset or expiry. The bars and the auto marker are the bar's credit row's job; the only marker kept is
// "manual" (and "check"), which the bar cannot say. A long figure wraps under itself instead of being cut.
const svcText = (r: ServiceRow): string => {
  const mark = r.source === 'manual' ? markerOf(r) : ''
  return r.text + (r.when !== '' ? ' \u00b7 ' + r.when : '') + (mark !== '' ? ' \u00b7 ' + mark : '')
}
function svcLayout(W: number, r: ServiceRow): { lines: string[]; h: number; textX: number } {
  const textX = GUTTER + SVC_NAME_W
  const room = Math.max(60, W - GUTTER - textX)
  const lines = wrapText(svcText(r), CAP, room, 4)
  return { lines, h: Math.max(SVC_MIN_H, lines.length * SVC_LINE + 6), textX }
}

export const servicesHeight = (W: number, rows: readonly ServiceRow[]): number => rows.reduce((a, r) => a + svcLayout(W, r).h, 0)

export function servicesParts(W: number, rows: readonly ServiceRow[], y0: number): { svg: string; h: number } {
  const parts: string[] = []
  let y = y0
  for (const r of rows) {
    const L = svcLayout(W, r)
    parts.push(glyphFragment(SERVICE_GLYPH[r.id], r.hex, GUTTER, y + 2, SVC_ICON))
    parts.push(text(GUTTER + SVC_ICON + 5, y + 13, r.name, 't', CAP, ' font-weight="700"'))
    L.lines.forEach((l, i) => parts.push(text(L.textX, y + 13 + i * SVC_LINE, l, r.state === 'unknown' || r.check ? 'm' : 's', CAP)))
    y += L.h
  }
  return { svg: parts.join(''), h: y - y0 }
}

/** The block as its own drawing (the bar above the prompt). */
export function servicesSvg(W: number, rows: readonly ServiceRow[]): string {
  const p = servicesParts(W, rows, 2)
  return doc(W, p.h + 4, p.svg, '', 0)
}

// The lines a card draws below its title: three fixed ones, or (the self-filling card) only those that have something to say plus NEXT and YOU.
const lineCount = (s: LookStatus): number =>
  s.main === undefined ? 3 : 2 + (fieldItems(s, 'now').length > 0 ? 1 : 0) + [s.main.running, s.main.landed, s.main.report].filter(x => x !== '').length

export const statusHeight = (W: number, s: LookStatus): number => STATUS_H + (lineCount(s) - 3) * LINE_H + (titleLayout(W, s).lines.length > 1 ? TITLE_LINE : 0) + expandedExtra(W, s)

export function statusSvg(W: number, s: LookStatus): string {
  const L = titleLayout(W, s)
  const H = statusHeight(W, s)
  const extra = L.lines.length > 1 ? TITLE_LINE : 0
  const parts: string[] = [`<rect class="tile" x="0" y="0" width="${n(W)}" height="${H - 8}" rx="${RADIUS}"/>`]
  // v17: the Active or Away chip is not on the card (the button row under it carries it).
  let right = W - GUTTER
  const { countText, barX, barW } = L
  parts.push(text(right, GUTTER + 13, countText, 's', CAP, ' text-anchor="end" font-variant-numeric="tabular-nums"'))
  if (s.ratio !== null) parts.push(bar(barX, GUTTER + 6, barW, s.ratio, 'okc', 5))
  L.lines.forEach((l, i) => parts.push(text(GUTTER, GUTTER + 17 + i * TITLE_LINE, l, 't', TITLE, ' font-weight="700"')))
  let y = GUTTER + 24 + extra + GAP
  const LW = labelWOf(s)
  const line = (label: string, value: string, cls: string, badge = '', rows: string[] | null = null, badgeHex = '#F0A500', note = ''): void => {
    parts.push(text(GUTTER, y + 15, label, 'm', CAP, ' font-weight="600"'))
    // The stale chip sits at the right edge of the line; the text gives it the room. A dim note (COCKPIT-38) sits left of any chip.
    const chipW = badge === '' ? 0 : chip(0, 0, badge, badgeHex).w
    const noteW = note === '' ? 0 : Math.ceil(textWidth(note, CAP - 1)) + GAP
    const reserve = (chipW > 0 ? chipW + GAP : 0) + noteW
    if (rows !== null) rows.forEach((r, i) => parts.push(text(GUTTER + LW, y + 15 + i * EXPAND_LINE, r, cls, BODY)))
    else parts.push(text(GUTTER + LW, y + 15, fitText(value, BODY, W - GUTTER * 2 - LW - reserve), cls, BODY))
    if (badge !== '') parts.push(`<g transform="translate(${n(W - GUTTER - chipW)},${n(y)})">${chip(0, 0, badge, badgeHex).svg}</g>`)
    if (note !== '') parts.push(text(W - GUTTER - (chipW > 0 ? chipW + GAP : 0), y + 15, note, 'm', CAP - 1, ' text-anchor="end" opacity="0.7"'))
    y += LINE_H + Math.max(0, (rows?.length ?? 1) - 1) * EXPAND_LINE
  }
  if (s.main !== undefined) {
    if (fieldItems(s, 'now').length > 0) line('NOW', s.now, 't', '', openRows(W, s, 'now'))
    if (s.main.running !== '') line('RUNNING', s.main.running, 's')
    if (s.main.landed !== '') line('LANDED', s.main.landed, 's', '', landedRows(W, s))
    if (s.main.report !== '') line('REPORT', s.main.report, 's')
    line('NEXT', s.next === '' ? 'nothing' : s.next, s.next === '' ? 'm' : 's', '', openRows(W, s, 'next'), '#F0A500', s.next === '' ? '' : s.main.notes)
    line('YOU', s.you === '' ? 'nothing' : s.you, s.you === '' ? 'm' : toneClass(s.youHex), s.outage ?? '', openRows(W, s, 'you'), '#EF4444', s.you === '' ? '' : s.main.notes)
    return doc(W, H, parts.join(''), '', s.phase)
  }
  line('NOW', s.now === '' ? 'nothing' : s.now, s.now === '' ? 'm' : 't', s.stale, openRows(W, s, 'now'))
  line('NEXT', s.next === '' ? 'nothing' : s.next, s.next === '' ? 'm' : 's', '', openRows(W, s, 'next'))
  line('YOU', s.you === '' ? 'nothing' : s.you, s.you === '' ? 'm' : toneClass(s.youHex), s.outage ?? '', openRows(W, s, 'you'), '#EF4444')
  return doc(W, H, parts.join(''), '', s.phase)
}

// ---------------------------------------------------------------------------
// The Limits area, pinned at the bottom: ONE line per pool, the same six as the strip above the prompt: System,
// Claude, Codex, API, Cloud, Local. Claude and Codex draw thin meters side by side (ctx, 5h, wk) with the percent and
// the reset; API and Cloud a thin bar and their text; System and Local a dot and their text; a pool that cannot be
// read is ONE muted line; an exhausted or down pool is at 45%.

const LIMIT_ROW_H = 24
const LIMITS_GAP = 8
export const limitsHeight = (rows: number): number => LIMITS_GAP + 8 + rows * LIMIT_ROW_H + 8

export function limitsSvg(W: number, rows: readonly PoolRow[]): string {
  const H = limitsHeight(rows.length)
  const parts: string[] = [`<rect class="tile" x="0" y="${LIMITS_GAP}" width="${n(W)}" height="${H - LIMITS_GAP}" rx="${RADIUS}"/>`]
  const labelW = 58
  const x0 = GUTTER + labelW
  const avail = W - GUTTER - x0
  let y = LIMITS_GAP + 8
  for (const r of rows) {
    const cy = y + LIMIT_ROW_H / 2
    const g: string[] = [text(GUTTER, cy + 4.5, r.name, r.isMuted ? 'm' : 't', BODY, ' font-weight="600"')]
    const asText = r.id === 'system' || r.id === 'local' || r.isMuted || r.meters.length === 0
    if (asText) {
      const dx = r.dot !== null ? 14 : 0
      if (r.dot !== null) g.push(`<circle class="${toneClass(r.dot)}" cx="${x0 + 4}" cy="${cy}" r="4"/>`)
      g.push(text(x0 + dx, cy + 4, fitText(r.text, CAP, avail - dx), r.isMuted ? 'm' : 's', CAP))
    } else if (r.id === 'api' || r.id === 'cloud') {
      const m = r.meters[0]
      const bw = Math.min(64, Math.max(30, avail * 0.2))
      if (m !== undefined) g.push(bar(x0, cy - 3, bw, m.ratio, toneClass(m.hex), 6))
      g.push(text(x0 + bw + GAP, cy + 4, fitText(r.text, CAP, avail - bw - GAP), 's', CAP))
    } else {
      const slot = avail / r.meters.length
      r.meters.forEach((m, i) => {
        const x = x0 + i * slot
        const lab = textWidth(m.label, CAP) + 4
        const val = textWidth('100%', CAP) + 4
        const sub = slot >= 140 && m.sub !== '' ? textWidth(m.sub, CAP) + 6 : 0
        const bw = Math.max(24, slot - lab - val - sub - GAP)
        g.push(text(x, cy + 4, m.label, 'm', CAP))
        g.push(bar(x + lab, cy - 3, bw, m.ratio, toneClass(m.hex), 6))
        g.push(text(x + lab + bw + 4, cy + 4, m.value, m.ratio === null ? 'm' : 's', CAP, ' font-variant-numeric="tabular-nums"'))
        if (sub > 0) g.push(text(x + lab + bw + 4 + val, cy + 4, m.sub, 'm', CAP))
      })
    }
    parts.push(`<g${r.dim ? ' opacity="0.45"' : ''}>${g.join('')}</g>`)
    y += LIMIT_ROW_H
  }
  return doc(W, H, parts.join(''))
}

// ---------------------------------------------------------------------------
// COCKPIT-46: the bar's credit row as ONE row: Claude, Cloud, API and Codex packed left to right in the declared order with one even gap (CREDIT_SEP),
// nothing right-aligned. Each is the Main status card's own glyph (`glyphFragment` with SERVICE_GLYPH) + its name + a small bar + the short figure.
// When the width is short the row narrows in the order CREDIT_STEPS declares: names go, then the figures shorten, then the bars; it never drops a service or wraps.
export const CREDIT_H = 20
const CREDIT_ICON = 14
const CREDIT_PAD = 4
export const CREDIT_SEP = 14

export type CreditPlace = { seg: CreditSeg; x: number; w: number; /** the name drawn after the icon, or '' when names were dropped */ name: string }
export type CreditLayout = { step: number; spec: CreditStep; places: CreditPlace[]; /** where the packed row ends */ edge: number }

const segWidth = (g: CreditSeg, spec: CreditStep): number =>
  CREDIT_ICON + CREDIT_PAD + (spec.named ? Math.ceil(textWidth(g.name, CAP)) + CREDIT_PAD : 0) + (spec.bar > 0 ? spec.bar + CREDIT_PAD : 0) + Math.ceil(textWidth(g.fig, CAP))

export function creditLayout(W: number, rows: readonly ServiceRow[]): CreditLayout {
  let last: CreditLayout | null = null
  for (let step = 0; step < CREDIT_STEPS.length; step++) {
    const spec = CREDIT_STEPS[step]!
    const segs = creditSegments(rows, spec.fig)
    const ws = segs.map(g => segWidth(g, spec))
    let x = GAP
    const places: CreditPlace[] = segs.map((seg, i) => {
      const at = x
      x += ws[i]! + CREDIT_SEP
      return { seg, x: at, w: ws[i]!, name: spec.named ? seg.name : '' }
    })
    const edge = x - CREDIT_SEP
    last = { step, spec, places, edge }
    if (edge <= W - GAP) break
  }
  return last!
}

export function creditsSvg(W: number, rows: readonly ServiceRow[]): string {
  const lay = creditLayout(W, rows)
  const barW = lay.spec.bar
  const cy = CREDIT_H / 2
  const parts: string[] = []
  for (const { seg, x, w, name } of lay.places) {
    const g: string[] = [glyphFragment(SERVICE_GLYPH[seg.id], seg.hex, x, cy - CREDIT_ICON / 2, CREDIT_ICON)]
    let tx = x + CREDIT_ICON + CREDIT_PAD
    if (name !== '') {
      g.push(text(tx, cy + 4, name, 'm', CAP))
      tx += Math.ceil(textWidth(name, CAP)) + CREDIT_PAD
    }
    if (barW > 0) {
      g.push(bar(tx, cy - 2.5, barW, seg.ratio, seg.unknown ? 'm' : toneClass(seg.hex), 5))
      tx += barW + CREDIT_PAD
    }
    g.push(text(tx, cy + 4, seg.fig, seg.unknown ? 'm' : toneClass(seg.hex), CAP, ' font-variant-numeric="tabular-nums"'))
    void w
    parts.push(`<g data-svc="${seg.id}"${seg.unknown ? ' opacity="0.55"' : ''}>${g.join('')}</g>`)
  }
  return doc(W, CREDIT_H, parts.join(''))
}

// ---------------------------------------------------------------------------
// The strip above the prompt (two thin lines). Pieces: the count pill, a character at 20 px, and each pool group's
// meters as one small svg (22 px high): [label] [48 px thin bar] [percent only from 70%], dim when exhausted.

// The band's drawing width in px. The host REFUSES an Svg wider than 4096 px ("Svg width and height are pixels, at most
// 4096") and then draws none of the band, so the width is clamped far under that (a cell is 8 px; a very wide window must not
// switch the band off). v10: found with the test host at 1000 columns.
export const BAND_MIN_PX = 240
export const BAND_MAX_PX = 1600
export const bandPx = (cols: number): number => Math.max(BAND_MIN_PX, Math.min(BAND_MAX_PX, (Number.isFinite(cols) ? cols : 100) * 8 - 8))

export const STRIP_H = 22
const STRIP_CHAR = 20

export function countPillSvg(text0: string, isWorking: boolean): { svg: string; w: number; h: number } {
  const c = chip(0, 1, text0, isWorking ? '#22C55E' : '#8B949E')
  return { svg: doc(c.w, STRIP_H, c.svg), w: c.w, h: STRIP_H }
}

export function characterSvg(kind: string, variant: number, mode: DrawMode, activity: Activity, phase: number): string {
  return doc(STRIP_CHAR, STRIP_H, spriteSvg(0, 1, kind, variant, mode, STRIP_CHAR / 26, activity), '', phase)
}

// A group's drawing: its dots, then each meter as [label] [thin bar] [percent from 60%]. Its width is exactly what
// `groupPx` counted after the label button (pools.ts), so nothing overlaps. A pool's meter labels are real words
// ("5h", "wk", "Fable", "GPU"); a meter with no label (API, Cloud) is the bar alone.
export function groupSvg2(g: StripGroup): { svg: string; w: number } {
  const parts: string[] = []
  const cy = STRIP_H / 2
  let x = GROUP_PAD
  for (const d of g.dots) {
    parts.push(`<circle class="${toneClass(d)}" cx="${x + 5}" cy="${cy}" r="4"/>`)
    x += 14
  }
  for (const m of g.meters) {
    if (m.label !== '') {
      parts.push(text(x, cy + 4, m.label, 'm', CAP))
      x += Math.ceil(textWidth(m.label, CAP)) + 4
    }
    parts.push(bar(x, cy - 3, g.meterW, m.ratio, toneClass(m.hex), 6))
    x += g.meterW
    if (meterShowsPct(m)) {
      parts.push(text(x + 4, cy + 4, m.value, toneClass(m.hex), CAP, ' font-weight="600" font-variant-numeric="tabular-nums"'))
      x += 4 + Math.ceil(textWidth(m.value, CAP))
    }
    x += 8
  }
  const w = Math.max(10, Math.ceil(x))
  return { svg: doc(w, STRIP_H, `<g${g.dim ? ' opacity="0.45"' : ''}>${parts.join('')}</g>`), w }
}

// ---------------------------------------------------------------------------
// A text card (the "?" help): a title and wrapped lines on a tile, styled like the other cards.

const CARD_LINE = 20
const cardLines = (W: number, lines: readonly string[]): string[] => lines.flatMap(l => wrapText(l, BODY, W - GUTTER * 2, 3))

export const cardHeight = (W: number, lines: readonly string[]): number => GUTTER + 24 + cardLines(W, lines).length * CARD_LINE + GUTTER

export function cardSvg(W: number, title: string, lines: readonly string[]): string {
  const H = cardHeight(W, lines)
  const parts: string[] = [`<rect class="tile" x="0" y="0" width="${n(W)}" height="${H}" rx="${RADIUS}"/>`, text(GUTTER, GUTTER + 15, title, 't', TITLE, ' font-weight="700"')]
  cardLines(W, lines).forEach((l, i) => parts.push(text(GUTTER, GUTTER + 24 + 14 + i * CARD_LINE, l, 's', BODY)))
  return doc(W, H, parts.join(''))
}

// ---------------------------------------------------------------------------
// The milestone progress line, line 1 of the bar above the prompt (v8): the milestone title, a filling bar with the
// done count ("3/6") and "now <item>". It is the reason the bar exists, so it is always there. Animated in the
// style of a progress meter, CSS only: while anything works the fill carries moving stripes, a travelling shimmer
// and a pulse on its leading edge; when the done count rises the fill grows from where it was and the count pops;
// idle, the bar is still. prefers-reduced-motion switches every animation off.

export type ProgressIn = {
  title: string
  // done over total, 0 to 1, or null when the milestone has no count.
  ratio: number | null
  count: string
  now: string
  // Anything is working: the bar moves.
  isWorking: boolean
  // The done count just rose from `from` (0 to 1): the fill grows from there once.
  grewFrom: number | null
}

export const PROGRESS_H = 28

/**
 * COCKPIT-52: the status-row bar is plain coloured Text (the live host dropped the bar picture). The cells, the title and the count are
 * fitted into leftPx (8 px a terminal column): the bar is 12 to 30 cells and shrinks to 12 before the title truncates; the count never drops.
 */
export const BAR_MIN_CELLS = 12
export const BAR_MAX_CELLS = 30
export const BAR_FILLED = '\u2588'
export const BAR_EMPTY = '\u2591'

export function headCells(leftPx: number, title: string, count: string): { cells: number; title: string; count: string } {
  const cols = Math.floor(leftPx / 8)
  const avail = cols - (count === '' ? 0 : count.length + 1) - 1
  if (title.length + BAR_MIN_CELLS <= avail) return { cells: Math.min(BAR_MAX_CELLS, avail - title.length), title, count }
  const room = Math.max(1, avail - BAR_MIN_CELLS)
  const t = title.length <= room ? title : (room <= 1 ? '' : title.slice(0, room - 1)) + '\u2026'
  return { cells: BAR_MIN_CELLS, title: t, count }
}

/** The bar as two strings: filled and empty cells, proportional to done/total (a started bar shows one cell, an unfinished one never looks full). */
export function textBar(ratio: number | null, cells: number): { filled: string; empty: string } {
  const r = ratio === null ? 0 : Math.max(0, Math.min(1, ratio))
  let f = Math.round(r * cells)
  if (r > 0 && f < 1) f = 1
  if (r < 1 && f > cells - 1) f = cells - 1
  return { filled: BAR_FILLED.repeat(f), empty: BAR_EMPTY.repeat(cells - f) }
}

const BAR_H = 10

export function progressSvg(W: number, p: ProgressIn): string {
  const cy = PROGRESS_H / 2
  const parts: string[] = []
  // COCKPIT-42: the label is the short description of the current work; nothing sits to the right of the bar (no count, no "now").
  // COCKPIT-44: the bar shortens first (down to 40 px); only then does the title truncate.
  // COCKPIT-46: the done count ("1/7") sits immediately right of the bar and is never dropped; the title and the bar give way first.
  const countW = p.count === '' ? 0 : Math.ceil(textWidth(p.count, HEAD_FS)) + 8
  // COCKPIT-48: the order is bar, title, count (the title no longer sits before the bar). The bar shortens first (down to 40 px), then the title truncates.
  const titleW = Math.max(24, Math.min(Math.ceil(textWidth(p.title, HEAD_FS)) + 4, W - GAP * 2 - 12 - 40 - countW))
  const title = fitText(p.title, HEAD_FS, titleW)
  const titleTextW = Math.ceil(textWidth(title, HEAD_FS))
  const x = GAP
  const barW = Math.max(40, W - GAP * 2 - 12 - titleTextW - countW)
  const by = cy - BAR_H / 2
  const tx = p.ratio === null ? x : x + barW + 12
  // COCKPIT-49: the title and the count are two plain <text> elements (no <tspan>: a host that cannot draw a tspan drops the whole picture). The count starts a fixed 8 px
  // after the title's measured width; doc() lets HEAD_FS through unclamped, so that width matches what is drawn.
  const countEl = p.count !== '' && p.ratio !== null ? `<text class="t" x="${n(tx + Math.round(titleTextW * 0.93) + 8)}" y="${n(cy + 6.3)}" font-family="${FONT}" font-size="${HEAD_FS}" font-weight="600">${xml(p.count)}</text>` : ''
  const titleEl = `<text class="t" x="${n(tx)}" y="${n(cy + 6.3)}" font-family="${FONT}" font-size="${HEAD_FS}" font-weight="600">${xml(title)}</text>${countEl}`
  let css = ''
  if (p.ratio !== null) {
    const fillW = Math.max(BAR_H, barW * Math.max(0, Math.min(1, p.ratio)))
    const grow = p.grewFrom !== null && p.grewFrom < p.ratio && p.ratio > 0
    // The fill, clipped so its stripes and shimmer stay inside its rounded shape.
    parts.push(`<rect class="k" x="${n(x)}" y="${by}" width="${n(barW)}" height="${BAR_H}" rx="${BAR_H / 2}"/>`)
    parts.push(`<clipPath id="pgc"><rect x="${n(x)}" y="${by}" width="${n(fillW)}" height="${BAR_H}" rx="${BAR_H / 2}"/></clipPath>`)
    parts.push(`<g class="${grow ? 'pg-grow' : ''}"><rect class="okc" x="${n(x)}" y="${by}" width="${n(fillW)}" height="${BAR_H}" rx="${BAR_H / 2}"/>`)
    if (p.isWorking) {
      parts.push(`<g clip-path="url(#pgc)"><g class="pg-stripes"><rect x="${n(x - 24)}" y="${by}" width="${n(fillW + 48)}" height="${BAR_H}" fill="url(#pgs)"/></g><rect class="pg-shine" x="${n(x - 36)}" y="${by}" width="36" height="${BAR_H}" fill="url(#pgh)"/></g>`)
      parts.push(`<circle class="pg-edge okc" cx="${n(x + fillW - BAR_H / 2)}" cy="${cy}" r="${BAR_H / 2 - 1}" fill-opacity="0.55"/>`)
    }
    parts.push('</g>')
    const defs = `<defs><pattern id="pgs" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="12" fill="#ffffff" fill-opacity="0.22"/></pattern><linearGradient id="pgh" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0.5"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs>`
    parts.unshift(defs)
    const from = grow ? Math.max(0.02, (p.grewFrom ?? 0) / p.ratio) : 1
    css = [
      p.isWorking ? `.pg-stripes{animation:pgs 0.9s linear infinite}@keyframes pgs{to{transform:translateX(17px)}}` : '',
      p.isWorking ? `.pg-shine{animation:pgh 2.4s ease-in-out infinite}@keyframes pgh{0%{transform:translateX(0)}100%{transform:translateX(${n(fillW + 72)}px)}}` : '',
      p.isWorking ? `.pg-edge{transform-box:fill-box;transform-origin:center;animation:pge 1.2s ease-in-out infinite}@keyframes pge{0%,100%{transform:scale(1);opacity:.9}50%{transform:scale(1.5);opacity:.2}}` : '',
      grow ? `.pg-grow{transform-box:fill-box;transform-origin:left center;animation:pgg 1.4s cubic-bezier(.2,.8,.2,1) 1 both}@keyframes pgg{from{transform:scaleX(${n(from)})}to{transform:scaleX(1)}}` : '',
      grow ? `.pg-pop{transform-box:fill-box;transform-origin:center;animation:pgp 1.4s ease-out 1 both}@keyframes pgp{0%{transform:scale(1.35)}100%{transform:scale(1)}}` : '',
    ].join('')
    // Reduced motion turns every animation off; with nothing animated there is nothing to switch off.
    if (css !== '') css += '@media (prefers-reduced-motion: reduce){.pg-stripes,.pg-shine,.pg-edge,.pg-grow,.pg-pop{animation:none}}'
  }
  parts.push(titleEl)
  return doc(W, PROGRESS_H, parts.join(''), css)
}
