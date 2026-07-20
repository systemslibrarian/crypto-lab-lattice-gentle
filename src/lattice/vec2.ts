/**
 * Exact integer 2D lattice arithmetic.
 *
 * A 2D lattice basis is a pair of integer vectors [b1, b2]. Everything here is
 * exact: values stay well inside Number.MAX_SAFE_INTEGER for every instance in
 * the demo (the largest, Example 9.12 of the notes, peaks near 1.3e10).
 */

export type Vec2 = readonly [number, number]
export type Basis2 = readonly [Vec2, Vec2]

export const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1]
export const normSq = (a: Vec2): number => dot(a, a)
export const norm = (a: Vec2): number => Math.sqrt(normSq(a))
export const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]]
export const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]]
export const scale = (a: Vec2, c: number): Vec2 => [c * a[0], c * a[1]]
export const eq = (a: Vec2, b: Vec2): boolean => a[0] === b[0] && a[1] === b[1]

/** Determinant of the basis matrix [b1 | b2] (columns). */
export const det = (B: Basis2): number => B[0][0] * B[1][1] - B[1][0] * B[0][1]

/**
 * Round to nearest integer with ties broken towards 0 — the ⌊·⌉ convention of
 * §9 of the notes (Gauss and LLL), computed without floating-point error.
 */
export function roundTiesToZero(num: number, den: number): number {
  if (den < 0) {
    num = -num
    den = -den
  }
  const q = Math.floor(num / den)
  const r = num - q * den // 0 <= r < den
  const twice = 2 * r
  if (twice < den) return q
  if (twice > den) return q + 1
  // exact tie: pick whichever of q, q+1 is closer to 0
  return Math.abs(q) <= Math.abs(q + 1) ? q : q + 1
}

/** Exact rational coordinates of t in basis B, as {num1, num2, den}. */
export function coordsOf(B: Basis2, t: Vec2): { num1: number; num2: number; den: number } {
  const d = det(B)
  if (d === 0) throw new Error('degenerate basis')
  // Cramer's rule on B x = t with B = [b1 | b2] as columns
  const num1 = t[0] * B[1][1] - B[1][0] * t[1]
  const num2 = B[0][0] * t[1] - t[0] * B[0][1]
  return { num1, num2, den: d }
}

/** Is t a lattice point of L(B)? Exact integer check. */
export function isLatticePoint(B: Basis2, t: Vec2): boolean {
  const { num1, num2, den } = coordsOf(B, t)
  return num1 % den === 0 && num2 % den === 0
}

/**
 * Do B1 and B2 generate the same lattice? True iff U = B1^-1 B2 has integer
 * entries and det(U) = ±1 (Theorem 2.9 of the notes: U unimodular).
 */
export function sameLattice(B1: Basis2, B2: Basis2): boolean {
  if (det(B1) === 0 || det(B2) === 0) return false
  return isLatticePoint(B1, B2[0]) && isLatticePoint(B1, B2[1]) && Math.abs(det(B1)) === Math.abs(det(B2))
}

/** The unimodular change-of-basis matrix U with B2 = B1·U, or null. */
export function changeOfBasis(B1: Basis2, B2: Basis2): Basis2 | null {
  if (!sameLattice(B1, B2)) return null
  const c1 = coordsOf(B1, B2[0])
  const c2 = coordsOf(B1, B2[1])
  return [
    [c1.num1 / c1.den, c1.num2 / c1.den],
    [c2.num1 / c2.den, c2.num2 / c2.den],
  ]
}

/**
 * Babai's rounding method (§2.5.3): round the real coordinates of t in basis B
 * to nearest integers (ties towards 0) and return that lattice vector.
 */
export function babaiRound(B: Basis2, t: Vec2): { coeffs: Vec2; point: Vec2; realCoords: [number, number] } {
  const { num1, num2, den } = coordsOf(B, t)
  const c1 = roundTiesToZero(num1, den)
  const c2 = roundTiesToZero(num2, den)
  return {
    coeffs: [c1, c2],
    point: add(scale(B[0], c1), scale(B[1], c2)),
    realCoords: [num1 / den, num2 / den],
  }
}

/**
 * All lattice points of L(B) inside the axis-aligned box [xmin,xmax]×[ymin,ymax].
 * Integer-coordinate ranges are bounded by mapping the box corners through B^-1.
 */
export function pointsInBox(B: Basis2, xmin: number, xmax: number, ymin: number, ymax: number): Vec2[] {
  const corners: Vec2[] = [
    [xmin, ymin],
    [xmin, ymax],
    [xmax, ymin],
    [xmax, ymax],
  ]
  let a1 = Infinity
  let a2 = -Infinity
  let c1 = Infinity
  let c2 = -Infinity
  for (const p of corners) {
    const { num1, num2, den } = coordsOf(B, p)
    a1 = Math.min(a1, num1 / den)
    a2 = Math.max(a2, num1 / den)
    c1 = Math.min(c1, num2 / den)
    c2 = Math.max(c2, num2 / den)
  }
  const out: Vec2[] = []
  for (let a = Math.floor(a1) - 1; a <= Math.ceil(a2) + 1; a++) {
    for (let c = Math.floor(c1) - 1; c <= Math.ceil(c2) + 1; c++) {
      const p = add(scale(B[0], a), scale(B[1], c))
      if (p[0] >= xmin && p[0] <= xmax && p[1] >= ymin && p[1] <= ymax) out.push(p)
    }
  }
  return out
}
