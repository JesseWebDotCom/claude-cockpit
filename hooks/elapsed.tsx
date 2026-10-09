// A running clock drawn on the SURFACE's own frame clock (Cockpit 0.4.0, the Deck), so the deck need not redraw each second.
// `since` and `now` come from the hooks module's $.clock; between its redraws this module adds its own one-second ticks, and a
// fresh `now` restarts the count from the real reading. With `endAt` set the clock is stopped and draws that final reading.
// Adapted from claude-flightdeck's elapsed.tsx (MIT, Copyright (c) 2026 Stephen Casella; see NOTICE).
import type { ClientModule } from 'claude-code'

type Props = { since: number; now: number; endAt: number | null; color: string }
type Ref = { base: number; ticks: number; lastNow: number; isRunning: boolean }
type State = { ref: Ref }

const fmt = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

const Elapsed: ClientModule<Props, State> = (props, surface) => {
  const { Text } = surface.elements
  const ref: Ref = surface.state?.ref ?? { base: 0, ticks: 0, lastNow: -1, isRunning: true }
  if (props.now !== ref.lastNow) {
    ref.lastNow = props.now
    ref.base = (props.endAt ?? props.now) - props.since
    ref.ticks = 0
  }
  ref.isRunning = props.endAt === null
  if (surface.state === undefined) {
    surface.setState({ ref })
    surface.every(1000, () => {
      if (ref.isRunning) {
        ref.ticks += 1
        surface.setState({ ref })
      }
    })
  }
  return Text({ color: props.color, children: [fmt(ref.base + ref.ticks * 1000)] })
}

export default Elapsed
