// COCKPIT-67: the two buttons on a "Waiting on me" row write to the plan file the way tools/plan-set does. Pure text in, text out; the caller
// reads the file, applies one of these, and writes it back atomically (a temp file, then a rename). Each function touches exactly one item (and
// the `updated` stamp and the history tail); every other key and item is kept as it was. null means the item is not in the file.

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v)

const same = (a: unknown, id: string): boolean => typeof a === 'string' && a.trim().toLowerCase() === id.trim().toLowerCase()

function load(text: string): { data: Obj; items: unknown[] } | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!isObj(raw) || !Array.isArray(raw.items)) return null
  return { data: raw, items: raw.items }
}

const history = (data: Obj, entry: Obj): void => {
  const h = Array.isArray(data.history) ? data.history : []
  data.history = [...h, entry]
}

const dump = (data: Obj): string => JSON.stringify(data, null, 2) + '\n'

/** What Undo needs to put a removed item back where it was. */
export type RemovedItem = { id: string; item: Obj; index: number }

/** Mark one item done: state done, doneAt, a history line. */
export function markItemDone(text: string, id: string, iso: string, say = 'Marked done from the Cockpit panel'): string | null {
  const l = load(text)
  if (l === null) return null
  const it = l.items.find(x => isObj(x) && same(x.id, id))
  if (!isObj(it)) return null
  it.state = 'done'
  it.doneAt = iso
  l.data.updated = iso
  history(l.data, { at: iso, id: String(it.id), state: 'done', say })
  return dump(l.data)
}

/** Remove one item from the list (it leaves every group); returns the new text and what Undo needs. */
export function removeItem(text: string, id: string, iso: string, say = 'Removed from the plan from the Cockpit panel'): { text: string; removed: RemovedItem } | null {
  const l = load(text)
  if (l === null) return null
  const index = l.items.findIndex(x => isObj(x) && same(x.id, id))
  const it = l.items[index]
  if (index < 0 || !isObj(it)) return null
  l.items.splice(index, 1)
  l.data.updated = iso
  history(l.data, { at: iso, id: String(it.id), state: 'cancelled', say })
  return { text: dump(l.data), removed: { id: String(it.id), item: it, index } }
}

/** Undo a removal: the item goes back at its old place. null when the file now has an item with that id (nothing is overwritten). */
export function restoreItem(text: string, r: RemovedItem, iso: string): string | null {
  const l = load(text)
  if (l === null) return null
  if (l.items.some(x => isObj(x) && same(x.id, r.id))) return null
  l.items.splice(Math.min(r.index, l.items.length), 0, r.item)
  l.data.updated = iso
  history(l.data, { at: iso, id: r.id, state: String(r.item.state ?? 'todo'), say: 'Put back on the plan from the Cockpit panel' })
  return dump(l.data)
}

/** 0.22.0, the retry button: flip one item back to todo and clear what made it stuck (start and done times, and an owner that is Jesse himself, since
 *  a todo item owned by the person is waiting on nobody). Every other key and item is kept. null when the item is not in the file. */
export function retryItem(text: string, id: string, iso: string, say = 'Set back to todo from the Cockpit panel, to be dispatched again'): string | null {
  const l = load(text)
  if (l === null) return null
  const it = l.items.find(x => isObj(x) && same(x.id, id))
  if (!isObj(it)) return null
  it.state = 'todo'
  delete it.startedAt
  delete it.doneAt
  if (typeof it.owner === 'string' && /^(jesse|you|owner)$/i.test(it.owner.trim())) it.owner = ''
  l.data.updated = iso
  history(l.data, { at: iso, id: String(it.id), state: 'todo', say })
  return dump(l.data)
}

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim()

/** The question-mark button: the line sent to the main session. It asks for a plain-words explanation, or a question through AskUserQuestion when a decision is needed. */
export const explainMessage = (id: string, title: string, ask: string): string =>
  squash('Explain this plan item to me in plain words' + (id !== '' ? ' (' + id + ')' : '') + ': ' + title + (ask !== '' && ask !== title ? ' - ' + ask : '') +
    '. If it needs a decision from me, ask me with the AskUserQuestion tool (the normal question mode) instead of a prose question.')

/** The retry button: the one-line request sent to the main session after the item is back at todo. */
export const retryMessage = (id: string, title: string): string => squash('Re-dispatch plan item ' + id + ' (' + title + '): I set it back to todo, please send it out again and update the plan.')
