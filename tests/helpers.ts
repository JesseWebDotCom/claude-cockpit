// Shared by the drawing tests. These check the drawings as text; nobody has looked at them on the desktop.

// A small tag-balance check: every open tag is closed in order, no stray "<" in the text.
// Not a full XML parser.
export function isWellFormed(svg: string): boolean {
  const stack: string[] = []
  const tag = /<(\/?)([a-zA-Z][\w:-]*)((?:[^>"]|"[^"]*")*?)(\/?)>/g
  let m: RegExpExecArray | null
  let last = 0
  while ((m = tag.exec(svg)) !== null) {
    if (svg.slice(last, m.index).includes('<')) return false
    last = tag.lastIndex
    const [, close, name = '', , self] = m
    if (self === '/') continue
    if (close === '/') {
      if (stack.pop() !== name) return false
    } else stack.push(name)
  }
  return stack.length === 0 && !svg.slice(last).includes('<')
}

export const count = (s: string, needle: string): number => s.split(needle).length - 1

// Every id in a document is used once (a clipPath or marker id twice would clip the wrong thing).
export function idsAreUnique(svg: string): boolean {
  const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map(m => m[1] ?? '')
  return new Set(ids).size === ids.length
}
