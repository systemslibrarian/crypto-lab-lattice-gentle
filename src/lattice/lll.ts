/**
 * The LLL lattice basis reduction algorithm — Algorithm 9.20 of the notes,
 * with δ = 3/4 and the notes' conventions: size-reduce the whole basis
 * (Algorithm 9.18), then swap the *smallest* index violating the Lovász
 * condition (footnote 18), and repeat. ⌊·⌉ breaks ties towards 0.
 *
 * The implementation emits a complete event trace so the UI can step through
 * every size-reduction, every Lovász check, and every swap.
 */

export type VecN = readonly number[]

export type LLLEvent =
  | {
      type: 'size-reduce'
      /** b_i ← b_i − q·b_j */
      i: number
      j: number
      mu: number
      q: number
      before: VecN
      after: VecN
      basis: VecN[]
    }
  | {
      type: 'lovasz'
      /** check at index k (0-based pair k-1, k): ‖b*_k‖² ≥ (3/4 − μ²)‖b*_{k−1}‖² ? */
      k: number
      lhs: number
      rhs: number
      mu: number
      ok: boolean
      basis: VecN[]
    }
  | { type: 'swap'; k: number; basis: VecN[] }
  | { type: 'done'; basis: VecN[] }

export interface LLLResult {
  reduced: VecN[]
  events: LLLEvent[]
  swaps: number
}

const dotN = (a: VecN, b: VecN): number => a.reduce((s, x, i) => s + x * b[i], 0)
const normSqN = (a: VecN): number => dotN(a, a)

function roundTiesToZeroFloat(x: number): number {
  const f = Math.floor(x)
  const r = x - f
  if (r < 0.5) return f
  if (r > 0.5) return f + 1
  return Math.abs(f) <= Math.abs(f + 1) ? f : f + 1
}

/** Gram–Schmidt orthogonalization (Algorithm 9.5). Returns B* and μ. */
export function gramSchmidt(B: VecN[]): { Bstar: number[][]; mu: number[][] } {
  const n = B.length
  const Bstar: number[][] = []
  const mu: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (let i = 0; i < n; i++) {
    const v = [...B[i]]
    for (let j = 0; j < i; j++) {
      mu[i][j] = dotN(B[i], Bstar[j]) / normSqN(Bstar[j])
      for (let k = 0; k < v.length; k++) v[k] -= mu[i][j] * Bstar[j][k]
    }
    Bstar.push(v)
  }
  return { Bstar, mu }
}

const snapshot = (B: VecN[]): VecN[] => B.map((b) => [...b])

export function lllReduce(input: VecN[], delta = 0.75): LLLResult {
  let B = input.map((b) => [...b])
  const n = B.length
  const events: LLLEvent[] = []
  let swaps = 0

  // termination is guaranteed by the potential-function argument (§9.3.4);
  // the cap is a defensive bound far above anything the demo can produce
  for (let iter = 0; iter < 100_000; iter++) {
    // Algorithm 9.18: size reduction
    for (let i = 1; i < n; i++) {
      for (let j = i - 1; j >= 0; j--) {
        const { mu } = gramSchmidt(B)
        const q = roundTiesToZeroFloat(mu[i][j])
        if (q !== 0) {
          const before = [...B[i]]
          for (let k = 0; k < B[i].length; k++) B[i][k] -= q * B[j][k]
          events.push({ type: 'size-reduce', i, j, mu: mu[i][j], q, before, after: [...B[i]], basis: snapshot(B) })
        }
      }
    }
    // Lovász condition at each adjacent pair; swap at the smallest violation
    const { Bstar, mu } = gramSchmidt(B)
    let swapAt = -1
    for (let k = 1; k < n; k++) {
      const lhs = normSqN(Bstar[k])
      const rhs = (delta - mu[k][k - 1] ** 2) * normSqN(Bstar[k - 1])
      const ok = lhs >= rhs
      events.push({ type: 'lovasz', k, lhs, rhs, mu: mu[k][k - 1], ok, basis: snapshot(B) })
      if (!ok) {
        swapAt = k
        break
      }
    }
    if (swapAt === -1) {
      events.push({ type: 'done', basis: snapshot(B) })
      return { reduced: B, events, swaps }
    }
    ;[B[swapAt - 1], B[swapAt]] = [B[swapAt], B[swapAt - 1]]
    swaps++
    events.push({ type: 'swap', k: swapAt, basis: snapshot(B) })
  }
  throw new Error('LLL did not terminate')
}

/** Is B size-reduced (|μij| ≤ 1/2) and does it satisfy the Lovász condition? */
export function isLLLReduced(B: VecN[], delta = 0.75): boolean {
  const { Bstar, mu } = gramSchmidt(B)
  const n = B.length
  for (let i = 1; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (Math.abs(mu[i][j]) > 0.5 + 1e-9) return false
    }
  }
  for (let k = 1; k < n; k++) {
    if (normSqN(Bstar[k]) < (delta - mu[k][k - 1] ** 2) * normSqN(Bstar[k - 1]) - 1e-9) return false
  }
  return true
}
