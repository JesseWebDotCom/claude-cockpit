import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildPromptContext } from '../hooks/prompt-context.ts'

const NOW = Date.parse('2026-10-14T12:02:00Z')

test('prompt context names every unplanned worker with its type and elapsed time until it is named', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cockpit-context-'))
  try {
    await mkdir(join(dir, 'lane-health', 'subagents'), { recursive: true })
    await writeFile(join(dir, 'lane-health', 'needs-name.json'), JSON.stringify([
      { id: 'AGENT-A1', owner: 'agent-1', since: '2026-10-14T12:00:00Z', hint: 'Inspect parser', asked: '2026-10-14T12:01:00Z' },
      { id: 'LANE-B2', owner: 'codex-w2', since: '2026-10-14T12:01:00Z', hint: 'codex-w2', asked: null },
    ]))
    await writeFile(join(dir, 'lane-health', 'subagents', 'agent-1.json'), JSON.stringify({ subagent_type: 'Explore', started_at: NOW - 120_000, state: 'running' }))
    await writeFile(join(dir, 'plan.json'), JSON.stringify({ updated: '2026-10-14T12:00:00Z', milestones: [], offPlan: [
      { id: 'AGENT-A1', title: 'Untitled: Inspect parser', state: 'running', planned: false },
      { id: 'LANE-B2', title: 'Untitled: codex-w2', state: 'running', planned: false },
    ] }))
    const context = await buildPromptContext(dir, NOW)
    expect(context).toContain('Needs a name: AGENT-A1 (Explore, running 2m): reply with plan-set AGENT-A1 running agent-1 --add "<title>"')
    expect(context).toContain('Needs a name: LANE-B2 (codex, running 1m): reply with plan-set LANE-B2 running codex-w2 --add "<title>"')
    expect(context.match(/Needs a name:/g)).toHaveLength(2)
    await writeFile(join(dir, 'plan.json'), JSON.stringify({ updated: '2026-10-14T12:02:01Z', milestones: [], offPlan: [
      { id: 'AGENT-A1', title: 'Inspect parser', state: 'running', planned: false },
      { id: 'LANE-B2', title: 'Untitled: codex-w2', state: 'running', planned: false },
    ] }))
    expect(await buildPromptContext(dir, NOW + 2)).not.toContain('Needs a name: AGENT-A1')
    expect(await buildPromptContext(dir, NOW + 2)).toContain('Needs a name: LANE-B2')
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('republish request is injected once per plan change and cleared when the publish stamp catches up', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cockpit-context-'))
  try {
    await mkdir(join(dir, 'state'), { recursive: true })
    await writeFile(join(dir, 'plan.json'), JSON.stringify({ updated: '2026-10-14T12:00:00Z', milestones: [] }))
    await writeFile(join(dir, 'plan-page.published'), JSON.stringify({ updated: '2026-10-14T11:00:00Z' }))
    await writeFile(join(dir, 'plan-republish.request'), JSON.stringify({ requestedAt: '2026-10-14T12:00:01Z', reason: 'plan changed' }))

    const first = await buildPromptContext(dir, NOW)
    const second = await buildPromptContext(dir, NOW + 1)
    expect(first).toContain('Republish the plan page: run tools/plan-page-build, publish plan-page.html to plan-page.url, then write plan-page.published with the plan updated stamp.')
    expect(second).not.toContain('Republish the plan page:')

    await writeFile(join(dir, 'plan-page.published'), JSON.stringify({ updated: '2026-10-14T12:00:00Z' }))
    const afterPublish = await buildPromptContext(dir, NOW + 2)
    expect(afterPublish).not.toContain('Republish the plan page:')
    expect(await readFile(join(dir, 'plan-republish.request'), 'utf8')).toBe('')
  } finally { await rm(dir, { recursive: true, force: true }) }
})
