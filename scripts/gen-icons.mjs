// Generates the PWA icons as PNGs with no image dependencies: raw RGBA pixels
// through zlib, wrapped in the minimal PNG chunk structure. Run `npm run icons`
// after changing the artwork below.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const BG_TOP = [24, 34, 56]
const BG_BOTTOM = [15, 20, 32]
const MARK = [110, 168, 254]

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function encodePNG(size, pixelAt) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  let p = 0
  for (let y = 0; y < size; y++) {
    raw[p++] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelAt(x, y)
      raw[p++] = r
      raw[p++] = g
      raw[p++] = b
      raw[p++] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Distance from point p to segment ab, for drawing thick strokes. */
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

function makeIcon(size) {
  const s = size / 512
  const stroke = 34 * s
  // A check mark, drawn as two thick segments with a soft edge.
  const pts = [
    [150 * s, 268 * s],
    [225 * s, 344 * s],
    [366 * s, 176 * s],
  ]
  return encodePNG(size, (x, y) => {
    const bg = mix(BG_TOP, BG_BOTTOM, y / size)
    const d = Math.min(
      distToSegment(x, y, pts[0][0], pts[0][1], pts[1][0], pts[1][1]),
      distToSegment(x, y, pts[1][0], pts[1][1], pts[2][0], pts[2][1]),
    )
    const edge = 1.5 * s
    const alpha = d <= stroke / 2 ? 1 : d >= stroke / 2 + edge ? 0 : 1 - (d - stroke / 2) / edge
    if (alpha <= 0) return [...bg, 255]
    return [...mix(bg, MARK, alpha), 255]
  })
}

mkdirSync(OUT_DIR, { recursive: true })
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  writeFileSync(resolve(OUT_DIR, name), makeIcon(size))
  console.log(`wrote ${name} (${size}x${size})`)
}
