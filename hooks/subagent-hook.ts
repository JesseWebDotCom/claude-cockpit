import { appendFile, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildConfig, configPathsOf } from './config.ts'

const HOLD_MS = 10 * 60_000
export const STALE_MS = 30 * 60_000
type Event = Record<string, unknown> & { hook_event_name?: string }
type Saved = { agent_id: string; description: string; subagent_type: string; model?: string; plan_ids?: string[]; started_at: number; updated_at: number; state: 'running' | 'done' | 'failed' }
type Pending = { description: string; subagent_type: string; model?: string; plan_ids?: string[]; created_at: number }
const str = (v: unknown): string => typeof v === 'string' ? v.trim() : ''
const safe = (v: string): string => /^[A-Za-z0-9._-]{1,180}$/.test(v) ? v : ''

export function agentDescription(v: unknown, fallback: string): string {
  const s = str(v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return s.slice(0, 240) || fallback
}

export function stoppedState(e: Event): 'done' | 'failed' {
  return e.is_error === true || e.subagent_status === 'failed' || e.error !== undefined ? 'failed' : 'done'
}

const planIdsFromPrompt = (v: unknown): string[] => {
  const s = str(v)
  return [...new Set((s.match(/[A-Z0-9]+(?:-[A-Z0-9]+)+/gi) ?? []).filter(id => id.length <= 80).map(id => id.toUpperCase()))].slice(0, 10)
}

async function atomic(path: string, value: unknown): Promise<void> {
  const tmp = path + '.tmp-' + process.pid + '-' + crypto.randomUUID()
  await writeFile(tmp, JSON.stringify(value) + '\n', { mode: 0o600 })
  await rename(tmp, path)
}

async function json(path: string): Promise<any | null> {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch { return null }
}

async function clean(dir: string, now: number): Promise<void> {
  await mkdir(dir, { recursive: true })
  for (const name of await readdir(dir)) {
    if (!name.endsWith('.json')) continue
    const path = join(dir, name)
    const x = await json(path)
    if (x === null) continue
    const at = typeof x.updated_at === 'number' ? x.updated_at : x.created_at
    if (typeof at === 'number' && x.state !== 'running' && now - at >= HOLD_MS || typeof at === 'number' && name.endsWith('.pending.json') && now - at >= HOLD_MS) await rm(path, { force: true })
  }
}

async function pending(dir: string, type: string): Promise<Pending | null> {
  for (const name of (await readdir(dir)).filter(n => n.endsWith('.pending.json')).sort()) {
    const path = join(dir, name)
    const p = await json(path) as Pending | null
    if (p !== null && p.subagent_type === type) { await rm(path, { force: true }); return p }
  }
  return null
}

export async function handleEvent(e: Event, dir: string, now = Date.now()): Promise<void> {
  await clean(dir, now)
  const event = str(e.hook_event_name)
  if (event === 'PreToolUse') {
    const input = (e.tool_input && typeof e.tool_input === 'object' ? e.tool_input : {}) as Record<string, unknown>
    const type = str(input.subagent_type) || str(input.agent_type) || 'subagent'
    const id = 'pending-' + now + '-' + crypto.randomUUID()
    const plan_ids = planIdsFromPrompt(input.prompt)
    const p: Pending = { description: agentDescription(input.description, type), subagent_type: type, ...(str(input.model) ? { model: str(input.model) } : {}), ...(plan_ids.length > 0 ? { plan_ids } : {}), created_at: now }
    await atomic(join(dir, id + '.pending.json'), p)
    return
  }
  const id = safe(str(e.agent_id))
  if (id === '') return
  const path = join(dir, id + '.json')
  if (event === 'SubagentStart') {
    const type = str(e.agent_type) || 'subagent'
    const p = await pending(dir, type)
    const record: Saved = { agent_id: id, description: agentDescription(p?.description ?? e.description, type), subagent_type: p?.subagent_type ?? type, ...(p?.model ? { model: p.model } : str(e.model) ? { model: str(e.model) } : {}), ...(p?.plan_ids ? { plan_ids: p.plan_ids } : {}), started_at: now, updated_at: now, state: 'running' }
    await atomic(path, record)
  } else if (event === 'PostToolUse') {
    const old = await json(path) as Saved | null
    if (old?.state === 'running') await atomic(path, { ...old, updated_at: now })
  } else if (event === 'SubagentStop') {
    const old = await json(path) as Saved | null
    if (old !== null) await atomic(path, { ...old, updated_at: now, state: stoppedState(e) })
  }
}

export async function runHookSafely(e: Event, dir: string, log: (message: string) => Promise<void>, now = Date.now()): Promise<0> {
  try { await handleEvent(e, dir, now) } catch (error) { await log(String(error).replace(/[\r\n\t]/g, ' ').slice(0, 500)).catch(() => undefined) }
  return 0
}

async function resolveDataDir(): Promise<{ dir: string; log: string }> {
  const home = process.env.HOME ?? ''
  const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
  const layers = await Promise.all(configPathsOf(root, home).map(async l => ({ label: l.label, text: await readFile(l.path, 'utf8').catch(() => null) })))
  const cfg = buildConfig(layers, root, home)
  return { dir: cfg.subagentsDir, log: join(cfg.dataDir, 'logs', 'cockpit-subagents-hook.log') }
}

async function main(): Promise<void> {
  let target: { dir: string; log: string } | null = null
  try {
    target = await resolveDataDir()
    const raw = await Bun.stdin.text()
    const e = JSON.parse(raw) as Event
    await runHookSafely(e, target.dir, async message => {
      await mkdir(join(target!.log, '..'), { recursive: true })
      await appendFile(target!.log, new Date().toISOString() + '\t' + message + '\n')
    })
  } catch (error) {
    try {
      target ??= await resolveDataDir()
      await mkdir(join(target.log, '..'), { recursive: true })
      await appendFile(target.log, new Date().toISOString() + '\t' + String(error).replace(/[\r\n\t]/g, ' ').slice(0, 500) + '\n')
    } catch { /* an unavailable log path must not block Agent */ }
  }
}

if (import.meta.main) await main()
