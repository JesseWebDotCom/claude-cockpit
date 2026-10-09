// The status line under the input box (cockpit 0.5.1, COCKPIT-18): UNSAVED WORK only, summed over the git repositories the user lists under
// "repos" in the Cockpit config file (hooks/hosts.ts; none by default, and then nothing is read and no line is shown). "all saved" when there
// are no uncommitted files and no unpushed commits, else "unsaved: <N> uncommitted files, <M> unpushed commits". Pure: the reader
// (register.tsx) runs git and hands the output here.
//
// The host's status line takes plain text only (`$.ui.status(text)`: no colour), so "green when saved, amber otherwise" is carried by a glyph
// and the words, not a colour; tests/cockpit18.test.ts says so.

export const UNSAVED_EVERY_MS = 30_000

/** One repository's two git outputs; null for a command that failed (a missing repo, no upstream). */
export type RepoReading = { repo: string; porcelain: string | null; ahead: string | null }

/** The number of paths `git status --porcelain` lists (one line each, untracked included). */
export const countPorcelain = (out: string): number => out.split('\n').filter(l => l.trim() !== '').length

/** The number `git rev-list --count @{u}..HEAD` prints, or null when it is not one. */
export function parseAhead(out: string): number | null {
  const m = /^\s*(\d+)\s*$/.exec(out)
  return m === null ? null : Number(m[1])
}

export type Unsaved = { files: number; commits: number; repos: number }

/**
 * The sum over the repositories that could be read. A repository whose `status` failed is skipped (missing or not a repo); one with no
 * upstream (`rev-list` failed) counts its files and no commits. Null when no repository could be read at all.
 */
export function sumUnsaved(readings: readonly RepoReading[]): Unsaved | null {
  let files = 0
  let commits = 0
  let repos = 0
  for (const r of readings) {
    if (r.porcelain === null) continue
    repos += 1
    files += countPorcelain(r.porcelain)
    commits += r.ahead === null ? 0 : parseAhead(r.ahead) ?? 0
  }
  return repos === 0 ? null : { files, commits, repos }
}

export const isAllSaved = (u: Unsaved): boolean => u.files === 0 && u.commits === 0

/** The status line text; undefined (no status at all) when nothing could be read. */
export function unsavedText(u: Unsaved | null): string | undefined {
  if (u === null) return undefined
  return isAllSaved(u) ? '\u2713 all saved' : '\u25cf unsaved: ' + u.files + ' uncommitted files, ' + u.commits + ' unpushed commits'
}

/** The tone the text stands for (green when saved, amber otherwise); for tests and for any surface that can colour it. */
export const unsavedTone = (u: Unsaved | null): 'green' | 'amber' | '' => (u === null ? '' : isAllSaved(u) ? 'green' : 'amber')

/** The two git commands for one repository (its absolute folder path), as argv. */
export const gitCommands = (repo: string): { status: string[]; ahead: string[] } => ({
  status: ['git', '-C', repo, 'status', '--porcelain'],
  ahead: ['git', '-C', repo, 'rev-list', '--count', '@{u}..HEAD'],
})
