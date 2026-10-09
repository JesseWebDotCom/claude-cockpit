// The System card's extras, from the config file (pure: no mods API, no I/O). The card always shows THIS computer. Anything more is listed by the
// user in the Cockpit config file (hooks/config.ts reads it):
//
//   "hosts":    [{ "name": "host-a", "ssh": "gpu-alias", "gpu": true }]       one gauge group per host, read through ssh
//   "services": [{ "name": "Web app", "url": "http://localhost:3000/health" }]   one up/down line per service, read with an HTTP GET
//               add "ssh": "gpu-alias" to a service to make the GET from that host (a service that listens only on its own machine)
//
// No hosts and no services listed means nothing extra is shown and nothing extra is probed: no ssh, no HTTP. Unit tested in tests/hosts.test.ts.

export type HostSpec = { name: string; ssh: string; gpu: boolean }
/** `ssh` is '' to probe from this computer, or a host alias to run the GET on that host. */
export type ServiceSpec = { name: string; url: string; ssh: string }
export type Extras = { hosts: HostSpec[]; services: ServiceSpec[] }

export const MAX_HOSTS = 8
export const MAX_SERVICES = 12
const NAME_MAX = 40

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const clean = (v: unknown): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : '')

/** An ssh host alias or name: letters, digits, dot, dash, underscore, @; never starting with a dash (it would be read as an ssh option). */
export const isSshTarget = (s: string): boolean => /^[A-Za-z0-9_][\w.@-]{0,99}$/.test(s)

/** An http or https address with no spaces, quotes, backticks, backslashes or angle brackets (it can be put inside single quotes for a remote shell). */
export const isServiceUrl = (s: string): boolean => /^https?:\/\/[^\s'"`\\<>]+$/i.test(s) && s.length <= 300

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
    if (!Array.isArray(o.services)) warnings.push('services: expected a list of {"name": ..., "url": ...}, ignored')
    else {
      for (const x of o.services) {
        const url = isObj(x) && typeof x.url === 'string' ? x.url.trim() : ''
        if (!isServiceUrl(url)) {
          warnings.push('services: an entry has no usable "url" (http or https), skipped')
          continue
        }
        if (services.length >= MAX_SERVICES) {
          warnings.push('services: only the first ' + MAX_SERVICES + ' are used')
          break
        }
        const via = isObj(x) && typeof x.ssh === 'string' ? x.ssh.trim() : ''
        if (via !== '' && !isSshTarget(via)) {
          warnings.push('services: "' + url.slice(0, 40) + '" has an unusable "ssh", skipped')
          continue
        }
        const name = isObj(x) ? clean(x.name) : ''
        services.push({ name: name !== '' ? name : hostOfUrl(url), url, ssh: via })
      }
    }
  }
  return { hosts, services }
}

export const noExtras: Extras = { hosts: [], services: [] }

// ---------------------------------------------------------------------------
// The commands. Read only; nothing is ever changed on any machine.

const SSH_HEAD = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=3']
const GPU_QUERY = 'nvidia-smi --query-gpu=memory.used,memory.total,utilization.gpu --format=csv,noheader 2>/dev/null; '

/** One ssh per host: memory (`free -m`) and, when `gpu` is on, the GPU. `; true` so a host without the tool still answers 0; a failing ssh is the 255 that turns the host grey. */
export const hostCommand = (h: HostSpec): string[] => [...SSH_HEAD, h.ssh, 'free -m; ' + (h.gpu ? GPU_QUERY : '') + 'true']

const CURL_ARGS = ['-s', '-m', '2', '-o', '/dev/null', '-w']

/** One GET per service: prints the status code and the total time in seconds. With `ssh`, the GET runs on that host (one ssh, same BatchMode and 3 s timeout). */
export const serviceCommand = (s: ServiceSpec): string[] =>
  s.ssh === '' ? ['curl', ...CURL_ARGS, '%{http_code} %{time_total}', s.url] : [...SSH_HEAD, s.ssh, "curl -s -m 2 -o /dev/null -w '%{http_code} %{time_total}' '" + s.url + "'"]

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
export type ServiceState = { name: string; url: string; dot: ServiceDot; ms: number | null; unreachable: boolean }

export const checkingService = (s: ServiceSpec): ServiceState => ({ name: s.name, url: s.url, dot: 'grey', ms: null, unreachable: false })
/** The state from what the probe printed and how it exited (the exit only matters for a service probed through ssh). */
export const serviceFrom = (s: ServiceSpec, stdout: string, exitCode: number | null = 0): ServiceState => {
  if (s.ssh !== '' && exitCode !== 0 && exitCode !== null && parseProbe(stdout).code === null) return { name: s.name, url: s.url, dot: 'grey', ms: null, unreachable: true }
  if (s.ssh !== '' && exitCode === null) return { name: s.name, url: s.url, dot: 'grey', ms: null, unreachable: true }
  const p = parseProbe(stdout)
  const dot = serviceDot(p.code)
  return { name: s.name, url: s.url, dot, ms: dot === 'green' ? p.ms : null, unreachable: false }
}

/** "up, 12 ms", "down", "unknown" (ssh failed) or "checking". */
export const serviceWord = (s: ServiceState): string => (s.dot === 'green' ? (s.ms !== null ? 'up, ' + s.ms + ' ms' : 'up') : s.dot === 'red' ? 'down' : s.unreachable ? 'unknown' : 'checking')
