// A stubbed world for the hooks tests: a fake file system, a fake tmux and a few fake commands. Nothing
// here touches a real file, a real tmux session, the network or the app.

export const HOME = '/home/alex/projects/example-app'
export const DATA = HOME + '/.cockpit'
export const QUEUE = DATA + '/agents/queue'
export const USER_HOME = '/Users/test'
export const CLAUDE_DIR = USER_HOME + '/.claude/projects/-home-alex-projects-example-app'

export type World = {
  files: Map<string, { text: string; mtimeMs: number }>
  // tmux sessions and what each pane shows.
  sessions: string[]
  panes: Record<string, string>
  // Every process the mod started, in order.
  calls: string[][]
  // Every file the mod wrote with fs.write.
  writes: { path: string; text: string }[]
  // What the fake commands answer.
  ps: string
  gitLog: string
  serviceCode: string
  // This computer's resource commands and a listed host's answer (free -m and nvidia-smi), by their real output.
  memoryPressure: string
  swapUsage: string
  loadAvg: string
  ncpu: string
  df: string
  psAll: string
  boxExit: number
  boxOut: string
  gateStatus: string
  tails: Record<string, string>
  // What `$.session.usage().rateLimits` answers: the Claude plan's windows, empty off a subscription.
  rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[]
  // The engine's `theme` setting ("dark", "light", ...); '' answers with no theme row.
  theme: string
  // The context `$.session.usage()` reports (tokens over a 200k window); null = no response yet.
  ctx: { tokens: number } | null
  // What `sqlite3 -readonly <opencode.db> <query>` prints ("197.12|34"), or null when it cannot run.
  sqlite: string | null
  // `find ... stat -f '%m %z %N'` over the transcripts, and what the awk cost filter prints (see spend.ts).
  costFind: string
  costAwk: string
  // What `pgrep -fl "opencode run"` prints ("" = no such process, exit 1), and this session's id.
  pgrep: string
  sessionId: string
  // What `$.agent.list()` answers: one running subagent by default (a subagent working is "something working").
  agents: { id: string; description: string; type: string; status: string }[]
  // The raw process.run events of `tee` calls, and the pane opens.
  teeEvents: unknown[]
  opened: { id: string; title?: string }[]
  // The panes the engine has open now, and the ids closed so far (cockpit v10).
  trackPanes: boolean
  openPanes: string[]
  closed: string[]
}

// The config file the mod reads (hooks/hosts.ts, `<project root>/.cockpit/config.json`): the default world lists one host and one service, so the System card has
// something of each to show; `withoutExtras(w)` takes the file away.
export const CONFIG_PATH = HOME + '/.cockpit/config.json'
export const EXTRAS_JSON = JSON.stringify({ hosts: [{ name: 'host-a', ssh: 'gpu-alias', gpu: true }], services: [{ name: 'Web app', url: 'http://localhost:3000/health' }] })
export const withoutExtras = (w: World): void => void w.files.delete(CONFIG_PATH)

export function newWorld(): World {
  return {
    files: new Map([[CONFIG_PATH, { text: EXTRAS_JSON, mtimeMs: 0 }]]),
    sessions: [],
    panes: {},
    calls: [],
    writes: [],
    rateLimits: [],
    theme: '',
    ctx: null,
    sqlite: null,
    costFind: '',
    costAwk: '',
    ps: '',
    gitLog: '',
    serviceCode: '200',
    memoryPressure: 'System-wide memory free percentage: 41%\n',
    swapUsage: 'total = 2048.00M  used = 1024.50M  free = 1023.50M  (encrypted)\n',
    loadAvg: '{ 2.10 1.95 1.80 }\n',
    ncpu: '10\n',
    df: 'Filesystem    1024-blocks      Used Available Capacity iused      ifree %iused  Mounted on\n/dev/disk3s1s1   494384795  15000000 200000000     7%  355483 2000000000    0%   /\n',
    psAll: ' 1258291 /Applications/Claude.app/Contents/MacOS/Claude\n  412345 /usr/local/bin/node\n   98765 /usr/sbin/mDNSResponder\n',
    boxExit: 0,
    boxOut: '               total        used        free      shared  buff/cache   available\nMem:           31890       12000        5000        1000       14890       19000\nSwap:           8191         512        7679\n5120 MiB, 24576 MiB, 37 %\n',
    gateStatus: '',
    tails: {},
    pgrep: '',
    sessionId: 'sess-main',
    agents: [{ id: 'a1', description: 'scout', type: 'Explore', status: 'running' }],
    teeEvents: [],
    opened: [],
    trackPanes: false,
    openPanes: [],
    closed: [],
  }
}

// Paths are compared with "." and ".." resolved, as the engine does before a hook sees them.
export const norm = (p: string): string => {
  const out: string[] = []
  for (const part of p.split('/')) {
    if (part === '..') out.pop()
    else if (part !== '.' && part !== '') out.push(part)
  }
  return '/' + out.join('/')
}

export const put = (w: World, path: string, text: string, mtimeMs = 0): void => {
  w.files.set(norm(path), { text, mtimeMs })
}

const isDir = (w: World, path: string): boolean => [...w.files.keys()].some(k => k.startsWith(path + '/'))

// The calls whose first word is `bin`.
export const callsOf = (w: World, bin: string): string[][] => w.calls.filter(c => c[0] === bin)
export const tmuxCalls = (w: World, sub: string): string[][] => w.calls.filter(c => c[0] === 'tmux' && c[1] === sub)

export function stubWorld(on: any, w: World): void {
  on('process.run', ($: unknown, e: { argv: string[]; init?: { stdin?: string; timeoutMs?: number } }) => {
    const argv = [...e.argv]
    w.calls.push(argv)
    const [bin = '', a = '', ...rest] = argv
    const ok = (stdout = '', exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    if (bin === 'tmux') {
      if (a === 'list-sessions') return ok(w.sessions.join('\n') + '\n')
      if (a === 'capture-pane') return ok(w.panes[rest[rest.indexOf('-t') + 1] ?? ''] ?? '')
      if (a === 'display-message') return ok('/dev/ttys001\n')
      if (a === 'new-session') {
        const name = rest[rest.indexOf('-s') + 1] ?? ''
        w.sessions.push(name)
        w.panes[name] = ''
        return ok()
      }
      if (a === 'kill-session') {
        const target = (rest[rest.indexOf('-t') + 1] ?? '').replace(/^=/, '')
        w.sessions = w.sessions.filter(s => s !== target)
        return ok()
      }
      return ok()
    }
    if (bin === 'tee') {
      w.teeEvents.push(e)
      const path = norm(a === '-a' ? rest[0] ?? '' : a)
      const text = e.init?.stdin ?? ''
      const cur = w.files.get(path)
      w.files.set(path, { text: (cur?.text ?? '') + text, mtimeMs: cur?.mtimeMs ?? 0 })
      return ok(text)
    }
    if (bin === 'pgrep') return ok(w.pgrep, w.pgrep === '' ? 1 : 0)
    if (bin === 'ps') return ok(a === '-Ao' ? w.psAll : w.ps)
    if (bin === 'memory_pressure') return ok(w.memoryPressure)
    if (bin === 'sysctl') return ok(rest[0] === 'vm.swapusage' ? w.swapUsage : rest[0] === 'vm.loadavg' ? w.loadAvg : rest[0] === 'hw.ncpu' ? w.ncpu : '')
    if (bin === 'df') return ok(w.df)
    if (bin === 'git') return ok(w.gitLog)
    if (bin === 'curl') return ok(w.serviceCode + ' 0.0421')
    // A listed host's probe (free -m, and nvidia-smi when its gpu flag is on): the only ssh command there is.
    if (bin === 'ssh') return ok(w.boxExit === 0 ? w.boxOut : '', w.boxExit)
    if (bin === 'bash') return ok(w.gateStatus)
    if (bin === 'sqlite3') return w.sqlite === null ? ok('', 1) : ok(w.sqlite)
    if (bin === 'find') return ok(w.costFind)
    if (bin === 'awk') return ok(w.costAwk)
    if (bin === 'tail') return ok(w.tails[argv[argv.length - 1] ?? ''] ?? '')
    return ok('', 1)
  })
  on('fs.exists', ($: unknown, e: { path: string }) => ({ value: w.files.has(norm(e.path)) || isDir(w, norm(e.path)) }))
  // A missing file reads as empty and stats with no time (the mod checks exists first, and treats an
  // unknown time as unknown); nothing throws, so the engine has nothing to report.
  on('fs.read', ($: unknown, e: { path: string }) => ({ value: w.files.get(norm(e.path))?.text ?? '' }))
  on('fs.list', ($: unknown, e: { path?: string }) => {
    const dir = norm(e.path ?? '').replace(/\/$/, '')
    const seen = new Map<string, 'file' | 'dir'>()
    for (const k of w.files.keys()) {
      if (!k.startsWith(dir + '/')) continue
      const rel = k.slice(dir.length + 1)
      const first = rel.split('/')[0] ?? ''
      seen.set(first, rel.includes('/') ? 'dir' : 'file')
    }
    return { value: [...seen].map(([name, kind]) => ({ name, kind, size: 1, isLink: false })) }
  })
  on('fs.stat', ($: unknown, e: { path: string }) => {
    const f = w.files.get(norm(e.path))
    if (f) return { value: { kind: 'file', size: f.text.length, mtimeMs: f.mtimeMs, isLink: false } }
    // A folder's time is its newest file's (a file appearing or being rewritten moves it, as on a real disk).
    if (isDir(w, norm(e.path))) {
      const dir = norm(e.path)
      const newest = [...w.files].filter(([k]) => k.startsWith(dir + '/')).reduce((m, [, f]) => Math.max(m, f.mtimeMs), 0)
      return { value: { kind: 'dir', size: 0, mtimeMs: newest, isLink: false } }
    }
    return { value: { kind: 'file', size: 0, mtimeMs: Number.NaN, isLink: false } }
  })
  on('fs.write', ($: unknown, e: { path: string; text: string }) => {
    w.writes.push({ path: e.path, text: e.text })
    w.files.set(norm(e.path), { text: e.text, mtimeMs: w.files.get(norm(e.path))?.mtimeMs ?? 0 })
    return { value: undefined }
  })
  on('env.get', ($: unknown, e: { name?: string; key?: string }) => ({ value: (e.name ?? e.key) === 'HOME' ? USER_HOME : (e.name ?? e.key) === 'USER' ? 'alex' : undefined }))
  on('session.root', () => ({ value: HOME }))
  on('config.list', () => ({ value: w.theme === '' ? [] : [{ key: 'theme', label: 'Theme', kind: 'choice', value: w.theme, provider: 'engine', isLocked: false }] }))
  on('session.id', () => ({ value: w.sessionId }))
  on('session.measure', ($: unknown, e: { changed: string[] }) => ({ changed: e.changed }))
  on('session.usage', () => ({ value: { startedAt: 0, context: w.ctx === null ? { window: 200000 } : { window: 200000, tokens: w.ctx.tokens, percent: Math.round((w.ctx.tokens / 200000) * 100) }, rateLimits: w.rateLimits } }))
  on('agent.list', () => ({ value: w.agents }))
  on('command.register', () => ({ value: undefined }))
  // The pane list is the engine's record. Off by default (the list stays empty, as before); a test that toggles the
  // panel sets `trackPanes` so an open adds the pane and a close removes it.
  on('ui.panes', () => ({ value: w.trackPanes ? w.openPanes.map(id => ({ id, title: id, isShown: true, hasFocus: false, isPlaced: true })) : [] }))
  on('ui.open', ($: unknown, e: { id: string; title?: string }) => {
    w.opened.push({ id: e.id, title: e.title })
    if (w.trackPanes && !w.openPanes.includes(e.id)) w.openPanes.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($: unknown, e: { id: string }) => {
    w.closed.push(e.id)
    w.openPanes = w.openPanes.filter(id => id !== e.id)
    return { value: undefined }
  })
  // What the host itself draws at a site the mod wraps. The word "engine" that showed under the band in v6's renders
  // was THIS test stub, not the app; it is an empty box now so no stand-in text can land in a screenshot.
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }))
}

// A pane of a Codex session that is working, and one that is idle.
export const WORKING_PANE = '• Edited hooks/core.ts (+4 -1)\n• Working (4s \u2022 esc to interrupt)\n\n\n'
export const IDLE_PANE = '• Done: the report is written.\n\n  GPT-6-Luna low \u00b7 ~/Developer/home\n  ? for shortcuts\n'
