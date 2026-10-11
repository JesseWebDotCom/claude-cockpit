// COCKPIT-69: the slash commands are registered, early and safely.
import { expect, test } from 'bun:test'
import { register, registerCommands } from '../hooks/register.tsx'

const NAMES = ['cockpit', 'cockpit-status', 'agents', 'agents-status', 'crew', 'crew-status', 'lanes', 'lanes-status', 'handoff']

test('registerCommands registers /cockpit, /cockpit-status, /agents, /lanes and the aliases, once', async () => {
  const seen: string[] = []
  const $ = { command: { register: async (d: { name: string }) => { seen.push(d.name) } } } as never
  await registerCommands($)
  await registerCommands($)
  expect(seen).toEqual(NAMES)
})

test('session.start registers the commands first, survives a failing registration and a failing startUp, and still calls next', async () => {
  const seen: string[] = []
  let start: ((...a: unknown[]) => Promise<unknown>) | null = null
  register(((ev: string, ...r: unknown[]) => { if (ev === 'session.start') start = r[r.length - 1] as never }) as never, {} as never)
  const reg = async (d: { name: string }) => { if (d.name === 'cockpit') throw new Error('already'); seen.push(d.name) }
  const $ = new Proxy({ command: { register: reg } }, { get: (t, k) => (k in t ? (t as never)[k] : new Proxy(() => { throw new Error('boom') }, { get: () => () => { throw new Error('boom') } })) }) as never
  let nexted = false
  await start!($, {}, async () => { nexted = true })
  expect(seen).toEqual(NAMES.filter(n => n !== 'cockpit'))
  expect(nexted).toBe(true)
})

test('the module hooks command.run for each command it registers, and session.start', () => {
  const hooked: string[] = []
  register(((ev: string, m: unknown) => { hooked.push(ev + (m !== null && typeof m === 'object' && 'command' in (m as object) ? ':' + (m as { command: string }).command : '')) }) as never, {} as never)
  for (const n of ['cockpit', 'agents', 'crew', 'lanes', 'cockpit-status', 'agents-status', 'lanes-status', 'handoff']) expect(hooked).toContain('command.run:' + n)
  expect(hooked).toContain('session.start')
})
