// A shell prompt is never work (cockpit 0.5.1, COCKPIT-18). A pane whose last lines are a shell prompt (powerline segments, a user and
// path and branch line, a right prompt "zsh 100 10:08:42") has no agent running in it, whatever scrollback is above it. Pure rules:
//   - stripGlyphs: box drawing, block elements, braille and private-use (powerline, Nerd Font) glyphs out, whitespace collapsed;
//   - isShellPromptLine: one line is a prompt;
//   - atShellPrompt: a pane's last non-empty line is a prompt, so the lane is idle.

// Private use areas hold the powerline and Nerd Font icons: U+E000-F8FF, and the supplementary planes 15 and 16.
const PRIVATE_USE = /[\ue000-\uf8ff\u{f0000}-\u{ffffd}\u{100000}-\u{10fffd}]/gu
const NOISE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2500-\u259f\u2800-\u28ff\ue000-\uf8ff\u{f0000}-\u{ffffd}\u{100000}-\u{10fffd}]/gu

/** The text with the drawing and icon glyphs removed and the whitespace collapsed ('' when nothing readable is left). */
export const stripGlyphs = (s: string): string => s.replace(NOISE, ' ').replace(/\s+/g, ' ').trim()

const privateUseCount = (s: string): number => (s.match(PRIVATE_USE) ?? []).length

/** One line of a pane that is a shell prompt (or its right-hand half), judged on the raw text so the glyphs still count. */
export function isShellPromptLine(raw: string): boolean {
  const t = stripGlyphs(raw)
  if (t === '') return false
  // Powerline segments: two or more private-use glyphs on a line that has some text.
  if (privateUseCount(raw) >= 2) return true
  // A right prompt: the shell's name and a clock ("zsh 100 10:08:42").
  if (/^(?:zsh|bash|fish|sh|nu)\b.*\b\d{1,2}:\d{2}:\d{2}$/i.test(t)) return true
  // user@host:path$ and the bare marks.
  if (/^[\w.-]+@[\w.-]+[: ~/].*[$%#>\u276f\u279c]$/.test(t)) return true
  if (/^[$%#>\u276f\u279c]$/.test(t)) return true
  // A prompt whose glyphs were already stripped: a branch with its ahead/behind marks and a path or version.
  if (/\b(?:main|master|develop|trunk)\b\s*[\u2191\u2193\u2261]/.test(t) && /(?:\bhome\b|~|\/|\b\d+\.\d+\.\d+\b)/.test(t)) return true
  return false
}

/** The pane ends at a shell prompt: its last non-empty line is one. A TUI that is running never ends like that. */
export function atShellPrompt(lines: readonly string[]): boolean {
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i] ?? ''
    if (l.trim() === '') continue
    return isShellPromptLine(l)
  }
  return false
}
