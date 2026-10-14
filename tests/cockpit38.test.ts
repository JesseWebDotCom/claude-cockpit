// COCKPIT-38: the Main status card fills itself from live data and never says "stale" in its headline.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { test, expect } from './pure.ts'
import { agoText, landedText, notesNote, nowItems, reportText, runningText } from '../hooks/maincard.ts'
import { parseClaim } from '../hooks/laneitem.ts'
import { parseExtras } from '../hooks/hosts.ts'
import { parseStatus } from '../hooks/board.ts'
import { statusHeight, statusSvg } from '../hooks/look.ts'
import type { LookStatus } from '../hooks/look.ts'
import { lookStatusForTest, setCardSourcesForTest } from '../hooks/register.tsx'

const H = 3_600_000
const NOW = 1_800_000_000_000
const textsOf = (svg: string): string[] => [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map(m => m[1] ?? '')

const BASE: LookStatus = { title: 'Main status', ratio: 0.5, count: 'M · 5/10', note: '', now: '', next: 'step two', you: 'answer one', youHex: '#F0A500', isAway: false, presenceText: 'Active', stale: '', phase: 0 }

test('the claims become the NOW lines: id plus first line, a closed claim leaves, newest first', () => {
  const claims = [
    parseClaim('A-1.claim', 'A-1 write the parser\nlane: x\n', NOW - 2 * H),
    parseClaim('B-2.claim', 'B-2\n', NOW - 5 * 60_000),
    parseClaim('C-3.claim', 'plain words for c\n', NOW - 3 * H),
    parseClaim('D-4.claim', 'D-4 done already\n', NOW - 4 * H),
    parseClaim('OLD-5.claim', 'too old\n', NOW - 30 * H),
  ]
  const reports = [{ id: 'D-4', mtimeMs: NOW - 1 * H }]
  expect(nowItems(claims, reports, NOW)).toEqual(['B-2', 'A-1: write the parser', 'C-3: plain words for c'])
})

test('running, landed, report and notes texts', () => {
  expect(runningText({ sessions: 3, agents: 1, byState: { editing: 1 } })).toBe('3 sessions, 1 agent (1 editing)')
  expect(runningText({ sessions: 2, agents: 0, byState: {} })).toBe('2 sessions, 0 agents')
  expect(runningText({ sessions: 1, agents: 0, byState: {} })).toBe('')
  expect(landedText({ subject: 'ITEM-1: did it', ms: NOW - 12 * 60_000 }, NOW)).toBe('ITEM-1: did it · 12m ago')
  expect(landedText(null, NOW)).toBe('')
  expect(reportText([{ id: 'one', mtimeMs: NOW - 3 * H }, { id: 'two', mtimeMs: NOW - 60_000 }], NOW)).toBe('two · 1m ago')
  expect(reportText([], NOW)).toBe('')
  expect(agoText(50 * H)).toBe('2d')
  expect(notesNote(NOW - 2 * 24 * H, NOW, 6)).toBe('notes from 2d ago')
  expect(notesNote(NOW - 2 * H, NOW, 6)).toBe('')
  expect(notesNote(null, NOW, 6)).toBe('')
})

test('the card with live lines: lines show in order, no word stale anywhere', () => {
  const s: LookStatus = { ...BASE, now: 'A-1: x', nowItems: ['A-1: x'], main: { running: '1 lane awake', landed: 'S · 1m ago', report: 'r · 2m ago', notes: 'notes from 2d ago' } }
  const svg = statusSvg(420, s)
  const t = textsOf(svg)
  expect(t.slice(t.indexOf('NOW'), t.indexOf('NOW') + 1)).toEqual(['NOW'])
  const order = ['NOW', 'RUNNING', 'LANDED', 'REPORT', 'NEXT', 'YOU'].map(l => t.indexOf(l))
  expect(order.every((v, i) => v >= 0 && (i === 0 || v > (order[i - 1] as number)))).toBe(true)
  expect(svg.toLowerCase()).not.toContain('stale')
  expect(statusHeight(420, s)).toBeGreaterThan(statusHeight(420, { ...BASE, nowItems: [] }))
})

test('the dim note is on NEXT and YOU only, and only when there is something on the line', () => {
  const s: LookStatus = { ...BASE, main: { running: '', landed: '', report: '', notes: 'notes from 2d ago' } }
  const t = textsOf(statusSvg(420, s))
  expect(t.filter(x => x === 'notes from 2d ago').length).toBe(2)
  const quiet = textsOf(statusSvg(420, { ...s, next: '', you: '' }))
  expect(quiet.filter(x => x === 'notes from 2d ago').length).toBe(0)
  const fresh = textsOf(statusSvg(420, { ...s, main: { ...(s.main as any), notes: '' } }))
  expect(fresh.join('|')).not.toContain('notes from')
  // The title row and the live lines carry no note.
  expect(t.slice(0, t.indexOf('NEXT')).join('|')).not.toContain('notes from')
})

test('missing sources: no live lines, no error, NEXT and YOU still drawn', () => {
  const s: LookStatus = { ...BASE, main: { running: '', landed: '', report: '', notes: '' } }
  const t = textsOf(statusSvg(420, s))
  for (const gone of ['NOW', 'RUNNING', 'LANDED', 'REPORT']) expect(t).not.toContain(gone)
  expect(t).toContain('NEXT')
  expect(t).toContain('YOU')
  expect(statusHeight(420, s)).toBe(statusHeight(420, { ...BASE }) - 22)
})

test('through the pane data: a 2-day-old status file shows live lines, no stale text, a note for the manual lines', () => {
  const old = parseStatus(JSON.stringify({ updated: new Date(NOW - 48 * H).toISOString(), milestone: 'M', done: 5, total: 10, now: ['hand-written now'], next: ['n1'], you: ['y1'] }))
  setCardSourcesForTest({
    status: old,
    claims: [parseClaim('Z-9.claim', 'Z-9 the live thing\n', NOW - 60_000)],
    itemReports: [{ id: 'Y-8', mtimeMs: NOW - 120_000, gate: null, scope: '' }],
    lastCommit: { subject: 'Z-8: landed it', ms: NOW - 600_000 },
    crew: [],
    subs: [],
  })
  const card = lookStatusForTest(NOW)
  expect(card.stale).toBe('')
  expect(card.title).toBe('Main status')
  expect(card.now).toBe('Z-9: the live thing')
  expect(card.now).not.toContain('hand-written')
  expect(card.main?.landed).toBe('Z-8: landed it · 10m ago')
  expect(card.main?.report).toBe('Y-8 · 2m ago')
  expect(card.main?.notes).toBe('notes from 2d ago')
  expect(statusSvg(420, card).toLowerCase()).not.toContain('stale')
})

test('through the pane data with nothing: no claims, no commit, no reports, no file', () => {
  setCardSourcesForTest({ status: null, claims: [], itemReports: [], lastCommit: null, crew: [], subs: [] })
  const card = lookStatusForTest(NOW)
  expect(card.now).toBe('')
  expect(card.main).toEqual({ running: '', landed: '', report: '', notes: '' })
  expect(() => statusSvg(420, card)).not.toThrow()
})

test('config keys: folders and the notes threshold, neutral defaults when absent', () => {
  expect(parseExtras({}, []).card).toBeUndefined()
  const e = parseExtras({ claimsDir: '/a/claims', reportsDir: '/a/reports/', notesHours: 12 }, [])
  expect(e.card).toEqual({ claimsDir: '/a/claims', reportsDir: '/a/reports', notesHours: 12 })
  const w: string[] = []
  expect(parseExtras({ claimsDir: 'rel', notesHours: -1 }, w).card).toBeUndefined()
  expect(w.length).toBe(2)
})

test('shipped code names no product', () => {
  const src = ['maincard.ts', 'hosts.ts'].map(f => readFileSync(resolve(import.meta.dir, '../hooks', f), 'utf8')).join('\n')
  expect(/mai.?pai|chat.?ab/i.test(src)).toBe(false)
})

test('status-set patches one key, stamps updated, leaves the others', () => {
  const dir = mkdtempSync(join(tmpdir(), 'status-set-'))
  const file = join(dir, 'status.json')
  writeFileSync(file, JSON.stringify({ updated: '2020-01-01T00:00:00+0000', milestone: 'M', done: 1, total: 4, next: ['a'], you: [] }))
  const script = resolve(import.meta.dir, '../tools/status-set')
  const run = (...a: string[]) => Bun.spawnSync([script, '--file', file, ...a], { stdout: 'pipe', stderr: 'pipe' })
  expect(run('done', '3').exitCode).toBe(0)
  let j = JSON.parse(readFileSync(file, 'utf8'))
  expect(j.done).toBe(3)
  expect(j.milestone).toBe('M')
  expect(j.total).toBe(4)
  expect(j.next).toEqual(['a'])
  expect(j.updated).not.toBe('2020-01-01T00:00:00+0000')
  expect(Math.abs(Date.parse(j.updated) - Date.now())).toBeLessThan(60_000)
  expect(run('you', 'one', 'two').exitCode).toBe(0)
  j = JSON.parse(readFileSync(file, 'utf8'))
  expect(j.you).toEqual(['one', 'two'])
  expect(j.done).toBe(3)
  expect(run('bogus', 'x').exitCode).toBe(2)
  expect(run('done', 'x').exitCode).toBe(2)
  expect(JSON.parse(readFileSync(file, 'utf8')).done).toBe(3)
})


test('status-set clears derived list fields when they have no entries', () => {
  const dir = mkdtempSync(join(tmpdir(), 'status-set-empty-'))
  const f = join(dir, 'status.json')
  writeFileSync(f, JSON.stringify({ now: ['old work'], next: ['old next'], you: ['keep'] }))
  const script = resolve(import.meta.dir, '../tools/status-set')
  const r = Bun.spawnSync([script, '--file', f, 'now'], { stdout: 'pipe', stderr: 'pipe' })
  expect(r.exitCode).toBe(0)
  const d = JSON.parse(readFileSync(f, 'utf8'))
  expect(d.now).toEqual([])
  expect(d.next).toEqual(['old next'])
  expect(d.you).toEqual(['keep'])
})
