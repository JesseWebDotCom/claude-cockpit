// Cockpit 0.4.0 (the Deck), panel 4: the main vitals. The model, effort, permission mode and request count of THIS
// session's main loop; a context gauge with a mark for every compaction (`session.compact`); the session cost; and the
// plan's rate-limit windows, which come from limits.ts (this file only formats a window it is handed, it reads no limit).
// Pure reducers. The box's content is adapted from claude-flightdeck's "main" panel (MIT; see NOTICE).

import { clamp, isObject, kTokens, prettyModel } from './deckfmt.ts'
import { liveWin, usedColor, winText } from './limits.ts'
import type { Win } from './limits.ts'

export type Main = { model: string; effort: string; mode: string; steps: number; isRunning: boolean }
export type Context = {
  pct: number | null
  tokens: number | null
  window: number
  costUsd: number | null
  compactions: number
  /** The context percent each compaction happened at, oldest first (the gauge's marks). */
  marks: number[]
}

export const emptyMain = (): Main => ({ model: '', effort: '', mode: '', steps: 0, isRunning: false })
export const emptyContext = (): Context => ({ pct: null, tokens: null, window: 0, costUsd: null, compactions: 0, marks: [] })

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

export function normalizeMain(stored: unknown): Main {
  const o = isObject(stored) ? stored : {}
  return { model: String(o.model ?? ''), effort: String(o.effort ?? ''), mode: String(o.mode ?? ''), steps: finite(o.steps) ? o.steps : 0, isRunning: o.isRunning === true }
}

/** The main loop's request starts: its model and effort are known now, before the first one finishes. */
export const onStep = (m: Main, s: { model: string; effort?: string | number }): Main => ({ ...m, model: s.model, effort: s.effort === undefined ? m.effort : String(s.effort), steps: m.steps + 1 })
export const onMode = (m: Main, mode: string | undefined): Main => (mode === undefined || mode === '' || mode === m.mode ? m : { ...m, mode })
export const onRunning = (m: Main, isRunning: boolean): Main => (m.isRunning === isRunning ? m : { ...m, isRunning })

/** The engine measured the context and the cost (`session.measure`). A null reading clears the number, it does not keep a stale one. */
export const onMeasure = (c: Context, e: { percent: number | null; tokens: number | null; window: number; costUsd: number | null }): Context => ({
  ...c,
  pct: e.percent !== null && finite(e.percent) ? clamp(e.percent, 0, 100) : null,
  tokens: e.tokens !== null && finite(e.tokens) ? e.tokens : null,
  window: finite(e.window) ? e.window : c.window,
  costUsd: e.costUsd !== null && finite(e.costUsd) ? e.costUsd : null,
})

/** The main conversation compacted: one more mark, at the percent the context stood at before it. */
export const onCompact = (c: Context): Context => ({ ...c, compactions: c.compactions + 1, marks: [...c.marks, c.pct ?? 0].slice(-12), pct: null, tokens: null })

/** Effort as 0 to 4 filled cells; numbers (a thinking budget) read as 4. */
export const effortCells = (effort: string): number => ({ low: 1, medium: 2, high: 3, xhigh: 4, max: 4 })[effort] ?? (/^\d+$/.test(effort) ? 4 : 0)

export type Gauge = { on: string; off: string; marks: string; hasMarks: boolean }

/**
 * A gauge `width` cells wide: filled cells and empty cells, and a second row with a `\u27f2` under the cell each compaction
 * happened at (the row is spaces when there are none, and `hasMarks` says whether to draw it).
 */
export function gaugeOf(pct: number, width: number, marks: readonly number[]): Gauge {
  const w = Math.max(1, Math.round(width))
  const full = clamp(Math.round((pct / 100) * w), 0, w)
  const row = Array.from({ length: w }, () => ' ')
  for (const m of marks) row[clamp(Math.floor((m / 100) * w), 0, w - 1)] = '\u27f2'
  return { on: '\u25b0'.repeat(full), off: '\u25b1'.repeat(w - full), marks: row.join(''), hasMarks: marks.length > 0 }
}

export type WinView = { label: string; used: number | null; color: string; text: string; gauge: { on: string; off: string } }

/** A rate-limit window as the deck draws it: its label, a 5-cell gauge, the colour limits.ts gives its percent. A reset window reads as unknown. */
export function windowView(w: Win, nowMs: number): WinView {
  const live = liveWin(w, nowMs)
  const full = live.used === null ? 0 : clamp(Math.round((live.used / 100) * 5), 0, 5)
  return {
    label: live.label,
    used: live.used,
    color: usedColor(live.used),
    text: winText(live),
    gauge: { on: '\u25b0'.repeat(full), off: '\u25b1'.repeat(5 - full) },
  }
}

export type VitalsView = {
  model: string
  isRunning: boolean
  effort: string
  effortFilled: number
  mode: string
  requests: number
  ctx: { pct: number; gauge: Gauge; tokensText: string; isHigh: boolean } | null
  /** Compactions this session, shown even while the gauge waits for the next measurement. */
  compactions: number
  cost: number | null
  windows: WinView[]
}

/** Everything the vitals box draws, from the stored pieces and the windows limits.ts gives. */
export function vitalsOf(i: { main: Main; ctx: Context; wins: readonly Win[]; nowMs: number; gaugeWidth: number }): VitalsView {
  const { main, ctx } = i
  return {
    model: prettyModel(main.model),
    isRunning: main.isRunning,
    effort: main.effort,
    effortFilled: effortCells(main.effort),
    mode: main.mode,
    requests: main.steps,
    ctx:
      ctx.pct === null
        ? null
        : {
            pct: Math.round(ctx.pct),
            gauge: gaugeOf(ctx.pct, i.gaugeWidth, ctx.marks),
            tokensText: ctx.tokens !== null && ctx.window > 0 ? `${kTokens(ctx.tokens)}/${kTokens(ctx.window)}` : '',
            isHigh: ctx.pct >= 80,
          },
    compactions: ctx.compactions,
    cost: ctx.costUsd,
    windows: i.wins.map(w => windowView(w, i.nowMs)),
  }
}
