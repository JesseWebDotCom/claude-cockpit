// Text cleaning for what the panel shows from a pane: control and block characters out, and any line
// that looks like code, terminal art or a prompt fragment rejected. Pure; tested in tests/text.test.ts.

// Control characters, box drawing (U+2500-257F), block elements (U+2580-259F), braille (U+2800-28FF) and the private use area (powerline and
// Nerd Font icons, U+E000-F8FF: COCKPIT-18).
const NOISE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2500-\u259f\u2800-\u28ff\ue000-\uf8ff]/g

// Strips the noise characters and collapses whitespace.
export function stripNoise(s: string): string {
  return s.replace(NOISE, ' ').replace(/\s+/g, ' ').trim()
}

const LETTER = /\p{L}/u

// Share of the non-space characters that are letters, 0 to 1; 0 for a blank line.
export function letterShare(s: string): number {
  const chars = [...s].filter(c => !/\s/.test(c))
  if (chars.length === 0) return 0
  return chars.filter(c => LETTER.test(c)).length / chars.length
}

// Pieces of source code or shell that never belong in a plain-words description.
const CODE_BITS = ['=>', "')", '")', '();', '\\b', '{', '}']
// A clock, a prompt or a terminal status fragment: zsh, "100%" (or its block-drawn form), "↓7", hh:mm:ss.
const PROMPT_BITS = /\bzsh\b|\b100\s?[%\u2592]|[\u2191\u2193]\s?\d+|\b\d{1,2}:\d{2}:\d{2}\b/

// True when the line must not be shown: nothing readable is left, letters are under 60% of what remains,
// it holds code (`=>`, `')`, `();`, a backslash-b, a heap of backticks) or a clock/prompt fragment.
export function isJunkLine(raw: string): boolean {
  const t = stripNoise(raw)
  if (t === '') return true
  if (letterShare(t) < 0.6) return true
  if (CODE_BITS.some(bit => t.includes(bit))) return true
  if ((t.match(/`/g) ?? []).length >= 6) return true
  if (PROMPT_BITS.test(t)) return true
  return false
}

// The line as it may be shown, or '' when it is junk.
export function cleanLine(raw: string): string {
  return isJunkLine(raw) ? '' : stripNoise(raw)
}
