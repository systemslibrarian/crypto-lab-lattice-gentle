/**
 * Spec KATs for the LWE and SIS instances — Examples 4.3 and 3.2 of the notes
 * (eprint 2026/1098), verbatim, plus exhaustive confirmation that the stated
 * solutions are the *only* solutions.
 */
import { describe, expect, it } from 'vitest'
import { LWE_EXAMPLE, LWE_EXAMPLE_SOLUTIONS, checkLWE, allLWESolutions } from './lwe'
import { SIS_EXAMPLE, SIS_EXAMPLE_SOLUTIONS, checkSIS, allSISSolutions } from './sis'

describe('Example 4.3 — LWE instance (m=5, n=3, q=47, B=2)', () => {
  it('KAT: accepts all three solutions stated in the notes', () => {
    for (const { s, e } of LWE_EXAMPLE_SOLUTIONS) {
      const check = checkLWE(LWE_EXAMPLE, s)
      expect(check.ok).toBe(true)
      expect(check.e).toEqual([...e])
    }
  })
  it('rejects a wrong secret', () => {
    const check = checkLWE(LWE_EXAMPLE, [1, 2, 3])
    expect(check.ok).toBe(false)
    expect(check.eNormInf).toBeGreaterThan(LWE_EXAMPLE.B)
  })
  it('exhaustive: the instance has exactly the three stated solutions', () => {
    const all = allLWESolutions(LWE_EXAMPLE)
    expect(all.map((x) => x.s)).toEqual(LWE_EXAMPLE_SOLUTIONS.map((x) => [...x.s]))
  })
})

describe('Example 3.2 — SIS instance (n=3, m=5, q=13, B=3)', () => {
  it('KAT: accepts all four solutions ±(2,−2,0,3,0), ±(3,−3,0,−2,0)', () => {
    for (const z of SIS_EXAMPLE_SOLUTIONS) {
      const check = checkSIS(SIS_EXAMPLE, z)
      expect(check.ok).toBe(true)
      expect(check.Az).toEqual([0, 0, 0])
    }
  })
  it('fail-closed: z = 0 is rejected (nonzero condition reported independently)', () => {
    const check = checkSIS(SIS_EXAMPLE, [0, 0, 0, 0, 0])
    expect(check.isZeroVector).toBe(true) // Az = 0, trivially
    expect(check.isNonzero).toBe(false) //   … but z itself is zero
    expect(check.ok).toBe(false)
  })
  it('fail-closed: a long kernel vector is rejected (shortness condition)', () => {
    // 13·e1 is in the kernel but far outside [−3, 3]
    const check = checkSIS(SIS_EXAMPLE, [13, 0, 0, 0, 0])
    expect(check.isZeroVector).toBe(true)
    expect(check.isShort).toBe(false)
    expect(check.ok).toBe(false)
  })
  it('exhaustive: the instance has exactly four SIS solutions', () => {
    const all = allSISSolutions(SIS_EXAMPLE)
    const key = (z: readonly number[]): string => z.join(',')
    expect(new Set(all.map(key))).toEqual(new Set(SIS_EXAMPLE_SOLUTIONS.map(key)))
  })
})
