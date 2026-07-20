/**
 * Spec KATs for R_q arithmetic, from the worked examples in the course slides
 * (V1: Mathematical prerequisites) accompanying eprint 2026/1098.
 */
import { describe, expect, it } from 'vitest'
import {
  polyAdd,
  polySub,
  polyMul,
  polyMods,
  polyNormInf,
  vecAdd,
  vecSub,
  vecDot,
  matVec,
  polyToString,
} from './rq'
import { mods } from '../fq/zq'

describe('Z_q basics (slides V1 pp. 23, 31–33)', () => {
  it('KAT: arithmetic in Z_17', () => {
    expect((9 + 15) % 17).toBe(7)
    expect(mods(9 - 15, 17)).toBe(-6)
    expect((9 * 15) % 17).toBe(16)
  })
  it('KAT: symmetric mod, q = 17 odd', () => {
    expect(mods(6, 17)).toBe(6)
    expect(mods(13, 17)).toBe(-4)
    expect(mods(9 * 15, 17)).toBe(-1)
  })
  it('KAT: symmetric mod, q = 18 even', () => {
    expect(mods(6, 18)).toBe(6)
    expect(mods(13, 18)).toBe(-5)
    expect(mods(9 + 15, 18)).toBe(6)
    expect(mods(9 * 15, 18)).toBe(9)
  })
  it('KAT: sizes in Z_19', () => {
    expect(Math.abs(mods(7, 19))).toBe(7)
    expect(Math.abs(mods(18, 19))).toBe(1)
  })
})

describe('R_41 = Z_41[x]/(x^4+1) (slides V1 pp. 26–27)', () => {
  const P = { q: 41, n: 4 }
  it('KAT: (32+17x²+22x³)(11+7x+19x²+x³) = 39+35x+35x²+24x³', () => {
    expect(polyMul([32, 0, 17, 22], [11, 7, 19, 1], P)).toEqual([39, 35, 35, 24])
  })
  it('KAT: vector representation ops on f=(23,0,11,7), g=(40,5,16,0)', () => {
    const f = [23, 0, 11, 7]
    const g = [40, 5, 16, 0]
    expect(polyAdd(f, g, P)).toEqual([22, 5, 27, 7])
    expect(polySub(f, g, P)).toEqual([24, 36, 36, 7])
    expect(polyMul(f, g, P)).toEqual([12, 3, 29, 7])
  })
})

describe('R_137 and the module R_137^3 (slides V1 pp. 29, 33–35)', () => {
  const P = { q: 137, n: 4 }
  it('KAT: product of small polynomials lands in S_8', () => {
    const prod = polyMul([1, 1, -2, 2], [-2, 0, 2, -1], P)
    expect(prod).toEqual([3, 129, 8, 134])
    expect(polyMods(prod, P)).toEqual([3, -8, 8, -3])
    expect(polyNormInf(prod, P)).toBe(8)
  })
  it('KAT: module ops in R_137^3', () => {
    const a = [
      [93, 51, 34, 54],
      [27, 87, 81, 6],
      [112, 15, 46, 122],
    ]
    const b = [
      [40, 78, 1, 119],
      [11, 31, 57, 90],
      [108, 72, 47, 14],
    ]
    expect(vecAdd(a, b, P)).toEqual([
      [133, 129, 35, 36],
      [38, 118, 1, 96],
      [83, 87, 93, 136],
    ])
    expect(vecSub(a, b, P)).toEqual([
      [53, 110, 33, 72],
      [16, 56, 24, 53],
      [4, 80, 136, 108],
    ])
    expect(vecDot(a, b, P)).toEqual([93, 59, 44, 132])
  })
})

describe('MLWE instance (slides V1 p. 39, q = 541)', () => {
  const P = { q: 541, n: 4 }
  it('KAT: t = As + e', () => {
    const A = [
      [
        [442, 502, 513, 15],
        [368, 166, 37, 135],
      ],
      [
        [479, 532, 116, 41],
        [12, 139, 385, 409],
      ],
      [
        [29, 394, 503, 389],
        [9, 499, 92, 254],
      ],
    ]
    const s = [
      [2, -2, 0, 1],
      [3, -2, -2, -2],
    ]
    const e = [
      [2, -2, -1, 0],
      [1, 2, 2, 1],
      [-2, 0, -1, -2],
    ]
    const t = vecAdd(matVec(A, s, P), e, P)
    expect(t).toEqual([
      [30, 252, 401, 332],
      [247, 350, 259, 485],
      [534, 234, 137, 443],
    ])
  })
})

describe('small-polynomial product bound (slides V1 p. 36)', () => {
  it('property: f ∈ S_η1, g ∈ S_η2 ⇒ f·g ∈ S_{n·η1·η2}', () => {
    const P = { q: 137, n: 4 }
    for (let trial = 0; trial < 200; trial++) {
      const rnd = (eta: number): number[] =>
        Array.from({ length: 4 }, () => Math.floor(Math.random() * (2 * eta + 1)) - eta)
      const f = rnd(2)
      const g = rnd(3)
      expect(polyNormInf(polyMul(f, g, P), P)).toBeLessThanOrEqual(4 * 2 * 3)
    }
  })
})

describe('polyToString', () => {
  it('renders symmetric representation', () => {
    expect(polyToString([3, 129, 8, 134], { q: 137, n: 4 }, true)).toBe('3 − 8x + 8x² − 3x³')
    expect(polyToString([0, 0, 0, 0])).toBe('0')
  })
})
