// Cockpit v13: the rename (the mod is "Cockpit"), the Captain (the coordinator's row, with the captain's cap), the Captain
// row's item from the REAL status.json shape, and the bar's Active / Away pill. Pure rules and drawings; run with
// `bun test tests/cockpit13.test.ts` or the host's runner.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parseStatus, splitEntries } from '../hooks/board.ts'
import { ACTIVITY_COLOR } from '../hooks/crew.ts'
import { spriteSvg } from '../hooks/draw.ts'
import { captainItem, coordinatorItem } from '../hooks/laneitem.ts'
import { rowSvg } from '../hooks/look.ts'
import type { LookRow } from '../hooks/look.ts'
import { SPRITES } from '../hooks/sprites.ts'
import { presencePill } from '../hooks/ui.ts'
import { isWellFormed } from './helpers.ts'
import { expect, test } from './pure.ts'

const ROOT = resolve(import.meta.dir, '..')
const NOW = Date.parse('2026-10-09T15:00:00Z')
const MIN = 60_000

// ---------------------------------------------------------------------------
// The name

test('the plugin is "cockpit" (0.3.x or later); no manifest or hooks description still says demo-plugin', () => {
  const plugin = JSON.parse(readFileSync(resolve(ROOT, '.claude-plugin/plugin.json'), 'utf8')) as { name: string; version: string; description: string }
  expect(plugin.name).toBe('cockpit')
  expect(plugin.version).toMatch(/^0\.(3\.[1-9]|(?:[4-9]|\d{2})\.\d+)/)
  expect(plugin.description).toContain('/cockpit')
  expect(plugin.description).toContain('/crew')
  expect(plugin.description).not.toContain('demo-plugin')
  expect(readFileSync(resolve(ROOT, 'hooks/hooks.json'), 'utf8')).not.toContain('demo-plugin')
  expect(readFileSync(resolve(ROOT, 'hooks/hooks.json'), 'utf8')).toContain('Cockpit')
})

test('the commands: /cockpit is registered first, /crew and /lanes (and their -status forms) stay as aliases', () => {
  const src = readFileSync(resolve(ROOT, 'hooks/register.tsx'), 'utf8')
  for (const name of ['cockpit', 'cockpit-status', 'crew', 'crew-status', 'lanes', 'lanes-status', 'handoff']) expect(src).toContain("{ name: '" + name + "', description:")
  expect(src.indexOf("{ name: 'cockpit', description:")).toBeLessThan(src.indexOf("{ name: 'crew', description:"))
  expect(src).toContain("for (const name of ['cockpit', 'crew', 'lanes']) on('command.run'")
  expect(src).toContain("for (const name of ['cockpit-status', 'crew-status', 'lanes-status'])")
  expect(src).toContain("const PANE_TITLE = 'Cockpit'")
  expect(src).toContain("'Cockpit opened.' : 'Cockpit closed.'")
})

// ---------------------------------------------------------------------------
// The Captain's item, from the real status.json shape

// What the coordinator really writes: `now` is ONE string (entries separated by semicolons), not a list.
const REAL = JSON.stringify({
  updated: '2026-10-09T09:01:11-0500',
  milestone: 'Pair the app with the remote service',
  done: 5,
  total: 6,
  now: 'AUTH-KEYPAIR-01 (opencode-b): wiring the key path; FEAT-11 (opencode-a): crew rows',
  next: ['fix box key, rerun check'],
  you: ['Run the doctor script on the remote computer and paste it'],
})

test('REGRESSION: a status.json whose `now` is one string used to read as NO entries (an empty NOW and an empty Captain row); it is now split at the semicolons outside parentheses', () => {
  const s = parseStatus(REAL)
  expect(s?.now).toEqual(['AUTH-KEYPAIR-01 (opencode-b): wiring the key path', 'FEAT-11 (opencode-a): crew rows'])
  expect(s?.milestone).toBe('Pair the app with the remote service')
  // A semicolon inside parentheses stays in its entry; a list still works; so does a lone string.
  expect(splitEntries('Waiting for you (hop 5: box rejects App\'s key; retry later); FEAT-13 (opencode-a): rename')).toEqual(["Waiting for you (hop 5: box rejects App's key; retry later)", 'FEAT-13 (opencode-a): rename'])
  expect(splitEntries('one')).toEqual(['one'])
  expect(splitEntries('')).toEqual([])
  expect(parseStatus('{"now":["a","b"],"next":"x; y","you":"z"}')?.next).toEqual(['x', 'y'])
  expect(parseStatus('{"you":"approve it; look at it"}')?.you.map(y => y.text)).toEqual(['approve it', 'look at it'])
})

test('the Captain row always has an item: the first NOW entry while the file is fresh, else the milestone; the full text is for the open row', () => {
  const s = parseStatus(REAL)
  const updatedMs = s?.updatedMs ?? 0
  const fresh = captainItem(s, updatedMs + 5 * MIN, 0)
  expect(fresh.source).toBe('now')
  expect(fresh.line).toBe('AUTH-KEYPAIR-01 (opencode-b): wiring the key path')
  expect(fresh.full).toEqual(['AUTH-KEYPAIR-01 (opencode-b): wiring the key path', 'FEAT-11 (opencode-a): crew rows', 'Milestone: Pair the app with the remote service'])
  // Hours old and older than the live evidence: the milestone name.
  const old = captainItem(s, updatedMs + 5 * 60 * MIN, updatedMs + 4 * 60 * MIN)
  expect(old.source).toBe('milestone')
  expect(old.line).toBe('Pair the app with the remote service')
  // Fresh with no NOW at all: the milestone. The old list shape works too.
  expect(captainItem(parseStatus('{"updated":"2026-10-09T09:00:00-0500","milestone":"M","now":[]}'), Date.parse('2026-10-09T09:05:00-0500'), 0).line).toBe('M')
  expect(captainItem(parseStatus('{"updated":"2026-10-09T09:00:00-0500","milestone":"M","now":["a thing"]}'), Date.parse('2026-10-09T09:05:00-0500'), 0).line).toBe('a thing')
  // Nothing in the file, or no file: nothing (never a guess).
  expect(captainItem(parseStatus('{}'), NOW, 0).line).toBe('')
  expect(captainItem(null, NOW, 0).line).toBe('')
  expect(coordinatorItem(s, updatedMs + MIN, 0)).toBe(fresh.line)
})

const CAPTAIN_ROW: LookRow = {
  kind: 'captain',
  variant: 0,
  mode: 'idle',
  activity: 'sleeping',
  title: 'Captain',
  state: { text: 'sleeping', color: ACTIVITY_COLOR.sleeping },
  item: 'Pair the app with the remote service',
  tag: 'Opus 5.5',
  since: '',
  trouble: null,
  isOut: false,
  indent: 0,
  isOpen: false,
  detail: [],
  bars: [],
  burst: '',
  landed: '',
  phase: 0,
}

test('the Captain row is drawn with its title and its item line under the name, working or sleeping, at every width', () => {
  for (const W of [360, 520, 900]) {
    for (const row of [CAPTAIN_ROW, { ...CAPTAIN_ROW, mode: 'work' as const, activity: 'working' as const, state: { text: 'working', color: ACTIVITY_COLOR.working }, since: '2:36', tone: 'green' as const }]) {
      const svg = rowSvg(W, row)
      expect(isWellFormed(svg)).toBe(true)
      expect(svg).toContain('>Captain<')
      expect(svg).toMatch(/<text class="s"[^>]*>Pair the app with the remote service<\/text>/)
    }
  }
  // A long first NOW entry is cut to the row (an ellipsis), never overflowing; the open row carries the whole text.
  const long = rowSvg(360, { ...CAPTAIN_ROW, item: 'AUTH-KEYPAIR-01 (opencode-b): wiring the key path through the remote computer and the pairing code' })
  expect(long).toContain('\u2026')
  const open = rowSvg(360, { ...CAPTAIN_ROW, isOpen: true, detail: [{ label: 'Now', text: 'AUTH-KEYPAIR-01 (opencode-b):' }, { label: '', text: 'wiring the key path' }] })
  expect(open).toContain('>Now<')
  expect(open).toContain('>wiring the key path<')
})

// ---------------------------------------------------------------------------
// The captain's cap

const NAVY = '#1F3A6E'
const GOLD = '#F5C518'

test('the Captain character wears the cap: navy crown, white band, gold badge; working, sleeping, and awake after a landing', () => {
  // A greyed character (no session) mixes every colour toward grey, so it only has to keep the cap's shapes.
  expect(spriteSvg(0, 0, 'captain', 0, 'dim', 1, 'working')).toContain('class="hat"')
  for (const mode of ['work', 'idle'] as const) {
    const svg = spriteSvg(0, 0, 'captain', 0, mode, 1, 'working')
    expect(svg).toContain(`fill="${NAVY}"`)
    expect(svg).toContain(`fill="${GOLD}"`)
    expect(svg).toContain('class="hat"')
    expect(svg).toContain('fill="#FFFFFF"')
  }
  // the Captain never sleeps: its idle look is the awake still one, cap and colours on, no sleep frames.
  const asleep = spriteSvg(0, 0, 'captain', 0, 'idle', 1, 'working')
  expect(asleep).not.toContain('sleep')
  expect(asleep).toContain('class="sp c-captain still"')
  expect(asleep).toContain(`fill="${NAVY}"`)
  for (const activity of ['coding', 'asking', 'cheering', 'errored'] as const) expect(spriteSvg(0, 0, 'captain', 0, 'work', 1, activity)).toContain(`fill="${NAVY}"`)
})

test('no other character has the cap: max (subagents), codex, api, cloud and local never draw navy', () => {
  for (const kind of ['max', 'codex', 'api', 'cloud', 'local']) {
    for (const variant of [0, 1, 2, 3]) {
      for (const mode of ['work', 'idle'] as const) expect(spriteSvg(0, 0, kind, variant, mode, 1, 'working')).not.toContain(`fill="${NAVY}"`)
    }
  }
  // The Captain is the Claude critter plus the cap: same body, same glasses, same palette.
  expect(SPRITES.captain?.dark.B).toBe(SPRITES.max?.dark.B)
  expect(SPRITES.captain?.accent).toBe(SPRITES.max?.accent)
  expect(SPRITES.captain?.label).toBe('Captain')
  // The terminal sprite has the cap too (navy N and gold A in its own palette, both themes).
  for (const theme of ['dark', 'light'] as const) {
    expect(SPRITES.captain?.[theme].N).toBe(NAVY)
    expect(SPRITES.captain?.[theme].A).toBeDefined()
    expect(SPRITES.max?.[theme].N).toBeUndefined()
  }
  expect(SPRITES.captain?.idle[0]?.p.length).toBeGreaterThan(SPRITES.max?.idle[0]?.p.length ?? 99)
})

test('the register file gives the cap to the Captain row only: it is the one place that names kind captain', () => {
  const src = readFileSync(resolve(ROOT, 'hooks/register.tsx'), 'utf8')
  const rows = [...src.matchAll(/kind: 'captain'/g)].length
  // sessionRowIn, sessionCardData, the band's characters and the cast list; subRowIn and the crew rows keep their kinds.
  expect(rows).toBe(4)
  expect(src).toMatch(/function subRowIn[^]*?kind: 'max'/)
  expect(src).toContain("title: 'Captain'")
  expect(src).not.toContain("title: 'this session'")
})

// ---------------------------------------------------------------------------
// The bar: the Active / Away pill

test('the AUTOPILOT word is grey off and green on (its own mark beside a string-labelled Button, not a Button child)', () => {
  // 0.7.0: the word alone, colour is the only state (no chip, no "on" or "off").
  expect(presencePill(false)).toEqual({ color: 'gray', bold: true, text: 'AUTOPILOT' })
  expect(presencePill(true)).toEqual({ color: 'green', bold: true, text: 'AUTOPILOT' })
  const src = readFileSync(resolve(ROOT, 'hooks/register.tsx'), 'utf8')
  expect(src).toContain("autopilotMark(kit, 'crew-presence-pill', pres.isAway")
})

test('the bar no longer says "now <item>": the progress line is the milestone title, the bar and the count only', () => {
  const src = readFileSync(resolve(ROOT, 'hooks/register.tsx'), 'utf8')
  expect(src).toContain("          now: '',\n")
  expect(src).not.toMatch(/alt: 'Milestone ' \+ st\.title[^\n]*', now '/)
})
