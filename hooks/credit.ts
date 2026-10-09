// COCKPIT-32: the two credit icons of the status bar's middle row: a cloud (the cloud sessions' credit) and a coin (the API credit). Pure.
// What the Cockpit can know without calling a billing API: the pool rows it already reads (cloud expiry, the API spend against its limit)
// and the outage judge of COCKPIT-31 (a crew pane showing a credit or quota error). A real balance is never invented: an icon shows a state only,
// and an unreadable one is grey with "unknown", never hidden.

import type { PoolRow } from './pools.ts'
import type { Outage } from './outage.ts'
import { LEVEL_COLOR } from './system.ts'
import type { Level } from './system.ts'
import type { GlyphKind } from './glyphs.ts'

export type CreditState = 'ok' | 'low' | 'out' | 'unknown'
export type CreditIcon = { kind: GlyphKind; id: 'cloud' | 'api'; state: CreditState; level: Level; hex: string; tip: string }

const LEVEL_OF: Record<CreditState, Level> = { ok: 'green', low: 'amber', out: 'red', unknown: 'grey' }
const WORD: Record<CreditState, string> = { ok: 'ok', low: 'low', out: 'out', unknown: 'unknown' }
const RED = '#F85149'
const AMBER = '#F0A500'

// One pool row to a state: not readable is unknown; dimmed (exhausted or expired) is out; an amber or red meter is low.
export function stateOfRow(row: PoolRow | undefined): CreditState {
  if (row === undefined || row.isMuted) return 'unknown'
  if (row.dim) return 'out'
  const hex = row.meters[0]?.hex
  const ratio = row.meters[0]?.ratio
  if (row.id === 'api' && ratio !== null && ratio !== undefined && ratio >= 1) return 'out'
  return hex === RED || hex === AMBER ? 'low' : 'ok'
}

const worse = (a: CreditState, b: CreditState): CreditState => {
  const rank: Record<CreditState, number> = { unknown: 0, ok: 1, low: 2, out: 3 }
  return rank[b] > rank[a] ? b : a
}

export function creditIcons(rows: readonly PoolRow[], outages: readonly { kind: string; outage: Outage | null }[], label = 'API credit'): CreditIcon[] {
  const hit = (kinds: readonly string[], id: Outage['id']): boolean => outages.some(o => o.outage !== null && o.outage.id === id && kinds.includes(o.kind))
  const make = (kind: GlyphKind, id: 'cloud' | 'api', name: string, base: CreditState, kinds: readonly string[]): CreditIcon => {
    // A crew member reporting the error is "out" (credit) or "low" (limit); a reading with no report is the pool's own state.
    let state = base
    if (hit(kinds, 'credit')) state = 'out'
    else if (hit(kinds, 'quota')) state = worse(state, 'low')
    const level = LEVEL_OF[state]
    return { kind, id, state, level, hex: LEVEL_COLOR[level], tip: name + ': ' + WORD[state] }
  }
  return [
    make('cloud', 'cloud', 'Cloud credit', stateOfRow(rows.find(r => r.id === 'cloud')), ['cloud']),
    make('coin', 'api', label, stateOfRow(rows.find(r => r.id === 'api')), ['api']),
  ]
}
