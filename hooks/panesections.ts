// COCKPIT-36: the pane's five sections, in ONE declared list. Every layout path reads it: the order top to bottom is this order, every header is always
// drawn, and each section's open or closed state is its own saved flag that only that section's toggle writes. Pure; tests/cockpit36.test.ts.

export type PaneSection = { id: string; title: string; /** The block key of the section's header row. */ head: string; /** The block-key prefix of its body. */ prefix: string; openByDefault: boolean }

export const PANE_SECTIONS: readonly PaneSection[] = [
  { id: 'status', title: 'Main status', head: 'status-row', prefix: 'status-', openByDefault: true },
  { id: 'c-agents', title: 'Agents', head: 'crew-head', prefix: 'crew-', openByDefault: true },
  { id: 'c-system', title: 'System', head: 'sys-head', prefix: 'sys-', openByDefault: false },
  { id: 'c-events', title: 'Events', head: 'fl-head', prefix: 'fl-', openByDefault: false },
  { id: 'c-syslog', title: 'System log', head: 'bx-head', prefix: 'bx-', openByDefault: false },
]

/** COCKPIT-45: the pre-0.18 ids. A saved file that still has them is read as the new ids, so nobody loses their open or closed flags. */
export const LEGACY_IDS: Readonly<Record<string, string>> = { 'c-agents': 'c-crew', 'c-events': 'c-flight', 'c-syslog': 'c-blackbox' }

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
  for (const s of PANE_SECTIONS) {
    const v = typeof o[s.id] === 'boolean' ? o[s.id] : o[LEGACY_IDS[s.id] ?? '']
    if (typeof v === 'boolean') out[s.id] = v
  }
  return out
}

/** Flags from the pre-0.9 file, which kept a list of open ids and a 'c-crew-shut' marker. Used only when the file has no `sections`. */
export function legacySections(expanded: readonly string[]): Record<string, boolean> {
  return { status: expanded.includes('status'), 'c-agents': !expanded.includes('c-crew-shut'), 'c-system': expanded.includes('c-system'), 'c-events': expanded.includes('c-flight'), 'c-syslog': expanded.includes('c-blackbox') }
}
