// A tiny PNG reader for the sprite build (tools/buildsprites.ts): 8-bit palette or RGB(A), no interlace. Returns RGBA bytes. Reads a file the repo ships (assets/workers),
// never executes anything from it.
import { inflateSync } from 'node:zlib'
import { readFileSync } from 'node:fs'

export type Pixels = { w: number; h: number; rgba: Uint8Array }

export function readPng(path: string): Pixels {
  const b = readFileSync(path)
  let p = 8
  let w = 0
  let h = 0
  let depth = 8
  let ctype = 0
  let plte: Uint8Array = new Uint8Array(0)
  let trns: Uint8Array = new Uint8Array(0)
  const idat: Buffer[] = []
  while (p < b.length) {
    const len = b.readUInt32BE(p)
    const type = b.toString('ascii', p + 4, p + 8)
    const data = b.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') {
      w = data.readUInt32BE(0)
      h = data.readUInt32BE(4)
      depth = data[8]!
      ctype = data[9]!
      if (data[12] !== 0) throw new Error('interlaced PNG not supported')
    } else if (type === 'PLTE') plte = new Uint8Array(data)
    else if (type === 'tRNS') trns = new Uint8Array(data)
    else if (type === 'IDAT') idat.push(Buffer.from(data))
    p += 12 + len
  }
  if (depth !== 8) throw new Error('only 8-bit PNG supported')
  const ch = ctype === 3 ? 1 : ctype === 2 ? 3 : ctype === 6 ? 4 : ctype === 0 ? 1 : 2
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * ch
  const out = new Uint8Array(h * stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]!
    const row = y * stride
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x]!
      const a = x >= ch ? out[row + x - ch]! : 0
      const up = y > 0 ? out[row - stride + x]! : 0
      const c = x >= ch && y > 0 ? out[row - stride + x - ch]! : 0
      let r = v
      if (f === 1) r = v + a
      else if (f === 2) r = v + up
      else if (f === 3) r = v + ((a + up) >> 1)
      else if (f === 4) {
        const pa = Math.abs(up - c)
        const pb = Math.abs(a - c)
        const pc = Math.abs(a + up - 2 * c)
        r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c)
      }
      out[row + x] = r & 255
    }
  }
  const rgba = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    let r = 0
    let g = 0
    let bl = 0
    let al = 255
    if (ctype === 3) {
      const k = out[i]!
      r = plte[k * 3]!
      g = plte[k * 3 + 1]!
      bl = plte[k * 3 + 2]!
      al = k < trns.length ? trns[k]! : 255
    } else if (ctype === 2) {
      r = out[i * 3]!
      g = out[i * 3 + 1]!
      bl = out[i * 3 + 2]!
    } else if (ctype === 6) {
      r = out[i * 4]!
      g = out[i * 4 + 1]!
      bl = out[i * 4 + 2]!
      al = out[i * 4 + 3]!
    }
    rgba.set([r, g, bl, al], i * 4)
  }
  return { w, h, rgba }
}
