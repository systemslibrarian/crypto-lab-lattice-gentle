/**
 * Exact brute-force solvers for SVP and CVP on small 2D lattices.
 *
 * These are the demo's ground truth: the UI never asserts "this is the
 * shortest vector" from a formula — it exhaustively proves it over a
 * coefficient window large enough for the lattices on screen.
 */
import { add, babaiRound, coordsOf, det, scale, normSq, sub, type Basis2, type Vec2 } from './vec2'

/**
 * A shortest nonzero vector of L(B), by exhaustive search over integer
 * coefficients in [-R, R]. Correct whenever a shortest vector has both
 * coefficients within R. The fixed presets use a separately checked window.
 */
export function shortestVector(B: Basis2, R = 30): { v: Vec2; coeffs: Vec2; normSq: number } {
  let best: { v: Vec2; coeffs: Vec2; normSq: number } | null = null
  for (let a = -R; a <= R; a++) {
    for (let c = -R; c <= R; c++) {
      if (a === 0 && c === 0) continue
      const v = add(scale(B[0], a), scale(B[1], c))
      const n = normSq(v)
      if (best === null || n < best.normSq) best = { v, coeffs: [a, c], normSq: n }
    }
  }
  if (!best) throw new Error('empty search window')
  return best
}

/** The closest lattice vector to target t, by exhaustive search around t. */
export function closestVector(B: Basis2, t: Vec2, R?: number): { v: Vec2; coeffs: Vec2; distSq: number } {
  if (R === undefined && det(B) !== 0) {
    const rounded = babaiRound(B, t)
    const best = { v: rounded.point, coeffs: rounded.coeffs, distSq: normSq(sub(t, rounded.point)) }
    if (normSq(t) < best.distSq) {
      best.v = [0, 0]
      best.coeffs = [0, 0]
      best.distSq = normSq(t)
    }
    // The current candidate bounds the radius. Check integer points in that square,
    // so even an extremely skewed basis needs no arbitrary bound on its coefficients.
    const radius = Math.sqrt(best.distSq)
    for (let x = Math.ceil(t[0] - radius); x <= Math.floor(t[0] + radius); x++) {
      for (let y = Math.ceil(t[1] - radius); y <= Math.floor(t[1] + radius); y++) {
        const v: Vec2 = [x, y]
        const distSq = normSq(sub(t, v))
        if (distSq >= best.distSq) continue
        const { num1, num2, den } = coordsOf(B, v)
        if (num1 % den === 0 && num2 % den === 0) {
          best.v = v
          best.coeffs = [num1 / den, num2 / den]
          best.distSq = distSq
        }
      }
    }
    return best
  }
  // Preserve bounded-search behavior for explicit windows and rank-deficient inputs.
  const limit = R ?? 30
  let best: { v: Vec2; coeffs: Vec2; distSq: number } | null = null
  for (let a = -limit; a <= limit; a++) {
    for (let c = -limit; c <= limit; c++) {
      const v = add(scale(B[0], a), scale(B[1], c))
      const d = normSq(sub(t, v))
      if (best === null || d < best.distSq) best = { v, coeffs: [a, c], distSq: d }
    }
  }
  if (!best) throw new Error('empty search window')
  return best
}
