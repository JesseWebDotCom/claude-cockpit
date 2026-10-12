// COCKPIT-36 (COCKPIT-67: now two, the System, Events and System log cards are gone): the pane's sections, in ONE declared list. Every layout path reads it: the order top to bottom is this order, every header is always
// drawn, and each section's open or closed state is its own saved flag that only that section's toggle writes. Pure; tests/cockpit36.test.ts.

export type PaneSection = { id: string; title: string; /** The block key of the section's header row. */ head: string; /** The block-key prefix of its body. */ prefix: string; openByDefault: boolean }

export const PANE_SECTIONS: readonly PaneSection[] = [
  { id: 'status', title: 'Main status', head: 'status-row', prefix: 'status-', openByDefault: true },
  { id: 'c-agents', title: 'Agents', head: 'crew-head', prefix: 'crew-', openByDefault: true },
]

/** 0.22.0: the plan area's own cards (hooks/plancards.ts), each with its own saved flag. They are not in PANE_SECTIONS (that list is the old two-header layout);
 *  the flags ride in the same saved `sections` object. The Title card is always open and has no flag. */
export const CARD_FLAGS: Readonly<Record<string, boolean>> = { 'pc-system': false, 'pc-needs': false, 'pc-off': false }

/** COCKPIT-TREE-01: the plan tree's dynamic flags, one per milestone (pm-<id>), per expanded step (ps-<id>) and per second expand (pv-<id>). Missing means closed. */
export const TREE_FLAG = /^(pm|ps|pv)-[A-Za-z0-9._-]{1,64}$/

/** COCKPIT-45: the pre-0.18 ids. A saved file that still has them is read as the new ids, so nobody loses their open or closed flags. */
export const LEGACY_IDS: Readonly<Record<string, string>> = { 'c-agents': 'c-crew' }

/** The saved flags: section id to open (true) or closed (false). A missing id means the section's default. */
export type SectionFlags = Readonly<Record<string, boolean>>

export const defaultSections = (): Record<string, boolean> => ({ ...Object.fromEntries(PANE_SECTIONS.map(s => [s.id, s.openByDefault])), ...CARD_FLAGS })

export const isSectionOpen = (flags: SectionFlags, id: string): boolean => flags[id] ?? PANE_SECTIONS.find(s => s.id === id)?.openByDefault ?? CARD_FLAGS[id] ?? false

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
  for (const id of Object.keys(CARD_FLAGS)) if (typeof o[id] === 'boolean') out[id] = o[id] as boolean
  for (const id of Object.keys(o)) if (TREE_FLAG.test(id) && typeof o[id] === 'boolean') out[id] = o[id] as boolean
  return out
}

/** Flags from the pre-0.9 file, which kept a list of open ids and a 'c-crew-shut' marker. Used only when the file has no `sections`. */
export function legacySections(expanded: readonly string[]): Record<string, boolean> {
  return { status: expanded.includes('status'), 'c-agents': !expanded.includes('c-crew-shut') }
}
