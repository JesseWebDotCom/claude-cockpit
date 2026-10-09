// For tests of pure functions only (no `$`, no hooks): runs under `claude plugin test` (the host's kit) and under plain
// `bun test` (bun:test), so a pure rule can be checked where the host is not available.

const kit = (await import('claude-code/testing').catch(() => import('bun:test' as string))) as typeof import('claude-code/testing')

export const test = kit.test
export const expect = kit.expect
