// Regenerates tests/fixtures.ts from fixtures/pane-*.txt:   bun tools/fixtures.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dir, '..')
const names: Record<string, string> = {
  PANE_CODEX_A: 'pane-codex-a.txt',
  PANE_CODEX_B: 'pane-codex-b.txt',
  PANE_CODEX_C: 'pane-codex-c.txt',
  PANE_CODEX_D: 'pane-codex-d.txt',
  PANE_OPENCODE_A: 'pane-opencode-a.txt',
}
let out = '// The pane captures from fixtures/pane-*.txt (synthetic: an example project, a user called alex), copied here as text (a test may import only\n// its own files, not node:fs). Regenerate with `bun tools/fixtures.ts`; do not edit by hand.\n\n'
for (const [k, f] of Object.entries(names)) out += 'export const ' + k + ' = ' + JSON.stringify(readFileSync(resolve(ROOT, 'fixtures', f), 'utf8')) + '\n\n'
writeFileSync(resolve(ROOT, 'tests/fixtures.ts'), out)
