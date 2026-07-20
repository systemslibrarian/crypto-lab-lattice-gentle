/**
 * The polynomial ring R_q = Z_q[x]/(x^n + 1) and the module R_q^k — the
 * algebra that Kyber (ML-KEM) and Dilithium (ML-DSA) actually compute in,
 * hand-rolled so every operation is inspectable. Multiplication is schoolbook
 * followed by reduction x^n ≡ −1, exactly as in §V1b of the course slides.
 *
 * A polynomial is a plain coefficient array [a0, a1, …, a(n−1)] (degree < n).
 * A module element is an array of polynomials.
 */
import { mod, mods } from '../fq/zq'

export interface RingParams {
  q: number
  n: number
}

export type Poly = readonly number[]
export type PolyVec = readonly Poly[]

export const polyAdd = (f: Poly, g: Poly, { q }: RingParams): number[] => f.map((a, i) => mod(a + g[i], q))
export const polySub = (f: Poly, g: Poly, { q }: RingParams): number[] => f.map((a, i) => mod(a - g[i], q))

/** f·g in R_q: schoolbook product in Z_q[x], then reduce modulo x^n + 1. */
export function polyMul(f: Poly, g: Poly, { q, n }: RingParams): number[] {
  const h = new Array<number>(2 * n).fill(0)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      h[i + j] += f[i] * g[j]
    }
  }
  const r = new Array<number>(n)
  for (let i = 0; i < n; i++) r[i] = mod(h[i] - h[i + n], q) // x^n ≡ −1
  return r
}

/** Symmetric (mods q) representation of a polynomial. */
export const polyMods = (f: Poly, { q }: RingParams): number[] => f.map((a) => mods(a, q))

/** ‖f‖∞ = max |f_i mods q|. */
export const polyNormInf = (f: Poly, { q }: RingParams): number =>
  Math.max(...f.map((a) => Math.abs(mods(a, q))))

export const vecAdd = (a: PolyVec, b: PolyVec, p: RingParams): number[][] =>
  a.map((f, i) => polyAdd(f, b[i], p))
export const vecSub = (a: PolyVec, b: PolyVec, p: RingParams): number[][] =>
  a.map((f, i) => polySub(f, b[i], p))

/** Inner product aᵀ·b of two vectors in R_q^k — a single polynomial. */
export function vecDot(a: PolyVec, b: PolyVec, p: RingParams): number[] {
  let acc = new Array<number>(p.n).fill(0)
  for (let i = 0; i < a.length; i++) acc = polyAdd(acc, polyMul(a[i], b[i], p), p)
  return acc
}

/** A·s for a k×l matrix of polynomials (row-major) and s ∈ R_q^l. */
export const matVec = (A: readonly PolyVec[], s: PolyVec, p: RingParams): number[][] =>
  A.map((row) => vecDot(row, s, p))

/** Aᵀ·r for a k×l matrix A (row-major) and r ∈ R_q^k. */
export function matTVec(A: readonly PolyVec[], r: PolyVec, p: RingParams): number[][] {
  const l = A[0].length
  const out: number[][] = []
  for (let j = 0; j < l; j++) {
    let acc = new Array<number>(p.n).fill(0)
    for (let i = 0; i < A.length; i++) acc = polyAdd(acc, polyMul(A[i][j], r[i], p), p)
    out.push(acc)
  }
  return out
}

export const vecNormInf = (a: PolyVec, p: RingParams): number =>
  Math.max(...a.map((f) => polyNormInf(f, p)))

export const vecMods = (a: PolyVec, p: RingParams): number[][] => a.map((f) => polyMods(f, p))

/** Pretty-print a polynomial in symmetric or standard representation. */
export function polyToString(f: Poly, p?: RingParams, symmetric = false): string {
  const coeffs = symmetric && p ? polyMods(f, p) : [...f]
  let out = ''
  coeffs.forEach((c, i) => {
    if (c === 0) return
    const mag = Math.abs(c)
    const body = (i === 0 ? String(mag) : mag === 1 ? '' : String(mag)) + (i === 0 ? '' : i === 1 ? 'x' : `x${superscript(i)}`)
    if (out === '') out = (c < 0 ? '−' : '') + body
    else out += ` ${c < 0 ? '−' : '+'} ${body}`
  })
  return out === '' ? '0' : out
}

const superscript = (i: number): string =>
  String(i).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)])
