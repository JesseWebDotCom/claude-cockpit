// A short confetti burst when the plan's last step is done. Pure: the frame number in, coloured rows of characters out.
export const CONFETTI_MS = 4000
export const CONFETTI_FRAME_MS = 140
export const CONFETTI_ROWS = 3

const GLYPHS = ['*', '•', '✦', '▪', '~', '·']
const COLORS = ['red', 'yellow', 'green', 'cyan', 'magenta', 'blue'] as const

export type ConfettiCell = { text: string; color: (typeof COLORS)[number] | undefined }

// A small integer hash so each column has its own steady pattern; no random numbers, so a frame is reproducible.
function hash(n: number): number {
  let x = (n + 0x9e3779b9) | 0
  x = Math.imul(x ^ (x >>> 16), 0x45d0f3b)
  x = Math.imul(x ^ (x >>> 16), 0x45d0f3b)
  return (x ^ (x >>> 16)) >>> 0
}

/** One row of cells, runs of the same colour joined. Particles fall one row per two frames and thin out near the end. */
export function confettiRow(row: number, frame: number, cols: number, totalFrames: number): ConfettiCell[] {
  const fade = Math.max(0, 1 - frame / totalFrames)
  const cells: ConfettiCell[] = []
  for (let x = 0; x < cols; x++) {
    const h = hash(x * 7919)
    const speed = 1 + (h % 3)
    const phase = (h >>> 3) % (CONFETTI_ROWS * 4)
    const y = Math.floor((frame * speed) / 3 + phase) % (CONFETTI_ROWS * 4)
    const lit = y === row && (h >>> 9) % 100 < 70 * fade + 5
    const cell: ConfettiCell = lit
      ? { text: GLYPHS[(h >>> 5) % GLYPHS.length]!, color: COLORS[(h >>> 11) % COLORS.length] }
      : { text: ' ', color: undefined }
    const last = cells[cells.length - 1]
    if (last !== undefined && last.color === cell.color && last.color === undefined) last.text += cell.text
    else cells.push(cell)
  }
  return cells
}

/** Rows for a frame, or [] once the burst is over or has not started. */
export function confettiRows(startMs: number | null, nowMs: number, cols: number): ConfettiCell[][] {
  if (startMs === null || nowMs < startMs || nowMs - startMs >= CONFETTI_MS) return []
  const frame = Math.floor((nowMs - startMs) / CONFETTI_FRAME_MS)
  const total = Math.floor(CONFETTI_MS / CONFETTI_FRAME_MS)
  return Array.from({ length: CONFETTI_ROWS }, (_, r) => confettiRow(r, frame, Math.max(10, Math.min(cols, 200)), total))
}

/** True the moment a plan goes from not finished to finished; the first look at a plan only records it. */
export function justFinished(prevDone: boolean | null, nowDone: boolean): boolean {
  return prevDone === false && nowDone
}
