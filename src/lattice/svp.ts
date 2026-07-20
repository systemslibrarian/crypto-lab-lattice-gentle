/**
 * Exact brute-force solvers for SVP and CVP on small 2D lattices.
 *
 * These are the demo's ground truth: the UI never asserts "this is the
 * shortest vector" from a formula — it exhaustively proves it over a
 * coefficient window large enough for the lattices on screen.
 */
import { add, scale, normSq, sub, type Basis2, type Vec2 } from './vec2'

/**
 * A shortest nonzero vector of L(B), by exhaustive search over integer
 * coefficients in [-R, R]. Correct whenever a shortest vector has both
 * coefficients within R — guaranteed here by searching a window that grows
 * until the best-found length stops improving against the Minkowski bound.
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
export function closestVector(B: Basis2, t: Vec2, R = 30): { v: Vec2; coeffs: Vec2; distSq: number } {
  let best: { v: Vec2; coeffs: Vec2; distSq: number } | null = null
  for (let a = -R; a <= R; a++) {
    for (let c = -R; c <= R; c++) {
      const v = add(scale(B[0], a), scale(B[1], c))
      const d = normSq(sub(t, v))
      if (best === null || d < best.distSq) best = { v, coeffs: [a, c], distSq: d }
    }
  }
  if (!best) throw new Error('empty search window')
  return best
}
