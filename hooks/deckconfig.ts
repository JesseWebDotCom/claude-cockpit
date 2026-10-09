// Cockpit 0.4.0 (the Deck), panel 7: layout and options. The layout is auto, compact, wide or mini: mini is a summary of at
// most 8 rows seated inline above the prompt; wide is two columns from 110 columns, docked. A `motion` option turns the
// animation off, a `panels` option sets the order and which panels show, and a panel with nothing to show takes no room.
// `/cockpit layout ...`, `/cockpit reset`, `/cockpit deck`, `/cockpit motion ...` and `/cockpit panels ...` are parsed here.
// The option names and the layout rule follow claude-flightdeck (MIT; see NOTICE). Pure.

export type DeckPanel = 'vitals' | 'gate' | 'agents' | 'receipt' | 'log'
export const PANELS: readonly DeckPanel[] = ['vitals', 'gate', 'agents', 'receipt', 'log']
export type Layout = 'auto' | 'compact' | 'wide' | 'mini'
export type ShownLayout = 'compact' | 'wide' | 'mini'
export const LAYOUTS: readonly Layout[] = ['auto', 'compact', 'wide', 'mini']

/** The most rows the mini layout may take. */
export const MINI_ROWS = 8
/** Docked panes go two columns from this many columns. */
export const WIDE_FROM = 110
/** A forced `wide` still needs this much room (two columns of 40); narrower falls back to compact. */
export const WIDE_MIN = 80

export type DeckConfig = { layout: Layout; motion: boolean; panels: DeckPanel[]; maxCards: number; openOnStart: boolean; statusLine: boolean; consult: RegExp }

const isPanel = (s: string): s is DeckPanel => (PANELS as readonly string[]).includes(s)

/** A panel list from "gate, vitals" style text: known names only, no repeats; null when nothing in it is a panel. */
export function parsePanels(text: string): DeckPanel[] | null {
  const list = text.split(/[\s,]+/).map(s => s.trim().toLowerCase()).filter(isPanel)
  return list.length > 0 ? [...new Set(list)] : null
}

const safeRegExp = (source: string, fallback: string): RegExp => {
  try {
    return new RegExp(source !== '' ? source : fallback, 'i')
  } catch {
    return new RegExp(fallback, 'i')
  }
}

/** The plugin's `/config` values, read leniently: anything malformed falls back to its default. */
export function parseDeckConfig(o: Readonly<Record<string, unknown>>): DeckConfig {
  const str = (k: string, d: string): string => (typeof o[k] === 'string' && o[k] !== '' ? (o[k] as string) : d)
  const bool = (k: string, d: boolean): boolean => (typeof o[k] === 'boolean' ? (o[k] as boolean) : d)
  const layout = str('layout', 'auto')
  const max = typeof o.maxCards === 'number' && Number.isFinite(o.maxCards) ? Math.round(o.maxCards) : 3
  return {
    layout: (LAYOUTS as readonly string[]).includes(layout) ? (layout as Layout) : 'auto',
    motion: str('motion', 'while-active') !== 'off',
    panels: parsePanels(str('panels', PANELS.join(','))) ?? [...PANELS],
    maxCards: Math.min(6, Math.max(1, max)),
    openOnStart: bool('deckOnStart', false),
    statusLine: bool('statusLine', true),
    consult: safeRegExp(str('consultPattern', ''), 'advisor|architect|consult'),
  }
}

/** What commands changed for this session (null = not overridden, the option stands). */
export type DeckView = { layout: Layout | null; motion: boolean | null; panels: DeckPanel[] | null }
export const emptyView = (): DeckView => ({ layout: null, motion: null, panels: null })

export function normalizeView(stored: unknown): DeckView {
  const o = typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {}
  const panels = Array.isArray(o.panels) ? parsePanels(o.panels.filter((p): p is string => typeof p === 'string').join(',')) : null
  return { layout: typeof o.layout === 'string' && (LAYOUTS as readonly string[]).includes(o.layout) ? (o.layout as Layout) : null, motion: typeof o.motion === 'boolean' ? o.motion : null, panels }
}

export const effectiveMotion = (c: DeckConfig, v: DeckView): boolean => v.motion ?? c.motion
export const effectivePanels = (c: DeckConfig, v: DeckView): DeckPanel[] => v.panels ?? c.panels
export const effectiveLayout = (c: DeckConfig, v: DeckView): Layout => v.layout ?? c.layout

/**
 * The layout actually drawn. `auto`: mini when the pane sits inline above the prompt, wide from 110 columns when docked,
 * compact otherwise. A forced mini, compact or wide is honored (wide needs WIDE_MIN columns).
 */
export function resolveLayout(layout: Layout, placement: 'dock' | 'inline', columns: number): ShownLayout {
  if (layout === 'mini' || layout === 'compact') return layout
  if (layout === 'wide') return columns >= WIDE_MIN ? 'wide' : 'compact'
  return placement === 'inline' ? 'mini' : columns >= WIDE_FROM ? 'wide' : 'compact'
}

export type PanelFacts = { checks: number; cards: number; isRunning: boolean; hasReceipt: boolean; logLines: number }

/** True when a panel has nothing to show yet (it then takes no room). The vitals always have something. */
export function isEmptyPanel(p: DeckPanel, f: PanelFacts): boolean {
  switch (p) {
    case 'vitals':
      return false
    case 'gate':
      return f.checks === 0
    case 'agents':
      return f.cards === 0
    case 'receipt':
      return !f.isRunning && !f.hasReceipt
    case 'log':
      return f.logLines === 0
  }
}

/** The panels to draw: the chosen order, less the empty ones. */
export const visiblePanels = (order: readonly DeckPanel[], f: PanelFacts): DeckPanel[] => order.filter(p => !isEmptyPanel(p, f))

// ---------------------------------------------------------------- commands

export type DeckCommand =
  | { cmd: 'layout'; layout: Layout | null }
  | { cmd: 'reset' }
  | { cmd: 'deck'; action: 'open' | 'close' | 'toggle' }
  | { cmd: 'motion'; motion: boolean | null }
  | { cmd: 'panels'; panels: DeckPanel[] | 'all' | null }

/** The deck's `/cockpit` verbs: `layout auto|compact|wide|mini`, `reset`, `deck [open|close]`, `motion on|off`, `panels <list>|all`. Anything else: null. */
export function parseDeckArgs(args: string): DeckCommand | null {
  const [word = '', ...rest] = args.trim().split(/\s+/)
  const w = word.toLowerCase()
  const arg = (rest[0] ?? '').toLowerCase()
  if (w === 'layout') return { cmd: 'layout', layout: (LAYOUTS as readonly string[]).includes(arg) ? (arg as Layout) : null }
  if (w === 'reset') return { cmd: 'reset' }
  if (w === 'deck') return { cmd: 'deck', action: arg === 'open' || arg === 'close' ? arg : 'toggle' }
  if (w === 'motion') return { cmd: 'motion', motion: arg === 'on' ? true : arg === 'off' ? false : null }
  if (w === 'panels') return { cmd: 'panels', panels: arg === 'all' ? 'all' : parsePanels(rest.join(' ')) }
  return null
}

export const DECK_USAGE = 'Usage: /cockpit layout auto|compact|wide|mini, /cockpit reset, /cockpit deck [open|close], /cockpit motion on|off, /cockpit panels vitals,gate,agents,receipt,log|all'
