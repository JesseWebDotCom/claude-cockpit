// Cockpit 0.4.0 (the Deck): the drawing. Native Box, Text and Button elements, coloured from the same tokens.ts palette the
// svg drawings use (ok, info, warn, err, text, muted, dim), so the deck and the crew panel read as one mod. No svg: the deck
// is plain cells and works on every surface.
//
// HOST RULE: every Button here is `Button({ key, label: <string>, ... })`, a string label and NO children. The real
// host refuses any other child. Colour is always a Text beside or inside a row, never a Button child (tests/cockpit16.test.ts scans
// this file too).
//
// Pure with respect to the host: it takes a `kit` (the host's Box, Text, Button) and returns a tree; tests hand it a fake kit.
// The panel arrangement, the card and swimlane rules and the mini summary are adapted from claude-flightdeck (MIT; see NOTICE).

import { agentsLayout, cardTitle, expandedOf, isMaxTokens, lanes, stateOf, titleLines, tokensText } from './agentcards.ts'
import type { AgentCard } from './agentcards.ts'
import { fmtStamp, fmtUsd, kTokens, prettyModel, shorten } from './deckfmt.ts'
import type { DeckPanel, ShownLayout } from './deckconfig.ts'
import { BUCKETS, cellOf, deciderOf, drill, gateSummary, strip, totalsText, verdictWord } from './gate.ts'
import type { Cell, Check, Tone } from './gate.ts'
import { LOG_EXPANDED, LOG_SHOWN, isProblem, logWindow } from './sessionlog.ts'
import type { LogLine } from './sessionlog.ts'
import { railActive, railKind, stillRail } from './motion.ts'
import type { Flow } from './motion.ts'
import { receiptText, runningText } from './turnreceipt.ts'
import { vitalsOf } from './vitals.ts'
import type { Deck } from './deckstate.ts'
import { lanesWorking } from './deckstate.ts'
import type { Palette } from './tokens.ts'
import type { Win } from './limits.ts'

type KitFn = (props: any) => any
export type DeckKit = { Box: KitFn; Text: KitFn; Button: KitFn }

/** What the deck needs that is not in the deck's own memory. */
export type DeckIn = {
  kit: DeckKit
  deck: Deck
  layout: ShownLayout
  /** The panels to draw, in order, empty ones already dropped. */
  panels: readonly DeckPanel[]
  /** Columns of the body. */
  width: number
  /** Rows the body may take (the mini layout never takes more than 8). */
  maxRows: number
  maxCards: number
  now: number
  /** The permission mode, for who decides ("classifier" in auto mode, else "you"). */
  mode: string
  wins: readonly Win[]
  /** Motion on, and what flows now. */
  motion: boolean
  flow: Flow
  pal: Palette
  /** The agent whose transcript is on screen (the log is filtered to it), or null. */
  viewedAgent: string | null
  /** Surface modules (rail.tsx, elapsed.tsx); null where the surface cannot draw them (a still line and a static time are drawn). */
  client: DeckClient | null
  act: DeckActions
}

export type DeckClient = {
  rail: (key: string, p: { active: boolean; width: number; color: string; dim: string; marks: number[]; isMerge: boolean }) => unknown
  clock: (key: string, p: { since: number; now: number; endAt: number | null; color: string }) => unknown
}

export type DeckActions = {
  expand: (id: string) => void
  gate: (b: 'file' | 'shell' | 'other') => void
  logOlder: () => void
  logNewer: () => void
  logToggle: () => void
}

export const toneColor = (t: Tone, pal: Palette): string => (t === 'allowed' ? pal.ok : t === 'decided' ? pal.info : t === 'pending' ? pal.warn : pal.err)

const logColor = (l: LogLine, pal: Palette): string =>
  isProblem(l) ? pal.err : l.kind === 'consult' ? pal.warn : l.kind === 'prompt' ? pal.text : l.kind === 'edit' ? pal.ok : l.kind === 'spawn' || l.kind === 'done' ? pal.info : pal.muted

const statusColor = (c: AgentCard, pal: Palette): string => (isMaxTokens(c) || c.status === 'failed' ? pal.err : c.status === 'done' ? pal.ok : c.status === 'stopped' ? pal.dim : pal.info)

/** Consecutive cells of one tone and dimness drawn as one Text (a handful of nodes, not one per check). */
function stripRuns(cells: readonly Cell[]): { text: string; tone: Tone; isDim: boolean }[] {
  const runs: { text: string; tone: Tone; isDim: boolean }[] = []
  for (const c of cells) {
    const last = runs[runs.length - 1]
    if (last !== undefined && last.tone === c.tone && last.isDim === c.isDim) last.text += c.glyph
    else runs.push({ text: c.glyph, tone: c.tone, isDim: c.isDim })
  }
  return runs
}

// ---------------------------------------------------------------------------

export function drawDeck(i: DeckIn): unknown {
  const { kit, deck, pal } = i
  const { Box, Text, Button } = kit
  const W = Math.max(40, i.width)
  const decider = deciderOf(i.mode)
  const running = deck.cards.filter(c => c.status === 'running')
  const laneCount = lanesWorking(deck)

  // ---- connectors and clocks: surface modules when the surface can draw them, still text otherwise
  const rail = (key: string, active: boolean, kind: 'turn' | 'agents' | 'lanes', width: number, marks: number[] = [], isMerge = false): unknown => {
    const color = kind === 'agents' ? pal.info : kind === 'lanes' ? pal.warn : pal.ok
    if (i.client === null || !i.motion) return Text({ key, color: pal.line, children: [stillRail(width, marks, isMerge)] })
    return i.client.rail(key, { active, width, color, dim: pal.line, marks, isMerge })
  }
  const clock = (key: string, since: number, endAt: number | null, color: string): unknown => {
    if (since <= 0) return Text({ key, color, children: ['\u2014'] })
    if (i.client === null) return Text({ key, color, children: [fmtMs((endAt ?? i.now) - since)] })
    return i.client.clock(key, { since, now: i.now, endAt, color })
  }

  const viewed = i.viewedAgent

  // ---- vitals
  const vitalsPanel = (w: number, isMini: boolean): unknown => {
    const v = vitalsOf({ main: deck.main, ctx: deck.ctx, wins: i.wins, nowMs: i.now, gaugeWidth: isMini ? 6 : 10 })
    const winTexts = v.windows.map(x =>
      Text({
        key: 'vw-' + x.label,
        children: [
          Text({ dimColor: true, children: [x.label + ' '] }),
          Text({ color: x.color, children: [x.gauge.on] }),
          Text({ color: pal.line, children: [x.gauge.off] }),
          Text({ dimColor: true, children: [x.used === null ? ' ?  ' : ' ' + Math.round(x.used) + '%  '] }),
        ],
      }),
    )
    const lines: unknown[] = [
      Box({ key: 'v-head', justifyContent: 'space-between', children: [Text({ bold: true, color: pal.info, wrap: 'truncate-end', children: [v.model + ' \u00b7 main'] }), Text({ color: v.isRunning ? pal.ok : pal.dim, children: [v.isRunning ? '\u25cf working' : '\u25cb idle'] })] }),
      Text({
        key: 'v-effort',
        wrap: 'truncate-end',
        children: [
          Text({ dimColor: true, children: ['effort '] }),
          Text({ color: pal.info, children: ['\u25ae'.repeat(v.effortFilled) + '\u25af'.repeat(4 - v.effortFilled) + ' '] }),
          Text({ bold: true, children: [v.effort === '' ? '\u2014' : v.effort] }),
          Text({ dimColor: true, children: [(v.mode !== '' ? '   mode ' + v.mode : '') + '   ' + v.requests + ' req'] }),
        ],
      }),
    ]
    if (v.ctx !== null) {
      lines.push(
        Text({
          key: 'v-ctx',
          wrap: 'truncate-end',
          children: [
            Text({ dimColor: true, children: ['ctx '] }),
            Text({ color: v.ctx.isHigh ? pal.err : pal.info, children: [v.ctx.gauge.on] }),
            Text({ color: pal.line, children: [v.ctx.gauge.off] }),
            Text({ bold: true, children: [' ' + v.ctx.pct + '%'] }),
            Text({ dimColor: true, children: [v.ctx.tokensText !== '' ? ' ' + v.ctx.tokensText : ''] }),
            Text({ color: pal.warn, children: [v.compactions > 0 ? '  \u27f2' + v.compactions : ''] }),
          ],
        }),
      )
      // The compaction marks sit on a row of their own under the gauge, at the cells the context stood at.
      if (v.ctx.gauge.hasMarks && !isMini) lines.push(Text({ key: 'v-marks', color: pal.warn, wrap: 'truncate-end', children: ['    ' + v.ctx.gauge.marks] }))
    } else if (v.compactions > 0) lines.push(Text({ key: 'v-ctx-wait', color: pal.warn, children: ['ctx \u2026  \u27f2' + v.compactions] }))
    if (v.cost !== null || winTexts.length > 0) lines.push(Text({ key: 'v-cost', wrap: 'truncate-end', children: [Text({ children: [v.cost !== null ? fmtUsd(v.cost) + '   ' : ''] }), ...winTexts] }))
    if (laneCount > 0) lines.push(Text({ key: 'v-lanes', color: pal.warn, wrap: 'truncate-end', children: ['lanes ' + laneCount + ' working'] }))
    return Box({ key: 'p-vitals', flexDirection: 'column', borderStyle: 'round', borderColor: pal.info, paddingX: 1, width: w, children: lines })
  }

  // ---- gate
  const gatePanel = (w: number): unknown => {
    const s = gateSummary(deck.gate)
    const cells = strip(deck.gate, Math.max(8, w - 4))
    const open = deck.ui.gateOpen
    return Box({
      key: 'p-gate',
      flexDirection: 'column',
      borderStyle: 'round',
      borderColor: pal.ok,
      paddingX: 1,
      width: w,
      children: [
        Box({ key: 'g-head', justifyContent: 'space-between', children: [Text({ bold: true, color: pal.ok, children: ['GATE \u00b7 permissions'] }), Text({ dimColor: true, children: [s.total + ' checks'] })] }),
        Box({ key: 'g-strip', children: stripRuns(cells).map((r, k) => Text({ key: 'gs-' + k, color: toneColor(r.tone, pal), dimColor: r.isDim, children: [r.text] })) }),
        Text({
          key: 'g-totals',
          wrap: 'truncate-end',
          children: [
            Text({ color: pal.ok, children: ['\u25a0'] }),
            Text({ dimColor: true, children: [' ' + s.rule + ' allowed  '] }),
            Text({ color: pal.info, children: ['\u25a0'] }),
            Text({ dimColor: true, children: [' ' + s.cleared + ' ' + decider + '  '] }),
            Text({ color: pal.warn, children: [s.ask > 0 ? '\u25a0 ' + s.ask + ' pending  ' : ''] }),
            Text({ color: s.deny > 0 ? pal.err : pal.dim, children: ['\u2717 ' + s.deny + ' denied'] }),
            Text({ color: pal.line, children: [w >= 80 && deck.gate.recent.some(c => c.inSubagent) ? '  dim: in subagents' : ''] }),
          ],
        }),
        Box({
          key: 'g-fam',
          columnGap: 2,
          children: BUCKETS.map(b => {
            const t = deck.gate.totals[b]
            const n = t.rule + t.ask + t.cleared + t.deny
            return Button({ key: 'gate-' + b, label: b + ' ' + n + (open === b ? ' \u25be' : ''), hotkey: b[0], plain: true, dimColor: n === 0, onPress: () => i.act.gate(b) })
          }),
        }),
        ...(open === null ? [] : drill(deck.gate, open).map(c => drillRow(c, w))),
      ],
    })
  }
  const drillRow = (c: Check, w: number): unknown => {
    const cell = cellOf(c)
    return Text({
      key: 'gd-' + c.id,
      wrap: 'truncate-end',
      children: [
        Text({ color: toneColor(cell.tone, pal), children: [cell.glyph + ' '] }),
        Text({ color: pal.dim, children: [verdictWord(c.verdict, decider).padEnd(10) + ' '] }),
        Text({ dimColor: c.inSubagent, children: [shorten(c.detail, Math.max(10, w - 18))] }),
      ],
    })
  }

  // ---- agents: cards while they fit, swimlanes beyond
  const agentsPanel = (w: number): unknown => {
    const L = agentsLayout(deck.cards, w, i.maxCards)
    const header = Box({
      key: 'a-head',
      justifyContent: 'space-between',
      width: w,
      children: [Text({ bold: true, children: ['agents \u00b7 ' + running.length + ' running \u00b7 ' + deck.cards.length + ' total'] }), Text({ color: pal.line, children: [L.keys > 0 ? '1-' + L.keys + ' expand' : ''] })],
    })
    if (L.mode === 'lanes') {
      const barW = Math.max(8, w - 28)
      const geo = lanes(L.shown, i.now, barW)
      return Box({
        key: 'p-agents',
        flexDirection: 'column',
        width: w,
        children: [
          header,
          ...(L.hiddenEarlier > 0 ? [Text({ key: 'a-earlier', color: pal.line, children: ['+' + L.hiddenEarlier + ' earlier'] })] : []),
          ...L.shown.map((c, k) => {
            const g = geo[k]
            const isViewed = viewed === c.id
            const st = stateOf(c)
            return Box({
              key: 'lane-' + c.id,
              children: [
                Text({ color: statusColor(c, pal), bold: isViewed, children: [(isViewed ? '\u25b6' : st.glyph) + ' '] }),
                Box({ width: 17, children: [Button({ key: 'card-' + c.id, label: shorten(cardTitle(c), 14), hotkey: k < 9 ? String(k + 1) : undefined, plain: true, onPress: () => i.act.expand(c.id) })] }),
                Text({ color: pal.line, children: [' ' + '\u00b7'.repeat(g?.before ?? 0)] }),
                Text({ color: statusColor(c, pal), children: ['\u2501'.repeat(g?.bar ?? 1)] }),
                Text({ color: pal.line, children: ['\u00b7'.repeat(g?.after ?? 0) + ' '] }),
                clock('lane-clock-' + c.id, c.spawnedAt, c.endedAt, pal.dim),
              ],
            })
          }),
        ],
      })
    }
    const shown = L.shown
    const centers = shown.map((_, k) => k * (L.cardW + 1) + Math.floor(L.cardW / 2))
    const modelName = prettyModel(deck.main.model)
    return Box({
      key: 'p-agents',
      flexDirection: 'column',
      width: w,
      children: [
        header,
        rail('fan-out', running.length > 0, 'agents', w, centers),
        Box({
          key: 'a-cards',
          columnGap: 1,
          children: shown.map((c, k) => {
            const isViewed = viewed === c.id
            const same = c.model === '' || prettyModel(c.model) === modelName
            const [l1, l2] = titleLines(cardTitle(c), L.cardW - 7, L.cardW - 4)
            const st = stateOf(c)
            return Box({
              key: 'card-box-' + c.id,
              flexDirection: 'column',
              borderStyle: isViewed ? 'double' : 'round',
              borderColor: isMaxTokens(c) ? pal.err : pal.info,
              borderDimColor: c.status !== 'running' && !isViewed,
              width: L.cardW,
              paddingX: 1,
              children: [
                Button({ key: 'card-' + c.id, label: l1, hotkey: k < 9 ? String(k + 1) : undefined, plain: true, onPress: () => i.act.expand(c.id) }),
                Text({ bold: true, wrap: 'truncate-end', children: [l2] }),
                Text({ color: pal.dim, wrap: 'truncate-end', children: [same ? c.type : c.type + ' \u00b7 ' + prettyModel(c.model)] }),
                Text({ dimColor: true, wrap: 'truncate-end', children: [tokensText(c, kTokens)] }),
                Box({
                  key: 'card-state-' + c.id,
                  children: [Text({ color: statusColor(c, pal), children: [L.cardW >= 26 ? st.glyph + ' ' + st.word + ' ' : st.glyph + ' '] }), Box({ flexShrink: 0, children: [clock('card-clock-' + c.id, c.spawnedAt, c.endedAt, pal.dim)] })],
                }),
              ],
            })
          }),
        }),
        rail('merge', running.length > 0, 'agents', w, centers, true),
      ],
    })
  }

  const expandedCard = deck.cards.find(c => c.id === deck.ui.expanded)
  const expandedPanel = (w: number): unknown => {
    if (expandedCard === undefined) return null
    const x = expandedOf(expandedCard, prettyModel)
    return Box({
      key: 'p-expanded',
      flexDirection: 'column',
      borderStyle: 'single',
      borderColor: pal.info,
      paddingX: 1,
      width: w,
      children: [
        Text({ bold: true, wrap: 'wrap', children: [x.title] }),
        Text({ dimColor: true, wrap: 'truncate-end', children: [x.head] }),
        ...(x.task !== '' ? [Text({ key: 'x-task', wrap: 'wrap', children: [x.task] })] : []),
        ...(x.tools.length === 0 ? [Text({ key: 'x-notools', color: pal.line, children: ['no tool calls yet'] })] : x.tools.map((n, k) => Text({ key: 'x-tool-' + k, color: n.isError ? pal.err : pal.text, wrap: 'truncate-end', children: [(n.isError ? '\u2717 ' : '\u00b7 ') + n.text] }))),
        ...(x.answer !== '' ? [Text({ key: 'x-answer', dimColor: true, wrap: 'wrap', children: ['\u00bb ' + shorten(x.answer, 240)] })] : []),
      ],
    })
  }

  // ---- receipt
  const receiptPanel = (w: number): unknown => {
    const r = deck.receipt
    return Box({
      key: 'p-receipt',
      flexDirection: 'column',
      borderStyle: 'round',
      borderColor: pal.info,
      borderDimColor: !deck.main.isRunning,
      paddingX: 1,
      width: w,
      children: [
        deck.main.isRunning
          ? Box({ key: 'r-run', children: [Text({ color: pal.info, children: ['\u25d0 turn '] }), Box({ flexShrink: 0, children: [clock('turn-clock', deck.turn.startedAt, null, pal.info)] }), Text({ dimColor: true, wrap: 'truncate-end', children: [' \u00b7 ' + runningText(deck.turn, deck.spawned)] })] })
          : r !== null
            ? Text({ key: 'r-last', wrap: 'truncate-end', children: [Text({ color: r.reason === 'answer' ? pal.ok : pal.err, children: [r.reason === 'answer' ? '\u2713 ' : '\u2717 '] }), Text({ children: ['last turn ' + receiptText(r)] })] })
            : Text({ key: 'r-none', color: pal.line, children: ['no turn finished yet'] }),
      ],
    })
  }

  // ---- log: 8 lines (24 expanded), scrollable
  const logPanel = (w: number): unknown => {
    const shownN = deck.ui.logOpen ? LOG_EXPANDED : LOG_SHOWN
    const win = logWindow(deck.log, { shown: shownN, back: deck.ui.logBack, agentId: viewed })
    return Box({
      key: 'p-log',
      flexDirection: 'column',
      borderStyle: 'round',
      borderColor: pal.line,
      paddingX: 1,
      width: w,
      children: [
        Box({
          key: 'l-head',
          columnGap: 2,
          children: [
            Text({ dimColor: true, children: [viewed !== null ? 'session log \u00b7 this agent' : 'session log'] }),
            Button({ key: 'log-older', label: '\u25b4 older' + (win.olderHidden > 0 ? ' ' + win.olderHidden : ''), hotkey: 'u', plain: true, dimColor: win.olderHidden === 0, onPress: () => i.act.logOlder() }),
            Button({ key: 'log-newer', label: '\u25be newer' + (win.newerHidden > 0 ? ' ' + win.newerHidden : ''), hotkey: 'n', plain: true, dimColor: win.newerHidden === 0, onPress: () => i.act.logNewer() }),
            Button({ key: 'log-open', label: deck.ui.logOpen ? 'fewer' : 'more', hotkey: 'e', plain: true, onPress: () => i.act.logToggle() }),
          ],
        }),
        ...win.rows.map((l, k) =>
          Box({
            key: 'll-' + k,
            children: [
              Box({ width: 9, flexShrink: 0, children: [Text({ color: pal.line, children: [fmtStamp(l.at)] })] }),
              Box({ width: 13, flexShrink: 0, children: [Text({ color: logColor(l, pal), bold: true, wrap: 'truncate-end', children: [l.who] })] }),
              Text({ color: isProblem(l) ? pal.err : pal.text, wrap: 'truncate-end', children: [l.text] }),
            ],
          }),
        ),
      ],
    })
  }

  const draw = (p: DeckPanel, w: number): unknown => (p === 'vitals' ? vitalsPanel(w, false) : p === 'gate' ? gatePanel(w) : p === 'agents' ? agentsPanel(w) : p === 'receipt' ? receiptPanel(w) : logPanel(w))
  const flow = i.flow

  // A column of panels with the connectors between them; the agents panel draws its own.
  const column = (ps: readonly DeckPanel[], w: number): unknown =>
    Box({
      key: 'col',
      flexDirection: 'column',
      width: w,
      children: ps.map((p, k) => {
        const prev = ps[k - 1]
        const link = k === 0 || p === 'agents' || prev === 'agents' ? null : rail('link-' + p, railActive(p, flow), railKind(p), w)
        return Box({ key: 'pc-' + p, flexDirection: 'column', children: [...(link === null ? [] : [link]), draw(p, w), ...(p === 'agents' && expandedCard !== undefined ? [expandedPanel(w)] : [])] })
      }),
    })

  // ---- mini: a summary of at most MINI_ROWS rows, every row ONE line (Text or a one-line Box)
  if (i.layout === 'mini') return Box({ key: 'deck-mini', flexDirection: 'column', width: W, children: miniRows(i, W, running, clock) })

  if (i.layout === 'wide') {
    const left = i.panels.filter(p => p === 'vitals' || p === 'gate' || p === 'receipt')
    const right = i.panels.filter(p => p === 'agents')
    const logIn = i.panels.includes('log')
    if (left.length > 0 && right.length > 0) {
      const colW = Math.floor((W - 2) / 2)
      return Box({ key: 'deck-wide', flexDirection: 'column', width: W, children: [header(i, running.length), Box({ key: 'deck-cols', columnGap: 2, children: [column(left, colW), column(right, colW)] }), ...(logIn ? [logPanel(W)] : [])] })
    }
  }
  return Box({ key: 'deck-compact', flexDirection: 'column', width: W, children: [header(i, running.length), ...(i.panels.length === 0 ? [Text({ key: 'deck-empty', color: pal.line, children: ['nothing to show yet'] })] : [column(i.panels, W)])] })
}

function header(i: DeckIn, running: number): unknown {
  const { Box, Text } = i.kit
  const m = i.deck.main
  return Box({
    key: 'deck-title',
    justifyContent: 'center',
    children: [
      Text({
        bold: true,
        wrap: 'truncate-end',
        children: [Text({ children: ['COCKPIT DECK'] }), Text({ color: i.pal.dim, children: [' \u00b7 '] }), Text({ color: i.pal.info, children: [prettyModel(m.model).toUpperCase()] }), Text({ children: [m.isRunning ? ' WORKS' : ' IDLE'] }), Text({ color: i.pal.dim, children: [running > 0 ? ' \u00b7 ' + running + ' agents' : ''] })],
      }),
    ],
  })
}

const fmtMs = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return m < 60 ? m + ':' + String(s % 60).padStart(2, '0') : Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0')
}

/**
 * The mini layout's rows, one line each, at most MINI_ROWS (8): the vitals line; the gate strip and totals; up to 3 agents; "+N more";
 * the turn (running, or the last receipt); the newest log line. Rows that have nothing to say are left out, so the count is never padded.
 */
export function miniRows(i: DeckIn, W: number, running: AgentCard[], clock: (key: string, since: number, endAt: number | null, color: string) => unknown): unknown[] {
  const { Box, Text } = i.kit
  const { deck, pal } = i
  const rows: unknown[] = []
  const v = vitalsOf({ main: deck.main, ctx: deck.ctx, wins: i.wins, nowMs: i.now, gaugeWidth: 6 })
  const lw = lanesWorking(deck)
  const has = (p: DeckPanel): boolean => i.panels.includes(p)
  if (has('vitals') || i.panels.length === 0) rows.push(
    Text({
      key: 'm-vitals',
      wrap: 'truncate-end',
      children: [
        Text({ bold: true, color: pal.info, children: [v.model] }),
        Text({ color: v.isRunning ? pal.ok : pal.dim, children: [v.isRunning ? ' \u25cf working' : ' \u25cb idle'] }),
        ...(v.ctx !== null
          ? [Text({ dimColor: true, children: [' \u00b7 ctx '] }), Text({ color: v.ctx.isHigh ? pal.err : pal.info, children: [v.ctx.gauge.on] }), Text({ color: pal.line, children: [v.ctx.gauge.off] }), Text({ children: [' ' + v.ctx.pct + '%'] })]
          : []),
        Text({ color: pal.warn, children: [v.compactions > 0 ? ' \u27f2' + v.compactions : ''] }),
        Text({ dimColor: true, children: [v.cost !== null ? ' \u00b7 ' + fmtUsd(v.cost) : ''] }),
        ...v.windows.filter(w => w.used !== null).slice(0, 2).map(w => Text({ key: 'mw-' + w.label, color: w.color, children: [' ' + w.label + ' ' + Math.round(w.used ?? 0) + '%'] })),
        Text({ color: pal.warn, children: [lw > 0 ? ' \u00b7 lanes ' + lw : ''] }),
      ],
    }),
  )
  if (has('gate') && deck.gate.recent.length > 0) {
    const decider = deciderOf(i.mode)
    const tail = ' ' + totalsText(deck.gate, decider)
    const cells = strip(deck.gate, Math.max(4, W - 6 - tail.length))
    const s = gateSummary(deck.gate)
    rows.push(
      Box({
        key: 'm-gate',
        children: [
          Text({ dimColor: true, children: ['gate '] }),
          ...stripRuns(cells).map((r, k) => Text({ key: 'mg-' + k, color: toneColor(r.tone, pal), dimColor: r.isDim, children: [r.text] })),
          Text({ color: s.deny > 0 ? pal.err : s.ask > 0 ? pal.warn : pal.dim, wrap: 'truncate-end', children: [tail] }),
        ],
      }),
    )
  }
  const live = has('agents') ? [...running, ...deck.cards.filter(c => c.status !== 'running').reverse()].slice(0, 3) : []
  for (const c of live) {
    const st = stateOf(c)
    rows.push(
      Box({
        key: 'm-card-' + c.id,
        children: [
          Text({ color: statusColor(c, pal), children: [st.glyph + ' '] }),
          Box({ width: Math.max(10, W - 30), children: [Text({ wrap: 'truncate-end', children: [cardTitle(c)] })] }),
          Text({ dimColor: true, children: [c.steps > 0 ? ' ctx ' + kTokens(c.ctx) + ' ' : ' '] }),
          clock('m-clock-' + c.id, c.spawnedAt, c.endedAt, pal.dim),
        ],
      }),
    )
  }
  if (has('agents') && deck.cards.length > live.length) rows.push(Text({ key: 'm-more', color: pal.line, wrap: 'truncate-end', children: ['+' + (deck.cards.length - live.length) + ' more agents \u00b7 /cockpit layout compact for all'] }))
  if (!has('receipt')) {
    // hidden by the panels option
  } else if (deck.main.isRunning) {
    rows.push(Box({ key: 'm-turn', children: [Text({ color: pal.info, children: ['\u25d0 turn '] }), clock('m-turn-clock', deck.turn.startedAt, null, pal.info), Text({ dimColor: true, wrap: 'truncate-end', children: [' \u00b7 ' + runningText(deck.turn, deck.spawned)] })] }))
  } else if (deck.receipt !== null) {
    rows.push(Text({ key: 'm-last', dimColor: true, wrap: 'truncate-end', children: ['last turn ' + receiptText(deck.receipt)] }))
  }
  const last = deck.log[deck.log.length - 1]
  if (has('log') && last !== undefined) rows.push(Text({ key: 'm-log', color: logColor(last, pal), wrap: 'truncate-end', children: [fmtStamp(last.at) + ' ' + last.who + ' ' + last.text] }))
  // Never more than the budget: the lines that matter least go first (the newest log line, then the last receipt, then extra agents).
  const cap = Math.min(MAX_MINI, Math.max(1, i.maxRows))
  return rows.slice(0, cap)
}

const MAX_MINI = 8
