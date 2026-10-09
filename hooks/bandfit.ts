// The bar above the prompt must fit the room the engine gives it, whatever the session is doing (cockpit v12).
//
// The host gives the band `maxRows` rows ("in fullscreen, what the bottom slot has left above the prompt; capped at half
// the terminal"). While a turn runs the slot also holds the spinner, queued prompts and the engine's own band content, so
// the room shrinks and grows with the turn: a tree taller than `maxRows` is shown in a scrolling window (the engine owns
// the scroll, and may leave it at the END of the tree) with an "n more" row, which can hide the bar entirely while a turn
// runs and bring it back when the session is idle. So the bar picks the tallest of three layouts that fits, and
// never draws the engine's own content beside it unless both fit:
//
//   full     progress line, usage strip, crew line   (the usual bar; 5 rows)
//   compact  progress line, crew line                (3 rows)
//   line     ONE row of text and buttons             (1 row)
//
// Pure: no mods API, no I/O. Unit tested in tests/bandfit.test.ts.

export const BAND_ROW_PX = 20

// Rows a drawing of `px` height takes: whole rows, rounded up (a 28 px line is two rows, a 22 px strip two).
export const svgRows = (px: number): number => (Number.isFinite(px) && px > 0 ? Math.ceil(px / BAND_ROW_PX) : 1)

export type BandLevel = 'full' | 'compact' | 'line'

export const PROGRESS_ROWS = svgRows(28)
// COCKPIT-44: the credit line (20 px) is one row.
export const STRIP_ROWS = svgRows(20)
// COCKPIT-44: the crew line is gone (its parts moved to the right of the progress row), so it takes no row.
export const CREW_ROWS = 0
export const LEVEL_ROWS: Record<BandLevel, number> = { full: PROGRESS_ROWS + STRIP_ROWS + CREW_ROWS, compact: PROGRESS_ROWS + CREW_ROWS, line: 1 }

export type BandFit = {
  level: BandLevel
  // The engine's own band content (`next(e)`) may be drawn under the bar: only when the bar and it both fit.
  embedTheirs: boolean
  // An opened meter card may be drawn (full only, with room for its rows).
  allowCard: boolean
}

// `maxRows`: the host's rows for the band (undefined, 0 or not a number: unknown, draw the full bar). `theirsRows`: rows the
// engine's own content takes. `cardRows`: rows of an opened meter card, 0 when none is open.
export function bandFit(maxRows: number | undefined, theirsRows: number, cardRows: number): BandFit {
  if (maxRows === undefined || !Number.isFinite(maxRows) || maxRows <= 0) return { level: 'full', embedTheirs: true, allowCard: true }
  const theirs = Math.max(0, Math.ceil(theirsRows))
  // The engine's content goes in only if even the one-row bar fits beside it.
  const embedTheirs = theirs === 0 || theirs + LEVEL_ROWS.line <= maxRows
  const room = embedTheirs ? maxRows - theirs : maxRows
  const level: BandLevel = room >= LEVEL_ROWS.full ? 'full' : room >= LEVEL_ROWS.compact ? 'compact' : 'line'
  return { level, embedTheirs, allowCard: level === 'full' && room >= LEVEL_ROWS.full + cardRows }
}

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }

// A rough count of the rows a tree takes: a Box in a column sums its children, in a row takes its tallest; a Text or a
// Button is a row; an Svg is its height in rows. Unknown elements count as one row. Only used to decide how much of the
// engine's own content to leave room for.
export function estimateRows(tree: unknown): number {
  if (tree === null || tree === undefined || typeof tree !== 'object') return 0
  const n = tree as Node
  const kids = Array.isArray(n.children) ? n.children : []
  if (n.type === 'Svg') return svgRows(Number(n.props?.height))
  if (n.type === 'Text' || n.type === 'Button') return 1
  if (kids.length === 0) return n.type === 'Box' ? 0 : 1
  const rows = kids.map(estimateRows)
  const isRow = n.props?.flexDirection === 'row' || n.props?.flexDirection === 'row-reverse'
  return isRow ? Math.max(0, ...rows) : rows.reduce((a, b) => a + b, 0)
}

// The line a band log gets when what the bar decided changed, for the next time it flickers and nobody was watching.
export function bandLogLine(o: { atIso: string; level: BandLevel | 'yield'; maxRows: number | undefined; theirsRows: number; embedded: boolean; hostWorking: boolean; modBusy: boolean; columns: number; px: number; crewWorking: number }): string {
  return [o.atIso, o.level, 'maxRows=' + (o.maxRows ?? 'none'), 'theirs=' + o.theirsRows + (o.embedded ? '(in)' : '(out)'), 'hostWorking=' + o.hostWorking, 'modBusy=' + o.modBusy, 'cols=' + o.columns, 'px=' + o.px, 'crewWorking=' + o.crewWorking].join('\t') + '\n'
}
