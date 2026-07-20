/**
 * Arithmetic in Z_q — the real thing, no simulation. `mods` is the symmetric
 * ("mods") representative of the notes (§V1b of the course slides): for odd q,
 * mods q ∈ [−(q−1)/2, (q−1)/2]; for even q, mods q ∈ (−q/2, q/2].
 */

export function mod(a: number, q: number): number {
  const r = a % q
  return r < 0 ? r + q : r
}

export function mods(a: number, q: number): number {
  const r = mod(a, q)
  return r > q / 2 ? r - q : r
}

/** ‖r‖∞ for an integer mod q: |r mods q|. */
export const sizeOf = (a: number, q: number): number => Math.abs(mods(a, q))

/** A·x mod q for an integer matrix A (rows) and vector x. */
export function matVec(A: readonly (readonly number[])[], x: readonly number[], q: number): number[] {
  return A.map((row) => mod(row.reduce((s, aij, j) => s + aij * x[j], 0), q))
}

export const vecSub = (a: readonly number[], b: readonly number[], q: number): number[] =>
  a.map((x, i) => mod(x - b[i], q))

export const infNorm = (a: readonly number[], q: number): number => Math.max(...a.map((x) => sizeOf(x, q)))
