// Cockpit 0.4.0 (the Deck): small formatters shared by the pure deck rules. No I/O, no host.
// prettyModel and the gauge idea are adapted from claude-flightdeck (MIT, scasella); see NOTICE.

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A stored object merged over its defaults, so a value saved under an older shape still reads. */
export const normalize = <T extends object>(def: T, stored: unknown): T => (isObject(stored) ? ({ ...def, ...stored } as T) : def)

/** One line: whitespace collapsed, cut to n cells with an ellipsis. */
export const shorten = (s: string, n: number): string => {
  const one = s.replace(/\s+/g, ' ').trim()
  return n <= 0 ? '' : one.length > n ? `${one.slice(0, Math.max(0, n - 1)).trimEnd()}\u2026` : one
}

/** 950 -> "950", 12_400 -> "12k", 1_250_000 -> "1.3M". */
export const kTokens = (n: number): string => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.max(0, Math.round(n))))

/** 42s, 3m05s, 1h07m. */
export const fmtDuration = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m${String(s % 60).padStart(2, '0')}s` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

/** A running clock: m:ss, or XhYY past an hour. */
export const fmtTimer = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

/** HH:MM:SS in local time, "--:--:--" for an unknown time. */
export const fmtStamp = (ms: number): string => (ms > 0 ? new Date(ms).toTimeString().slice(0, 8) : '--:--:--')

/** "1 error", "2 errors". */
export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

export const fmtUsd = (n: number): string => (n >= 100 ? `$${Math.round(n)}` : `$${n.toFixed(2)}`)

/** The last two path segments, or three: "hooks/core.ts". */
export const pathTail = (p: string, segments = 2): string => p.split(/[\\/]/).filter(s => s !== '').slice(-segments).join('/')

/**
 * A model id as people say it: `claude-opus-5-5[1m]` -> `Opus 5.5 1M`, `claude-3-5-haiku-20241022` -> `Haiku 3.5`.
 * Anything else is shown as given, cut to 22.
 */
export const prettyModel = (id: string): string => {
  if (id === '') return '\u2014'
  const cap = (f: string): string => f.charAt(0).toUpperCase() + f.slice(1)
  const big = /\[1m\]|-1m\b/i.test(id) ? ' 1M' : ''
  const now = /claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(?![\d])/i.exec(id)
  if (now?.[1] !== undefined && !/^\d/.test(now[1])) return `${cap(now[1].toLowerCase())} ${now[2]}${now[3] !== undefined ? `.${now[3]}` : ''}${big}`
  const old = /claude-(\d+)(?:-(\d))?-([a-z]+)/i.exec(id)
  if (old?.[3] !== undefined) return `${cap(old[3].toLowerCase())} ${old[1]}${old[2] !== undefined ? `.${old[2]}` : ''}${big}`
  return shorten(id, 22)
}

export const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n))
