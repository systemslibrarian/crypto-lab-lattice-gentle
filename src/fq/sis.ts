/**
 * The Short Integer Solution problem over Z_q (§3 of the notes): given
 * A ∈ Z_q^{n×m}, find a *nonzero* z ∈ [−B, B]^m with Az ≡ 0 (mod q).
 *
 * The instance below is Example 3.2 of the notes verbatim (n = 3, m = 5,
 * q = 13, B = 3); its four solutions are ±(2,−2,0,3,0) and ±(3,−3,0,−2,0).
 */
import { matVec, mod, infNorm } from './zq'

export interface SISInstance {
  n: number
  m: number
  q: number
  B: number
  A: readonly (readonly number[])[]
}

/** Example 3.2 of the notes. */
export const SIS_EXAMPLE: SISInstance = {
  n: 3,
  m: 5,
  q: 13,
  B: 3,
  A: [
    [10, 6, 3, 6, 0],
    [9, 11, 0, 10, 3],
    [7, 11, 5, 7, 8],
  ],
}

export const SIS_EXAMPLE_SOLUTIONS: ReadonlyArray<readonly number[]> = [
  [2, -2, 0, 3, 0],
  [-2, 2, 0, -3, 0],
  [3, -3, 0, -2, 0],
  [-3, 3, 0, 2, 0],
]

export interface SISCheck {
  Az: number[]
  /** the three independent conditions, reported independently */
  isZeroVector: boolean
  isNonzero: boolean
  isShort: boolean
  zNormInf: number
  ok: boolean
}

export function checkSIS(inst: SISInstance, z: readonly number[]): SISCheck {
  const Az = matVec(inst.A, z.map((x) => mod(x, inst.q)), inst.q)
  const isZeroVector = Az.every((x) => x === 0)
  const isNonzero = z.some((x) => x !== 0)
  const zNormInf = infNorm(z, inst.q)
  const isShort = z.every((x) => Math.abs(x) <= inst.B)
  return { Az, isZeroVector, isNonzero, isShort, zNormInf, ok: isZeroVector && isNonzero && isShort }
}

/** Exhaustively find every SIS solution of a small instance (test/ground truth). */
export function allSISSolutions(inst: SISInstance): number[][] {
  const out: number[][] = []
  const rec = (prefix: number[]): void => {
    if (prefix.length === inst.m) {
      if (checkSIS(inst, prefix).ok) out.push([...prefix])
      return
    }
    for (let v = -inst.B; v <= inst.B; v++) rec([...prefix, v])
  }
  rec([])
  return out
}
