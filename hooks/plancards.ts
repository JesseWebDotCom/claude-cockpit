// 0.22.0: the plan area as a stack of separate cards, top to bottom: Title (milestone, count, bar; always open), System (closed), Needs me (open),
// Pending (open), Blocked (closed), Off plan (open), Done (closed). Each card header shows its name and a count; each open flag is saved on its own
// (panesections.ts CARD_FLAGS) and one toggle never changes another. This file is the pure model (which card holds which rows, in what order, with
// which buttons) plus the card header and text-line drawings. The rows themselves are drawn by plancard.ts (planRowSvg) and waiting.ts.

import { FONT, doc, n, textWidth, wrapText, xml } from './draw.ts'
import type { PlanRow, PlanShown } from './plan.ts'
import { isSectionOpen, toggledSections } from './panesections.ts'
import type { SectionFlags } from './panesections.ts'
import { GUTTER, RADIUS } from './tokens.ts'
import { waitingItems } from './waiting.ts'
import type { WaitingItem } from './waiting.ts'

export type CardId = 'title' | 'system' | 'needs' | 'pending' | 'blocked' | 'off' | 'done'
export type CardDef = { id: CardId; title: string; /** The saved-flag id; '' for the Title card, which has none. */ flag: string; openByDefault: boolean; tone: 'infoc' | 'warnc' | 'okc' | 's' | 'm' }

/** The declared order. */
export const PLAN_CARDS: readonly CardDef[] = [
  { id: 'title', title: 'Title', flag: '', openByDefault: true, tone: 'm' },
  { id: 'system', title: 'System', flag: 'pc-system', openByDefault: false, tone: 'm' },
  { id: 'needs', title: 'Needs me', flag: 'pc-needs', openByDefault: true, tone: 'infoc' },
  { id: 'pending', title: 'Pending', flag: 'pc-pending', openByDefault: true, tone: 's' },
  { id: 'blocked', title: 'Blocked', flag: 'pc-blocked', openByDefault: false, tone: 'warnc' },
  { id: 'off', title: 'Off plan', flag: 'pc-off', openByDefault: true, tone: 's' },
  { id: 'done', title: 'Done', flag: 'pc-done', openByDefault: false, tone: 'okc' },
]

/** The flags after one card's toggle: exactly that card's entry changes. */
export const toggledCard = (flags: SectionFlags, id: CardId): Record<string, boolean> => {
  const flag = PLAN_CARDS.find(c => c.id === id)?.flag ?? ''
  return flag === '' ? { ...flags } : toggledSections(flags, flag)
}

/** The buttons of a row, in their fixed grid order (top row: done, remove; bottom row: explain, retry). */
export type RowAction = 'done' | 'remove' | 'explain' | 'retry'
export const ACTION_ORDER: readonly RowAction[] = ['done', 'remove', 'explain', 'retry']
export const ACTION_GLYPH: Record<RowAction, string> = { done: '✓', remove: '✕', explain: '?', retry: '↻' }
export const ACTION_HINT: Record<RowAction, string> = {
  done: 'mark done',
  remove: 'cancel and remove from the plan',
  explain: 'ask the session to explain this or ask you',
  retry: 'set back to todo and ask the session to dispatch it again',
}

export type CardEntry =
  | { kind: 'need'; item: WaitingItem; actions: RowAction[] }
  | { kind: 'plan'; row: PlanRow; actions: RowAction[] }

export type CardModel = { def: CardDef; count: number; open: boolean; entries: CardEntry[]; /** The System card's line. */ text: string }

const planActions = (r: PlanRow, list: 'pending' | 'blocked' | 'off' | 'done'): RowAction[] => {
  if (list === 'pending' || list === 'done') return []
  const out: RowAction[] = []
  if (r.state !== 'done') out.push('done')
  out.push('remove', 'explain')
  if (r.state !== 'todo' && r.state !== 'done') out.push('retry')
  return out
}

/** Rows by card. A blocked row that waits on Jesse lives in Needs me only; running rows lead Pending (they are not finished). */
export function cardRows(shown: PlanShown): { pending: PlanRow[]; blocked: PlanRow[]; off: PlanRow[]; done: PlanRow[] } {
  const v = shown.view
  const waitingIds = new Set(v.waiting.map(r => r.id))
  return {
    pending: [...shown.running, ...v.todo],
    blocked: v.blocked.filter(r => !waitingIds.has(r.id)),
    off: v.off,
    done: shown.done,
  }
}

/** The whole stack as data: every card, in order, with its count, open state and entries (entries are listed only for an open card). */
export function buildCards(shown: PlanShown, flags: SectionFlags, o: { youLines: readonly string[]; systemText: string }): CardModel[] {
  const rows = cardRows(shown)
  const asks = waitingItems(shown.view.waiting, o.youLines)
  const sys = o.systemText.trim()
  const sysCount = sys === '' ? 0 : sys.split(/\s+·\s+/).length
  const counts: Record<CardId, number> = { title: 0, system: sysCount, needs: asks.length, pending: rows.pending.length, blocked: rows.blocked.length, off: rows.off.length, done: rows.done.length }
  return PLAN_CARDS.map(def => {
    const open = def.flag === '' ? true : isSectionOpen(flags, def.flag)
    let entries: CardEntry[] = []
    if (open) {
      if (def.id === 'needs') entries = asks.map(item => ({ kind: 'need', item, actions: item.id === '' ? ['explain'] : [...ACTION_ORDER] }))
      else if (def.id === 'pending' || def.id === 'blocked' || def.id === 'off' || def.id === 'done') entries = rows[def.id].map(row => ({ kind: 'plan', row, actions: planActions(row, def.id as 'pending' | 'blocked' | 'off' | 'done') }))
    }
    return { def, count: counts[def.id], open, entries, text: def.id === 'system' ? (sys === '' ? 'System: checking' : sys) : '' }
  })
}

// ---------------------------------------------------------------------------
// Drawing

const text = (x: number, y: number, s: string, cls: string, size: number, extra = ''): string =>
  `<text class="${cls}" x="${n(x)}" y="${n(y)}" font-family="${FONT}" font-size="${size}"${extra}>${xml(s)}</text>`

export type CardDrawing = { svg: string; height: number }
export const CARD_HEAD_H = 34

/** A card header: the name and the count on the card's tile. `joined` is true when rows follow (the tile runs on under it, square at the bottom). */
export function cardHeadSvg(W: number, def: CardDef, count: number, joined: boolean): CardDrawing {
  const label = def.title.toUpperCase()
  const cls = count > 0 ? def.tone : 'm'
  const body = `<rect class="tile" x="0" y="0" width="${n(W)}" height="${CARD_HEAD_H + (joined ? RADIUS : 0)}" rx="${RADIUS}"/>${text(GUTTER, 22, label, cls, 13, ' font-weight="700" letter-spacing=".6"')}${text(GUTTER + Math.ceil(textWidth(label, 13)) + 22, 22, String(count), count > 0 ? cls : 's', 13, ' font-weight="700"')}`
  return { svg: doc(W, CARD_HEAD_H, body), height: CARD_HEAD_H }
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
