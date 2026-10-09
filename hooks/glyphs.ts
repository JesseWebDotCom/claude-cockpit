// The four health glyphs (cockpit 0.8.0, COCKPIT-28): a chip for CPU, a RAM stick for memory, a drive for disk, a graphics card for GPU. ONE definition:
// the status bar's icons, the System card header and the gauge rows of the open card all draw these same paths (`glyphFragment`), only the size and the
// colour differ. Pure strings, no mods API; tests/cockpit28.test.ts.
//
// Each glyph is drawn on a 24 x 24 grid with a 1.7 stroke and no fill, so it reads at 16 to 20 px; the colour is the health level's hex.

/** COCKPIT-40: the tree connectors that mark a subagent as a child of its owner (one definition): "├ " for every child but the last, "└ " for the last. */
export const TREE_MID = '\u251c '
export const TREE_LAST = '\u2514 '
export const treeOf = (isLast: boolean): string => (isLast ? TREE_LAST : TREE_MID)

export type GlyphKind = 'cpu' | 'memory' | 'disk' | 'gpu' | 'cloud' | 'coin' | 'spark' | 'prompt'

export const GLYPH_KINDS: readonly GlyphKind[] = ['cpu', 'memory', 'disk', 'gpu']
/** COCKPIT-32: the two credit glyphs of the status bar's middle row (drawn by the same builder). */
export const CREDIT_KINDS: readonly GlyphKind[] = ['cloud', 'coin']

/** The path data of each glyph, on the 24 x 24 grid. */
export const GLYPH_PATHS: Record<GlyphKind, string> = {
  // A chip: the die, a smaller core, three pins on each side.
  cpu: 'M8.5 6.5h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM10.5 10.5h3v3h-3zM9.5 3v3.5M12 3v3.5M14.5 3v3.5M9.5 17.5V21M12 17.5V21M14.5 17.5V21M3 9.5h3.5M3 12h3.5M3 14.5h3.5M17.5 9.5H21M17.5 12H21M17.5 14.5H21',
  // A RAM stick: the board, three memory chips, the gold fingers along the bottom edge.
  memory: 'M3.5 6.5h17a1 1 0 0 1 1 1v8.5h-19V7.5a1 1 0 0 1 1-1zM5.5 9.5h3.5v3.5H5.5zM10.3 9.5h3.5v3.5h-3.5zM15.1 9.5h3.5v3.5h-3.5zM5 16v2.5M8 16v2.5M11 16v2.5M14 16v2.5M17 16v2.5M20 16v2.5',
  // A drive: the case, the seam, the activity light and the label slot.
  disk: 'M5 4.5h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2zM3 13.5h18M6.5 16.5h.01M10 16.5h7',
  // A graphics card: the board with its fan, the bracket at the left and the connector underneath.
  // A cloud: one outline.
  cloud: 'M7 18.5h10.5a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.5 9.6A4.5 4.5 0 0 0 7 18.5z',
  // A coin: the disc, the rim and a centre bar.
  coin: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 7v10M9.5 9.5h4a1.75 1.75 0 0 1 0 3.5h-3a1.75 1.75 0 0 0 0 3.5h4',
  // COCKPIT-41: generic marks for the services (never a vendor logo): a six-ray asterisk for the Claude plan, a terminal prompt for Codex.
  spark: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9',
  prompt: 'M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 17V7A1.5 1.5 0 0 1 4 5.5zM6.5 10l3 2.5-3 2.5M12 15h5',
  gpu: 'M5 6.5h16.5v9.5H5zM3 5v13M9.5 11.25a2.75 2.75 0 1 0 5.5 0a2.75 2.75 0 1 0-5.5 0M12.25 8.5v5.5M9.5 11.25h5.5M8 16v2.5h9V16',
}

/**
 * COCKPIT-44: the text form of each glyph, for the one slot that takes only a string (the status line under the input box; the host draws no
 * Svg there). The same four kinds as the drawn icons, so adding a kind here and in GLYPH_PATHS keeps one list. Not a second icon set: a name tag.
 */
export const TEXT_GLYPH: Record<GlyphKind, string> = { cpu: 'CPU', memory: 'MEM', disk: 'DISK', gpu: 'GPU', cloud: 'CLOUD', coin: 'API', spark: 'CLAUDE', prompt: 'CODEX' }

/** The word for each glyph, for an accessible name. */
export const GLYPH_WORD: Record<GlyphKind, string> = { cpu: 'CPU', memory: 'Memory', disk: 'Disk', gpu: 'GPU', cloud: 'Cloud credit', coin: 'API credit', spark: 'Claude plan', prompt: 'Codex' }

const r = (v: number): number => Math.round(v * 100) / 100

/** The glyph as an SVG fragment: a group placed at (x, y), `size` px square, stroked in `hex`. The SAME fragment everywhere. */
export function glyphFragment(kind: GlyphKind, hex: string, x: number, y: number, size: number): string {
  const s = r(size / 24)
  return `<g transform="translate(${r(x)} ${r(y)}) scale(${s})" fill="none" stroke="${hex}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${GLYPH_PATHS[kind]}"/></g>`
}

/** One whole icon as its own small drawing (the band): `w` x `h` px with the glyph `size` px in the middle, a title for a tooltip. */
export function glyphDoc(kind: GlyphKind, hex: string, w: number, h: number, size: number, title: string): string {
  const esc = title.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${r(w)}" height="${r(h)}" viewBox="0 0 ${r(w)} ${r(h)}"><title>${esc}</title>${glyphFragment(kind, hex, (w - size) / 2, (h - size) / 2, size)}</svg>`
}

// COCKPIT-41: ONE icon per service, used by the bar's credit row (COCKPIT-42: drawn as an SVG) and by the Main status card's rows, both through `glyphFragment`. Four distinct SHAPES, so the services never depend on colour alone. Generic marks drawn by the mod: no vendor logo is embedded or redrawn.
export type ServiceKey = 'claude' | 'cloud' | 'api' | 'codex' | 'local'
export const SERVICE_GLYPH: Record<ServiceKey, GlyphKind> = { claude: 'spark', cloud: 'cloud', api: 'coin', codex: 'prompt', local: 'gpu' }
