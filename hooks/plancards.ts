// COCKPIT-TREE-01: the plan area as one calm tree of separate cards, top to bottom: the Plan (name, "Plan 7/10", bar; always open), Waiting on you,
// one card per milestone (its steps inside), Off plan, System. Every card but the Plan starts collapsed and shows its count in its title, so the counts
// stay visible when everything is closed. A step expands (detail line, id, buttons) and has a second expand (the longer note and history). Each open flag is
// saved on its own (panesections.ts) and one toggle never changes another. This file is the pure model plus the card header drawings; the steps are drawn
// by plancard.ts (planRowSvg) and the asks by waiting.ts.

import { FONT, doc, n, textWidth, wrapText, xml } from './draw.ts'
import { stepDetail } from './plancard.ts'
import { WORKER_CSS, workerMarker } from './workers.ts'
import type { StepKind } from './plan.ts'
import type { PlanGroup, PlanRow, PlanShown } from './plan.ts'
import { isSectionOpen, toggledSections } from './panesections.ts'
import type { SectionFlags } from './panesections.ts'
import { GUTTER, RADIUS } from './tokens.ts'
import { waitingItems } from './waiting.ts'
import type { WaitingItem } from './waiting.ts'

export type CardId = 'title' | 'needs' | 'milestone' | 'off' | 'system'
export type CardDef = { id: CardId; title: string; /** The saved-flag id; '' for the Title card, which has none. For a milestone it is pm-<id>. */ flag: string; openByDefault: boolean; tone: 'runc' | 'warnc' | 'okc' | 's' | 'm' }

/** The declared order of the fixed cards; the milestones sit between "Waiting on you" and "Off plan" (COCKPIT-TREE-01). Every card but the title is collapsed by default. */
export const PLAN_CARDS: readonly CardDef[] = [
  { id: 'title', title: 'Plan', flag: '', openByDefault: true, tone: 'm' },
  { id: 'system', title: 'System', flag: 'pc-system', openByDefault: false, tone: 'm' },
  { id: 'needs', title: 'Waiting on you', flag: 'pc-needs', openByDefault: false, tone: 'warnc' },
  { id: 'milestone', title: 'Milestone', flag: 'pm-', openByDefault: false, tone: 's' },
  { id: 'off', title: 'Off plan', flag: 'pc-off', openByDefault: false, tone: 'warnc' },
]

export const milestoneFlag = (id: string): string => 'pm-' + id
export const stepFlag = (id: string): string => 'ps-' + id
export const moreFlag = (id: string): string => 'pv-' + id

/** The flags after one card's toggle: exactly that card's entry changes. `milestoneId` names the milestone when the card is one. */
export const toggledCard = (flags: SectionFlags, id: CardId, milestoneId = ''): Record<string, boolean> => {
  const flag = id === 'milestone' ? (milestoneId === '' ? '' : milestoneFlag(milestoneId)) : (PLAN_CARDS.find(c => c.id === id)?.flag ?? '')
  return flag === '' ? { ...flags } : toggledSections(flags, flag)
}

/** The buttons of a row, in their fixed grid order (top row: done, remove; bottom row: explain, retry). */
export type RowAction = 'done' | 'remove' | 'explain' | 'retry'
export const ACTION_ORDER: readonly RowAction[] = ['done', 'remove', 'explain', 'retry']
export const ACTION_GLYPH: Record<RowAction, string> = { done: '\u2713', remove: '\u2715', explain: '?', retry: '\u21bb' }
export const ACTION_HINT: Record<RowAction, string> = {
  done: 'mark done',
  remove: 'cancel and remove from the plan',
  explain: 'ask the session to explain this or ask you',
  retry: 'set back to todo and ask the session to dispatch it again',
}

export type CardEntry =
  | { kind: 'need'; item: WaitingItem; actions: RowAction[] }
  | { kind: 'plan'; row: PlanRow; actions: RowAction[]; /** The step is expanded (detail line, id and buttons). */ expanded: boolean; /** The second expand is open. */ more: boolean; /** There is a longer note or a history behind the second expand. */ hasMore: boolean }

export type CardModel = {
  def: CardDef
  /** The card's own title: the milestone's name for a milestone card. */
  title: string
  /** The header's count: "2/5" for a milestone, the number for the others. */
  countText: string
  count: number
  open: boolean
  entries: CardEntry[]
  /** The System card's line. */
  text: string
  /** The milestone this card is, when it is one. */
  group?: PlanGroup
  /** Set when something inside is active: the kind to draw and whether it is waiting on you (amber) or running (blue). Drives the small worker on a collapsed header. */
  active?: { kind: StepKind; tone: 'run' | 'warn' }
}

/** The activity inside a set of rows: waiting on you wins over running; null when nothing is active. */
export function activityOf(rows: readonly PlanRow[]): { kind: StepKind; tone: 'run' | 'warn' } | null {
  const w = rows.find(r => r.state === 'blocked' && r.onYou)
  if (w !== undefined) return { kind: 'wait', tone: 'warn' }
  const r = rows.find(x => x.state === 'running' && !x.gone)
  return r !== undefined ? { kind: r.kind, tone: 'run' } : null
}

const planActions = (r: PlanRow): RowAction[] => {
  if (r.state === 'done' || r.state === 'todo') return r.planned ? [] : ['remove', 'explain']
  const out: RowAction[] = ['done', 'remove', 'explain']
  out.push('retry')
  return out
}

/** The whole tree as data: every card in order with its count, open state and entries (entries are listed only for an open card). */
export function buildCards(shown: PlanShown, flags: SectionFlags, o: { youLines: readonly string[]; systemText: string }): CardModel[] {
  const v = shown.view
  const asks = waitingItems(v.waiting, o.youLines)
  const sys = o.systemText.trim()
  const sysCount = sys === '' ? 0 : sys.split(/\s+\u00b7\s+/).length
  const planEntries = (rows: readonly PlanRow[]): CardEntry[] =>
    rows.map(row => {
      const expanded = isSectionOpen(flags, stepFlag(row.id))
      const more = expanded && isSectionOpen(flags, moreFlag(row.id))
      return { kind: 'plan', row, actions: expanded ? planActions(row) : [], expanded, more, hasMore: stepDetail(row).hasMore }
    })
  const act = (a: CardModel['active'] | null): { active?: CardModel['active'] } => (a === null ? {} : { active: a })
  const out: CardModel[] = []
  for (const def of PLAN_CARDS) {
    if (def.id === 'milestone') {
      for (const g of v.groups) {
        const flag = milestoneFlag(g.id)
        const open = isSectionOpen(flags, flag)
        out.push({ def: { ...def, flag, tone: g.state === 'done' ? 'okc' : g.state === 'active' ? 'runc' : 's' }, title: g.title, countText: g.done + '/' + g.total, count: g.total, open, entries: open ? planEntries(g.rows) : [], text: '', group: g, ...act(activityOf(g.rows)) })
      }
      continue
    }
    const open = def.flag === '' ? true : isSectionOpen(flags, def.flag)
    const count = def.id === 'needs' ? asks.length : def.id === 'off' ? v.off.length : def.id === 'system' ? sysCount : 0
    let entries: CardEntry[] = []
    if (open && def.id === 'needs') entries = asks.map(item => ({ kind: 'need', item, actions: item.id === '' ? ['explain'] : [...ACTION_ORDER] }))
    else if (open && def.id === 'off') entries = planEntries(v.off)
    out.push({ def, title: def.title, countText: String(count), count, open, entries, text: def.id === 'system' ? (sys === '' ? 'System: checking' : sys) : '', ...act(def.id === 'needs' ? (asks.length > 0 ? { kind: 'wait' as StepKind, tone: 'warn' as const } : null) : def.id === 'off' ? activityOf(v.off) : null) })
  }
  return out
}

// ---------------------------------------------------------------------------
// Drawing

const text = (x: number, y: number, s: string, cls: string, size: number, extra = ''): string =>
  `<text class="${cls}" x="${n(x)}" y="${n(y)}" font-family="${FONT}" font-size="${size}"${extra}>${xml(s)}</text>`

export type CardDrawing = { svg: string; height: number }
export const CARD_HEAD_H = 34

/** A card header: the name and the count on the card's tile. `joined` is true when rows follow (the tile runs on under it, square at the bottom).
 *  A milestone header shows its own name as written and a "2/5" count: green when all done, blue while one is active, grey otherwise. */
export function cardHeadSvg(W: number, def: CardDef, count: number, joined: boolean, o: { title?: string; countText?: string; active?: CardModel['active']; motion?: boolean; nowMs?: number; open?: boolean } = {}): CardDrawing {
  const milestone = def.id === 'milestone'
  const label = milestone ? (o.title ?? def.title) : (o.title ?? def.title).toUpperCase()
  const cls = milestone ? def.tone : count > 0 ? def.tone : 'm'
  const countText = o.countText ?? String(count)
  const room = Math.max(60, W - GUTTER * 2 - Math.ceil(countText.length * 8) - 22)
  const shown = wrapText(label, 13, room, 1)[0] ?? label
  const body = `<rect class="tile" x="0" y="0" width="${n(W)}" height="${CARD_HEAD_H + (joined ? RADIUS : 0)}" rx="${RADIUS}"/>${text(GUTTER, 22, shown, milestone ? 't' : cls, 13, milestone ? ' font-weight="600"' : ' font-weight="700" letter-spacing=".6"')}${text(GUTTER + Math.ceil(textWidth(shown, 13)) + (milestone ? 12 : 22), 22, countText, milestone || count > 0 ? cls : 's', 13, ' font-weight="700"')}`
  // A collapsed card with something active inside shows one small worker at the right edge (blue running, amber waiting).
  const mk = o.active !== undefined && o.open !== true ? workerMarker(o.active.kind, o.active.tone, 0, 0, { motion: o.motion ?? true, nowMs: o.nowMs ?? 0 }) : null
  const mark = mk === null ? '' : mk.svg.replace('translate(0 0)', `translate(${n(W - GUTTER - mk.width)} ${n((CARD_HEAD_H - mk.height) / 2)})`)
  return { svg: doc(W, CARD_HEAD_H, body + mark, mk === null ? '' : WORKER_CSS), height: CARD_HEAD_H }
}

/** One plain wrapped line on the tile (the System card's body, or an empty card's "nothing here"). */
export function cardLineSvg(W: number, s: string, cls = 's'): CardDrawing {
  const ls = wrapText(s, 12, Math.max(60, W - GUTTER * 2), 20)
  const H = 8 + ls.length * 16 + 6
  return { svg: doc(W, H, `<rect class="tile" x="0" y="0" width="${n(W)}" height="${H}"/>` + ls.map((l, i) => text(GUTTER, 21 + i * 16, l, cls, 12)).join('')), height: H }
}

/** The card's bottom edge, under its last row. */
export function cardCapSvg(W: number): CardDrawing {
  const H = RADIUS + 4
  return { svg: doc(W, H, `<rect class="tile" x="0" y="${-RADIUS}" width="${n(W)}" height="${n(2 * RADIUS)}" rx="${RADIUS}"/>`), height: H }
}
