import { expect, test } from 'bun:test'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handleEvent, runHookSafely } from '../hooks/subagent-hook.ts'
import { subagentDisplayState } from '../hooks/plan.ts'

test('SubagentStart records only description metadata; SubagentStop is held then pruned on the next hook', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cockpit-subagents-'))
  try {
    await handleEvent({ hook_event_name: 'PreToolUse', tool_input: { description: 'Inspect lane status', subagent_type: 'Explore', model: 'sonnet', prompt: 'PRIVATE /Users/secret/plan.md COCKPIT-SUBAGENTS-01' } }, dir, 1_000)
    await handleEvent({ hook_event_name: 'SubagentStart', agent_id: 'agent-1', agent_type: 'Explore' }, dir, 2_000)
    const path = join(dir, 'agent-1.json')
    const saved = await readFile(path, 'utf8')
    expect(saved).toContain('Inspect lane status')
    expect(JSON.parse(saved).plan_ids).toEqual(['COCKPIT-SUBAGENTS-01'])
    expect(saved).toContain('sonnet')
    expect(saved).not.toContain('PRIVATE')
    expect(saved).not.toContain('/Users/secret')
    await handleEvent({ hook_event_name: 'PostToolUse', agent_id: 'agent-1' }, dir, 2_500)
    expect(JSON.parse(await readFile(path, 'utf8')).updated_at).toBe(2_500)
    await handleEvent({ hook_event_name: 'SubagentStop', agent_id: 'agent-1' }, dir, 3_000)
    expect(JSON.parse(await readFile(path, 'utf8')).state).toBe('done')
    await handleEvent({ hook_event_name: 'SubagentStart', agent_id: 'agent-2', agent_type: 'Explore' }, dir, 3_000 + 10 * 60_000)
    expect(await readdir(dir)).not.toContain('agent-1.json')
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('hook errors return success and log without blocking Agent', async () => {
  const logs: string[] = []
  const code = await runHookSafely({ hook_event_name: 'SubagentStart', agent_id: 'agent-1', agent_type: 'Explore' }, '/proc/invalid/subagents', async s => { logs.push(s) })
  expect(code).toBe(0)
  expect(logs).toHaveLength(1)
})

test('an untouched running subagent becomes stale after 30 minutes', () => {
  expect(subagentDisplayState({ state: 'running', updated_at: 1_000 }, 1_000 + 30 * 60_000 + 1)).toBe('stale')
  expect(subagentDisplayState({ state: 'running', updated_at: 1_000 }, 1_000 + 30 * 60_000)).toBe('running')
})
