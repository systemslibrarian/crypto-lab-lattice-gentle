/**
 * The Learning With Errors problem over Z_q, exactly as in §4 of the notes:
 * given (A, b) with b = As + e (mod q) and e ∈ [−B, B]^m, find s.
 *
 * The instance below is Example 4.3 of the notes verbatim (m = 5, n = 3,
 * q = 47, B = 2), including all three of its solutions.
 */
import { matVec, vecSub, mods, infNorm } from './zq'

export interface LWEInstance {
  m: number
  n: number
  q: number
  B: number
  A: readonly (readonly number[])[]
  b: readonly number[]
}

/** Example 4.3 of the notes. */
export const LWE_EXAMPLE: LWEInstance = {
  m: 5,
  n: 3,
  q: 47,
  B: 2,
  A: [
    [27, 13, 13],
    [1, 46, 23],
    [16, 13, 30],
    [18, 16, 19],
    [22, 0, 3],
  ],
  b: [30, 28, 25, 34, 32],
}

/** The three solutions stated in Example 4.3. */
export const LWE_EXAMPLE_SOLUTIONS: ReadonlyArray<{ s: readonly number[]; e: readonly number[] }> = [
  { s: [2, 15, 12], e: [1, 0, 2, 0, -1] },
  { s: [19, 34, 12], e: [0, 2, 0, 1, 1] },
  { s: [41, 33, 7], e: [1, 0, -1, -2, 2] },
]

export interface LWECheck {
  As: number[]
  /** e = b − As, in symmetric representation */
  e: number[]
  eNormInf: number
  ok: boolean
}

/** Check a candidate secret s: compute As, then e = b − As, then test ‖e‖∞ ≤ B. */
export function checkLWE(inst: LWEInstance, s: readonly number[]): LWECheck {
  const As = matVec(inst.A, s, inst.q)
  const eRaw = vecSub(inst.b, As, inst.q)
  const e = eRaw.map((x) => mods(x, inst.q))
  const eNormInf = infNorm(eRaw, inst.q)
  return { As, e, eNormInf, ok: eNormInf <= inst.B }
}

/** Exhaustively find every LWE solution of a small instance (test/ground truth). */
export function allLWESolutions(inst: LWEInstance): { s: number[]; e: number[] }[] {
  const out: { s: number[]; e: number[] }[] = []
  const rec = (prefix: number[]): void => {
    if (prefix.length === inst.n) {
      const check = checkLWE(inst, prefix)
      if (check.ok) out.push({ s: [...prefix], e: check.e })
      return
    }
    for (let v = 0; v < inst.q; v++) rec([...prefix, v])
  }
  rec([])
  return out
}
