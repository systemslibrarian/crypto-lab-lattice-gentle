/**
 * Gauss's algorithm (Algorithm 9.10 of the notes) for 2D lattice basis
 * reduction, instrumented with a full step trace for the UI stepper.
 *
 * Guarantee (Theorem 9.13): the output [u, v] satisfies ‖u‖ = λ1(L) and
 * ‖v‖ = λ2(L) — u is a provably shortest nonzero vector of the lattice.
 */
import { dot, normSq, sub, scale, roundTiesToZero, type Basis2, type Vec2 } from './vec2'

export interface GaussStep {
  /** basis at the start of the iteration, ordered ‖u‖ ≤ ‖v‖ */
  u: Vec2
  v: Vec2
  uNormSq: number
  vNormSq: number
  /** μ = ⟨u,v⟩ / ‖u‖² */
  mu: number
  /** c = ⌊μ⌉ (ties towards 0) */
  c: number
  /** v − c·u */
  vNew: Vec2
}

export interface GaussResult {
  reduced: Basis2
  steps: GaussStep[]
}

export function gaussReduce(B: Basis2): GaussResult {
  let u: Vec2 = B[0]
  let v: Vec2 = B[1]
  const steps: GaussStep[] = []
  // guard against pathological input; Gauss terminates in O(log ‖v‖) rounds
  for (let i = 0; i < 10_000; i++) {
    if (normSq(u) > normSq(v)) [u, v] = [v, u]
    const d = normSq(u)
    if (d === 0) throw new Error('degenerate basis')
    const n = dot(u, v)
    const c = roundTiesToZero(n, d)
    if (c === 0) return { reduced: [u, v], steps }
    const vNew = sub(v, scale(u, c))
    steps.push({ u, v, uNormSq: d, vNormSq: normSq(v), mu: n / d, c, vNew })
    v = vNew
  }
  throw new Error('Gauss reduction did not terminate')
}

/** Is [u, v] Gauss-reduced (Definition 9.14): ‖u‖ ≤ ‖v‖ and |μ| ≤ 1/2? */
export function isGaussReduced(B: Basis2): boolean {
  const [u, v] = B
  return normSq(u) <= normSq(v) && 2 * Math.abs(dot(u, v)) <= normSq(u)
}
