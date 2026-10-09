// (cockpit 0.5.2): no agent status is ever the word "red"; the words a card may show are a closed list; and "gate red" counts only when it is
// the lane's own latest gate result line, not prose it merely quotes.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { test, expect } from './pure.ts'
import { ACTIVITY_COLOR, ORDER_RULE, STATUS_WORDS, activityOf, gateFailed, statusWordOf } from '../hooks/crew.ts'
import { memberCard, memberDetail } from '../hooks/details.ts'
import type { MemberCardIn } from '../hooks/details.ts'
import { ITEM_STATUS_LABEL } from '../hooks/cards.ts'
import { lastLines } from '../hooks/core.ts'
import { ACTIVITIES } from '../hooks/sprites.ts'
import type { Activity } from '../hooks/sprites.ts'

const ROOT = resolve(import.meta.dir, '..')
const read = (rel: string): string => readFileSync(resolve(ROOT, rel), 'utf8')
const SRC = read('hooks/register.tsx')
const W = 'working' as const

test('the closed list of status words', () => {
  expect([...STATUS_WORDS]).toEqual(['working', 'idle', 'sleeping', 'waiting', 'blocked', 'stuck', 'errored', 'gate failed', 'done'])
})

test('9) every activity the module can produce has a label on the list, and it is never "red"', () => {
  // ACTIVITIES (sprites.ts) is every Activity; ACTIVITY_COLOR has a key for each, so a new one cannot be added without a word.
  expect(Object.keys(ACTIVITY_COLOR).sort()).toEqual([...ACTIVITIES].sort())
  for (const activity of [...ACTIVITIES, 'absent'] as (Activity | 'absent')[]) {
    for (const blocked of [false, true]) {
      const word = statusWordOf(activity, { blocked })
      expect(STATUS_WORDS as readonly string[]).toContain(word)
      expect(word).not.toBe('red')
      expect(word.toLowerCase()).not.toMatch(/\bred\b/)
    }
  }
  expect(statusWordOf('red')).toBe('gate failed')
  expect(statusWordOf('red', { blocked: true })).toBe('gate failed')
  expect(statusWordOf('errored')).toBe('errored')
  expect(statusWordOf('asking')).toBe('waiting')
  expect(statusWordOf('asking', { blocked: true })).toBe('blocked')
  expect(statusWordOf('sleeping', { blocked: true })).toBe('blocked')
  expect(statusWordOf('sleeping')).toBe('sleeping')
  expect(statusWordOf('absent')).toBe('sleeping')
  expect(statusWordOf('stuck')).toBe('stuck')
  expect(statusWordOf('cheering')).toBe('done')
  for (const a of ['coding', 'testing', 'reviewing', 'landing', 'reading', 'planning', 'researching', 'documenting', 'designing', 'working'] as const) expect(statusWordOf(a)).toBe('working')
})

test('9) the activities the detector really finds, from real pane text, all map onto the list (and "red" is a gate that failed)', () => {
  const panes: [string[], 'working' | 'idle'][] = [
    [['Allow command? (y/n)'], W],
    [['• Ran bun test', '(fail) probeAlive > nothing to probe'], W],
    [['The full gate exited 1 on the weather assertion.'], W],
    [['• Ran git push origin main'], W],
    [['• Ran bun test', '12 pass', '0 fail'], W],
    [['• Edited hooks/core.ts (+4 -1)'], W],
    [['• Ran rg -n foo src/'], W],
    [['Thinking about how to split the file'], W],
    [['• Working'], W],
    [['', 'idle'], 'idle'],
  ]
  const seen = new Set<string>()
  for (const [lines, mode] of panes) {
    const a = activityOf(lines, mode, 5)
    seen.add(a)
    const word = statusWordOf(a)
    expect(STATUS_WORDS as readonly string[]).toContain(word)
    expect(word).not.toBe('red')
  }
  expect(seen.has('red')).toBe(true)
  expect(statusWordOf(activityOf(['The full gate exited 1 on the weather assertion.'], W, 5))).toBe('gate failed')
})

test('9) no card shows the activity word: the row chip, the open card, the terminal text and the item pills all use statusWordOf', () => {
  expect(SRC).toContain("state: { text: statusWordOf(m.activity, { blocked: b !== null }),")
  expect(SRC).toContain('activity: statusWordOf(m.activity, { blocked: b !== null }),')
  expect(SRC).toContain("text: running ? 'working' : failed ? 'errored' : 'done'")
  expect(SRC).toContain('pill: statusWordOf(a.activity as Activity),')
  expect(SRC.match(/activityPill\(statusWordOf\(m\.activity/g)?.length).toBe(2)
  expect(SRC).not.toMatch(/activityPill\(m\.activity/)
  expect(SRC).not.toContain('chipWordOf(')
  expect(SRC).not.toMatch(/state: \{ text: '(?:failed|red)'/)
  // an item whose gate failed says "gate failed", not "red" or "failed"
  expect(ITEM_STATUS_LABEL.red).toBe('gate failed')
  expect(Object.values(ITEM_STATUS_LABEL)).not.toContain('red')
  expect(ORDER_RULE.join(' ')).not.toMatch(/\bred\b/)
  expect(ORDER_RULE.join(' ')).toContain('gate failed')
})

const CARD: MemberCardIn = {
  name: 'codex-a', kind: 'codex', activity: 'gate failed', powered: '', target: '', item: 'X-1', doing: '', description: '', lastReport: '', since: '3m', lockOwner: '', lockAge: '',
  context: '', limits: '', blockedBy: [], errored: false, errorReason: '', out: false, back: '', isStale: false, isStuck: false,
}

test('9) the open card says "gate failed", not "red"', () => {
  const lines = memberCard(CARD)
  expect(lines.join('\n')).toContain('gate failed')
  expect(lines.join('\n')).not.toMatch(/\bred\b/)
  expect(JSON.stringify(memberDetail(CARD))).not.toMatch(/"red"/)
})

// ---------------------------------------------------------------- the detector

const QUOTED = lastLines(read('fixtures/pane-codex-quoted-gate-red.txt'), 40)

test('9) the words "the gate is red" inside a brief a lane merely quotes do not flip the card', () => {
  expect(QUOTED.some(l => /gate is red/i.test(l))).toBe(true)
  expect(gateFailed(QUOTED)).toBe(false)
  const a = activityOf(QUOTED, W, 5)
  expect(a).not.toBe('red')
  expect(statusWordOf(a)).not.toBe('gate failed')
  // the same words as prose, bare
  expect(activityOf(['the gate is red in that brief, so it stops'], W, 5)).not.toBe('red')
  expect(activityOf(['Never push on red. Gate red means stop.'], W, 5)).not.toBe('red')
  expect(activityOf(['> Gate: red'], W, 5)).not.toBe('red')
  expect(activityOf(['"Gate is red" is what the brief says'], W, 5)).not.toBe('red')
})

test('9) only the lane\'s own latest gate result line counts: red then green is not failed; green then red is', () => {
  expect(gateFailed(['Gate: red'])).toBe(true)
  expect(gateFailed(['• Gate is red in ONE test'])).toBe(true)
  expect(gateFailed(['Full gate failed on the weather assertion'])).toBe(true)
  expect(gateFailed(['check.sh exit code 1'])).toBe(true)
  expect(gateFailed(['Gate: bash scripts/check.sh exit 1'])).toBe(true)
  expect(gateFailed(['Gate: red', 'work work', 'Gate: green, exit 0'])).toBe(false)
  expect(gateFailed(['Gate: exit 0', 'more', 'Gate: red again'])).toBe(true)
  expect(gateFailed(['Gate: passed'])).toBe(false)
  expect(gateFailed([])).toBe(false)
  expect(gateFailed(['we talked about the gate', 'and it was fine'])).toBe(false)
  // a lane's own gate failure still turns the card to "gate failed"
  expect(activityOf(['• Ran bash scripts/check.sh', 'Gate: red in ONE test'], W, 5)).toBe('red')
  expect(statusWordOf(activityOf(['• Ran bash scripts/check.sh', 'Gate: red in ONE test'], W, 5))).toBe('gate failed')
  // a later green gate result clears it
  expect(activityOf(['Gate: red in ONE test', '• Edited a.ts', 'Gate: exit 0'], W, 5)).not.toBe('red')
})

test('9) the other detectors are unchanged: a failing test line or a non-zero exit is still a failed gate', () => {
  expect(activityOf(['• Ran bun test', '(fail) probeAlive > nothing to probe'], W, 5)).toBe('red')
  expect(activityOf(['The full gate exited 1 on the weather assertion.'], W, 5)).toBe('red')
  expect(activityOf(['error: could not resolve ../../shared'], W, 5)).toBe('red')
})

test('the manifest is 0.5.2 or later', () => {
  expect(JSON.parse(read('.claude-plugin/plugin.json')).version).toMatch(/^0\.\d+\.\d+$/)
})
