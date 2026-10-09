// Cockpit 0.4.0 (the Deck), panel 8: the status line piece. Context, running agents, lanes working and denials, only the
// fields that have something to say; with none, no status entry at all. Pure; the host call is in register.tsx.

export type StatusFacts = { ctxPct: number | null; agentsRunning: number; agentsTotal: number; lanesWorking: number; denied: number }

/** "ctx 41% \u00b7 agents 2/5 \u00b7 lanes 3 active \u00b7 denied 1", or undefined when there is nothing to say. */
export function statusPiece(f: StatusFacts): string | undefined {
  const parts = [
    f.ctxPct !== null ? `ctx ${Math.round(f.ctxPct)}%` : null,
    f.agentsTotal > 0 ? `agents ${f.agentsRunning}/${f.agentsTotal}` : null,
    f.lanesWorking > 0 ? `lanes ${f.lanesWorking} active` : null,
    f.denied > 0 ? `denied ${f.denied}` : null,
  ].filter((p): p is string => p !== null)
  return parts.length > 0 ? parts.join(' \u00b7 ') : undefined
}
