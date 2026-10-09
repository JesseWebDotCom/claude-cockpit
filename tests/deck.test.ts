// Cockpit 0.4.0, the Deck: the pure rules behind every panel (hooks/mask.ts, sessionlog.ts, gate.ts, turnreceipt.ts, vitals.ts,
// agentcards.ts, deckstate.ts, deckconfig.ts, deckstatus.ts, motion.ts). Plain objects only; runs under plain `bun test`.

import { test, expect } from './pure.ts'
import { addCard, agentsLayout, applyStep, blankCard, expandedOf, finishCard, isMaxTokens, keyOf, lanes, noteTool, spawnCard, titleLines } from '../hooks/agentcards.ts'
import { DECK_USAGE, effectiveLayout, effectiveMotion, effectivePanels, emptyView, isEmptyPanel, normalizeView, parseDeckArgs, parseDeckConfig, parsePanels, resolveLayout, visiblePanels } from '../hooks/deckconfig.ts'
import { fmtDuration, fmtTimer, kTokens, pathTail, prettyModel, shorten } from '../hooks/deckfmt.ts'
import { closeConsult, deckOnAgentComplete, deckOnAgentStep, deckOnCheck, deckOnCompact, deckOnLanes, deckOnMainComplete, deckOnMainStep, deckOnMeasure, deckOnMode, deckOnSpawn, deckOnToolCall, deckOnTurnStart, emptyDeck, lanesWorking, normalizeDeck, openConsult, panelFactsOf, resetDeck, scrollLog, statusFactsOf, toggleExpanded, toggleGate, toggleLogOpen } from '../hooks/deckstate.ts'
import type { Deck } from '../hooks/deckstate.ts'
import { statusPiece } from '../hooks/deckstatus.ts'
import { BUCKETS, cellOf, deciderOf, drill, emptyGate, familyTotal, gateSummary, makeCheck, normalizeGate, recordCheck, settleCheck, strip, totalsText, trimRecent, verdictWord } from '../hooks/gate.ts'
import { bucketOf, describeInput, EDIT_TOOLS, redact } from '../hooks/mask.ts'
import { PACKET_GAP, flowOf, isFlowing, packetCells, railActive, railKind, stillRail } from '../hooks/motion.ts'
import { LOG_KEEP, LOG_SHOWN, logWindow, normalizeLog, promptLine, pushLog, trackLanes } from '../hooks/sessionlog.ts'
import { afterCall, emptyTurn, receiptOf, receiptText, runningText, startTurn } from '../hooks/turnreceipt.ts'
import { effortCells, gaugeOf, onCompact, onMeasure, vitalsOf, emptyContext, emptyMain, windowView } from '../hooks/vitals.ts'
import { winOf } from '../hooks/limits.ts'

// ---------------------------------------------------------------- masking

test('credentials are masked, idempotently, and ordinary text is untouched', () => {
  expect(redact('curl -H "Authorization: Bearer abc.def.ghi123" x')).not.toContain('abc.def')
  expect(redact('export OPENAI_API_KEY=sk-proj-1234567890abcdef')).not.toContain('1234567890')
  expect(redact('gh auth --token ghp_abcdefghijklmnop')).not.toContain('abcdefghijklmnop')
  expect(redact('psql postgres://bob:hunter2@db/x')).not.toContain('hunter2')
  expect(redact('password=hunter2 ls')).not.toContain('hunter2')
  expect(redact('ls -la src/')).toBe('ls -la src/')
  const once = redact('token=abc12345')
  expect(redact(once)).toBe(once)
})

test('describeInput names the call by its command, path, pattern or url, masked; buckets and edit tools', () => {
  expect(describeInput('Bash', { command: 'curl -H "Authorization: Bearer zzzzzzzzzzzz" x' })).not.toContain('zzzzzzzz')
  expect(describeInput('Edit', { file_path: '/a/b/c/d/core.ts' })).toBe('Edit \u2192 c/d/core.ts'.replace('c/d', 'b/c/d').replace('b/c/d/core.ts', 'c/d/core.ts'))
  expect(describeInput('Grep', { pattern: 'ageLabel' })).toBe('Grep \u2192 ageLabel')
  expect(describeInput('Foo', {})).toBe('Foo')
  expect([bucketOf('Read'), bucketOf('Bash'), bucketOf('Agent'), bucketOf('MultiEdit')]).toEqual(['file', 'shell', 'other', 'file'])
  expect(EDIT_TOOLS.has('Write')).toBe(true)
  expect(EDIT_TOOLS.has('Read')).toBe(false)
})

// ---------------------------------------------------------------- 1. the session log

test('log: a prompt is its first 70 characters; a tagged hand-back is the engine\'s; text is masked and one line', () => {
  expect(promptLine('x'.repeat(100)).text.length).toBe(70)
  expect(promptLine('fix the bar please').who).toBe('you')
  expect(promptLine('<agent-message from="abcdef123456">report</agent-message>')).toEqual({ who: 'engine', text: 'agent message from abcdef12' })
  const l = pushLog([], { at: 1, kind: 'info', who: 'main', text: 'curl --token abc123456789\nsecond line', agentId: null })
  expect(l[0]?.text).not.toContain('abc123456789')
  expect(l[0]?.text).not.toContain('\n')
})

test('log: 200 kept, newest last; the window shows 8 and scrolls without running off either end', () => {
  let log = [] as ReturnType<typeof pushLog>
  for (let i = 0; i < 250; i++) log = pushLog(log, { at: i + 1, kind: 'info', who: 'main', text: 'line ' + i, agentId: null })
  expect(log).toHaveLength(LOG_KEEP)
  expect(log[log.length - 1]?.text).toBe('line 249')
  expect(log[0]?.text).toBe('line 50')
  const w = logWindow(log, { shown: LOG_SHOWN, back: 0 })
  expect(w.rows.map(r => r.text)).toEqual(Array.from({ length: 8 }, (_, i) => 'line ' + (242 + i)))
  expect(w.olderHidden).toBe(192)
  const back = logWindow(log, { shown: 8, back: 16 })
  expect(back.rows[7]?.text).toBe('line 233')
  expect(back.newerHidden).toBe(16)
  expect(logWindow(log, { shown: 8, back: 9999 }).rows[0]?.text).toBe('line 50')
  expect(logWindow(log, { shown: 8, back: -5 }).back).toBe(0)
  const mixed = pushLog(pushLog([], { at: 1, kind: 'info', who: 'a', text: 'x', agentId: 'A' }), { at: 2, kind: 'info', who: 'b', text: 'y', agentId: 'B' })
  expect(logWindow(mixed, { shown: 8, back: 0, agentId: 'A' }).rows.map(r => r.text)).toEqual(['x'])
})

test('log: lane changes (working, idle, absent) are logged; the first poll is only the baseline', () => {
  const first = trackLanes(null, [{ name: 'codex-a', state: 'working' }, { name: 'codex-b', state: 'idle' }], 1)
  expect(first.lines).toEqual([])
  const second = trackLanes(first.next, [{ name: 'codex-a', state: 'idle' }], 2)
  expect(second.lines.map(l => l.who + ' ' + l.text)).toEqual(['codex-a working \u2192 idle', 'codex-b idle \u2192 absent'])
  expect(trackLanes(second.next, [{ name: 'codex-a', state: 'idle' }], 3).lines).toEqual([])
  const back = trackLanes(second.next, [{ name: 'codex-a', state: 'idle' }, { name: 'codex-b', state: 'working' }], 4)
  expect(back.lines.map(l => l.text)).toEqual(['back \u00b7 working'])
  expect(normalizeLog('nonsense')).toEqual([])
  expect(normalizeLog([{ at: 1, kind: 'weird', who: 'x', text: 'token=abcdef123456' }])[0]).toMatchObject({ kind: 'info', text: 'token=\u2022\u2022\u2022' })
})

// ---------------------------------------------------------------- 2. the permission gate

test('gate: allowed, asked-then-run, pending, denied; an ask is settled by the tool.call that follows', () => {
  let g = emptyGate()
  const mk = (id: string, tool: string, decision: 'allow' | 'ask' | 'deny', inSubagent = false) => makeCheck({ id, tool, input: { command: 'ls' }, inSubagent, at: 1 }, decision)
  g = recordCheck(g, mk('a', 'Read', 'allow'))
  g = recordCheck(g, mk('b', 'Bash', 'ask'))
  g = recordCheck(g, mk('c', 'Bash', 'ask'))
  g = recordCheck(g, mk('d', 'Bash', 'deny', true))
  expect(gateSummary(g)).toMatchObject({ rule: 1, ask: 2, cleared: 0, deny: 1, total: 4 })
  g = settleCheck(g, 'b', true)
  g = settleCheck(g, 'c', false)
  expect(settleCheck(g, 'zzz', true)).toBe(g)
  expect(settleCheck(g, 'a', true)).toBe(g)
  expect(gateSummary(g)).toMatchObject({ rule: 1, ask: 0, cleared: 1, deny: 2, total: 4 })
  expect(g.recent.map(c => c.verdict)).toEqual(['rule', 'cleared', 'deny', 'deny'])
  expect(g.totals.file.rule).toBe(1)
  expect(g.totals.shell).toMatchObject({ cleared: 1, deny: 2 })
  expect(familyTotal(g, 'shell')).toBe(3)
})

test('gate: one cell per check, its tone, dim inside a subagent, the newest N', () => {
  let g = emptyGate()
  for (const [i, d] of (['allow', 'ask', 'deny'] as const).entries()) g = recordCheck(g, makeCheck({ id: 'x' + i, tool: 'Bash', input: {}, inSubagent: i === 2, at: 1 }, d))
  g = settleCheck(g, 'x1', true)
  const cells = strip(g, 10)
  expect(cells.map(c => c.tone)).toEqual(['allowed', 'decided', 'denied'])
  expect(cells.map(c => c.isDim)).toEqual([false, false, true])
  expect(cells[2]?.glyph).toBe('\u2717')
  expect(strip(g, 2)).toHaveLength(2)
  expect(cellOf(makeCheck({ id: 'p', tool: 'Bash', input: {}, inSubagent: false, at: 1 }, 'ask')).tone).toBe('pending')
  expect(verdictWord('cleared', deciderOf('auto'))).toBe('classifier')
  expect(verdictWord('cleared', deciderOf('default'))).toBe('you')
  expect(totalsText(g, 'you')).toBe('1 allowed \u00b7 1 you \u00b7 1 denied')
})

test('gate: the drill-down is the last 5 checks of the family, credentials masked; a pending ask is never trimmed away', () => {
  let g = emptyGate()
  for (let i = 0; i < 8; i++) g = recordCheck(g, makeCheck({ id: 's' + i, tool: 'Bash', input: { command: 'deploy --token=sekrit' + i + 'abcdefgh' }, inSubagent: false, at: i }, 'allow'))
  g = recordCheck(g, makeCheck({ id: 'f0', tool: 'Read', input: { file_path: '/a/b.ts' }, inSubagent: false, at: 9 }, 'allow'))
  const rows = drill(g, 'shell')
  expect(rows).toHaveLength(5)
  expect(rows.map(r => r.id)).toEqual(['s3', 's4', 's5', 's6', 's7'])
  expect(rows.every(r => !r.detail.includes('sekrit'))).toBe(true)
  expect(drill(g, 'file')).toHaveLength(1)
  const pending = [makeCheck({ id: 'p', tool: 'Bash', input: {}, inSubagent: false, at: 1 }, 'ask'), ...Array.from({ length: 10 }, (_, i) => makeCheck({ id: 'q' + i, tool: 'Read', input: {}, inSubagent: false, at: 2 }, 'allow'))]
  expect(trimRecent(pending, 3).some(c => c.id === 'p')).toBe(true)
  expect(BUCKETS).toEqual(['file', 'shell', 'other'])
  expect(normalizeGate(null).recent).toEqual([])
  expect(normalizeGate({ recent: [{ id: 'z', detail: 'token=abcdefgh1234' }], totals: { file: { rule: 2 } } }).recent[0]?.detail).toBe('token=\u2022\u2022\u2022')
})

// ---------------------------------------------------------------- 3. the turn receipt

test('receipt: an edit counts from any loop, an error only in the main loop, a denial neither; cost added needs half a cent', () => {
  let t = startTurn(100, 2, 1.0)
  t = afterCall(t, { inSubagent: false, hasFailed: false, isEdit: true, wasDenied: false })
  t = afterCall(t, { inSubagent: true, hasFailed: false, isEdit: true, wasDenied: false })
  t = afterCall(t, { inSubagent: true, hasFailed: true, isEdit: false, wasDenied: false })
  t = afterCall(t, { inSubagent: false, hasFailed: true, isEdit: true, wasDenied: false })
  t = afterCall(t, { inSubagent: false, hasFailed: false, isEdit: true, wasDenied: true })
  expect(t).toMatchObject({ edits: 2, errors: 1 })
  const r = receiptOf(t, { durationMs: 185_000, agentsNow: 5, costNow: 1.42, reason: 'answer' })
  expect(r).toMatchObject({ durationMs: 185_000, agents: 3, edits: 2, errors: 1, reason: 'answer' })
  expect(Math.abs((r.costDelta ?? 0) - 0.42) < 1e-6).toBe(true)
  expect(receiptText(r)).toBe('3m05s \u00b7 3 agents \u00b7 2 edits \u00b7 1 error \u00b7 +$0.42')
  expect(receiptOf(t, { durationMs: 1000, agentsNow: 2, costNow: 1.001, reason: 'answer' }).costDelta).toBe(null)
  expect(receiptOf(startTurn(1, 0, null), { durationMs: 1000, agentsNow: 0, costNow: 5, reason: 'answer' }).costDelta).toBe(null)
  expect(runningText(t, 4)).toBe('2 agents \u00b7 2 edits \u00b7 1 error')
  expect(emptyTurn().edits).toBe(0)
})

// ---------------------------------------------------------------- 4. the main vitals

test('vitals: the gauge, its compaction marks, effort cells, and the model name', () => {
  const g = gaugeOf(40, 10, [])
  expect(g.on).toBe('\u25b0\u25b0\u25b0\u25b0')
  expect(g.off).toBe('\u25b1'.repeat(6))
  expect(g.hasMarks).toBe(false)
  const m = gaugeOf(40, 10, [30, 85])
  expect(m.hasMarks).toBe(true)
  expect(m.marks).toBe('   \u27f2    \u27f2 ')
  expect(m.marks.length).toBe(10)
  expect(effortCells('high')).toBe(3)
  expect(effortCells('')).toBe(0)
  expect(prettyModel('claude-opus-5-5[1m]')).toBe('Opus 5.5 1M')
  expect(prettyModel('')).toBe('\u2014')
})

test('vitals: a measurement sets context and cost; a compaction adds a mark at the percent it stood at and waits for the next reading', () => {
  let c = onMeasure(emptyContext(), { percent: 72, tokens: 144_000, window: 200_000, costUsd: 4.2 })
  expect(c).toMatchObject({ pct: 72, tokens: 144_000, window: 200_000, costUsd: 4.2 })
  c = onCompact(c)
  expect(c).toMatchObject({ pct: null, compactions: 1, marks: [72] })
  c = onMeasure(c, { percent: 12, tokens: 24_000, window: 200_000, costUsd: 4.3 })
  expect(c.marks).toEqual([72])
  const v = vitalsOf({ main: { ...emptyMain(), model: 'claude-sonnet-5-5', effort: 'medium', mode: 'auto', steps: 7, isRunning: true }, ctx: c, wins: [winOf('5h', 31, null), winOf('week', null, null)], nowMs: 1, gaugeWidth: 10 })
  expect(v).toMatchObject({ model: 'Sonnet 5.5', isRunning: true, effortFilled: 2, mode: 'auto', requests: 7, compactions: 1, cost: 4.3 })
  expect(v.ctx?.pct).toBe(12)
  expect(v.ctx?.gauge.hasMarks).toBe(true)
})

test('vitals: a rate-limit window comes from limits.ts (its colour rule, its reset handling), not from a copy', () => {
  const w = windowView(winOf('5h', 92, null), 1)
  expect(w).toMatchObject({ label: '5h', used: 92, color: '#F85149' })
  expect(windowView(winOf('week', 10, null), 1).color).toBe('#3FB950')
  expect(windowView(winOf('week', 70, null), 1).color).toBe('#F0A500')
  // a window that reset since it was read says nothing now
  expect(windowView(winOf('5h', 92, 500), 1000).used).toBe(null)
})

// ---------------------------------------------------------------- 5. the subagent cards

test('cards: per-agent context is the latest request\'s whole input; output adds up; max_tokens is flagged', () => {
  let c = spawnCard({ id: 'A', type: 'Explore', model: 'claude-haiku-4-5', description: 'find the claim reader', prompt: 'Find where the claim file is read, with token=abcdefgh1234.', at: 1000 })
  expect(c.task).not.toContain('abcdefgh1234')
  c = applyStep(c, { model: 'm', usage: { input_tokens: 100, cache_read_input_tokens: 5000, cache_creation_input_tokens: 400, output_tokens: 50 }, stopReason: 'tool_use' })
  c = applyStep(c, { model: 'm', usage: { input_tokens: 80, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0, output_tokens: 70 }, stopReason: 'max_tokens' })
  expect(c).toMatchObject({ ctx: 9080, out: 120, steps: 2 })
  expect(isMaxTokens(c)).toBe(true)
  c = applyStep(c, { model: 'm', usage: null, stopReason: 'end_turn' })
  expect(c.ctx).toBe(9080)
  c = noteTool(noteTool(noteTool(noteTool(c, { tool: 'Read', text: 'a', isError: false }), { tool: 'Read', text: 'b', isError: false }), { tool: 'Bash', text: 'c', isError: true }), { tool: 'Grep', text: 'd', isError: false })
  expect(c.tools.map(t => t.text)).toEqual(['b', 'c', 'd'])
  const done = finishCard(c, { reason: 'answer', at: 5000, answer: 'Found it in core.ts with password=hunter2hunter2' })
  expect(done).toMatchObject({ status: 'done', endedAt: 5000 })
  expect(done.answer).not.toContain('hunter2')
  expect(finishCard(c, { reason: 'aborted', at: 1, answer: '' }).status).toBe('stopped')
  expect(finishCard(c, { reason: 'error', at: 1, answer: '' }).status).toBe('failed')
})

test('cards: side by side while they fit, swimlanes beyond; the number keys follow the shown list', () => {
  const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ ...blankCard(), id: 'a' + i, description: 'task ' + i, spawnedAt: 1000 * (i + 1) }))
  expect(agentsLayout([], 66, 3).mode).toBe('none')
  const three = agentsLayout(mk(3), 66, 3)
  expect(three.mode).toBe('cards')
  expect(three.cardW).toBeGreaterThanOrEqual(20)
  expect(three.keys).toBe(3)
  expect(agentsLayout(mk(4), 66, 3).mode).toBe('lanes')
  // a narrow pane lowers the number of cards that fit
  expect(agentsLayout(mk(3), 40, 3).mode).toBe('lanes')
  const many = agentsLayout(mk(12), 100, 3)
  expect(many.shown).toHaveLength(6)
  expect(many.hiddenEarlier).toBe(6)
  expect(keyOf(many.shown, 'a11')).toBe(6)
  expect(keyOf(many.shown, 'a0')).toBe(null)
  expect(addCard(mk(24), { ...blankCard(), id: 'new' })).toHaveLength(24)
  const g = lanes(mk(3), 4000, 40)
  expect(g[0]?.before).toBe(0)
  expect(g.every(x => x.before + x.bar + x.after >= 40 || x.bar >= 1)).toBe(true)
  expect(titleLines('a very long task description for an agent', 20, 20)[0].length).toBeLessThanOrEqual(20)
  const e = expandedOf({ ...blankCard(), id: 'x', description: 'D', task: 'the whole task', tools: [{ tool: 'Read', text: 'r', isError: false }], answer: 'ans' }, prettyModel)
  expect(e).toMatchObject({ title: 'D', task: 'the whole task', answer: 'ans' })
})

// ---------------------------------------------------------------- the whole deck, event by event

const T0 = 1_000_000

test('deck: a turn with an agent, a gate check, an edit, an error and a denial, event by event', () => {
  let d: Deck = emptyDeck()
  d = deckOnMode(d, 'auto')
  d = deckOnTurnStart(d, { at: T0, text: 'make the bar come back and add the deck to the cockpit please, all of it now', cost: 1 })
  expect(d.main.isRunning).toBe(true)
  expect(d.log[0]).toMatchObject({ kind: 'prompt', who: 'you' })
  expect(d.log[0]?.text.length).toBe(70)
  d = deckOnMainStep(d, { model: 'claude-opus-5-5', effort: 'high' })
  d = deckOnSpawn(d, { id: 'A1', type: 'Explore', model: 'claude-haiku-4-5', description: 'find the bar code', prompt: 'look', at: T0 + 1000, isConsult: false })
  expect(d.cards).toHaveLength(1)
  expect(d.log[d.log.length - 1]).toMatchObject({ kind: 'spawn', agentId: 'A1' })
  d = deckOnAgentStep(d, { agentId: 'A1', model: 'm', usage: { input_tokens: 10, cache_read_input_tokens: 90, cache_creation_input_tokens: 0, output_tokens: 7 }, stopReason: 'tool_use', at: T0 + 2000 })
  expect(d.cards[0]).toMatchObject({ ctx: 100, out: 7, steps: 1 })
  // a write: asked, decided, run
  d = deckOnCheck(d, { id: 'w1', tool: 'Write', input: { file_path: '/x/y/z/hooks/new.ts' }, decision: 'ask', at: T0 + 3000 })
  expect(gateSummary(d.gate).ask).toBe(1)
  d = deckOnToolCall(d, { id: 'w1', tool: 'Write', input: { file_path: '/x/y/z/hooks/new.ts' }, wasDenied: false, isError: false, at: T0 + 3100 })
  expect(gateSummary(d.gate)).toMatchObject({ ask: 0, cleared: 1 })
  expect(d.turn.edits).toBe(1)
  expect(d.log[d.log.length - 1]).toMatchObject({ kind: 'edit', who: 'main' })
  expect(d.log[d.log.length - 1]?.text).toContain('hooks/new.ts')
  // a failing call in the main loop
  d = deckOnCheck(d, { id: 'b1', tool: 'Bash', input: { command: 'bun test' }, decision: 'allow', at: T0 + 4000 })
  d = deckOnToolCall(d, { id: 'b1', tool: 'Bash', input: { command: 'bun test' }, wasDenied: false, isError: true, at: T0 + 4100 })
  expect(d.turn.errors).toBe(1)
  expect(d.log[d.log.length - 1]).toMatchObject({ kind: 'error' })
  // a denial by rule: logged once when checked, not again when the call comes back denied
  d = deckOnCheck(d, { id: 'd1', tool: 'Bash', input: { command: 'rm -rf /tmp/x --token=abcdefgh1234' }, decision: 'deny', at: T0 + 5000 })
  const n = d.log.length
  d = deckOnToolCall(d, { id: 'd1', tool: 'Bash', input: {}, wasDenied: true, isError: false, at: T0 + 5100 })
  expect(d.log).toHaveLength(n)
  expect(d.log[n - 1]?.kind).toBe('deny')
  expect(d.log[n - 1]?.text).not.toContain('abcdefgh1234')
  // a subagent's own tool call is noted on its card and does not count as the main loop's error
  d = deckOnCheck(d, { id: 's1', tool: 'Read', input: { file_path: '/a/b.ts' }, agentId: 'A1', decision: 'allow', at: T0 + 6000 })
  d = deckOnToolCall(d, { id: 's1', tool: 'Read', input: { file_path: '/a/b.ts' }, agentId: 'A1', wasDenied: false, isError: true, at: T0 + 6100 })
  expect(d.turn.errors).toBe(1)
  expect(d.cards[0]?.tools).toHaveLength(1)
  expect(d.gate.recent.find(c => c.id === 's1')?.inSubagent).toBe(true)
  d = deckOnAgentComplete(d, { agentId: 'A1', reason: 'answer', answer: 'done', at: T0 + 7000 })
  expect(d.cards[0]?.status).toBe('done')
  d = deckOnMainComplete(d, { reason: 'answer', durationMs: 8000, cost: 1.5 })
  expect(d.main.isRunning).toBe(false)
  expect(d.receipt).toMatchObject({ agents: 1, edits: 1, errors: 1, durationMs: 8000, reason: 'answer' })
  expect(Math.abs((d.receipt?.costDelta ?? 0) - 0.5) < 1e-6).toBe(true)
  // a hand-back call is plumbing
  const before = d.turn.errors
  d = deckOnToolCall(d, { id: 'h', tool: 'SubagentHandback', input: {}, wasDenied: false, isError: true, at: T0 + 9000 })
  expect(d.turn.errors).toBe(before)
})

test('deck: compaction, measurement, consults, lanes, status facts and the empty-panel facts', () => {
  let d = emptyDeck()
  d = deckOnMeasure(d, { percent: 64, tokens: 128_000, window: 200_000, costUsd: 2 })
  d = deckOnCompact(d, { trigger: 'auto', at: T0 })
  d = deckOnCompact(d, { trigger: 'precompute', at: T0 })
  d = deckOnCompact(d, { agentId: 'sub', trigger: 'auto', at: T0 })
  expect(d.ctx).toMatchObject({ compactions: 1, marks: [64], pct: null })
  expect(d.log.filter(l => l.text.includes('compacted'))).toHaveLength(1)
  d = openConsult(d, 'c1', 'advisor tool', T0)
  d = openConsult(d, 'c1', 'advisor tool', T0)
  d = closeConsult(d, 'c1', T0 + 1)
  d = closeConsult(d, 'c1', T0 + 2)
  expect(d.log.filter(l => l.kind === 'consult').map(l => l.text)).toEqual(['consulted \u00b7 advisor tool', 'advice returned'])
  d = deckOnLanes(d, [{ name: 'codex-a', state: 'working' }, { name: 'codex-b', state: 'idle' }], T0)
  d = deckOnLanes(d, [{ name: 'codex-a', state: 'idle' }, { name: 'codex-b', state: 'working' }], T0 + 5)
  expect(lanesWorking(d)).toBe(1)
  expect(d.log.filter(l => l.kind === 'lane')).toHaveLength(2)
  d = deckOnSpawn(d, { id: 'k', type: 'advisor', model: 'm', description: 'consult', prompt: 'p', at: T0, isConsult: true })
  expect(d.log.some(l => l.kind === 'consult' && l.text.includes('advisor spawned'))).toBe(true)
  expect(statusFactsOf(d)).toMatchObject({ ctxPct: null, agentsRunning: 1, agentsTotal: 1, lanesWorking: 1, denied: 0 })
  expect(panelFactsOf(emptyDeck())).toEqual({ checks: 0, cards: 0, isRunning: false, hasReceipt: false, logLines: 0 })
})

test('deck: reset clears agents, checks, log, turn and the pane state, and keeps the model, cost, compactions and lane states', () => {
  let d = emptyDeck()
  d = deckOnMainStep(d, { model: 'claude-opus-5-5', effort: 'high' })
  d = deckOnMeasure(d, { percent: 50, tokens: 1, window: 2, costUsd: 3 })
  d = deckOnCompact(d, { trigger: 'manual', at: 1 })
  d = deckOnSpawn(d, { id: 'A', type: 't', model: 'm', description: 'd', prompt: 'p', at: 1, isConsult: false })
  d = deckOnLanes(d, [{ name: 'codex-a', state: 'working' }], 1)
  d = toggleExpanded(toggleGate(d, 'shell'), 'A')
  const r = resetDeck(d)
  expect(r.cards).toEqual([])
  expect(r.log).toEqual([])
  expect(r.gate).toEqual(emptyGate())
  expect(r.receipt).toBe(null)
  expect(r.ui).toEqual({ expanded: null, gateOpen: null, logBack: 0, logOpen: false })
  expect(r.main.model).toBe('claude-opus-5-5')
  expect(r.ctx.compactions).toBe(1)
  expect(r.ctx.costUsd).toBe(3)
  expect(r.lanes).toEqual({ 'codex-a': 'working' })
  expect(normalizeDeck(undefined)).toEqual(emptyDeck())
})

test('deck: what the person presses: expand toggles, the gate drill toggles, the log scrolls within its ends', () => {
  let d = emptyDeck()
  for (let i = 0; i < 30; i++) d = { ...d, log: pushLog(d.log, { at: i + 1, kind: 'info', who: 'm', text: 't' + i, agentId: null }) }
  expect(toggleExpanded(d, 'A').ui.expanded).toBe('A')
  expect(toggleExpanded(toggleExpanded(d, 'A'), 'A').ui.expanded).toBe(null)
  expect(toggleExpanded(toggleExpanded(d, 'A'), 'B').ui.expanded).toBe('B')
  expect(toggleGate(toggleGate(d, 'file'), 'file').ui.gateOpen).toBe(null)
  expect(scrollLog(d, 8, 8).ui.logBack).toBe(8)
  expect(scrollLog(d, 999, 8).ui.logBack).toBe(22)
  expect(scrollLog(scrollLog(d, 8, 8), -99, 8).ui.logBack).toBe(0)
  expect(toggleLogOpen(scrollLog(d, 8, 8)).ui).toMatchObject({ logOpen: true, logBack: 0 })
})

// ---------------------------------------------------------------- 7. layout and options, 8. the status line piece

test('config: the options are read leniently; a bad value falls back to its default', () => {
  expect(parseDeckConfig({})).toMatchObject({ layout: 'auto', motion: true, panels: ['vitals', 'gate', 'agents', 'receipt', 'log'], maxCards: 3, openOnStart: false, statusLine: true })
  expect(parseDeckConfig({ layout: 'bogus', motion: 'off', panels: 'log, gate, nope, log', maxCards: 99, deckOnStart: true, statusLine: false })).toMatchObject({ layout: 'auto', motion: false, panels: ['log', 'gate'], maxCards: 6, openOnStart: true, statusLine: false })
  expect(parseDeckConfig({ panels: 'nothing valid', maxCards: 0 })).toMatchObject({ panels: ['vitals', 'gate', 'agents', 'receipt', 'log'], maxCards: 1 })
  expect(parseDeckConfig({ consultPattern: '(' }).consult.test('advisor')).toBe(true)
  expect(parsePanels('')).toBe(null)
})

test('layout: auto is mini inline, wide from 110 columns docked, compact otherwise; a forced layout is honoured', () => {
  expect(resolveLayout('auto', 'inline', 200)).toBe('mini')
  expect(resolveLayout('auto', 'dock', 109)).toBe('compact')
  expect(resolveLayout('auto', 'dock', 110)).toBe('wide')
  expect(resolveLayout('mini', 'dock', 200)).toBe('mini')
  expect(resolveLayout('compact', 'inline', 200)).toBe('compact')
  expect(resolveLayout('wide', 'dock', 100)).toBe('wide')
  expect(resolveLayout('wide', 'dock', 60)).toBe('compact')
  const cfg = parseDeckConfig({ layout: 'wide', motion: 'off', panels: 'log,vitals' })
  const v = { ...emptyView(), layout: 'mini' as const, motion: true, panels: ['gate' as const] }
  expect(effectiveLayout(cfg, emptyView())).toBe('wide')
  expect(effectiveLayout(cfg, v)).toBe('mini')
  expect(effectiveMotion(cfg, emptyView())).toBe(false)
  expect(effectiveMotion(cfg, v)).toBe(true)
  expect(effectivePanels(cfg, emptyView())).toEqual(['log', 'vitals'])
  expect(effectivePanels(cfg, v)).toEqual(['gate'])
  expect(normalizeView({ layout: 'x', motion: 'y', panels: ['gate', 'zzz'] })).toEqual({ layout: null, motion: null, panels: ['gate'] })
})

test('panels: empty ones take no room; order follows the option', () => {
  const none = { checks: 0, cards: 0, isRunning: false, hasReceipt: false, logLines: 0 }
  expect(visiblePanels(['vitals', 'gate', 'agents', 'receipt', 'log'], none)).toEqual(['vitals'])
  expect(visiblePanels(['log', 'agents', 'vitals'], { ...none, cards: 2, logLines: 3 })).toEqual(['log', 'agents', 'vitals'])
  expect(isEmptyPanel('receipt', { ...none, isRunning: true })).toBe(false)
  expect(isEmptyPanel('receipt', { ...none, hasReceipt: true })).toBe(false)
  expect(isEmptyPanel('gate', { ...none, checks: 1 })).toBe(false)
})

test('commands: layout, reset, deck, motion, panels', () => {
  expect(parseDeckArgs('layout mini')).toEqual({ cmd: 'layout', layout: 'mini' })
  expect(parseDeckArgs('LAYOUT Wide')).toEqual({ cmd: 'layout', layout: 'wide' })
  expect(parseDeckArgs('layout nope')).toEqual({ cmd: 'layout', layout: null })
  expect(parseDeckArgs('reset')).toEqual({ cmd: 'reset' })
  expect(parseDeckArgs('deck')).toEqual({ cmd: 'deck', action: 'toggle' })
  expect(parseDeckArgs('deck close')).toEqual({ cmd: 'deck', action: 'close' })
  expect(parseDeckArgs('motion off')).toEqual({ cmd: 'motion', motion: false })
  expect(parseDeckArgs('motion maybe')).toEqual({ cmd: 'motion', motion: null })
  expect(parseDeckArgs('panels gate, log')).toEqual({ cmd: 'panels', panels: ['gate', 'log'] })
  expect(parseDeckArgs('panels all')).toEqual({ cmd: 'panels', panels: 'all' })
  expect(parseDeckArgs('')).toBe(null)
  expect(parseDeckArgs('away')).toBe(null)
  expect(parseDeckArgs('status')).toBe(null)
  expect(DECK_USAGE).toContain('/cockpit layout')
})

test('status line piece: only the fields with something to say; nothing at all when there is nothing', () => {
  expect(statusPiece({ ctxPct: 41.4, agentsRunning: 2, agentsTotal: 5, lanesWorking: 3, denied: 1 })).toBe('ctx 41% \u00b7 agents 2/5 \u00b7 lanes 3 working \u00b7 denied 1')
  expect(statusPiece({ ctxPct: null, agentsRunning: 0, agentsTotal: 0, lanesWorking: 0, denied: 0 })).toBeUndefined()
  expect(statusPiece({ ctxPct: 8, agentsRunning: 0, agentsTotal: 0, lanesWorking: 0, denied: 0 })).toBe('ctx 8%')
})

// ---------------------------------------------------------------- 6. motion

test('motion: a connector moves only while a turn, an agent or a lane is working', () => {
  expect(isFlowing(flowOf({ turnRunning: false, agentsRunning: 0, lanesWorking: 0 }))).toBe(false)
  const turn = flowOf({ turnRunning: true, agentsRunning: 0, lanesWorking: 0 })
  const agent = flowOf({ turnRunning: false, agentsRunning: 2, lanesWorking: 0 })
  const lane = flowOf({ turnRunning: false, agentsRunning: 0, lanesWorking: 1 })
  expect([railActive('gate', turn), railActive('receipt', turn), railActive('agents', turn)]).toEqual([true, true, false])
  expect([railActive('agents', agent), railActive('gate', agent), railActive('receipt', agent)]).toEqual([true, true, false])
  expect([railActive('log', lane), railActive('gate', lane)]).toEqual([true, false])
  expect(railActive('vitals', turn)).toBe(false)
  expect([railKind('agents'), railKind('log'), railKind('gate')]).toEqual(['agents', 'lanes', 'turn'])
  expect(stillRail(10, [2, 7], false)).toBe('\u2500\u2500\u252c\u2500\u2500\u2500\u2500\u252c\u2500\u2500')
  expect(stillRail(10, [2], true)[2]).toBe('\u2534')
  expect(packetCells(80, 0).get(0)).toBe('\u25cf')
  expect(PACKET_GAP).toBe(24)
})

// ---------------------------------------------------------------- small formatters

test('formatters', () => {
  expect(kTokens(950)).toBe('950')
  expect(kTokens(12_400)).toBe('12k')
  expect(kTokens(1_250_000)).toBe('1.3M')
  expect(fmtDuration(42_000)).toBe('42s')
  expect(fmtDuration(3_900_000)).toBe('1h05m')
  expect(fmtTimer(65_000)).toBe('1:05')
  expect(shorten('a  b   c', 10)).toBe('a b c')
  expect(shorten('abcdefghij', 5)).toBe('abcd\u2026')
  expect(pathTail('/a/b/c/d.ts', 2)).toBe('c/d.ts')
})
