// COCKPIT-58: a hook that sits in the path of a prompt, a tool call, a spawn or a command never lets its own bookkeeping fail the event.
import { test, expect } from './pure.ts'
import { register } from '../hooks/register.tsx'

type Handler = (...a: any[]) => any
const handlers: { name: string; filter: any; fn: Handler }[] = []
const on: any = (name: string, a: any, b?: Handler) => handlers.push(b === undefined ? { name, filter: null, fn: a } : { name, filter: a, fn: b })
register(on, {} as any)

// An engine whose every call throws: the worst case for the bookkeeping.
const broken: any = new Proxy({}, {
  get: () => new Proxy(() => undefined, { get: () => () => { throw new Error('engine down') }, apply: () => { throw new Error('engine down') } }),
})
const find = (name: string, command?: string): Handler => {
  const h = handlers.find(x => x.name === name && (command === undefined || x.filter?.command === command))
  if (!h) throw new Error('no hook ' + name)
  return h.fn
}

test('prompt.submit still passes the prompt on when the engine clock fails', async () => {
  const out = await find('prompt.submit')(broken, { text: 'hi' }, async (e: any) => ({ passed: e }))
  expect(out).toEqual({ passed: { text: 'hi' } })
})

test('tool.call still runs the tool when the engine clock fails', async () => {
  const out = await find('tool.call')(broken, { tool: 'Bash' }, async () => 'ran')
  expect(out).toBe('ran')
})

test('turn.start still passes on when the engine clock fails', async () => {
  const out = await find('turn.start')(broken, {}, async () => 'go')
  expect(out).toBe('go')
})

test('agent.spawn returns the spawn result when the bookkeeping fails', async () => {
  const res = { agentId: 'a1', model: 'm' }
  expect(await find('agent.spawn')(broken, {}, async () => res)).toBe(res)
})

test('ui.scroll goes on to the host when the plugin cannot work out the scroll', async () => {
  const out = await find('ui.scroll')(broken, undefined, async () => 'host')
  expect(out).toBe('host')
})

test('/handoff answers with text that says what to do when writing fails', async () => {
  const out = await find('command.run', 'handoff')(broken, {})
  expect(out.text).toContain('/reload-plugins')
})
