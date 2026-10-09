// A connector drawn on the SURFACE's own frame clock (Cockpit 0.4.0, the Deck). Packets travel along it while `active`;
// at rest it is a plain dim line. Only this region redraws: the deck does not. It imports nothing at run time (a surface
// module stands alone); the rules it follows are in motion.ts and tests/deck.test.ts checks the two agree.
// Adapted from claude-flightdeck's rail.tsx (MIT, Copyright (c) 2026 Stephen Casella; see NOTICE).
import type { ClientModule } from 'claude-code'

type Props = {
  active: boolean
  width: number
  color: string
  dim: string
  /** Cells where a branch drops; the rest of the line is a plain rule. */
  marks: number[]
  /** Draw a merge mark instead of a branch mark. */
  isMerge: boolean
}

type Ref = { phase: number; active: boolean }
type State = { ref: Ref }

const STEP_MS = 110
const GAP = 24

const Rail: ClientModule<Props, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const ref: Ref = surface.state?.ref ?? { phase: 0, active: props.active }
  ref.active = props.active
  if (surface.state === undefined) {
    surface.setState({ ref })
    surface.every(STEP_MS, () => {
      // Resting rails never redraw; only a moving one asks for a frame.
      if (ref.active) {
        ref.phase += 1
        surface.setState({ ref })
      }
    })
  }

  const width = Math.max(1, surface.columns > 0 ? surface.columns : props.width)
  const cells = Array.from({ length: width }, () => '\u2500')
  for (const m of props.marks) if (m >= 0 && m < width) cells[m] = props.isMerge ? '\u2534' : '\u252c'

  if (!props.active) return Box({ children: [Text({ color: props.dim, children: [cells.join('')] })] })

  const lit = new Map<number, string>()
  const span = width + GAP
  for (let base = 0; base < span; base += GAP) {
    const head = (base + ref.phase) % span
    if (head < width) lit.set(head, '\u25cf')
    if (head - 1 >= 0 && head - 1 < width) lit.set(head - 1, '\u2022')
  }
  // Runs, not cells: consecutive cells of one kind share one Text, a handful of nodes a frame.
  const runs: { text: string; isLit: boolean }[] = []
  cells.forEach((ch, i) => {
    const isLit = lit.has(i)
    const last = runs[runs.length - 1]
    const glyph = lit.get(i) ?? ch
    if (last !== undefined && last.isLit === isLit) last.text += glyph
    else runs.push({ text: glyph, isLit })
  })
  return Box({ children: runs.map(r => Text({ color: r.isLit ? props.color : props.dim, bold: r.isLit, children: [r.text] })) })
}

export default Rail
