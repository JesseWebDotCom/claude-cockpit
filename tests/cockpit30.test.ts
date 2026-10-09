// COCKPIT-30 (0.7.2): the Captain and the crew sit under one collapsible "Crew" line.
import { test, expect } from './pure.ts'
import { crewSummary } from '../hooks/crew.ts'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(import.meta.dir, '../hooks/register.tsx'), 'utf8')

test('the Crew summary names trouble first, leaves zero counts out and says so when there is no crew', () => {
  expect(crewSummary({ working: 2, idle: 1, sleeping: 3, blocked: 0, errored: 0 })).toBe('2 working, 1 idle, 3 sleeping')
  expect(crewSummary({ working: 0, idle: 0, sleeping: 2, blocked: 1, errored: 1 })).toBe('1 errored, 1 blocked, 2 sleeping')
  expect(crewSummary({ working: 0, idle: 0, sleeping: 0, blocked: 0, errored: 0 })).toBe('no crew running')
})

test('the Crew line is open by default, its shut state is saved, and it wraps the Captain and the crew rows', () => {
  expect(SRC).toContain("const crewOpen = isSectionOpen(ui.sections, 'c-crew')")
  expect(SRC).toContain("put('cs-crew'")
  const head = SRC.indexOf("put('cs-crew'")
  expect(SRC.indexOf("rowBox('session'", head)).toBeGreaterThan(head)
  expect(SRC.indexOf("put('cs-system'")).toBeGreaterThan(head)
})
