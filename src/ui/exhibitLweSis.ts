/**
 * Exhibit 4 — LWE and SIS over the real F_q, compute-both-sides-and-compare.
 * The instances are Examples 4.3 and 3.2 of the notes verbatim; every check
 * on screen is the actual modular arithmetic, shown element by element.
 */
import { h, intInput, badge } from './dom'
import { LWE_EXAMPLE, LWE_EXAMPLE_SOLUTIONS, checkLWE } from '../fq/lwe'
import { SIS_EXAMPLE, SIS_EXAMPLE_SOLUTIONS, checkSIS } from '../fq/sis'
import { mods } from '../fq/zq'

function matrixTable(A: readonly (readonly number[])[], caption: string): HTMLElement {
  const table = h('table', { class: 'num-table' })
  table.append(h('caption', { text: caption }))
  const tbody = h('tbody')
  for (const row of A) {
    tbody.append(h('tr', {}, ...row.map((x) => h('td', { text: String(x) }))))
  }
  table.append(tbody)
  return table
}

export function mountExhibitLweSis(root: HTMLElement): void {
  root.append(lwePanel(), sisPanel())
}

function lwePanel(): HTMLElement {
  const inst = LWE_EXAMPLE
  let s = [0, 0, 0]

  const result = h('div', { class: 'compare-region', role: 'status' })
  const fields = h('div', { class: 'field-row' })
  const inputs: HTMLInputElement[] = []
  for (let i = 0; i < inst.n; i++) {
    const { wrap, input } = intInput(`lwe-s${i}`, `s${i + 1}`, 0, 0, inst.q - 1, (v) => {
      s[i] = v
      update()
    })
    inputs.push(input)
    fields.append(wrap)
  }

  const solRow = h('div', { class: 'button-row', role: 'group', 'aria-label': 'Known LWE solutions' })
  LWE_EXAMPLE_SOLUTIONS.forEach((sol, i) => {
    const btn = h('button', { type: 'button', text: `Solution ${i + 1}: s = (${sol.s.join(', ')})` })
    btn.addEventListener('click', () => {
      s = [...sol.s]
      inputs.forEach((inp, j) => (inp.value = String(s[j])))
      update()
    })
    solRow.append(btn)
  })
  const wrongBtn = h('button', { type: 'button', text: 'A wrong guess: s = (1, 2, 3)' })
  wrongBtn.addEventListener('click', () => {
    s = [1, 2, 3]
    inputs.forEach((inp, j) => (inp.value = String(s[j])))
    update()
  })
  solRow.append(wrongBtn)

  function update(): void {
    const c = checkLWE(inst, s)
    const table = h('table', { class: 'num-table compare-table' })
    table.append(h('caption', { text: 'Both sides, row by row: b vs A·s (mod 47), difference e = b − A·s' }))
    table.append(
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('th', { scope: 'col', text: 'row' }),
          h('th', { scope: 'col', text: 'b' }),
          h('th', { scope: 'col', text: 'A·s' }),
          h('th', { scope: 'col', text: 'e = b − A·s (mods)' }),
          h('th', { scope: 'col', text: `|e| ≤ ${inst.B}?` }),
        ),
      ),
    )
    const tbody = h('tbody')
    c.e.forEach((ei, i) => {
      const ok = Math.abs(ei) <= inst.B
      tbody.append(
        h(
          'tr',
          { class: ok ? 'row-ok' : 'row-bad' },
          h('th', { scope: 'row', text: String(i + 1) }),
          h('td', { text: String(inst.b[i]) }),
          h('td', { text: String(c.As[i]) }),
          h('td', { text: String(ei) }),
          h('td', { text: ok ? '✓ small' : '✗ too big' }),
        ),
      )
    })
    table.append(tbody)
    result.replaceChildren(
      table,
      h(
        'p',
        {},
        c.ok
          ? badge('ok', `accepted: ‖e‖∞ = ${c.eNormInf} ≤ ${inst.B} — s solves this LWE instance`)
          : badge('bad', `rejected: ‖e‖∞ = ${c.eNormInf} > ${inst.B} — b − A·s is not a small error vector`),
      ),
    )
  }

  const panel = h(
    'div',
    { class: 'subpanel' },
    h('h3', { text: 'LWE — noisy equations (Example 4.3: m=5, n=3, q=47, B=2)' }),
    h(
      'p',
      { class: 'panel-note' },
      'b = A·s + e (mod 47) for a secret s and a small error e with entries in [−2, 2]. Without e this is high-school linear algebra — Gaussian elimination finds s instantly. The tiny noise is the entire difficulty. Type a candidate s and both sides are computed for real:',
    ),
    matrixTable(inst.A, 'A ∈ Z₄₇^{5×3}'),
    matrixTable([inst.b], 'bᵀ (the noisy result)'),
    fields,
    solRow,
    result,
    h(
      'details',
      {},
      h('summary', { text: 'Where is the lattice in LWE?' }),
      h(
        'p',
        {},
        'The set {A·s mod q : all s}, lifted by multiples of q, is a lattice in Z⁵ (a "q-ary" lattice). b sits within distance ‖e‖ of the lattice point A·s. Recovering s is exactly the Closest Vector Problem from Exhibit 1 — in 5 dimensions here, in hundreds of dimensions in real schemes, where no good basis is known and rounding fails. That is the approx-CVP/BDD formulation of LWE (§4 of the notes).',
      ),
    ),
  )
  update()
  return panel
}

function sisPanel(): HTMLElement {
  const inst = SIS_EXAMPLE
  let z = [0, 0, 0, 0, 0]

  const result = h('div', { class: 'compare-region', role: 'status' })
  const fields = h('div', { class: 'field-row' })
  const inputs: HTMLInputElement[] = []
  for (let i = 0; i < inst.m; i++) {
    const { wrap, input } = intInput(`sis-z${i}`, `z${i + 1}`, 0, -inst.B, inst.B, (v) => {
      z[i] = v
      update()
    })
    inputs.push(input)
    fields.append(wrap)
  }

  const solRow = h('div', { class: 'button-row', role: 'group', 'aria-label': 'Known SIS solutions' })
  SIS_EXAMPLE_SOLUTIONS.slice(0, 2).forEach((sol, i) => {
    const btn = h('button', { type: 'button', text: `Solution ${i + 1}: z = (${sol.join(', ')})` })
    btn.addEventListener('click', () => {
      z = [...sol]
      inputs.forEach((inp, j) => (inp.value = String(z[j])))
      update()
    })
    solRow.append(btn)
  })
  const zeroBtn = h('button', { type: 'button', text: 'The cheat: z = 0' })
  zeroBtn.addEventListener('click', () => {
    z = [0, 0, 0, 0, 0]
    inputs.forEach((inp) => (inp.value = '0'))
    update()
  })
  solRow.append(zeroBtn)

  function update(): void {
    const c = checkSIS(inst, z)
    const table = h('table', { class: 'num-table compare-table' })
    table.append(h('caption', { text: 'A·z (mod 13), row by row — target: exactly 0' }))
    const tbody = h('tbody')
    c.Az.forEach((v, i) => {
      tbody.append(
        h(
          'tr',
          { class: v === 0 ? 'row-ok' : 'row-bad' },
          h('th', { scope: 'row', text: `row ${i + 1}` }),
          h('td', { text: `${v}` }),
          h('td', { text: v === 0 ? '✓ zero' : `✗ ${mods(v, inst.q)} ≠ 0` }),
        ),
      )
    })
    table.append(tbody)
    result.replaceChildren(
      table,
      h(
        'ul',
        { class: 'check-list', role: 'list' },
        h('li', { role: 'listitem' }, c.isZeroVector ? badge('ok', 'A·z ≡ 0 (mod 13)') : badge('bad', 'A·z ≠ 0')),
        h('li', { role: 'listitem' }, c.isNonzero ? badge('ok', 'z ≠ 0') : badge('bad', 'z = 0 — the trivial answer is banned')),
        h(
          'li',
          { role: 'listitem' },
          c.isShort ? badge('ok', `short: ‖z‖∞ = ${c.zNormInf} ≤ ${inst.B}`) : badge('bad', `too long: ‖z‖∞ = ${c.zNormInf} > ${inst.B}`),
        ),
      ),
      h('p', {}, c.ok ? badge('ok', 'valid SIS solution') : badge('bad', 'not a SIS solution')),
    )
  }

  const panel = h(
    'div',
    { class: 'subpanel' },
    h('h3', { text: 'SIS — short kernel vectors (Example 3.2: n=3, m=5, q=13, B=3)' }),
    h(
      'p',
      { class: 'panel-note' },
      'Find a nonzero z with entries in [−3, 3] such that A·z ≡ 0 (mod 13). Solutions to A·z ≡ 0 are easy to describe — they form a lattice — but among the 169 candidate combinations only four are short enough. Shortness is the entire difficulty.',
    ),
    matrixTable(inst.A, 'A ∈ Z₁₃^{3×5}'),
    fields,
    solRow,
    result,
    h(
      'details',
      {},
      h('summary', { text: 'Where is the lattice in SIS — and why does a hash function care?' }),
      h(
        'p',
        {},
        'The set {z ∈ Z⁵ : A·z ≡ 0 (mod q)} is a lattice, and a SIS solution is a short vector in it — the Shortest Vector Problem from Exhibit 2, in higher dimension. Example 3.3 of the notes builds a hash H(z) = A·z from this: a collision H(z₁) = H(z₂) gives the short kernel vector z₁ − z₂, so collision resistance is exactly SIS hardness. Dilithium\'s unforgeability reduces to the module version, MSIS (Exhibit 5).',
      ),
    ),
  )
  update()
  return panel
}
