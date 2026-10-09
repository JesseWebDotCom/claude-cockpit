// COCKPIT-36: the pane's five sections, in ONE declared list. Every layout path reads it: the order top to bottom is this order, every header is always
// drawn, and each section's open or closed state is its own saved flag that only that section's toggle writes. Pure; tests/cockpit36.test.ts.

export type PaneSection = { id: string; title: string; /** The block key of the section's header row. */ head: string; /** The block-key prefix of its body. */ prefix: string; openByDefault: boolean }

export const PANE_SECTIONS: readonly PaneSection[] = [
  { id: 'status', title: 'Main status', head: 'status-row', prefix: 'status-', openByDefault: true },
  { id: 'c-crew', title: 'Crew', head: 'crew-head', prefix: 'crew-', openByDefault: true },
  { id: 'c-system', title: 'System', head: 'sys-head', prefix: 'sys-', openByDefault: false },
  { id: 'c-flight', title: 'Flight log', head: 'fl-head', prefix: 'fl-', openByDefault: false },
  { id: 'c-blackbox', title: 'Black box', head: 'bx-head', prefix: 'bx-', openByDefault: false },
]

/** The saved flags: section id to open (true) or closed (false). A missing id means the section's default. */
export type SectionFlags = Readonly<Record<string, boolean>>

export const defaultSections = (): Record<string, boolean> => Object.fromEntries(PANE_SECTIONS.map(s => [s.id, s.openByDefault]))

export const isSectionOpen = (flags: SectionFlags, id: string): boolean => flags[id] ?? PANE_SECTIONS.find(s => s.id === id)?.openByDefault ?? false

/** The flags after one section's toggle: exactly that one entry changes. */
export const toggledSections = (flags: SectionFlags, id: string): Record<string, boolean> => ({ ...flags, [id]: !isSectionOpen(flags, id) })

/** The flags after one section is set open: exactly that one entry changes. */
export const withSection = (flags: SectionFlags, id: string, open: boolean): Record<string, boolean> => ({ ...flags, [id]: open })

/** Flags read from a saved file: only the declared ids, only booleans. Nothing else in the object is kept. */
export function parseSections(v: unknown): Record<string, boolean> | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const out: Record<string, boolean> = {}
  for (const s of PANE_SECTIONS) if (typeof o[s.id] === 'boolean') out[s.id] = o[s.id] as boolean
  return out
}

/** Flags from the pre-0.9 file, which kept a list of open ids and a 'c-crew-shut' marker. Used only when the file has no `sections`. */
export function legacySections(expanded: readonly string[]): Record<string, boolean> {
  return { status: expanded.includes('status'), 'c-crew': !expanded.includes('c-crew-shut'), 'c-system': expanded.includes('c-system'), 'c-flight': expanded.includes('c-flight'), 'c-blackbox': expanded.includes('c-blackbox') }
}
