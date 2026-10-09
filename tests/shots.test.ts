// The look-at-it loop, part 1: drive the real mod with fixture data (test names, not real ones) and print each
// drawn tree as one line, `@@SHOT|<name>|<json>`. tools/render.ts runs `claude plugin test`, reads those lines,
// turns each tree into an HTML page (the Svg elements as images, the native Text, Button, Input and Box
// elements simulated) and takes a headless Chrome screenshot into shots/. The assertions here only make sure
// the trees exist and are not empty.

import { expect, mock, test } from 'claude-code/testing'

import { DATA, IDLE_PANE, QUEUE, WORKING_PANE, newWorld, put, stubWorld } from './world.ts'
import type { World } from './world.ts'
import { PANE_OPENCODE_A } from './fixtures.ts'

const NOW0 = Date.parse('2026-10-08T22:00:00Z')
const MIN = 60_000
const HOUR = 60 * MIN

const PANE = { plugin: 'cockpit', component: 'Pane', requestId: 'crew', surface: 'desktop', viewport: { columns: 100, rows: 40 }, props: { title: 'Cockpit', isFocused: true, bodyColumns: 65, placement: 'dock', scroll: { offset: 0, bodyRows: 80 }, view: {} } } as const
const BAND = { plugin: 'cockpit', component: 'AbovePrompt', requestId: 'band', surface: 'desktop', viewport: { columns: 100, rows: 40 }, props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 80, scroll: { offset: 0, bodyRows: 11 }, view: {} } } as const

const OUT_PANE = "You've hit your usage limit. Try again later.\n\n  ? for shortcuts\n"

// Eight members: two working, one errored, one blocked, one out of credits, three sleeping, plus a cloud one.
function scenario(theme: string): World {
  const w = newWorld()
  w.theme = theme
  w.sessions = ['codex-a', 'codex-b', 'codex-c', 'codex-d', 'codex-e', 'codex-f', 'opencode-1', 'cloud-commons-remote-state', 'local-llama']
  const panes: Record<string, string> = { 'codex-a': WORKING_PANE, 'codex-b': WORKING_PANE, 'codex-c': OUT_PANE, 'codex-d': IDLE_PANE, 'codex-e': IDLE_PANE, 'codex-f': IDLE_PANE, 'opencode-1': PANE_OPENCODE_A, 'cloud-commons-remote-state': WORKING_PANE, 'local-llama': IDLE_PANE }
  // A local model server behind the local lane, the measured OpenCode spend, and the transcript cost buckets
  // (the sample numbers only): the 5h window starts at 19:00 UTC, so the 17:0 bucket is outside it.
  w.ps = 'llama-server -m /models/llama-9b.gguf --port 8081\nopencode run -m anthropic/claude-sonnet-5-5 "sample"\n'
  w.ctx = { tokens: 102_000 }
  // The Fable week (32% used) is not in the live windows: it comes from the saved usage cache (as of 21:40).
  put(w, DATA + '/usage-cache.json', JSON.stringify({ fiveHour: null, week: null, fable: { pct: 32, resetsAt: new Date(NOW0 + 2 * 24 * HOUR).toISOString(), at: NOW0 - 20 * 60_000, source: 'manual' } }), NOW0)
  w.sqlite = '3.41|34'
  // v9: an opencode run is up (opencode-1 works on its brief), and this session's own entry says busy.
  w.pgrep = '4242 opencode run Read and do ' + QUEUE + '/brief-b70.md\n'
  put(w, '/Users/test/.claude/sessions/4001.json', JSON.stringify({ pid: 4001, sessionId: w.sessionId, status: 'busy', updatedAt: new Date(NOW0 - 2 * MIN).toISOString() }), NOW0)
  w.costFind = '1791500000 480000 /Users/test/.claude/projects/sample/one.jsonl\n'
  w.costAwk = ['2026-10-08T19:3', '2026-10-08T20:4', '2026-10-08T21:5', '2026-10-08T17:0'].map((b, i) => `/Users/test/.claude/projects/sample/one.jsonl\t${b}\tclaude-opus-5-5\t${40 + i}\t${9000 + i * 100}\t${2_000_000}\t${300_000}\t${100_000}`).join('\n') + '\n'
  for (const s of w.sessions) w.panes[s] = panes[s] ?? IDLE_PANE
  put(w, DATA + '/lane-locks/opencode-1.lock', 'c\topencode-1\tt\tb70\n', NOW0 - HOUR)
  put(w, DATA + '/lane-locks/codex-a.lock', 'c\tcodex-a\tt\tb21\n', NOW0 - HOUR)
  put(w, DATA + '/lane-locks/codex-b.lock', 'c\tcodex-b\tt\tb50\n', NOW0 - 20 * MIN)
  put(w, QUEUE + '/brief-b21.md', '# b21: land the sample settings screen\n', NOW0 - 2 * HOUR)
  put(w, QUEUE + '/brief-b50.md', '# b50: the sample installer\n', NOW0 - HOUR)
  put(w, QUEUE + '/brief-b70.md', '# b70: the sample report page\n', NOW0 - HOUR)
  put(w, QUEUE + '/brief-b30.md', '# b30: the sample place map\n', NOW0 - 15 * MIN)
  put(w, DATA + '/crew-deps.json', JSON.stringify({ waits: [{ member: 'codex-b', on: 'codex-a', why: 'needs the sample pin first' }] }), NOW0)
  put(w, DATA + '/crew-targets.json', JSON.stringify({ b21: 'Settings screen', b50: 'Installer', b70: 'Report page', b30: 'Place map' }), NOW0)
  put(w, DATA + '/status.json', JSON.stringify({ updated: new Date(NOW0 - 3 * MIN).toISOString(), milestone: 'Sample milestone', done: 3, total: 6, now: ['b21 settings screen', 'b50 installer'], next: ['b30 place map', 'b60 backup'], you: [{ text: 'approve the sample pin bump', blocking: 'b50 waits on it' }] }), NOW0)
  put(w, DATA + '/credits.json', JSON.stringify({ opencode: { total: 200, left: 197, expires: '2026-10-28', start: '2026-10-01' }, cloud: { expires: '2026-11-30' } }), NOW0)
  put(w, DATA + '/inbox.jsonl', '{"id":"a3f","kind":"bug","text":"sample bug: the page is blank on phones","at":"2026-10-08T21:00:00.000Z","by":"sam","status":"new"}\n{"id":"b71","kind":"feature","text":"sample idea: dark mode for the shell","at":"2026-10-08T21:30:00.000Z","by":"sam","status":"new"}\n', NOW0)
  w.gitLog = '4d3cf848 feat: sample landing (b22)\n9dc1cecd chore: sample bump\n'
  const future = Math.floor(NOW0 / 1000) + 3600
  const log = '/Users/test/.codex/sessions/2026/10/08'
  put(w, log + '/rollout.jsonl', 'x', NOW0)
  w.tails[log + '/rollout.jsonl'] = '{"payload":{"rate_limits":{"primary":{"used_percent":52,"window_minutes":300,"resets_at":' + future + '},"secondary":{"used_percent":80,"window_minutes":10080,"resets_at":' + (future + 86400) + '}}}}\n'
  w.rateLimits = [
    // the owner's real figures: the plan 5h is 0% used and the week 87% used, while this session's context is 51%.
    { kind: 'five_hour', percentUsed: 0, resetsAt: new Date(NOW0 + 7.5 * HOUR).toISOString() },
    { kind: 'seven_day', percentUsed: 87, resetsAt: new Date(NOW0 + 2 * 24 * HOUR).toISOString() },
  ]
  return w
}

const dump = (name: string, tree: unknown): void => {
  ;(globalThis as unknown as { console: { log: (s: string) => void } }).console.log('@@SHOT|' + name + '|' + JSON.stringify(tree))
}

async function boot($: any, on: any, w: World) {
  const clock = mock.clock(on, { now: NOW0 })
  stubWorld(on, w)
  on('session.start', () => ({ cwd: '/work' }))
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await clock.advance(5000)
  await clock.settle()
  await clock.advance(31000)
  await clock.settle()
  return clock
}

for (const theme of ['dark', 'light']) {
  for (const cols of [45, 65]) {
    // 45 columns draw 352 px, 65 columns draw 512 px.
    test('shots ' + theme + ' ' + cols, async ($, on) => {
      const w = scenario(theme)
      const clock = await boot($, on, w)
      const mount = async (props: Record<string, unknown> = {}) => $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: cols, ...props } })
      const tag = theme + '-' + (cols === 45 ? '360' : '520')
      let m = await mount()
      dump('crew-' + tag, await m.drawn())
      // One row open in place (a Codex member), and the coordinator's.
      await m.press({ key: 'row-codex-a' })
      dump('crewopen-' + tag, await m.drawn())
      await m.press({ key: 'row-session' })
      dump('crewsession-' + tag, await m.drawn())
      await m.press({ key: 'row-session' })
      // COCKPIT-23: one page, no tabs. The System card opened (it holds the Health content), then the Add Bug field.
      await m.press({ key: 'cs-system' })
      dump('system-' + tag, await m.drawn())
      // COCKPIT-26: all three section cards open at once; none of them hides another.
      await m.press({ key: 'cs-flight' })
      await m.press({ key: 'cs-blackbox' })
      dump('sections-' + tag, await m.drawn())
      await m.press({ key: 'cs-flight' })
      await m.press({ key: 'cs-blackbox' })
      await m.press({ key: 'cs-system' })
      await m.press({ key: 'add-bug' })
      dump('inboxadd-' + tag, await m.drawn())
      await m.press({ key: 'add-bug' })
      // A status file nobody has updated for two hours: the amber stale chip on the NOW line (v9).
      if (cols === 65 || cols === 45) {
        put(w, DATA + '/status.json', JSON.stringify({ updated: new Date(NOW0 - 2 * HOUR).toISOString(), milestone: 'Sample milestone', done: 3, total: 6, now: ['b21 settings screen', 'b50 installer'], next: ['b30 place map'], you: [] }), NOW0 + 40_000)
        await clock.advance(8000)
        await clock.settle()
        dump('crewstale-' + tag, await m.drawn())
      }
      // The bar above the prompt: its own widths (45 columns = 360 px, 52 = 416, 65 = 520).
      for (const bc of cols === 45 ? [45, 52] : [65]) {
        const band = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: bc } })
        const btag = theme + '-' + (bc === 45 ? '360' : bc === 52 ? '420' : '520')
        dump('band-' + btag, await band.drawn())
        if (bc === 65) {
          await band.press({ key: 'meter-claude' })
          dump('bandcard-' + btag, await band.drawn())
          await band.press({ key: 'meter-claude' })
        }
        await band.unmount()
      }
      expect(JSON.stringify(await m.drawn()).length).toBeGreaterThan(1000)
    })
  }
}
