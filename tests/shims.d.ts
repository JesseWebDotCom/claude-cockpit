// Minimal typings for the three Node and Bun things a few pure tests use to read the mod's own files (the host's type
// package has no Node types). Types only: nothing here runs.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string
  export function readdirSync(path: string): string[]
  export function statSync(path: string): { mtimeMs: number }
}
declare module 'node:path' {
  export function resolve(...parts: string[]): string
}
interface ImportMeta {
  dir: string
}
