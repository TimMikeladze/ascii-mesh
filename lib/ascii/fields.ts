import { fbm3, noise3 } from './world-geom'
import type { Field } from './world'

// Screen-space generators drawn behind (or over) world objects. A sampler maps a cell to a value
// in [0, 1], or -1 for "nothing here". Coordinates: the shorter side of the view spans [-1, 1],
// y points up. `c` / `r` are the cell column / row (for per-column effects like rain).

export type FieldSampler = (x: number, y: number, c: number, r: number) => number

const TAU = Math.PI * 2
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

function cellHash(a: number, b: number, seed: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

/** `cell`: one glyph cell's width in field units (lines stay about one cell wide). */
export function fieldSampler(f: Field, t: number, rows: number, cell = 0.02): FieldSampler {
  const s = f.scale
  const time = t * f.speed
  const seed = f.seed
  const ang = (f.angle * Math.PI) / 180
  const ca = Math.cos(ang)
  const sa = Math.sin(ang)
  switch (f.type) {
    case 'gradient':
      return (x, y) => clamp01(0.5 + 0.5 * (x * ca + y * sa) * s)
    case 'plasma':
      return (x, y) => {
        x *= s
        y *= s
        const v =
          Math.sin(x * 3 + time) +
          Math.sin(y * 2.7 - time * 1.3) +
          Math.sin((x + y) * 2.2 + time * 0.7) +
          Math.sin(Math.hypot(x + Math.sin(time * 0.3), y) * 4.5 - time * 1.5)
        return 0.5 + v / 8
      }
    case 'noise':
      return (x, y) => clamp01((fbm3(x * s * 1.6 + seed * 3.1, y * s * 1.6 + time * 0.15, time * 0.12, 4, seed) - 0.5) * 2.2 + 0.5)
    case 'waves':
      return (x, y) => {
        const u = (x * ca + y * sa) * s
        const w = (-x * sa + y * ca) * s
        return 0.5 + 0.5 * Math.sin(w * 14 + Math.sin(u * 2.5 + time) * 1.6 + Math.sin(u * 5.3 - time * 0.7) * 0.5 - time * 1.8)
      }
    case 'ripples': {
      const centers = [0, 1, 2].map((i) => [cellHash(i, 1, seed) * 1.6 - 0.8, cellHash(i, 2, seed) * 1.2 - 0.6, cellHash(i, 3, seed)])
      return (x, y) => {
        let v = 0
        for (const [cx, cy, ph] of centers) {
          const d = Math.hypot(x - cx, y - cy) * s
          v += Math.sin(d * 22 - time * 3 - ph * TAU) * Math.exp(-d * 1.4)
        }
        return clamp01(0.5 + v * 0.45)
      }
    }
    case 'rain': {
      const tail = Math.max(4, rows * 0.35)
      return (_x, _y, c, r) => {
        const speed = (0.4 + cellHash(c, 7, seed) * 0.9) * rows * 0.35
        const span = rows + tail * 2
        const head = (time * speed + cellHash(c, 9, seed) * span) % span
        // Two drops per column, offset by half a cycle.
        let best = -1
        for (const off of [0, span / 2]) {
          const d = (head + off) % span - r
          if (d >= 0 && d < tail) best = Math.max(best, 1 - d / tail)
        }
        if (cellHash(c, 11, seed) > 0.8 * s) return -1
        return best < 0 ? -1 : Math.pow(best, 1.6)
      }
    }
    case 'fire':
      return (x, y) => {
        const yy = (y * s + 1) / 2
        const n = fbm3(x * s * 2.4, y * s * 2.4 - time * 1.7, time * 0.4, 4, seed)
        return clamp01(n * 1.7 - yy * 1.25 + 0.15 - Math.abs(x * s) * 0.35)
      }
    case 'aurora':
      return (x, y) => {
        x *= s
        y *= s
        let v = 0
        for (let k = 0; k < 2; k++) {
          const band = 0.42 + k * 0.22 + 0.16 * Math.sin(x * (1.6 + k * 0.7) + time * (0.35 + k * 0.2)) + 0.12 * (noise3(x * 2.2, time * 0.25, k, seed) - 0.5)
          const dy = y - band
          // Curtains hang down from the band and fade upward quickly.
          const shape = dy > 0 ? Math.exp(-dy * dy * 70) : Math.exp(-dy * dy * 9)
          const rays = 0.55 + 0.45 * Math.sin(x * 38 + noise3(x * 4, time * 0.5, k + 3, seed) * 9)
          v = Math.max(v, shape * rays * (k ? 0.75 : 1))
        }
        return clamp01(v)
      }
    case 'tunnel':
      return (x, y) => {
        const r = Math.hypot(x, y) + 1e-3
        const a = Math.atan2(y, x)
        const u = (0.45 * s) / r + time * 0.8
        const w = a / Math.PI + time * 0.05
        const v = (0.5 + 0.5 * Math.sin(u * TAU)) * (0.55 + 0.45 * Math.sin(w * Math.PI * 8))
        return clamp01(v * Math.min(1, r * 1.8))
      }
    case 'vortex':
      return (x, y) => {
        const r = Math.hypot(x, y) * s + 1e-3
        const a = Math.atan2(y, x)
        return clamp01((0.5 + 0.5 * Math.sin(a * 3 + Math.log(r) * 7 - time * 2)) * Math.min(1, r * 1.4) * Math.exp(-r * 0.35))
      }
    case 'stars': {
      const density = 0.035 * s
      return (_x, _y, c, r) => {
        const h = cellHash(c, r, seed)
        if (h > density) return -1
        const k = h / density
        return 0.25 + 0.75 * Math.pow(k, 2) * (0.6 + 0.4 * Math.sin(TAU * (time * (0.2 + k) + k * 7)))
      }
    }
    case 'metaballs': {
      const balls = [0, 1, 2, 3, 4].map((i) => [cellHash(i, 21, seed), cellHash(i, 22, seed), cellHash(i, 23, seed)])
      return (x, y) => {
        let sum = 0
        for (const [a, b, c] of balls) {
          const bx = 0.75 * Math.sin(time * (0.3 + a * 0.4) + c * TAU)
          const by = 0.6 * Math.cos(time * (0.25 + b * 0.35) + a * TAU)
          const rr = 0.08 + 0.1 * c
          sum += (rr * rr) / ((x * s - bx) ** 2 + (y * s - by) ** 2 + 1e-4)
        }
        return clamp01((sum - 0.35) * 0.9)
      }
    }
    case 'rings':
      return (x, y) => {
        const r = Math.hypot(x, y) * s
        return clamp01((0.5 + 0.5 * Math.sin(r * 16 - time * 3)) * Math.exp(-r * 0.6))
      }
    case 'grid': {
      // Retro perspective floor below the horizon (angle = horizon height, -90..90 → -1..1).
      const horizon = Math.max(-0.95, Math.min(0.95, f.angle / 90))
      const k = 1.6 * s
      return (x, y) => {
        if (y > horizon - cell) return -1
        const depth = 1 / (horizon - y)
        const gz = depth * k + time * 0.6
        const gx = x * depth * k
        // Distance to the nearest line, in cells: d(g)/d(screen) = depth·k (x) and depth²·k (y).
        const lz = Math.abs(gz - Math.round(gz)) / (depth * depth * k * cell)
        const lx = Math.abs(gx - Math.round(gx)) / (depth * k * cell)
        const fadeOut = clamp01(1.15 - depth * 0.07)
        if (lz < 0.6 && depth * depth * k * cell < 0.35) return fadeOut
        if (lx < 0.55) return fadeOut * 0.85
        return -1
      }
    }
  }
}
