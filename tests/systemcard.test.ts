// COCKPIT-TREE-01 round 1: the System card is exactly the 0.22.0 System card. The fixture was rendered by the code at commit 768f1c8
// (git worktree, `bun snap.ts`); only the shared <style> block is left out because the theme sheet gained plan colours (run, stuck) since.
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { CARD_FLAGS } from '../hooks/panesections.ts'
import { PLAN_CARDS, cardCapSvg, cardHeadSvg, cardLineSvg } from '../hooks/plancards.ts'

const old = JSON.parse(readFileSync(new URL('./fixtures/system-card-0.22.0.json', import.meta.url), 'utf8')) as { def: unknown; out: Record<string, string> }
const body = (svg: string): string => svg.replace(/<style>[\s\S]*?<\/style>/g, '')

test('the System card definition matches 0.22.0 (name, saved flag, closed by default, grey tone)', () => {
  expect(PLAN_CARDS.find(c => c.id === 'system')).toEqual(old.def as never)
  expect(CARD_FLAGS['pc-system']).toBe(false)
})

test('the System card sits second, right under the Plan head, as in 0.22.0', () => {
  expect(PLAN_CARDS.map(c => c.id).slice(0, 2)).toEqual(['title', 'system'])
})

test('the System card drawings are byte-for-byte the 0.22.0 drawings', () => {
  const def = PLAN_CARDS.find(c => c.id === 'system')!
  for (const W of [320, 480]) {
    expect(body(cardHeadSvg(W, def, 3, false).svg)).toBe(body(old.out['head-closed-' + W]!))
    expect(body(cardHeadSvg(W, def, 3, true).svg)).toBe(body(old.out['head-open-' + W]!))
    expect(body(cardHeadSvg(W, def, 0, true).svg)).toBe(body(old.out['head-zero-' + W]!))
    expect(body(cardLineSvg(W, 'CPU 12% · RAM 40% · Disk 61%', 's').svg)).toBe(body(old.out['line-' + W]!))
    expect(body(cardCapSvg(W).svg)).toBe(body(old.out['cap-' + W]!))
  }
})
