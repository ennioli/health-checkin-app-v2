// Generates the PWA icons as PNGs with no image dependencies: raw RGBA pixels
// through zlib, wrapped in the minimal PNG chunk structure. Run `npm run icons`
// after changing the artwork below.
//
// Artwork: deep-green gradient, a cream heart, and a green check inside it —
// the app's own cream/green language.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const BG_TOP = [47, 92, 66] // lighter green
const BG_BOTTOM = [24, 51, 37] // deep green
const HEART = [246, 244, 236] // cream
const CHECK = [31, 61, 46] // accent green

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

/** Classic implicit heart: inside where (x²+y²−1)³ − x²·y³ ≤ 0 (y points up). */
function inHeart(x, y) {
  const a = x * x + y * y - 1
  return a * a * a - x * x * y * y * y <= 0
}

/** Distance from point p to segment ab. */
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

// Check mark inside the heart, in heart-unit coordinates (y up).
const CHECK_PTS = [
  [-0.52, 0.1],
  [-0.14, -0.32],
  [0.62, 0.55],
]
const CHECK_W = 0.30 // stroke width in heart units

function makeIcon(size) {
  const cx = size / 2
  const cy = size * 0.485
  const s = size * 0.315 // heart scale
  const SS = 3 // 3×3 supersampling for smooth edges

  return encodePNG(size, (px, py) => {
    let r = 0
    let g = 0
    let b = 0
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const fx = px + (sx + 0.5) / SS
        const fy = py + (sy + 0.5) / SS
        // Background gradient.
        let c = mix(BG_TOP, BG_BOTTOM, fy / size)
        // Heart-local coordinates (y up).
        const hx = (fx - cx) / s
        const hy = -(fy - cy) / s
        if (inHeart(hx, hy * 1.06)) {
          c = HEART
          const d = Math.min(
            distToSegment(hx, hy, ...CHECK_PTS[0], ...CHECK_PTS[1]),
            distToSegment(hx, hy, ...CHECK_PTS[1], ...CHECK_PTS[2]),
          )
          if (d <= CHECK_W / 2) c = CHECK
        }
        r += c[0]
        g += c[1]
        b += c[2]
      }
    }
    const n = SS * SS
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n), 255]
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
