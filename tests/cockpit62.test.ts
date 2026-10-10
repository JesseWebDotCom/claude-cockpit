// COCKPIT-62: the host's hook validator rejects a module that passes $ to a helper that is not declared at the top level of the file.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { test, expect } from './pure.ts'

const src = readFileSync(resolve(import.meta.dir, '../hooks/register.tsx'), 'utf8')

test('every helper that takes $ is declared at the top level of register.tsx', () => {
  const names = new Set([...src.matchAll(/\b([A-Za-z_]\w*)\(\$[,)]/g)].map(m => m[1] as string))
  const bad = [...names].filter(n => !['on', 'if', 'for', 'while', 'switch'].includes(n) && !new RegExp(`^(?:export )?(?:async )?function ${n}\\b|^(?:export )?const ${n}\\b`, 'm').test(src))
  expect(bad).toEqual([])
})

test('scrollPane is inlined in its hook, not a nested helper taking $', () => {
  expect(src).not.toContain('scrollPane')
})
