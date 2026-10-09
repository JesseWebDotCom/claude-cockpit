import { expect, test } from './pure.ts'

import { buildRow, meaningfulTail } from '../hooks/core.ts'
import { cleanLine, isJunkLine, letterShare, stripNoise } from '../hooks/text.ts'

// The three strings Alex's 9:33 PM screenshots showed in the description line. Each must be rejected.
const JUNK_CODE_1 = "'#FFFFFF')"
const JUNK_CODE_2 = ".replace(/\\bundefined\\b/g, '')"
const JUNK_ART = '\u2592\u2592 zsh \u2592\u2592 100\u2592 21:29:35'

test('the exact junk from the screenshots is rejected', async () => {
  for (const line of [JUNK_CODE_1, JUNK_CODE_2, JUNK_ART]) {
    expect(isJunkLine(line)).toBe(true)
    expect(cleanLine(line)).toBe('')
  }
})

test('junk is never shown as a tail: a pane of nothing but junk shows nothing', async () => {
  expect(meaningfulTail([JUNK_CODE_1, JUNK_CODE_2, JUNK_ART])).toBe('')
  // Real text above the junk wins.
  expect(meaningfulTail(['ran the tests, 14 passed', JUNK_CODE_1, JUNK_ART])).toBe('ran the tests, 14 passed')
  expect(buildRow('codex-a', 'idle', null, [JUNK_CODE_1, JUNK_CODE_2, JUNK_ART], undefined, 0).tail).toBe('')
})

test('code and shell fragments are rejected', async () => {
  for (const line of [
    'const f = (x) => x + 1',
    'doThing();',
    "foo('bar')",
    'if (a) { return b }',
    'x.replace(/\\d+/g, "")',
    '`a` `b` `c` `d` `e` `f`',
    '\u2588\u2588\u2588\u2588\u2591\u2591\u2591\u2591',
    '\u2800\u2801\u2802\u2803\u2804',
    '\u2500\u2500\u2500\u2500\u2500\u2500',
  ]) {
    expect(isJunkLine(line)).toBe(true)
  }
})

test('a clock, a prompt or a status fragment is rejected', async () => {
  for (const line of ['zsh', 'home main \u21937 ?1', '100% 21:29:35', ' zsh   100  21:39:47 ', '8m 13.876s zsh', 'codex/d41 \u21911 \u2193209 ~1']) {
    expect(isJunkLine(line)).toBe(true)
  }
})

test('lines with under 60% letters are rejected, plain words pass', async () => {
  expect(letterShare('abc')).toBe(1)
  expect(letterShare('a1 b2 c3 d4')).toBeLessThan(0.6)
  expect(isJunkLine('12 34 56 78 9a')).toBe(true)
  expect(isJunkLine('')).toBe(true)
  for (const ok of [
    'land FORMS-03b in one pass',
    'ran the tests, 14 passed',
    'doing things',
    'Disconnected from this task. Any running work continues.',
    'The full gate exited 1 on the freshScore.test.ts weather assertion.',
    'write the SearXNG developer doc',
  ]) {
    expect(isJunkLine(ok)).toBe(false)
    expect(cleanLine(ok)).toBe(ok)
  }
})

test('control and block characters are stripped from what is shown', async () => {
  expect(stripNoise('a\u0007b\u001bc')).toBe('a b c')
  expect(stripNoise('\u2592\u2592 hello \u2592\u2592')).toBe('hello')
  expect(stripNoise('\u2801 braille \u28ff')).toBe('braille')
  expect(stripNoise('\u2502 boxed text \u2502')).toBe('boxed text')
  expect(stripNoise('  many    spaces\there ')).toBe('many spaces here')
  expect(cleanLine('\u2592 hello world here \u2592')).toBe('hello world here')
})
