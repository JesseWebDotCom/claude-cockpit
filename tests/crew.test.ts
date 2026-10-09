import { expect, test } from './pure.ts'

import { classifyLane, lastLines } from '../hooks/core.ts'
import type { Edge } from '../hooks/crew.ts'
import type { CreditView } from '../hooks/limits.ts'
import {
  ACTIVITY_COLOR,
  GROUP_RANK,
  ORDER_HYSTERESIS_MS,
  ORDER_RULE,
  RESTART_IDLE_MS,
  atBareShell,
  erroredOf,
  exhaustedOf,
  groupOf,
  orderCrew,
  refusalOf,
  STUCK_AFTER_MS,
  TARGET_MAX,
  actionLogLine,
  activityLines,
  activityOf,
  activityPill,
  allEdges,
  blockedBy,
  buildGraph,
  claudeModelName,
  discoverCrew,
  edgeIsFaded,
  gateHolder,
  hatIndex,
  isStuck,
  kindOfName,
  localModelFromPs,
  modelFromPsArgs,
  paneModel,
  parseCrewArgs,
  parseDeps,
  parseTargets,
  planAction,
  poweredCloud,
  poweredCodex,
  poweredLocal,
  poweredOpencode,
  poweredSession,
  poweredSub,
  sessionTarget,
  shortTarget,
  targetOf,
  waitsForGate,
} from '../hooks/crew.ts'
import { ACTIVITIES } from '../hooks/sprites.ts'
import { PANE_CODEX_A, PANE_CODEX_B, PANE_CODEX_C, PANE_CODEX_D, PANE_OPENCODE_A } from './fixtures.ts'

// The real pane captures (fixtures/pane-*.txt, copied into tests/fixtures.ts).
const FX: Record<string, string> = {
  'pane-codex-a.txt': PANE_CODEX_A,
  'pane-codex-b.txt': PANE_CODEX_B,
  'pane-codex-c.txt': PANE_CODEX_C,
  'pane-codex-d.txt': PANE_CODEX_D,
  'pane-opencode-a.txt': PANE_OPENCODE_A,
}
const fx = (name: string): string => FX[name] ?? ''
const FIXTURES = Object.keys(FX)

// ---------------------------------------------------------------------------
// Discovery: nobody is hardcoded

test('no crew: no members, from nothing and from sessions that are not crew', async () => {
  expect(discoverCrew([], new Set())).toEqual([])
  expect(discoverCrew(['main', 'scratch', 'home-pin'], new Set())).toEqual([])
  expect(discoverCrew(['', '  '], new Set())).toEqual([])
})

test('one member: its type and character come from the name prefix', async () => {
  expect(discoverCrew(['codex-a'], new Set())).toEqual([{ name: 'codex-a', kind: 'codex', variant: hatIndex('codex-a') }])
  expect(discoverCrew(['opencode-a'], new Set())).toEqual([{ name: 'opencode-a', kind: 'api', variant: 0 }])
  expect(discoverCrew(['local-llama'], new Set())[0]?.kind).toBe('local')
  // A tmux session with a lane in the config is that kind, whatever its name; discovery by prefix can be turned off.
  expect(discoverCrew(['worker-1'], new Set(), [{ name: 'worker-1', kind: 'opencode' }])[0]?.kind).toBe('api')
  expect(discoverCrew(['worker-2'], new Set(), [{ name: 'worker-2', kind: 'tmux' }])[0]?.kind).toBe('max')
  expect(discoverCrew(['codex-a'], new Set(), [], false)).toEqual([])
})

test('six members: grouped by type, names with numbers in order, others ignored', async () => {
  const crew = discoverCrew(['codex-b', 'zzz', 'cloud-x', 'codex-a', 'opencode-b', 'opencode-a', 'local-m', 'codex-c', 'tmux-scratch'], new Set())
  expect(crew.map(m => m.name)).toEqual(['codex-a', 'codex-b', 'codex-c', 'opencode-a', 'opencode-b', 'local-m'])
  expect(crew.map(m => m.kind)).toEqual(['codex', 'codex', 'codex', 'api', 'api', 'local'])
})

test('twelve members, and a name nobody ever listed: the crew just grows', async () => {
  const names = Array.from({ length: 12 }, (_, i) => 'codex-' + (12 - i))
  const crew = discoverCrew(names, new Set())
  expect(crew.length).toBe(12)
  expect(crew.map(m => m.name)).toEqual(Array.from({ length: 12 }, (_, i) => 'codex-' + (i + 1)))
  // A name that is in no list in the code still gets a codex character.
  expect(discoverCrew(['codex-zebra-9'], new Set())[0]?.kind).toBe('codex')
  // The same session seen twice is one member.
  expect(discoverCrew(['codex-a', 'codex-a'], new Set()).length).toBe(1)
})

test('a tmux session with a lock file is a member even if its name matches no prefix', async () => {
  const crew = discoverCrew(['scratch', 'home-pin', 'codex-a'], new Set(['scratch', 'codex-a']))
  expect(crew.map(m => m.name)).toEqual(['codex-a', 'scratch'])
  expect(crew[1]?.kind).toBe('max')
  // A lock with no session is nobody.
  expect(discoverCrew([], new Set(['codex-q'])).length).toBe(0)
  // A name that is not a safe word is dropped.
  expect(discoverCrew(['codex-a b', 'codex-$x'], new Set()).length).toBe(0)
})

test('a Codex hat colour is a stable function of the name', async () => {
  for (const name of ['codex-a', 'codex-b', 'codex-c', 'codex-d', 'codex-e', 'codex-zebra']) {
    const h = hatIndex(name)
    expect(h).toBe(hatIndex(name))
    expect(h >= 0 && h <= 3).toBe(true)
  }
  expect(new Set(Array.from({ length: 40 }, (_, i) => hatIndex('codex-' + i))).size).toBe(4)
  expect(kindOfName('codex-')).toBe(null)
  expect(kindOfName('codexa')).toBe(null)
})

// ---------------------------------------------------------------------------
// What powers each member

test('opencode: "Claude API . Sonnet 5.5" with the credit badge, from the process args', async () => {
  const ps = 'zsh\nopencode run -m anthropic/claude-sonnet-5-5 --print-logs "Read .cockpit/briefs/brief.md"\n'
  const pm = modelFromPsArgs(ps)
  expect(pm).toEqual({ provider: 'anthropic', model: 'claude-sonnet-5-5' })
  const p = poweredOpencode(pm, null)
  expect(p.text).toBe('Claude API \u00b7 Sonnet 5.5')
  expect(p.badge).toBe('$ API credit')
  expect(p.isDim).toBe(false)
  expect(modelFromPsArgs('opencode --model=anthropic/claude-opus-5-5')?.model).toBe('claude-opus-5-5')
  expect(modelFromPsArgs('node server.js -m anthropic/claude-sonnet-5-5')).toBe(null)
  expect(modelFromPsArgs('')).toBe(null)
})

test('opencode: any other provider reads "<Provider> API . <model>"; no run shows the last model, dim', async () => {
  expect(poweredOpencode({ provider: 'openai', model: 'gpt-5' }, null).text).toBe('OpenAI API \u00b7 gpt-5')
  expect(poweredOpencode({ provider: 'acme', model: 'x-1' }, null).text).toBe('Acme API \u00b7 x-1')
  const last = poweredOpencode(null, { provider: 'anthropic', model: 'claude-sonnet-5-5' })
  expect(last.text).toBe('Claude API \u00b7 Sonnet 5.5')
  expect(last.isDim).toBe(true)
  const none = poweredOpencode(null, null)
  expect(none.text).toBe('OpenCode \u00b7 model unknown')
  expect(none.text).not.toBe('API')
})

test('codex: "Codex (ChatGPT plan) . GPT-6 Luna low" from the pane\'s model line', async () => {
  const lines = lastLines(fx('pane-codex-a.txt'), 40)
  expect(paneModel(lines)).toBe('GPT-6 Luna low')
  expect(poweredCodex(paneModel(lines)).text).toBe('Codex (ChatGPT plan) \u00b7 GPT-6 Luna low')
  expect(poweredCodex('').text).toBe('Codex (ChatGPT plan)')
  expect(paneModel(['nothing here'])).toBe('')
  for (const f of ['pane-codex-b.txt', 'pane-codex-c.txt', 'pane-codex-d.txt']) expect(paneModel(lastLines(fx(f), 40))).toBe('GPT-6 Luna low')
})

test('this session and subagents: "Claude Max . <model>" with the model names mapped', async () => {
  expect(claudeModelName('claude-sonnet-5-5')).toBe('Sonnet 5.5')
  expect(claudeModelName('claude-opus-5-5')).toBe('Opus 5.5')
  expect(claudeModelName('claude-fable-5-1')).toBe('Fable 5.1')
  expect(claudeModelName('claude-haiku-5-5')).toBe('Haiku 5.5')
  expect(claudeModelName('claude-opus-5-5[1m]')).toBe('Opus 5.5')
  expect(claudeModelName('anthropic/claude-sonnet-5-5')).toBe('Sonnet 5.5')
  expect(claudeModelName('mystery-model-7')).toBe('mystery-model-7')
  expect(poweredSession('claude-fable-5-1').text).toBe('Claude Max \u00b7 Fable 5.1')
  expect(poweredSession('').text).toBe('Claude Max')
  expect(poweredSub('claude-sonnet-5-5').text).toBe('Claude Max \u00b7 Sonnet 5.5')
  expect(poweredSub('').text).toBe('Claude Max')
})

test('cloud and local', async () => {
  expect(poweredCloud('claude-sonnet-5-5').text).toBe('Claude cloud \u00b7 Sonnet 5.5')
  expect(poweredCloud('').text).toBe('Claude cloud')
  expect(localModelFromPs('llama-server -m /models/qwen3-27b-q4.gguf --port 8080 -c 8192')).toBe('qwen3-27b-q4')
  expect(localModelFromPs('zsh\n')).toBe('')
  expect(poweredLocal('qwen3-27b-q4').text).toBe('Local \u00b7 qwen3-27b-q4')
  expect(poweredLocal('').text).toBe('Local')
})

// ---------------------------------------------------------------------------
// Activity: one word, from the last 25 meaningful lines

const W = 'working'

test('every state, first match wins: asking, red, stuck, landing, testing, reviewing, coding, reading, planning', async () => {
  expect(activityOf(['Allow command? (y/n)'], W, 5)).toBe('asking')
  expect(activityOf(['Would you like to run the following command?', '1. Yes, proceed (y)'], W, 5)).toBe('asking')
  expect(activityOf(['• Ran bun test', '(fail) probeAlive > nothing to probe'], W, 5)).toBe('red')
  expect(activityOf(['The full gate exited 1 on the weather assertion.'], W, 5)).toBe('red')
  expect(activityOf(['error: could not resolve ../../shared'], W, 5)).toBe('red')
  expect(activityOf(['• Ran rg -n foo src/'], W, STUCK_AFTER_MS / 1000)).toBe('stuck')
  expect(activityOf(['• Ran git push origin main', 'To https://github.com/example-org/home.git'], W, 5)).toBe('landing')
  expect(activityOf(['• Ran git commit -m "x"', '1 file changed'], W, 5)).toBe('landing')
  expect(activityOf(['• Ran bun test', '12 pass', '0 fail'], W, 5)).toBe('testing')
  expect(activityOf(['• Ran bash scripts/check.sh --pre'], W, 5)).toBe('testing')
  expect(activityOf(['• Ran git diff --stat', 'reviewing the change'], W, 5)).toBe('reviewing')
  expect(activityOf(['• Edited hooks/core.ts (+4 -1)'], W, 5)).toBe('coding')
  expect(activityOf(['• Added src/dev/searxng.ts (+60 -0)'], W, 5)).toBe('coding')
  expect(activityOf(['• Ran apply_patch'], W, 5)).toBe('coding')
  expect(activityOf(['• Ran rg -n foo src/'], W, 5)).toBe('reading')
  expect(activityOf(['• Explored', '  \u2514 Read core.ts'], W, 5)).toBe('reading')
  expect(activityOf(['Thinking about how to split the file'], W, 5)).toBe('planning')
  expect(activityOf(['', 'idle'], 'idle', 5)).toBe('sleeping')
})

test('researching: web search or fetch, curl to a URL, gh api, "Fetched", browsing', async () => {
  for (const line of [
    '• Searching the web for "memory_pressure output"',
    'web search: searxng settings',
    '• Ran WebSearch',
    '• Ran WebFetch https://example.com/docs',
    '• Ran curl -s https://api.github.com/repos/example-org/home',
    '• Ran gh api repos/example-org/home/issues',
    '• Fetched https://docs.example.com/page',
    'browsing the release notes',
  ]) {
    expect(activityOf([line], W, 5)).toBe('researching')
  }
  // A plain repo search is reading, not research.
  expect(activityOf(['• Searched for foo in src'], W, 5)).toBe('reading')
  expect(activityOf(['• Ran rg -n foo src/'], W, 5)).toBe('reading')
  // curl to localhost-less text with no URL is not research.
  expect(activityOf(['curl is installed'], W, 5)).toBe('working')
})

test('documenting: editing prose files (.md, docs/, README, CHANGELOG, BACKLOG); a code edit stays coding', async () => {
  for (const line of [
    '• Edited docs/dev/searxng.md (+60 -0)',
    '• Added README.md (+12 -0)',
    '• Updated CHANGELOG (+3 -0)',
    '• Edited docs/BACKLOG.md (+1 -0)',
    '• Ran apply_patch docs/dev.md',
    '• Updated .cockpit/briefs/brief-b30.md (+9 -2)',
  ]) {
    expect(activityOf([line], W, 5)).toBe('documenting')
  }
  // A docs-only edit reads documenting while a .ts edit stays coding.
  expect(activityOf(['• Edited docs/dev/searxng.md (+60 -0)'], W, 5)).toBe('documenting')
  expect(activityOf(['• Edited hooks/core.ts (+4 -1)'], W, 5)).toBe('coding')
  // Both in the window: the code edit decides.
  expect(activityOf(['• Edited docs/dev.md (+1 -0)', '• Edited hooks/core.ts (+4 -1)'], W, 5)).toBe('coding')
  expect(activityOf(['• Edited hooks/core.ts (+4 -1)', '• Edited docs/dev.md (+1 -0)'], W, 5)).toBe('coding')
  // A bare apply_patch names no file: it cannot make a docs edit, and it is not code-free either.
  expect(activityOf(['• Ran apply_patch'], W, 5)).toBe('coding')
  expect(activityOf(['• Ran apply_patch', '• Edited docs/dev.md (+1 -0)'], W, 5)).toBe('documenting')
  // Reading a doc is reading, not documenting.
  expect(activityOf(['• Ran cat docs/dev.md'], W, 5)).toBe('reading')
  expect(activityOf(['• Explored', '  \u2514 Read docs/dev.md'], W, 5)).toBe('reading')
})

test('designing: schemas, design notes, RULES.md, spec, json schema, figma', async () => {
  for (const line of [
    'Working on the design note for the status page',
    'reading RULES.md before the change',
    'the spec says the field is optional',
    'drafting the json schema for crew-deps',
    'new figma frame for the settings card',
    'a mockup of the Crew panel',
  ]) {
    expect(activityOf([line], W, 5)).toBe('designing')
  }
  expect(activityOf(['nothing about it'], W, 5)).toBe('working')
})

test('new states sit below testing and reviewing and above coding, in this order', async () => {
  const pane = ['• Edited hooks/core.ts (+4 -1)', 'the design is in RULES.md', '• Edited docs/dev.md (+1 -0)', '• Searching the web for x', '• Ran git diff', '• Ran bun test']
  expect(activityOf(pane, W, 5)).toBe('testing')
  expect(activityOf(pane.slice(0, 5), W, 5)).toBe('reviewing')
  expect(activityOf(pane.slice(0, 4), W, 5)).toBe('researching')
  expect(activityOf(['• Edited docs/dev.md (+1 -0)', 'the design is in RULES.md'], W, 5)).toBe('documenting')
  expect(activityOf(['• Edited hooks/core.ts (+4 -1)', 'the design is in RULES.md'], W, 5)).toBe('designing')
  expect(activityOf(['• Edited hooks/core.ts (+4 -1)'], W, 5)).toBe('coding')
  // Above them: red, stuck, landing; and idle is still sleeping.
  expect(activityOf(['• Searching the web for x', '(fail) probe'], W, 5)).toBe('red')
  expect(activityOf(['• Searching the web for x'], W, 46 * 60)).toBe('stuck')
  expect(activityOf(['• Searching the web for x', '• Ran git push'], W, 5)).toBe('landing')
  expect(activityOf(['• Searching the web for x'], 'idle', 5)).toBe('sleeping')
})

test('priority: an earlier state beats a later one in the same pane', async () => {
  const pane = ['• Ran rg -n foo', '• Edited a.ts', '• Ran git diff', '• Ran bun test', '• Ran git push', '(fail) x']
  expect(activityOf(pane, W, 5)).toBe('red')
  expect(activityOf(pane.slice(0, 5), W, 5)).toBe('landing')
  expect(activityOf(pane.slice(0, 4), W, 5)).toBe('testing')
  expect(activityOf(pane.slice(0, 3), W, 5)).toBe('reviewing')
  expect(activityOf(pane.slice(0, 2), W, 5)).toBe('coding')
  expect(activityOf(pane.slice(0, 1), W, 5)).toBe('reading')
  // Stuck sits between red and landing.
  expect(activityOf(['• Ran git push'], W, 46 * 60)).toBe('stuck')
  expect(activityOf(['• Ran git push', '(fail) x'], W, 46 * 60)).toBe('red')
  // A pane that waits on you is asking, whatever it was doing.
  expect(activityOf(['(fail) x', 'Allow command? (y/n)'], W, 46 * 60)).toBe('asking')
})

test('unknown or ambiguous text falls back to "working", never a state the text does not support', async () => {
  expect(activityOf(['The quick brown fox'], W, 5)).toBe('working')
  expect(activityOf([], W, 5)).toBe('working')
  expect(activityOf(['? for shortcuts', 'esc to interrupt', 'f2 to view'], W, 5)).toBe('working')
  // "0 fail" is a passing summary, not a failure.
  expect(activityOf(['10 pass', '0 fail'], W, 5)).toBe('testing')
  // 44 minutes is not yet stuck.
  expect(activityOf(['The quick brown fox'], W, 44 * 60)).toBe('working')
  expect(activityOf(['The quick brown fox'], W, Number.NaN)).toBe('working')
})

test('idle is sleeping; only a question to you wakes it; a missing session is absent', async () => {
  expect(activityOf(['• Ran git push origin main', 'pushed'], 'idle', 5)).toBe('sleeping')
  expect(activityOf(['(fail) x'], 'idle', 5)).toBe('sleeping')
  expect(activityOf(['Which file should I edit?'], 'idle', 5)).toBe('asking')
  expect(activityOf(['anything'], 'absent', 0)).toBe('absent')
})

test('only the last 25 meaningful lines count; footers and blanks are not lines', async () => {
  const old = ['(fail) from long ago', ...Array.from({ length: 30 }, () => 'quiet line')]
  expect(activityOf(old, W, 5)).toBe('working')
  expect(activityLines(['a', '', '  ', '? for shortcuts', 'b', 'esc to interrupt'])).toEqual(['a', 'b'])
  expect(activityLines(Array.from({ length: 60 }, (_, i) => 'line ' + i)).length).toBe(25)
})

test('the real pane captures: all five are idle panes, so all five are sleeping', async () => {
  for (const f of FIXTURES) {
    const lines = lastLines(fx(f), 40)
    const state = classifyLane(f.includes('opencode') ? 'opencode-a' : 'codex-x', true, lines)
    expect(state).toBe('idle')
    expect(activityOf(lines, state, 0)).toBe('sleeping')
  }
})

test('the real pane captures, read as if the lane were working: what each one last did', async () => {
  const as = (f: string) => activityOf(lastLines(fx(f), 40), W, 5)
  // b20c and b21b stopped on a red gate.
  expect(as('pane-codex-b.txt')).toBe('red')
  expect(as('pane-codex-c.txt')).toBe('red')
  // a17 and d15 pushed to main.
  expect(as('pane-codex-a.txt')).toBe('landing')
  expect(as('pane-codex-d.txt')).toBe('landing')
  // The shell: nothing in it says more than "working".
  expect(['working', 'reading', 'planning', 'coding', 'testing', 'reviewing', 'researching', 'documenting', 'designing']).toContain(as('pane-opencode-a.txt'))
})

test('every activity has a pill colour (active ones green), and the pill reads "state . target"', async () => {
  for (const a of ACTIVITIES) expect(ACTIVITY_COLOR[a]).toMatch(/^#[0-9A-F]{6}$/)
  // v11: every ACTIVE activity is the one green, waiting is amber, a failure red, sleeping grey.
  for (const a of ['coding', 'testing', 'reviewing', 'researching', 'documenting', 'designing', 'reading', 'planning', 'landing', 'working'] as const) expect(ACTIVITY_COLOR[a]).toBe('#22C55E')
  expect(ACTIVITY_COLOR.asking).toBe(ACTIVITY_COLOR.stuck)
  expect(ACTIVITY_COLOR.sleeping).toBe('#8B949E')
  expect(ACTIVITY_COLOR.red).toBe('#EF4444')
  const greens = ACTIVITIES.filter(a => ACTIVITY_COLOR[a] === '#22C55E')
  expect(ACTIVITIES.filter(a => a !== 'sleeping' && a !== 'asking' && a !== 'stuck' && a !== 'red' && a !== 'errored' && a !== 'cheering').every(a => greens.includes(a))).toBe(true)
  expect(activityPill('coding', 'Billing Settings')).toBe('coding \u00b7 Billing Settings')
  expect(activityPill('sleeping', '')).toBe('sleeping')
})

test('stuck: a working lane with no pane change for 45 minutes', async () => {
  expect(isStuck('working', 45 * 60_000)).toBe(true)
  expect(isStuck('working', 45 * 60_000 - 1)).toBe(false)
  expect(isStuck('idle', 5 * 60 * 60_000)).toBe(false)
  expect(isStuck('absent', 5 * 60 * 60_000)).toBe(false)
  expect(isStuck('working', Number.NaN)).toBe(false)
})

// ---------------------------------------------------------------------------
// The target

const TARGETS = parseTargets(
  JSON.stringify({
    b21b: 'Billing Settings',
    b20c: 'Installer Fix',
    b22: 'Forms 03b',
    'ADMIN-BILL-SETTINGS-01': 'Billing Settings',
    'FORMS-03b': 'Forms 03b',
    'PLACE-MAP-01': 'Place Map',
    'place-map-d17': 'Place Map',
    b20: 'Installer Fix',
  }),
)

test('target: crew-targets.json by the item, then by a backlog id in the heading', async () => {
  expect(targetOf('b21b', 'b21b: land ADMIN-BILL-SETTINGS-01 without the home-location field', TARGETS)).toBe('Billing Settings')
  expect(targetOf('b22', '', TARGETS)).toBe('Forms 03b')
  expect(targetOf('place-map-d17', '', TARGETS)).toBe('Place Map')
  // The item is not in the file, the heading names FORMS-03b, which is.
  expect(targetOf('x9', 'x9: land FORMS-03b in one pass', TARGETS)).toBe('Forms 03b')
  expect(targetOf('x9', 'x9: ship PLACE-MAP-01 now', TARGETS)).toBe('Place Map')
  // Case does not matter for the item.
  expect(targetOf('B21B', '', TARGETS)).toBe('Billing Settings')
})

test('target: with no map, a name made from the id, a Title Case name, or the heading without verbs', async () => {
  expect(targetOf('b99', 'b99: land SHOP-CART-02 now', {})).toBe('Shop Cart')
  expect(targetOf('b50', 'b50: build the Weather Card Icons', {})).toBe('Weather Card Icons')
  expect(targetOf('b51', 'b51: fix flaky tests in checks', {})).toBe('flaky tests in checks')
  expect(targetOf('b52', '', {})).toBe('b52')
  expect(targetOf('', '', {})).toBe('')
})

test('target: never longer than 22 characters', async () => {
  expect(TARGET_MAX).toBe(22)
  const long = 'b60: implement a really long heading that goes on and on forever and ever'
  expect(targetOf('b60', long, {}).length).toBeLessThanOrEqual(22)
  expect(targetOf('b61', 'b61: land ' + 'X'.repeat(40) + '-01', {}).length).toBeLessThanOrEqual(22)
  expect(shortTarget('x'.repeat(50)).length).toBe(22)
  expect(shortTarget('x'.repeat(50)).endsWith('\u2026')).toBe(true)
  expect(targetOf('big', '', { big: 'Y'.repeat(40) }).length).toBeLessThanOrEqual(22)
  // The coordinator's own session: the newest status "now" item.
  expect(sessionTarget(['lanes mod v3b', 'b21b re-send'])).toBe('lanes mod v3b')
  expect(sessionTarget([])).toBe('')
  expect(sessionTarget(['z'.repeat(40)]).length).toBe(22)
})

test('crew-targets.json: tolerant', async () => {
  expect(parseTargets('not json')).toEqual({})
  expect(parseTargets('[]')).toEqual({})
  expect(parseTargets('{"a":"A","b":5,"c":"  "}')).toEqual({ a: 'A' })
})

// ---------------------------------------------------------------------------
// Who waits on whom

const members = new Set(['codex-a', 'codex-b', 'codex-c', 'opencode-a'])
const ctx = (bad: string[] = [], faded: (e: { member: string; on: string }) => boolean = () => false) => ({
  members,
  isBad: (n: string) => bad.includes(n),
  isFaded: faded,
})

test('crew-deps.json: empty, malformed and valid files', async () => {
  expect(parseDeps('')).toEqual([])
  expect(parseDeps('{"waits":[]}')).toEqual([])
  expect(parseDeps('nonsense')).toEqual([])
  expect(parseDeps('{"waits":"x"}')).toEqual([])
  expect(parseDeps('{"waits":[{"member":"codex-c","on":"codex-b","why":"needs b20c installer fix on main"},{"member":"x"},null,{"member":"a","on":"a"}]}')).toEqual([
    { member: 'codex-c', on: 'codex-b', why: 'needs b20c installer fix on main' },
  ])
})

test('a chain: A waits on B waits on C; both edges are hot, nothing is a cycle', async () => {
  const g = buildGraph(
    [
      { member: 'codex-a', on: 'codex-b', why: 'one' },
      { member: 'codex-b', on: 'codex-c', why: 'two' },
    ],
    ctx(),
  )
  expect(g.edges.map(e => e.hot)).toEqual([true, true])
  expect(g.hasCycle).toBe(false)
  expect(g.blocked).toEqual(['codex-a', 'codex-b'])
  expect(g.nodes.map(n => n.id)).toEqual(['codex-a', 'codex-b', 'codex-c'])
  expect(blockedBy(g, 'codex-a')).toEqual({ on: 'codex-b', why: 'one' })
  expect(blockedBy(g, 'codex-c')).toBe(null)
})

test('a single edge is not a chain; you and the gate are nodes of their own kind', async () => {
  const g = buildGraph([{ member: 'codex-a', on: 'you', why: 'needs the pairing code' }, { member: 'codex-b', on: 'gate', why: '' }], ctx())
  expect(g.edges.every(e => !e.hot)).toBe(true)
  expect(g.nodes.find(n => n.id === 'you')?.kind).toBe('person')
  expect(g.nodes.find(n => n.id === 'gate')?.kind).toBe('gate')
  expect(g.nodes.find(n => n.id === 'codex-a')?.kind).toBe('member')
})

test('a cycle is flagged, red, and does not loop forever', async () => {
  const g = buildGraph(
    [
      { member: 'codex-a', on: 'codex-b', why: '' },
      { member: 'codex-b', on: 'codex-a', why: '' },
      { member: 'codex-c', on: 'codex-a', why: '' },
    ],
    ctx(),
  )
  expect(g.hasCycle).toBe(true)
  expect(g.edges[0]?.inCycle).toBe(true)
  expect(g.edges[1]?.inCycle).toBe(true)
  // C only waits on the cycle; it is not part of it.
  expect(g.edges[2]?.inCycle).toBe(false)
  // A member that waits on itself is no edge at all.
  expect(parseDeps('{"waits":[{"member":"codex-a","on":"codex-a"}]}')).toEqual([])
})

test('an unknown member and an unknown blocker are text nodes; only real members get a chip', async () => {
  const g = buildGraph([{ member: 'ghost', on: 'codex-a', why: 'x' }, { member: 'codex-b', on: 'the new CI box', why: 'y' }], ctx())
  expect(g.nodes.find(n => n.id === 'ghost')?.kind).toBe('text')
  expect(g.nodes.find(n => n.id === 'the new CI box')?.kind).toBe('text')
  expect(g.blocked).toEqual(['codex-b'])
})

test('an empty file draws no graph', async () => {
  const g = buildGraph([], ctx())
  expect(g.nodes).toEqual([])
  expect(g.edges).toEqual([])
  expect(g.blocked).toEqual([])
  expect(g.hasCycle).toBe(false)
})

test('red when the blocker is stuck or red; a blocker that is fine is not', async () => {
  const edges = [{ member: 'codex-a', on: 'codex-b', why: '' }]
  expect(buildGraph(edges, ctx(['codex-b'])).edges[0]?.red).toBe(true)
  expect(buildGraph(edges, ctx(['codex-b'])).nodes.find(n => n.id === 'codex-b')?.bad).toBe(true)
  expect(buildGraph(edges, ctx()).edges[0]?.red).toBe(false)
})

test('an edge fades when its blocker has no lock any more or its report appeared', async () => {
  const lockItemOf = (n: string) => (n === 'codex-b' ? 'b20c' : '')
  const e = (on: string) => ({ member: 'codex-a', on, why: '' })
  const base = { members, lockItemOf }
  // Lock held, no report: live.
  expect(edgeIsFaded(e('codex-b'), { ...base, reportNames: new Set() })).toBe(false)
  // The report appeared.
  expect(edgeIsFaded(e('codex-b'), { ...base, reportNames: new Set(['b20c-report.md']) })).toBe(true)
  // The lock cleared (codex-c holds none).
  expect(edgeIsFaded(e('codex-c'), { ...base, reportNames: new Set() })).toBe(true)
  // Not a member: it stays.
  expect(edgeIsFaded(e('you'), { ...base, reportNames: new Set() })).toBe(false)
  // A faded edge is not counted as blocked and has no chip.
  const g = buildGraph([e('codex-c')], ctx([], () => true))
  expect(g.blocked).toEqual([])
  expect(g.edges[0]?.faded).toBe(true)
  expect(g.edges[0]?.hot).toBe(false)
  expect(blockedBy(g, 'codex-a')).toBe(null)
})

test('an automatic edge from a pane that waits for the gate lock', async () => {
  const pane = ['• Ran bash scripts/check.sh', '== waiting for the gate lock held by codex-a', '   queued 3m']
  expect(waitsForGate(pane)).toBe(true)
  expect(waitsForGate(['all quiet'])).toBe(false)
  expect(waitsForGate('waiting for lock\nmore')).toBe(true)
  const holder = gateHolder('gate lock held by codex-a (pid 4412), 2 waiting', ['codex-a', 'codex-b'])
  expect(holder).toBe('codex-a')
  const edges = allEdges([], ['codex-b'], holder)
  expect(edges).toEqual([{ member: 'codex-b', on: 'codex-a', why: 'waiting for the machine-wide gate lock', auto: true }])
  // An automatic edge does not fade just because the holder holds no lane lock.
  const noLock = { members, lockItemOf: () => '', reportNames: new Set<string>() }
  expect(edgeIsFaded(edges[0] as Edge, noLock)).toBe(false)
  expect(edgeIsFaded({ member: 'codex-b', on: 'codex-a', why: '' }, noLock)).toBe(true)
  // The holder is not found: the edge goes to "gate". A name that only starts like a member is not it.
  expect(gateHolder('held by codex-ab', ['codex-a'])).toBe('gate')
  expect(gateHolder('', ['codex-a'])).toBe('gate')
  expect(allEdges([], ['codex-b'], 'gate')[0]?.on).toBe('gate')
  // The holder itself waiting is "gate", not itself. A file edge for the member wins over the automatic one.
  expect(allEdges([], ['codex-a'], 'codex-a')[0]?.on).toBe('gate')
  expect(allEdges([{ member: 'codex-b', on: 'you', why: 'x' }], ['codex-b'], 'codex-a').length).toBe(1)
  const g = buildGraph(edges, ctx())
  expect(g.blocked).toEqual(['codex-b'])
  expect(blockedBy(g, 'codex-b')?.on).toBe('codex-a')
})

// ---------------------------------------------------------------------------
// Lane controls

const HOME = '/home/alex/projects/example-app'
const idle10m = { exists: true, state: 'idle' as const, sinceMs: 10 * 60_000, hasLock: false }

test('start: a new Codex session, plain `codex`, no model or effort flags; never over an existing one', async () => {
  const p = planAction('start', 'codex-e', null, HOME)
  expect(p.ok).toBe(true)
  if (p.ok) {
    expect(p.steps).toEqual([['tmux', 'new-session', '-d', '-s', 'codex-e', '-c', HOME, 'codex']])
    const flat = p.steps.flat().join(' ')
    expect(flat).not.toMatch(/\s(-m|--model|--effort|-c\s+model|model_reasoning_effort)\b/)
    expect(p.confirm).toContain('plain codex')
  }
  expect(planAction('start', 'codex-a', idle10m, HOME)).toEqual({ ok: false, reason: 'codex-a is already running' })
  expect(planAction('start', 'opencode-9', null, HOME).ok).toBe(false)
  expect(planAction('start', 'codex-e; rm -rf /', null, HOME).ok).toBe(false)
  expect(planAction('start', 'Codex-E', null, HOME).ok).toBe(false)
  expect(planAction('start', '', null, HOME).ok).toBe(false)
})

test('restart: only an idle (5 min) lane with no lock; kill then start', async () => {
  const p = planAction('restart', 'codex-b', idle10m, HOME)
  expect(p.ok).toBe(true)
  if (p.ok) {
    expect(p.steps).toEqual([
      ['tmux', 'kill-session', '-t', '=codex-b'],
      ['tmux', 'new-session', '-d', '-s', 'codex-b', '-c', HOME, 'codex'],
    ])
    expect(p.confirm).toContain('10m')
  }
  expect(planAction('restart', 'codex-b', { ...idle10m, state: 'working' }, HOME).ok).toBe(false)
  expect(planAction('restart', 'codex-b', { ...idle10m, hasLock: true }, HOME).ok).toBe(false)
  expect(planAction('restart', 'codex-b', { ...idle10m, sinceMs: RESTART_IDLE_MS - 1 }, HOME).ok).toBe(false)
  expect(planAction('restart', 'codex-b', { ...idle10m, sinceMs: RESTART_IDLE_MS }, HOME).ok).toBe(true)
  expect(planAction('restart', 'codex-b', null, HOME).ok).toBe(false)
  expect(planAction('restart', 'opencode-a', idle10m, HOME).ok).toBe(false)
})

test('clear: sends /clear and Enter, only to an idle session; never to a working one', async () => {
  const p = planAction('clear', 'codex-b', idle10m, HOME)
  expect(p).toEqual({ ok: true, steps: [['tmux', 'send-keys', '-t', '=codex-b:', '/clear', 'Enter']], confirm: expect.any(String) })
  expect(planAction('clear', 'codex-b', { ...idle10m, state: 'working' }, HOME).ok).toBe(false)
  expect(planAction('clear', 'codex-b', { ...idle10m, state: 'absent' }, HOME).ok).toBe(false)
  expect(planAction('clear', 'codex-b', null, HOME).ok).toBe(false)
  expect(planAction('clear', 'opencode-a', idle10m, HOME).ok).toBe(true)
  expect(planAction('clear', 'zsh', null, HOME).ok).toBe(false)
  // A lock does not stop a clear (only a restart needs it gone).
  expect(planAction('clear', 'codex-b', { ...idle10m, hasLock: true }, HOME).ok).toBe(true)
})

test('/crew arguments', async () => {
  expect(parseCrewArgs('')).toEqual({ cmd: 'toggle' })
  expect(parseCrewArgs('  status ')).toEqual({ cmd: 'status' })
  expect(parseCrewArgs('start codex-e')).toEqual({ cmd: 'start', name: 'codex-e' })
  expect(parseCrewArgs('restart codex-b extra')).toEqual({ cmd: 'restart', name: 'codex-b' })
  expect(parseCrewArgs('clear')).toEqual({ cmd: 'clear', name: '' })
  expect(parseCrewArgs('away')).toEqual({ cmd: 'away' })
  expect(parseCrewArgs('BACK')).toEqual({ cmd: 'back' })
  expect(parseCrewArgs('y')).toEqual({ cmd: 'confirm' })
  expect(parseCrewArgs('no')).toEqual({ cmd: 'cancel' })
  expect(parseCrewArgs('bug the page is blank  on phones')).toEqual({ cmd: 'bug', text: 'the page is blank  on phones' })
  expect(parseCrewArgs('idea')).toEqual({ cmd: 'idea', text: '' })
  expect(parseCrewArgs('feature dark mode')).toEqual({ cmd: 'feature', text: 'dark mode' })
  expect(parseCrewArgs('dance')).toEqual({ cmd: 'unknown', word: 'dance' })
})

test('the action log line is one tab separated line', async () => {
  expect(actionLogLine('2026-10-08T22:00:00.000Z', 'restart', 'codex-b', 'done')).toBe('2026-10-08T22:00:00.000Z\trestart\tcodex-b\tdone\n')
  expect(actionLogLine('t', 'clear', 'codex-b', 'a\tb\nc')).toBe('t\tclear\tcodex-b\ta b c\n')
})

// ---------------------------------------------------------------------------
// Errored (Addendum 2): the member itself broke

const idle = { state: 'idle' as const, sessionMissing: false, lockLive: false }
const withLock = { ...idle, lockLive: true }
const pane = (...lines: string[]): string[] => lines

test('errored: the tmux session is gone but its lock is live -> "session died"', async () => {
  expect(erroredOf([], { state: 'absent', sessionMissing: true, lockLive: true })).toEqual({ errored: true, reason: 'session died' })
  // No lock: a session that simply is not there is nobody's error.
  expect(erroredOf([], { state: 'absent', sessionMissing: true, lockLive: false })).toEqual({ errored: false, reason: '' })
})

test('errored: a bare shell with a live lock -> "session died" (the real opencode pane at its prompt)', async () => {
  const lines = lastLines(fx('pane-opencode-a.txt'), 40)
  expect(atBareShell(lines)).toBe(true)
  expect(erroredOf(lines, withLock)).toEqual({ errored: true, reason: 'session died' })
  // The same pane with no live lock is not errored: opencode has no lock, a shell is just a shell.
  expect(erroredOf(lines, idle)).toEqual({ errored: false, reason: '' })
  // A prompt line of its own kind.
  expect(atBareShell(pane('ran the tests', 'alex@Alexs-MacBook-Pro home % '))).toBe(true)
  expect(atBareShell(pane('done', '~/code on main \u2193 3'))).toBe(true)
  expect(atBareShell([])).toBe(false)
})

test('errored: the agent\'s own screen is never a bare shell (the four real Codex panes, locked)', async () => {
  for (const f of ['pane-codex-a.txt', 'pane-codex-b.txt', 'pane-codex-c.txt', 'pane-codex-d.txt']) {
    const lines = lastLines(fx(f), 40)
    expect(atBareShell(lines)).toBe(false)
    expect(erroredOf(lines, withLock)).toEqual({ errored: false, reason: '' })
  }
  expect(atBareShell(pane('> Ask Codex to do anything', '  ? for shortcuts'))).toBe(false)
  expect(atBareShell(pane('building', '  esc interrupt   ctrl+p commands'))).toBe(false)
})

test('errored: an API error in the pane tail -> "API error"', async () => {
  for (const line of ['API Error: 500 Internal Server Error', 'Error from the API: request failed', 'overloaded_error: Overloaded', 'stream disconnected before completion', 'Error: connect ECONNRESET 10.0.0.1:443']) {
    expect(erroredOf(pane('working on it', line), idle), line).toEqual({ errored: true, reason: 'API error' })
  }
})

test('errored: an auth error -> "auth error"', async () => {
  for (const line of ['Error: 401 Unauthorized', 'Authentication failed: invalid API key', 'You are not logged in. Please log in.', 'OAuth token has expired']) {
    expect(erroredOf(pane(line), idle), line).toEqual({ errored: true, reason: 'auth error' })
  }
})

test('errored: a rate-limit error -> "rate limited"', async () => {
  for (const line of ['Error: 429 Too Many Requests', 'rate limit exceeded, retry later', 'Rate-limited by the provider']) {
    expect(erroredOf(pane(line), idle), line).toEqual({ errored: true, reason: 'rate limited' })
  }
})

test('errored: the process exited badly -> "errored" alone, no guessed reason', async () => {
  for (const line of ['[Process exited with code 1]', '[exited 137]', 'zsh: Segmentation fault: 11', 'codex crashed unexpectedly']) {
    expect(erroredOf(pane('last output', line), idle), line).toEqual({ errored: true, reason: '' })
  }
  // A clean exit and a gate failure are not the member breaking.
  expect(erroredOf(pane('[Process exited with code 0]'), idle).errored).toBe(false)
  expect(erroredOf(pane('The full gate exited 1 on the weather assertion.'), idle).errored).toBe(false)
  expect(erroredOf(pane('(fail) probeAlive > nothing'), idle).errored).toBe(false)
})

test('errored: a member that is working is retrying, not errored; a credit refusal is out of credits, not errored', async () => {
  expect(erroredOf(pane('API Error: 500', 'Working (3s \u2022 esc to interrupt)'), { ...idle, state: 'working' }).errored).toBe(false)
  for (const line of ["You've hit your usage limit. Try again later.", 'Error: out of credits', 'credit balance is too low', 'You exceeded your current quota', 'limit reached']) {
    expect(refusalOf(pane(line)), line).toBe(true)
    expect(erroredOf(pane(line), idle).errored, line).toBe(false)
  }
  // The footer's weekly-limit hint is not a refusal; low credits change nothing.
  expect(refusalOf(pane('\u26a0 weekly limit: only 3% left \u00b7 /status', 'Heads up, you have less than 50% of your 5h limit left.'))).toBe(false)
  expect(refusalOf(lastLines(fx('pane-codex-a.txt'), 40))).toBe(false)
})

test('errored: only the last lines count; an old error scrolled away does not', async () => {
  const old = ['API Error: 500', ...Array.from({ length: 12 }, (_, i) => 'normal line ' + i)]
  expect(erroredOf(old, idle).errored).toBe(false)
  expect(erroredOf(['fine', 'fine again'], idle).errored).toBe(false)
})

test('errored has its own pill colour, distinct from red', async () => {
  expect(ACTIVITY_COLOR.errored).not.toBe(ACTIVITY_COLOR.red)
  expect(ACTIVITY_COLOR.errored).toMatch(/^#[0-9A-F]{6}$/)
})

// ---------------------------------------------------------------------------
// Out of credits (Addendum 6)

const poolOf = (state: { exhausted: boolean; backAtMs: number | null }, readable = true) => ({ codex: state, codexReadable: readable })
const credit = (exhausted: boolean): CreditView => ({ id: 'x', name: 'x', text: '', spent: null, left: null, total: null, ratio: null, exhausted, expired: false, expires: '', start: '' })
const noRefusal = { opencode: credit(false), cloud: credit(false), refusal: false }

test('exhausted: a Codex pool at 100% used dims every Codex member, with its reset time; 97% does not', async () => {
  const back = Date.parse('2026-10-09T09:00:00Z')
  const hit = exhaustedOf('codex', { ...poolOf({ exhausted: true, backAtMs: back }), ...noRefusal })
  expect(hit).toEqual({ exhausted: true, backAtMs: back, why: 'limit' })
  const at97 = exhaustedOf('codex', { ...poolOf({ exhausted: false, backAtMs: null }), ...noRefusal })
  expect(at97).toEqual({ exhausted: false, backAtMs: null, why: '' })
})

test('exhausted: a refusal seen in the pane counts only when the pool cannot be read; a readable pool wins', async () => {
  const refused = { ...noRefusal, refusal: true }
  expect(exhaustedOf('codex', { ...poolOf({ exhausted: false, backAtMs: null }, false), ...refused })).toEqual({ exhausted: true, backAtMs: null, why: 'refusal' })
  // The pool reads below 100% (the reset has passed): the old refusal on screen does not keep it dim.
  expect(exhaustedOf('codex', { ...poolOf({ exhausted: false, backAtMs: null }, true), ...refused }).exhausted).toBe(false)
})

test('exhausted: OpenCode and the cloud follow their credit (nothing left or expired), or a refusal; never "low"', async () => {
  const base = poolOf({ exhausted: false, backAtMs: null })
  expect(exhaustedOf('api', { ...base, opencode: credit(true), cloud: credit(false), refusal: false })).toEqual({ exhausted: true, backAtMs: null, why: 'credit' })
  expect(exhaustedOf('api', { ...base, opencode: credit(false), cloud: credit(true), refusal: false }).exhausted).toBe(false)
  expect(exhaustedOf('cloud', { ...base, opencode: credit(false), cloud: credit(true), refusal: false }).why).toBe('credit')
  expect(exhaustedOf('api', { ...base, ...noRefusal, refusal: true })).toMatchObject({ exhausted: true, why: 'refusal' })
  expect(exhaustedOf('api', { ...base, ...noRefusal }).exhausted).toBe(false)
  // Local members and this session are never dimmed here; a Codex pool does not dim OpenCode.
  expect(exhaustedOf('local', { ...poolOf({ exhausted: true, backAtMs: 1 }), opencode: credit(true), cloud: credit(true), refusal: true }).exhausted).toBe(false)
  expect(exhaustedOf('max', { ...poolOf({ exhausted: true, backAtMs: 1 }), opencode: credit(true), cloud: credit(true), refusal: true }).exhausted).toBe(false)
  expect(exhaustedOf('api', { ...poolOf({ exhausted: true, backAtMs: 1 }), ...noRefusal }).exhausted).toBe(false)
})

// ---------------------------------------------------------------------------
// Crew order (Addendum 4): fixed rule, stable

const m = (activity: string, state: 'working' | 'idle' = 'working', exhausted = false, blocked = false) => ({ activity, state, exhausted, blocked })

test('groups: errored, red, stuck, asking and blocked first; then active; then sleeping; then out of credits', async () => {
  expect(groupOf(m('errored', 'idle'))).toBe('attention')
  expect(groupOf(m('red'))).toBe('attention')
  expect(groupOf(m('stuck'))).toBe('attention')
  expect(groupOf(m('asking', 'idle'))).toBe('attention')
  expect(groupOf(m('coding', 'working', false, true))).toBe('attention')
  expect(groupOf(m('coding'))).toBe('active')
  expect(groupOf(m('testing'))).toBe('active')
  expect(groupOf(m('landing'))).toBe('active')
  expect(groupOf(m('sleeping', 'idle'))).toBe('sleeping')
  expect(groupOf(m('sleeping', 'idle', true))).toBe('exhausted')
  // Errored beats out of credits (a broken session needs attention first).
  expect(groupOf(m('errored', 'idle', true))).toBe('attention')
  // active first, then attention, then out of credits, the sleeping row last.
  expect(GROUP_RANK.active).toBeLessThan(GROUP_RANK.attention)
  expect(GROUP_RANK.attention).toBeLessThan(GROUP_RANK.exhausted)
  expect(GROUP_RANK.exhausted).toBeLessThan(GROUP_RANK.sleeping)
})

test('order: by group, ties by name with numbers in order', async () => {
  const entries = [
    { name: 'codex-10', group: 'active' as const },
    { name: 'codex-2', group: 'active' as const },
    { name: 'codex-b', group: 'sleeping' as const },
    { name: 'codex-a', group: 'exhausted' as const },
    { name: 'codex-z', group: 'attention' as const },
    { name: 'codex-c', group: 'sleeping' as const },
  ]
  expect(orderCrew(entries, new Map(), 0).order).toEqual(['codex-2', 'codex-10', 'codex-z', 'codex-a', 'codex-b', 'codex-c'])
  expect(orderCrew([], new Map(), 0).order).toEqual([])
})

test('order: a member moves only after its group has changed for about 10 seconds', async () => {
  const at = (group: 'active' | 'attention' | 'sleeping') => [{ name: 'codex-a', group }, { name: 'codex-b', group: 'active' as const }]
  let r = orderCrew(at('active'), new Map(), 0)
  expect(r.order).toEqual(['codex-a', 'codex-b'])
  // codex-a goes to sleep: it stays where it was for 9 s ...
  r = orderCrew(at('sleeping'), r.state, 1000)
  expect(r.order).toEqual(['codex-a', 'codex-b'])
  r = orderCrew(at('sleeping'), r.state, 5000)
  expect(r.order).toEqual(['codex-a', 'codex-b'])
  r = orderCrew(at('sleeping'), r.state, 10_900)
  expect(r.order).toEqual(['codex-a', 'codex-b'])
  // ... and moves once the change has lasted ORDER_HYSTERESIS_MS.
  r = orderCrew(at('sleeping'), r.state, 1000 + ORDER_HYSTERESIS_MS)
  expect(r.order).toEqual(['codex-b', 'codex-a'])
})

test('order: a blip does not move a member; a flip back resets the clock', async () => {
  const at = (group: 'active' | 'sleeping') => [{ name: 'codex-a', group }, { name: 'codex-b', group: 'active' as const }]
  let r = orderCrew(at('active'), new Map(), 0)
  r = orderCrew(at('sleeping'), r.state, 2000)
  // Back to active before 10 s: it never moved, and the pending change is forgotten.
  r = orderCrew(at('active'), r.state, 8000)
  expect(r.order).toEqual(['codex-a', 'codex-b'])
  r = orderCrew(at('sleeping'), r.state, 9000)
  // A new change starts a new 10 s: at 15 s it is only 6 s old.
  r = orderCrew(at('sleeping'), r.state, 15_000)
  expect(r.order).toEqual(['codex-a', 'codex-b'])
  r = orderCrew(at('sleeping'), r.state, 19_000)
  expect(r.order).toEqual(['codex-b', 'codex-a'])
})

test('order: a new member shows in its group at once; a member that is gone is forgotten', async () => {
  let r = orderCrew([{ name: 'codex-b', group: 'sleeping' }], new Map(), 0)
  r = orderCrew([{ name: 'codex-b', group: 'sleeping' }, { name: 'codex-a', group: 'attention' }], r.state, 1000)
  expect(r.order).toEqual(['codex-a', 'codex-b'])
  r = orderCrew([{ name: 'codex-b', group: 'sleeping' }], r.state, 2000)
  expect(r.state.has('codex-a')).toBe(false)
  expect(ORDER_RULE.length).toBeGreaterThanOrEqual(5)
  expect(ORDER_RULE[0]).toContain('The Captain')
})
