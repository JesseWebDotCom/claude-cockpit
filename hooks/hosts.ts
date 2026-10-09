// The System card's extras, from the config file (pure: no mods API, no I/O). The card always shows THIS computer. Anything more is listed by the
// user in the same config file the rest of Cockpit reads:
//
//   "hosts":    [{ "name": "host-a", "ssh": "gpu-alias", "gpu": true }]       one gauge group per host, read through ssh
//   "services": [{ "name": "Web app", "kind": "http", "target": "http://localhost:3000/health", "timeoutMs": 2000 }]   one up/down line per service
//               kind "http": an HTTP GET of `target`, up on a 2xx or 3xx; kind "tcp": `target` is "host:port", up when the port accepts a connection;
//               kind "ssh-tunnel": the same check (an http address or a host:port) made ON the host named by "ssh", for a service that listens only
//               on that machine and is reached through an ssh tunnel. `timeoutMs` (500 to 30000, default 2000) is how long one check may take.
//               The older shape {"name", "url", "ssh"} still reads: "url" is an http target, and "ssh" makes it an ssh-tunnel one.
//               Default: none. A service that is not listed is not probed and not shown.
//
//   "repos":    ["/path/to/project-one", "/path/to/project-two"]                      the git folders the status line sums unsaved work over; the Main status card's
//               "last landed" line is the newest commit in them (the session's own folder when none are listed)
//   "claimsDir":  "/abs/path"   where the Main status card reads its active work items (*.claim files); default: claims/ in the data folder
//   "reportsDir": "/abs/path"   where it reads the newest report from; default: the data folder's report folder
//   "notesHours":    6             after this many hours the hand-written lines (Next, You) get a dim "notes from <age> ago"; default 6
//
// No hosts and no services listed means nothing extra is shown and nothing extra is probed: no ssh, no HTTP. No repos listed means the status line
// under the input box shows nothing. Unit tested in tests/hosts.test.ts.

export type HostSpec = { name: string; ssh: string; gpu: boolean }
export type ServiceKind = 'http' | 'tcp' | 'ssh-tunnel'
export const SERVICE_KINDS: readonly ServiceKind[] = ['http', 'tcp', 'ssh-tunnel']
/** `target` is an http address, or "host:port" for tcp; `ssh` is '' to probe from this computer, or the host alias an ssh-tunnel service is probed on. */
export type ServiceSpec = { name: string; kind: ServiceKind; target: string; timeoutMs: number; ssh: string }
export const DEFAULT_SERVICE_TIMEOUT_MS = 2000
export const MIN_SERVICE_TIMEOUT_MS = 500
export const MAX_SERVICE_TIMEOUT_MS = 30000
/** `repos` are absolute folder paths of git repositories (the unsaved-work status line); empty by default. */
export type Extras = { hosts: HostSpec[]; services: ServiceSpec[]; repos: string[]; card?: CardCfg }
/** COCKPIT-38: where the Main status card finds its live lines. Each is optional; absent means the built-in default. Present only when the config sets one. */
export type CardCfg = { claimsDir?: string; reportsDir?: string; notesHours?: number }
export const DEFAULT_NOTES_HOURS = 6

export const MAX_HOSTS = 8
export const MAX_SERVICES = 12
export const MAX_REPOS = 20
const NAME_MAX = 40

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const clean = (v: unknown): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : '')

/** An ssh host alias or name: letters, digits, dot, dash, underscore, @; never starting with a dash (it would be read as an ssh option). */
export const isSshTarget = (s: string): boolean => /^[A-Za-z0-9_][\w.@-]{0,99}$/.test(s)

/** An http or https address with no spaces, quotes, backticks, backslashes or angle brackets (it can be put inside single quotes for a remote shell). */
export const isServiceUrl = (s: string): boolean => /^https?:\/\/[^\s'"`\\<>]+$/i.test(s) && s.length <= 300

/** "host:port" with a plain host name or address (letters, digits, dot, dash, underscore) and a port 1 to 65535. */
export const isTcpTarget = (s: string): boolean => {
  const m = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}:(\d{1,5})$/.exec(s)
  return m !== null && Number(m[1]) >= 1 && Number(m[1]) <= 65535
}

const hostOfUrl = (url: string): string => /^https?:\/\/([^/:?#]+)/i.exec(url)?.[1] ?? url

/** The hosts and services of a config object, read leniently: an entry that is not usable is skipped and says why in `warnings`. */
export function parseExtras(o: Readonly<Record<string, unknown>>, warnings: string[] = []): Extras {
  const hosts: HostSpec[] = []
  if (o.hosts !== undefined) {
    if (!Array.isArray(o.hosts)) warnings.push('hosts: expected a list of {"name": ..., "ssh": ..., "gpu": true}, ignored')
    else {
      for (const x of o.hosts) {
        const ssh = isObj(x) && typeof x.ssh === 'string' ? x.ssh.trim() : ''
        if (!isSshTarget(ssh)) {
          warnings.push('hosts: an entry has no usable "ssh" (a host alias), skipped')
          continue
        }
        if (hosts.length >= MAX_HOSTS) {
          warnings.push('hosts: only the first ' + MAX_HOSTS + ' are used')
          break
        }
        const name = isObj(x) ? clean(x.name) : ''
        hosts.push({ name: name !== '' ? name : ssh, ssh, gpu: isObj(x) && x.gpu === true })
      }
    }
  }
  const services: ServiceSpec[] = []
  if (o.services !== undefined) {
    if (!Array.isArray(o.services)) warnings.push('services: expected a list of {"name": ..., "kind": "http", "target": ...}, ignored')
    else {
      for (const x of o.services) {
        const rec = isObj(x) ? x : {}
        const raw = typeof rec.target === 'string' ? rec.target.trim() : typeof rec.url === 'string' ? rec.url.trim() : ''
        const via = typeof rec.ssh === 'string' ? rec.ssh.trim() : ''
        const named = typeof rec.kind === 'string' ? rec.kind.trim() : ''
        // No "kind": an http address is http (an ssh-tunnel one when a host is named), anything else is a tcp target.
        const kind = (named !== '' ? named : /^https?:\/\//i.test(raw) ? (via !== '' ? 'ssh-tunnel' : 'http') : 'tcp') as ServiceKind
        const label = raw.slice(0, 40)
        if (!SERVICE_KINDS.includes(kind)) {
          warnings.push('services: "' + label + '" has kind "' + named.slice(0, 20) + '", expected http, tcp or ssh-tunnel, skipped')
          continue
        }
        const fits = kind === 'tcp' ? isTcpTarget(raw) : kind === 'http' ? isServiceUrl(raw) : isServiceUrl(raw) || isTcpTarget(raw)
        if (!fits) {
          warnings.push('services: "' + label + '" has no usable "target" (' + (kind === 'tcp' ? 'host:port' : kind === 'http' ? 'an http or https address' : 'an http address or host:port') + '), skipped')
          continue
        }
        if (kind === 'ssh-tunnel' ? !isSshTarget(via) : via !== '') {
          warnings.push('services: "' + label + '" ' + (kind === 'ssh-tunnel' ? 'needs an "ssh" host alias' : 'names an "ssh" host, which only kind ssh-tunnel uses') + ', skipped')
          continue
        }
        if (services.length >= MAX_SERVICES) {
          warnings.push('services: only the first ' + MAX_SERVICES + ' are used')
          break
        }
        const t = typeof rec.timeoutMs === 'number' && Number.isFinite(rec.timeoutMs) ? Math.round(rec.timeoutMs) : DEFAULT_SERVICE_TIMEOUT_MS
        const name = clean(rec.name)
        services.push({ name: name !== '' ? name : kind === 'tcp' || !/^https?:/i.test(raw) ? raw.replace(/:\d+$/, '') : hostOfUrl(raw), kind, target: raw, timeoutMs: Math.max(MIN_SERVICE_TIMEOUT_MS, Math.min(MAX_SERVICE_TIMEOUT_MS, t)), ssh: via })
      }
    }
  }
  const repos: string[] = []
  if (o.repos !== undefined) {
    if (!Array.isArray(o.repos)) warnings.push('repos: expected a list of absolute folder paths, ignored')
    else {
      for (const x of o.repos) {
        const p = typeof x === 'string' ? x.trim().replace(/\/+$/, '') : ''
        if (!isRepoPath(p)) {
          warnings.push('repos: an entry is not an absolute folder path, skipped')
          continue
        }
        if (repos.length >= MAX_REPOS) {
          warnings.push('repos: only the first ' + MAX_REPOS + ' are used')
          break
        }
        if (!repos.includes(p)) repos.push(p)
      }
    }
  }
  const card: CardCfg = {}
  for (const [key, field] of [['claimsDir', 'claimsDir'], ['reportsDir', 'reportsDir']] as const) {
    const v = o[key]
    if (v === undefined) continue
    const p = typeof v === 'string' ? v.trim().replace(/\/+$/, '') : ''
    if (isRepoPath(p)) card[field] = p
    else warnings.push(key + ': expected an absolute folder path, ignored')
  }
  if (o.notesHours !== undefined) {
    const h = o.notesHours
    if (typeof h === 'number' && Number.isFinite(h) && h > 0) card.notesHours = h
    else warnings.push('notesHours: expected a number of hours above 0, ignored')
  }
  return Object.keys(card).length > 0 ? { hosts, services, repos, card } : { hosts, services, repos }
}

export const noExtras: Extras = { hosts: [], services: [], repos: [] }

/** An absolute folder path with no control characters and no ".." part (it is handed to `git -C`). */
export const isRepoPath = (s: string): boolean => /^\/[^\u0000-\u001f\u007f]*$/.test(s) && s.length > 1 && s.length <= 300 && !s.split('/').includes('..')

/** The extras from raw config layers (global first, then the project's): a layer that has the key replaces the earlier one. A broken layer is skipped. */
export function extrasFromLayers(texts: readonly (string | null)[], warnings: string[] = []): Extras {
  let merged: Record<string, unknown> = {}
  for (const t of texts) {
    if (t === null) continue
    try {
      const v: unknown = JSON.parse(t)
      if (isObj(v)) merged = { ...merged, ...v }
      else warnings.push('config: not a JSON object, ignored')
    } catch {
      warnings.push('config: not valid JSON, ignored')
    }
  }
  return parseExtras(merged, warnings)
}

// ---------------------------------------------------------------------------
// The commands. Read only; nothing is ever changed on any machine.

const SSH_HEAD = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=3']
const GPU_QUERY = 'nvidia-smi --query-gpu=memory.used,memory.total,utilization.gpu --format=csv,noheader 2>/dev/null; '

/** One ssh per host: memory (`free -m`) and, when `gpu` is on, the GPU. `; true` so a host without the tool still answers 0; a failing ssh is the 255 that turns the host grey. */
export const hostCommand = (h: HostSpec): string[] => [...SSH_HEAD, h.ssh, 'free -m; ' + (h.gpu ? GPU_QUERY : '') + 'true']

const seconds = (ms: number): number => Math.max(1, Math.ceil(ms / 1000))

/** The check as one shell-free argument list, run on this computer (http, tcp) or remotely (the same text, one ssh with BatchMode). */
const checkWords = (s: ServiceSpec, quote: boolean): string[] => {
  const q = (t: string): string => (quote ? "'" + t + "'" : t)
  if (/^https?:\/\//i.test(s.target)) return ['curl', '-s', '-m', String(seconds(s.timeoutMs)), '-o', '/dev/null', '-w', q('%{http_code} %{time_total}'), q(s.target)]
  const at = s.target.lastIndexOf(':')
  return ['nc', '-z', '-w', String(seconds(s.timeoutMs)), s.target.slice(0, at), s.target.slice(at + 1)]
}

/** One check per service: an http one prints the status code and the total time in seconds; a tcp one exits 0 when the port accepts. An ssh-tunnel service runs it on its host (one ssh, same BatchMode and 3 s connect timeout). */
export const serviceCommand = (s: ServiceSpec): string[] => (s.kind !== 'ssh-tunnel' ? checkWords(s, false) : [...SSH_HEAD, s.ssh, checkWords(s, true).join(' ')])

/** How long the whole check may run: its own timeout, the ssh connect time when it goes through ssh, and a second of slack. */
export const serviceRunMs = (s: ServiceSpec): number => s.timeoutMs + (s.kind === 'ssh-tunnel' ? 3000 : 0) + 1000

export type Probe = { code: number | null; ms: number | null }

/** curl's "200 0.012345" -> { code: 200, ms: 12 }; a "000" (no answer) or anything else is no code. */
export function parseProbe(stdout: string): Probe {
  const m = /(\d{3})\s+([\d.]+)\s*$/.exec(stdout.trim())
  if (!m) {
    const only = /(\d{3})\s*$/.exec(stdout.trim())
    return { code: only && only[1] !== '000' ? Number(only[1]) : null, ms: null }
  }
  const code = m[1] === '000' ? null : Number(m[1])
  const secs = Number(m[2])
  return { code, ms: code !== null && Number.isFinite(secs) ? Math.max(0, Math.round(secs * 1000)) : null }
}

export type ServiceDot = 'green' | 'red' | 'grey'

/** Up on any 2xx or 3xx; a failed or missing answer is down. */
export const serviceDot = (code: number | null): ServiceDot => (code !== null && code >= 200 && code < 400 ? 'green' : 'red')

/** `unreachable` is a service probed through ssh when ssh itself failed: grey, "unknown", not "down" (nothing is known about the service). */
export type ServiceState = { name: string; target: string; dot: ServiceDot; ms: number | null; unreachable: boolean }

export const checkingService = (s: ServiceSpec): ServiceState => ({ name: s.name, target: s.target, dot: 'grey', ms: null, unreachable: false })
/** The state from what the check printed and how it exited (the exit decides a tcp check, and tells a failed ssh from a failed service). */
export const serviceFrom = (s: ServiceSpec, stdout: string, exitCode: number | null = 0): ServiceState => {
  const base = { name: s.name, target: s.target }
  const viaSsh = s.kind === 'ssh-tunnel'
  const isHttp = /^https?:\/\//i.test(s.target)
  if (viaSsh && (exitCode === null || (exitCode === 255 && (!isHttp || parseProbe(stdout).code === null)))) return { ...base, dot: 'grey', ms: null, unreachable: true }
  if (!isHttp) return { ...base, dot: exitCode === 0 ? 'green' : 'red', ms: null, unreachable: false }
  if (viaSsh && exitCode !== 0 && parseProbe(stdout).code === null) return { ...base, dot: 'grey', ms: null, unreachable: true }
  const p = parseProbe(stdout)
  const dot = serviceDot(p.code)
  return { ...base, dot, ms: dot === 'green' ? p.ms : null, unreachable: false }
}

/** "up, 12 ms", "down", "unknown" (ssh failed) or "checking". */
export const serviceWord = (s: ServiceState): string => (s.dot === 'green' ? (s.ms !== null ? 'up, ' + s.ms + ' ms' : 'up') : s.dot === 'red' ? 'down' : s.unreachable ? 'unknown' : 'checking')
