import { expect, test } from './pure.ts'

import { COST_AWK, OPENCODE_DB, bucketMs, costArgv, costSince, parseBuckets, parseSpend, priceOf, spendArgv, spendQuery, startMs } from '../hooks/spend.ts'

// ---------------------------------------------------------------------------
// OpenCode: the measured spend (the schema is in agents/queue/oc-db-note.md; the db itself is not readable here)

test('the spend query reads only cost, count and time of the Claude API assistant messages; read only; a number is the only input', async () => {
  const q = spendQuery(1_790_000_000_000)
  expect(q).toContain("json_extract(data,'$.role')='assistant'")
  expect(q).toContain("json_extract(data,'$.providerID')='anthropic'")
  expect(q).toContain("sum(json_extract(data,'$.cost'))")
  expect(q).toContain("json_extract(data,'$.time.created') >= 1790000000000")
  // Nothing that could be message text, a key or an auth record is selected.
  expect(q).not.toMatch(/\bparts?\b|content|text|auth|key|token/i)
  expect(spendQuery(0)).toMatch(/>= 0$/)
  // A bad number cannot reach the query as text.
  expect(spendQuery(Number.NaN)).toMatch(/>= 0$/)
  expect(spendQuery(Number.POSITIVE_INFINITY)).toMatch(/>= 0$/)
  const argv = spendArgv('/Users/test', 5)
  expect(argv.slice(0, 3)).toEqual(['sqlite3', '-readonly', '/Users/test' + OPENCODE_DB])
  expect(argv.join(' ')).not.toMatch(/auth\.json|\.key/)
})

test('spend output: "197.1234|34" is $197.12 over 34 messages; anything else is null (never a made-up number)', async () => {
  expect(parseSpend('197.1234|34\n')).toEqual({ usd: 197.12, messages: 34 })
  expect(parseSpend('0|0')).toEqual({ usd: 0, messages: 0 })
  expect(parseSpend('3.41|34')).toEqual({ usd: 3.41, messages: 34 })
  expect(parseSpend('1.5e-05|2')).toEqual({ usd: 0, messages: 2 })
  for (const bad of ['', 'Error: unable to open database file', '-1|3', 'x|y', '3.4', '3.4|', '3.4|34|5']) expect(parseSpend(bad)).toBeNull()
})

test('the credit start date: "2026-10-01" is a time; anything else is 0 (all time)', async () => {
  expect(startMs('2026-10-01')).toBe(Date.parse('2026-10-01T00:00:00'))
  expect(startMs('')).toBe(0)
  expect(startMs('soon')).toBe(0)
})

// ---------------------------------------------------------------------------
// Claude transcripts: the dollar estimate

// What the awk filter prints for the fixture fixtures/transcript-sample.jsonl (its three assistant lines: one
// duplicated, one a model with no price): file, 10-minute bucket, model, input, output, cache read, write 5m, write 1h.
const AWK_OUT = [
  'a.jsonl\t2026-10-08T21:5\tclaude-opus-5-5\t6\t210\t146994\t400\t600',
  'a.jsonl\t2026-10-08T21:5\tmystery-model-1\t10\t20\t0\t0\t0',
  'a.jsonl\t2026-10-08T17:0\tclaude-sonnet-5-5\t100\t300\t5000\t0\t0',
].join('\n')

test('the awk filter prints only numbers and ids: no line of text, deduped by message and request id', async () => {
  expect(COST_AWK).toContain('"type":"assistant"')
  expect(COST_AWK).toContain('seen[id]')
  // It never prints a message: the only printf is the tab-separated bucket line.
  expect((COST_AWK.match(/printf/g) ?? []).length).toBe(1)
  expect(COST_AWK).not.toMatch(/print \$0|print \$/)
  const argv = costArgv(['/x/a.jsonl', '/x/b.jsonl'])
  expect(argv[0]).toBe('awk')
  expect(argv.slice(2)).toEqual(['/x/a.jsonl', '/x/b.jsonl'])
})

test('buckets parse; a line that is not eight fields or has a bad number is skipped', async () => {
  const b = parseBuckets(AWK_OUT + '\nnot a bucket line\nx\ty\tz\t1\t2\t3\t4\tNaNx\n')
  expect(b.length).toBe(3)
  expect(b[0]).toEqual({ file: 'a.jsonl', bucket: '2026-10-08T21:5', model: 'claude-opus-5-5', input: 6, output: 210, read: 146994, write5: 400, write1h: 600 })
  expect(bucketMs('2026-10-08T21:5')).toBe(Date.parse('2026-10-08T21:50:00Z'))
})

test('pricing: per model at API rates (cache writes 1.25x and 2x input); an unknown model is not priced', async () => {
  const b = parseBuckets(AWK_OUT)
  // opus-5-5: 4 in, 20 out, 0.2 read; 6*4 + 210*20 + 146994*0.2 + 400*4*1.25 + 600*4*2 = 24 + 4200 + 29398.8 + 2000 + 4800
  expect(Math.abs((priceOf('claude-opus-5-5', b[0]!) ?? 9) - (24 + 4200 + 29398.8 + 2000 + 4800) / 1_000_000) < 1e-9).toBe(true)
  expect(priceOf('anthropic.claude-opus-5-5-20260101', b[0]!)).not.toBeNull()
  expect(priceOf('mystery-model-1', b[1]!)).toBeNull()
})

test('a window costs what the buckets inside it cost: the 5h window excludes the 17:0 bucket, the week includes it; unpriced tokens are counted apart', async () => {
  const b = parseBuckets(AWK_OUT)
  const five = costSince(b, Date.parse('2026-10-08T19:00:00Z'))
  expect(five.tokens).toBe(6 + 210 + 146994 + 400 + 600 + 30)
  expect(five.unpricedTokens).toBe(30)
  expect(five.usd).toBe(0.04)
  const week = costSince(b, Date.parse('2026-10-01T22:00:00Z'))
  expect(week.tokens).toBe(five.tokens + 5400)
  expect(week.usd).toBeGreaterThanOrEqual(five.usd)
  // A heavier older bucket shows in the week and not in the 5h window.
  const heavy = [...b, { file: 'a.jsonl', bucket: '2026-10-05T10:0', model: 'claude-sonnet-5-5', input: 5_000_000, output: 1_000_000, read: 0, write5: 0, write1h: 0 }]
  expect(costSince(heavy, Date.parse('2026-10-08T19:00:00Z')).usd).toBe(five.usd)
  expect(costSince(heavy, Date.parse('2026-10-01T22:00:00Z')).usd).toBe(Math.round((week.usd + 20) * 100) / 100)
  // A window in the future holds nothing.
  expect(costSince(b, Date.parse('2026-10-09T00:00:00Z'))).toEqual({ usd: 0, tokens: 0, unpricedTokens: 0 })
  expect(costSince([], 0)).toEqual({ usd: 0, tokens: 0, unpricedTokens: 0 })
})
