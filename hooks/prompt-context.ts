// Prompt context for work that the coordinator must act on. This hook only reads the project data and emits context;
// worker naming stays visible on each turn until the off-plan row is named, while republish asks are sent once per plan change.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildConfig, configPathsOf } from './config.ts'

type NameEntry = { id?: string; owner?: string; since?: string; hint?: string }
type PlanStep = { id?: string; title?: string; state?: string }
const str = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
const safeToken = (value: string): boolean => /^[A-Za-z0-9._-]{1,100}$/.test(value)
const json = async (path: string): Promise<any | null> => {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch { return null }
}
const isoMs = (value: unknown): number | null => {
  if (typeof value !== 'string' || value.trim() === '') return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}
const elapsedMinutes = (since: unknown, now: number): number => {
  const start = isoMs(since)
  return start === null ? 1 : Math.max(1, Math.floor(Math.max(0, now - start) / 60_000))
}
const allSteps = (plan: any): PlanStep[] => [
  ...(Array.isArray(plan?.items) ? plan.items : []),
  ...(Array.isArray(plan?.offPlan) ? plan.offPlan : []),
  ...(Array.isArray(plan?.milestones) ? plan.milestones.flatMap((m: any) => Array.isArray(m?.steps) ? m.steps : []) : []),
]

function planBehind(planUpdated: unknown, publishedUpdated: unknown): boolean {
  const planMs = isoMs(planUpdated)
  const publishedMs = isoMs(publishedUpdated)
  return planMs !== null && (publishedMs === null || planMs > publishedMs)
}

function workerKind(owner: string): string {
  if (/^(codex|opencode|local|cloud)-/i.test(owner)) return owner.startsWith('codex-') ? 'codex' : owner.split('-')[0]!.toLowerCase()
  return 'subagent'
}

async function workerType(owner: string, dataDir: string): Promise<string> {
  const kind = workerKind(owner)
  if (kind !== 'subagent') return kind
  const record = await json(join(dataDir, 'lane-health', 'subagents', owner + '.json'))
  const type = str(record?.subagent_type).replace(/[^A-Za-z0-9._ -]/g, '').slice(0, 40)
  return type || 'subagent'
}

async function namingLines(dataDir: string, plan: any, now: number): Promise<string[]> {
  const queue = await json(join(dataDir, 'lane-health', 'needs-name.json'))
  if (!Array.isArray(queue)) return []
  const steps = allSteps(plan)
  const lines: string[] = []
  for (const entry of queue as NameEntry[]) {
    const id = str(entry?.id)
    const owner = str(entry?.owner)
    if (!safeToken(id) || !safeToken(owner)) continue
    const row = steps.find(step => str(step?.id).toLowerCase() === id.toLowerCase())
    if (!row || row.state !== 'running' || !str(row.title).startsWith('Untitled:')) continue
    const kind = await workerType(owner, dataDir)
    const elapsed = elapsedMinutes(entry.since, now)
    lines.push('Needs a name: ' + id + ' (' + kind + ', running ' + elapsed + 'm): reply with plan-set ' + id + ' running ' + owner + ' --add "<title>" to name the row, or --milestone <id> to attach it.')
  }
  return lines
}

async function republishLine(dataDir: string, plan: any, published: any): Promise<string | null> {
  const requestPath = join(dataDir, 'plan-republish.request')
  const requestText = await readFile(requestPath, 'utf8').catch(() => null)
  const request = requestText ? safeJson(requestText) : null
  const behind = planBehind(plan?.updated, published?.updated)
  const planMs = isoMs(plan?.updated)
  const publishedMs = isoMs(published?.updated)
  const caughtUp = planMs !== null && publishedMs !== null && publishedMs >= planMs
  if (caughtUp) {
    if (requestText !== null) await writeFile(requestPath, '')
    return null
  }
  if (requestText === null && !behind) return null
  const markerPath = join(dataDir, 'state', 'republish-context.json')
  const marker = await json(markerPath)
  const key = str(plan?.updated) || str(request?.requestedAt) || 'request-without-stamp'
  if (marker?.key === key) return null
  await mkdir(join(dataDir, 'state'), { recursive: true })
  await writeFile(markerPath, JSON.stringify({ key }) + '\n', { mode: 0o600 })
  return 'Republish the plan page: run tools/plan-page-build, publish plan-page.html to plan-page.url, then write plan-page.published with the plan updated stamp.'
}

function safeJson(text: string): any | null {
  try { return JSON.parse(text) } catch { return null }
}

/** Return the lines that should appear in UserPromptSubmit additional context. */
export async function buildPromptContext(dataDir: string, now = Date.now()): Promise<string> {
  const plan = await json(join(dataDir, 'plan.json'))
  const published = await json(join(dataDir, 'plan-page.published'))
  const lines = await namingLines(dataDir, plan, now)
  const republish = await republishLine(dataDir, plan, published)
  if (republish) lines.push(republish)
  return lines.join('\n')
}

async function resolveDataDir(): Promise<string> {
  const home = process.env.HOME ?? ''
  const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
  const layers = await Promise.all(configPathsOf(root, home).map(async layer => ({ label: layer.label, text: await readFile(layer.path, 'utf8').catch(() => null) })))
  return buildConfig(layers, root, home).dataDir
}

async function main(): Promise<void> {
  try {
    const context = await buildPromptContext(await resolveDataDir())
    if (context !== '') console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context } }))
  } catch {
    // An unavailable optional context file must never stop a prompt.
  }
}

if (import.meta.main) await main()
