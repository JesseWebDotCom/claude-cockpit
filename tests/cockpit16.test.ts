// the bar above the prompt vanished in 0.3.0 because the Active/Away Button had a coloured Text child and the real host
// refuses that ("JSX element <Button key="crew-presence"> takes one string child, its label, or none", .cockpit/logs/band-fault.log).
// Pure checks over the source and the pure rules: runs under plain `bun test`.

import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { test, expect } from './pure.ts'
import { PRESENCE_SWITCH, buttonChildProblems, plainBandText, presencePill } from '../hooks/ui.ts'

const ROOT = resolve(import.meta.dir, '..')
const read = (rel: string): string => readFileSync(resolve(ROOT, rel), 'utf8')

test('no Button in the mod carries a child: every Button is a string label only (the host refuses anything else)', () => {
  for (const f of readdirSync(resolve(ROOT, 'hooks')).filter(n => /\.(ts|tsx)$/.test(n))) {
    expect(buttonChildProblems(read('hooks/' + f))).toEqual([])
  }
})

test('the guard catches the exact v13 construct, and the JSX form, and leaves a string-labelled Button alone', () => {
  const v13 = "const b = Button({ key: 'crew-presence', label: 'Active', plain: true, onPress: () => go(), children: [Text({ backgroundColor: 'success', children: [' Active '] })] })"
  expect(buttonChildProblems(v13)).toHaveLength(1)
  expect(buttonChildProblems("Button({ key: 'x', label: 'a', onPress: () => ({ children: 1 }) })")).toEqual([])
  expect(buttonChildProblems("Button({ key: 'x', label: 'children: [' })")).toEqual([])
  expect(buttonChildProblems('<Button key="a" onPress={f}>{name} <Text dimColor>2m</Text></Button>')).toHaveLength(1)
  expect(buttonChildProblems("<Button key=\"a\" onPress={f}>{name}</Button>")).toEqual([])
})

test('the presence switch is a thin string, the colour is a Text beside it', () => {
  expect(typeof PRESENCE_SWITCH).toBe('string')
  expect(PRESENCE_SWITCH.length).toBeLessThanOrEqual(2)
  const src = read('hooks/register.tsx')
  expect(src).toMatch(/const presenceButton = Button\(\{ key: 'crew-presence', label: PRESENCE_SWITCH, plain: true, onPress: [^}]*\}\)/)
  expect(presencePill(false).color).toBe('gray')
  expect(presencePill(true).color).toBe('green')
})

test('the last resort is one plain Text line: counts and Active or Away as words, and the fallback chain reaches it', () => {
  expect(plainBandText({ working: 2, idle: 5, total: 7, isAway: false, needLook: 0 })).toBe('7 crew: 2 working, 5 idle \u00b7 AUTOPILOT off')
  expect(plainBandText({ working: 0, idle: 7, total: 7, isAway: true, needLook: 3 })).toBe('7 crew: 0 working, 7 idle \u00b7 AUTOPILOT on \u00b7 ! 3')
  const src = read('hooks/register.tsx')
  const tail = src.slice(src.indexOf('return await draw(false)'))
  const lastResort = tail.slice(0, tail.indexOf('// The panel:'))
  expect(lastResort).toContain('plainBandText(')
  expect(lastResort).not.toContain('Button(')
  expect(lastResort).not.toContain('presenceButton')
})
