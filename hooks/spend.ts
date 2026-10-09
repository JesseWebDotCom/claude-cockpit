// Measured spend (cockpit v7). Two read-only sources, both run by the mod at runtime through $.process.run and
// both fail soft ("not readable", nothing invented):
//
//  1. OpenCode's own cost records: ~/.local/share/opencode/opencode.db, table message(data JSON). An assistant row
//     carries cost (USD), providerID, modelID, tokens and time.created. Read with `sqlite3 -readonly`; ONLY the cost,
//     count and time fields are selected. auth.json and every *.key file are never opened.
//  2. Claude Code's transcripts (~/.claude/projects/**/*.jsonl): an awk filter keeps ONLY the timestamp, model and the
//     four token counts of each assistant line and sums them per 10-minute bucket; message text never leaves awk.
//     The buckets are priced at API rates (a small table, an ESTIMATE; unknown models price at 0 and are counted).

// ---------------------------------------------------------------------------
// OpenCode (the measured API spend)

export const OPENCODE_DB = '/.local/share/opencode/opencode.db'

// `select sum(cost), count(*)` of the assistant messages of the Claude API since `sinceMs` (0 for all). The values
// are numbers we format ourselves, never text from a row.
export function spendQuery(sinceMs: number): string {
  const since = Number.isFinite(sinceMs) && sinceMs > 0 ? Math.floor(sinceMs) : 0
  return "select coalesce(sum(json_extract(data,'$.cost')),0), count(*) from message where json_extract(data,'$.role')='assistant' and json_extract(data,'$.providerID')='anthropic' and json_extract(data,'$.time.created') >= " + since
}

export const spendArgv = (home: string, sinceMs: number): string[] => ['sqlite3', '-readonly', home + OPENCODE_DB, spendQuery(sinceMs)]

export type Spend = { usd: number; messages: number }

// "197.1234|34" -> { usd: 197.12, messages: 34 }; anything else is null.
export function parseSpend(stdout: string): Spend | null {
  const m = /^\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\|(\d+)\s*$/i.exec(stdout)
  if (m === null) return null
  const usd = Number(m[1])
  return Number.isFinite(usd) && usd >= 0 ? { usd: Math.round(usd * 100) / 100, messages: Number(m[2]) } : null
}

// The first instant of the calendar month of `nowMs`, in UTC (cockpit v9: the API line is "this month", measured
// from the 1st at 00:00 UTC). A time that is not a finite number is 0 (all time), never a guess.
export function monthStartUtcMs(nowMs: number): number {
  if (!Number.isFinite(nowMs)) return 0
  const d = new Date(nowMs)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
}

// The credit start date from credits.json ("start": "2026-10-01") as ms, or 0.
export function startMs(start: string): number {
  const t = /^\d{4}-\d{2}-\d{2}/.test(start) ? Date.parse(start.slice(0, 10) + 'T00:00:00') : Number.NaN
  return Number.isFinite(t) ? t : 0
}

// ---------------------------------------------------------------------------
// Claude Code transcripts (the dollar estimate per window)

// Per million tokens: [input, output, cache read]. Cache writes are 1.25x input (5 minute) and 2x input (1 hour).
// Longest matching prefix wins. An ESTIMATE from public list prices as I know them; unverified.
const PRICES: [string, number, number, number][] = (
  [
    ['claude-opus-5-5', 4, 20, 0.2],
    ['claude-opus-5', 5, 25, 0.5],
    ['claude-opus-4', 5, 25, 0.5],
    ['claude-sonnet-5', 2, 10, 0.2],
    ['claude-sonnet-4', 3, 15, 0.3],
    ['claude-haiku-5', 0.1, 0.5, 0.01],
    ['claude-haiku-4', 1, 5, 0.1],
  ] as [string, number, number, number][]
).sort((a, b) => b[0].length - a[0].length)

export type Bucket = { file: string; bucket: string; model: string; input: number; output: number; read: number; write5: number; write1h: number }

// One awk process over a batch of files. It dedupes by message id plus request id, and prints one tab-separated
// line per file, 10-minute bucket and model: file, bucket (YYYY-MM-DDTHH:M), model, input, output, cache read,
// cache write 5m, cache write 1h. Nothing else of a line is ever printed.
export const COST_AWK = `
function num(k,  p) { p = "\\"" k "\\":[0-9]+"; if (match($0, p)) return substr($0, RSTART + length(k) + 3, RLENGTH - length(k) - 3) + 0; return 0 }
/"type":"assistant"/ && /"usage"/ {
  if (!match($0, /"timestamp":"[0-9T:.Z-]+"/)) next
  b = substr($0, RSTART + 13, 15)
  if (!match($0, /"model":"[^"]+"/)) next
  m = substr($0, RSTART + 9, RLENGTH - 10)
  id = ""; if (match($0, /"id":"msg_[^"]+"/)) id = substr($0, RSTART, RLENGTH)
  if (match($0, /"requestId":"[^"]+"/)) id = id substr($0, RSTART, RLENGTH)
  if (id != "") { if (id in seen) next; seen[id] = 1 }
  k = FILENAME SUBSEP b SUBSEP m
  e1 = num("ephemeral_1h_input_tokens"); cw = num("cache_creation_input_tokens")
  i[k] += num("input_tokens"); o[k] += num("output_tokens"); r[k] += num("cache_read_input_tokens")
  w1[k] += e1; w5[k] += (cw > e1 ? cw - e1 : 0)
}
END { for (k in i) { split(k, a, SUBSEP); printf "%s\\t%s\\t%s\\t%d\\t%d\\t%d\\t%d\\t%d\\n", a[1], a[2], a[3], i[k], o[k], r[k], w5[k], w1[k] } }`

export const costArgv = (files: readonly string[]): string[] => ['awk', COST_AWK, ...files]

export function parseBuckets(stdout: string): Bucket[] {
  const out: Bucket[] = []
  for (const line of stdout.split('\n')) {
    const f = line.split('\t')
    if (f.length !== 8) continue
    const n = f.slice(3).map(Number)
    if (n.some(v => !Number.isFinite(v))) continue
    out.push({ file: f[0] ?? '', bucket: f[1] ?? '', model: f[2] ?? '', input: n[0] ?? 0, output: n[1] ?? 0, read: n[2] ?? 0, write5: n[3] ?? 0, write1h: n[4] ?? 0 })
  }
  return out
}

// "2026-10-08T21:5" (a 10-minute bucket, UTC) to the ms of its start.
export const bucketMs = (b: string): number => Date.parse(b + '0:00Z')

export function priceOf(model: string, b: Pick<Bucket, 'input' | 'output' | 'read' | 'write5' | 'write1h'>): number | null {
  const id = model.toLowerCase().replace(/^(us\.|eu\.|global\.)?anthropic\./, '')
  const p = PRICES.find(([prefix]) => id.startsWith(prefix))
  if (p === undefined) return null
  return (b.input * p[1] + b.output * p[2] + b.read * p[3] + b.write5 * p[1] * 1.25 + b.write1h * p[1] * 2) / 1_000_000
}

export type CostWindow = { usd: number; tokens: number; unpricedTokens: number }

// What the buckets that start at or after `fromMs` cost. A bucket that straddles the start counts whole (at most
// ten minutes of error).
export function costSince(buckets: readonly Bucket[], fromMs: number): CostWindow {
  const out: CostWindow = { usd: 0, tokens: 0, unpricedTokens: 0 }
  for (const b of buckets) {
    if (!(bucketMs(b.bucket) + 600_000 > fromMs)) continue
    const tok = b.input + b.output + b.read + b.write5 + b.write1h
    out.tokens += tok
    const usd = priceOf(b.model, b)
    if (usd === null) out.unpricedTokens += tok
    else out.usd += usd
  }
  out.usd = Math.round(out.usd * 100) / 100
  return out
}
