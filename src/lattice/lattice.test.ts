/**
 * Spec KATs for the lattice geometry, from the worked examples of the notes
 * (Menezes, "A gentle introduction to lattice-based cryptography",
 * eprint 2026/1098): Examples 2.7/2.8/2.10 (bases), 2.24 (CVP by rounding),
 * 9.11/9.12 (Gauss), 9.6/9.21 (Gram–Schmidt and LLL).
 */
import { describe, expect, it } from 'vitest'
import {
  det,
  sameLattice,
  changeOfBasis,
  babaiRound,
  pointsInBox,
  isLatticePoint,
  sub,
  normSq,
  type Basis2,
} from './vec2'
import { shortestVector, closestVector } from './svp'
import { gaussReduce, isGaussReduced } from './gauss'
import { gramSchmidt, lllReduce, isLLLReduced } from './lll'

const B2: Basis2 = [
  [2, 0],
  [0, 1],
]
const B3: Basis2 = [
  [-2, -2],
  [4, 3],
]

describe('Examples 2.7, 2.8, 2.10 — two bases of one lattice', () => {
  it('KAT: B2 and B3 generate the same lattice; U = [[3,−2],[2,−1]] is unimodular', () => {
    expect(sameLattice(B2, B3)).toBe(true)
    // notes state B2 = B3·U; our changeOfBasis solves B3 = B2·U', both valid
    const U = changeOfBasis(B3, B2)
    expect(U).toEqual([
      [3, 2],
      [-2, -1],
    ])
    expect(det(U as Basis2)).toBe(1)
  })
  it('KAT: (1,0) ∈ L1 = Z² but (1,0) ∉ L2', () => {
    const L1: Basis2 = [
      [1, 0],
      [0, 1],
    ]
    expect(isLatticePoint(L1, [1, 0])).toBe(true)
    expect(isLatticePoint(B2, [1, 0])).toBe(false)
  })
  it('KAT: a shortest nonzero vector of L2 is (0,±1)', () => {
    const { v, normSq: n } = shortestVector(B2)
    expect(n).toBe(1)
    expect(Math.abs(v[1])).toBe(1)
    expect(v[0]).toBe(0)
    // same answer when the lattice is presented by the bad basis B3
    expect(shortestVector(B3).normSq).toBe(1)
  })
  it('drag semantics: scaling a basis vector leaves a *different* lattice', () => {
    expect(sameLattice(B2, [[4, 0], [0, 1]])).toBe(false)
  })
})

describe('Example 2.24 — CVP via Babai rounding, good vs bad basis', () => {
  const B: Basis2 = [
    [5, 3],
    [2, 7],
  ]
  const Bp: Basis2 = [
    [12, 13],
    [7, 10],
  ]
  const t = [5, 6] as const

  it('KAT: B and B′ generate the same lattice via unimodular U = [[2,1],[1,1]]', () => {
    expect(sameLattice(B, Bp)).toBe(true)
    expect(changeOfBasis(B, Bp)).toEqual([
      [2, 1],
      [1, 1],
    ])
  })
  it('KAT: the true closest lattice vector to t=(5,6) is (5,3), distance 3', () => {
    const { v, distSq } = closestVector(B, t)
    expect(v).toEqual([5, 3])
    expect(distSq).toBe(9)
  })
  it('KAT: rounding with the good basis B yields (7,10), error √20', () => {
    const r = babaiRound(B, t)
    expect(r.coeffs).toEqual([1, 1])
    expect(r.point).toEqual([7, 10])
    expect(normSq(sub(t, r.point))).toBe(20)
  })
  it('KAT: rounding with the bad basis B′ yields (0,0), error √61', () => {
    const r = babaiRound(Bp, t)
    expect(r.coeffs).toEqual([0, 0])
    expect(r.point).toEqual([0, 0])
    expect(normSq(sub(t, r.point))).toBe(61)
  })
})

describe('Examples 9.11, 9.12 — Gauss reduction', () => {
  it('KAT: (3,5),(4,7) reduces to [(0,−1),(1,0)] in 4 size-reduction steps', () => {
    const { reduced, steps } = gaussReduce([
      [3, 5],
      [4, 7],
    ])
    expect(reduced).toEqual([
      [0, -1],
      [1, 0],
    ])
    expect(steps.map((s) => s.c)).toEqual([1, 3, -2])
    expect(isGaussReduced(reduced)).toBe(true)
  })
  it('KAT: (47928,63649),(68827,91412) reduces to [(542,−113),(285,724)]', () => {
    const { reduced } = gaussReduce([
      [47928, 63649],
      [68827, 91412],
    ])
    expect(reduced).toEqual([
      [542, -113],
      [285, 724],
    ])
  })
  it('Theorem 9.13: Gauss output attains λ1 (checked against brute force)', () => {
    for (let trial = 0; trial < 50; trial++) {
      const r = (): number => Math.floor(Math.random() * 41) - 20
      const B: Basis2 = [
        [r(), r()],
        [r(), r()],
      ]
      if (det(B) === 0) continue
      const { reduced } = gaussReduce(B)
      expect(sameLattice(B, reduced)).toBe(true)
      expect(normSq(reduced[0])).toBe(shortestVector(B, 40).normSq)
    }
  })
})

describe('Examples 9.6, 9.21 — Gram–Schmidt and LLL (δ = 3/4)', () => {
  const B = [
    [-5, -2, 5, 1],
    [3, 5, 2, 3],
    [0, 1, 2, -3],
    [-3, -4, -4, -5],
  ]
  it('KAT: Gram–Schmidt squared lengths ≈ 55, 44.4, 13.5, 2.5', () => {
    const { Bstar } = gramSchmidt(B)
    const sq = Bstar.map((v) => v.reduce((s, x) => s + x * x, 0))
    expect(sq[0]).toBeCloseTo(55, 9)
    expect(sq[1]).toBeCloseTo(134255 / 55 / 55, 1) // ≈ 44.4
    expect(sq[2]).toBeCloseTo(13.5, 1)
    expect(sq[3]).toBeCloseTo(2.5, 1)
  })
  it('KAT: LLL-reduced basis and squared lengths 9, 14, 27, 30; λ1 = 3', () => {
    const { reduced } = lllReduce(B)
    expect(reduced).toEqual([
      [0, 1, -2, -2],
      [0, 1, 2, -3],
      [-5, -1, -1, 0],
      [-2, 4, 1, 3],
    ])
    expect(reduced.map((v) => v.reduce((s, x) => s + x * x, 0))).toEqual([9, 14, 27, 30])
    expect(isLLLReduced(reduced)).toBe(true)
  })
  it('property: LLL output is always LLL-reduced (random 3D bases)', () => {
    for (let trial = 0; trial < 30; trial++) {
      const r = (): number => Math.floor(Math.random() * 21) - 10
      const B3 = [
        [r(), r(), r()],
        [r(), r(), r()],
        [r(), r(), r()],
      ]
      const d =
        B3[0][0] * (B3[1][1] * B3[2][2] - B3[1][2] * B3[2][1]) -
        B3[0][1] * (B3[1][0] * B3[2][2] - B3[1][2] * B3[2][0]) +
        B3[0][2] * (B3[1][0] * B3[2][1] - B3[1][1] * B3[2][0])
      if (d === 0) continue
      expect(isLLLReduced(lllReduce(B3).reduced)).toBe(true)
    }
  })
})

describe('pointsInBox', () => {
  it('finds the same lattice points under either basis of Example 2.24', () => {
    const B: Basis2 = [
      [5, 3],
      [2, 7],
    ]
    const Bp: Basis2 = [
      [12, 13],
      [7, 10],
    ]
    const key = (p: readonly [number, number]): string => p.join(',')
    const s1 = new Set(pointsInBox(B, -20, 20, -20, 20).map(key))
    const s2 = new Set(pointsInBox(Bp, -20, 20, -20, 20).map(key))
    expect(s1).toEqual(s2)
    expect(s1.size).toBeGreaterThan(10)
  })
})
