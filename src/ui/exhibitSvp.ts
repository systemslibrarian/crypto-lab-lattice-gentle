/**
 * Exhibit 2 — Good basis, bad basis: the shortest vector is always there,
 * but only the good basis points at it. Examples 2.7/2.8 of the notes, with
 * the shortest vector found by exhaustive search (never asserted).
 */
import { h, badge } from './dom'
import { LatticeView } from './latticeView'
import { coordsOf, norm, type Basis2 } from '../lattice/vec2'
import { shortestVector } from '../lattice/svp'

const GOOD: Basis2 = [
  [2, 0],
  [0, 1],
]
const BAD: Basis2 = [
  [-2, -2],
  [4, 3],
]

export function mountExhibitSvp(root: HTMLElement): void {
  let current: 'good' | 'bad' = 'good'

  const view = new LatticeView({ extent: 6, sizePx: 420 }, 'Lattice L2 with the shortest vector highlighted')
  const status = h('p', { class: 'panel-status', role: 'status' })

  const toggle = h('div', { class: 'button-row', role: 'group', 'aria-label': 'Choose the basis' })
  const goodBtn = h('button', { type: 'button', text: 'Good basis B₂ = (2,0), (0,1)', 'aria-pressed': 'true' })
  const badBtn = h('button', { type: 'button', text: 'Bad basis B₃ = (−2,−2), (4,3)', 'aria-pressed': 'false' })
  goodBtn.addEventListener('click', () => setBasis('good'))
  badBtn.addEventListener('click', () => setBasis('bad'))
  toggle.append(goodBtn, badBtn)

  function setBasis(which: 'good' | 'bad'): void {
    current = which
    goodBtn.setAttribute('aria-pressed', String(which === 'good'))
    badBtn.setAttribute('aria-pressed', String(which === 'bad'))
    update()
  }

  function update(): void {
    const B = current === 'good' ? GOOD : BAD
    const sv = shortestVector(GOOD)
    view.render({
      lattice: GOOD,
      basis: B,
      parallelogram: true,
      highlight: [{ v: sv.v, label: 'shortest' }],
    })
    const l1 = Math.sqrt(sv.normSq)
    const n1 = norm(B[0])
    const n2 = norm(B[1])
    const c = coordsOf(B, sv.v)
    const a1 = c.num1 / c.den
    const a2 = c.num2 / c.den
    const svText = `A shortest nonzero vector is (${sv.v[0]}, ${sv.v[1]}), length ${l1} — found by exhaustive search, not read off the basis.`
    if (current === 'good') {
      status.replaceChildren(
        h('span', {}, `${svText} With B₂ it is literally the second basis vector (‖b₁‖ = ${n1}, ‖b₂‖ = ${n2}). `),
        badge('ok', 'the basis hands you the answer'),
      )
    } else {
      status.replaceChildren(
        h(
          'span',
          {},
          `${svText} B₃ generates the same lattice, but ‖b₁‖ ≈ ${n1.toFixed(2)} and ‖b₂‖ = ${n2} — both much longer than ${l1}. The short vector is still in the lattice, as the combination ${a1}·b₁ + ${a2}·b₂, but nothing in the basis points at it. `,
        ),
        badge('warn', 'the basis hides the answer'),
      )
    }
    view.setAriaLabel(
      `Lattice L2 drawn with the ${current} basis; the shortest vector (${sv.v[0]}, ${sv.v[1]}) is highlighted.`,
    )
  }

  root.append(toggle, h('div', { class: 'lattice-layout' }, view.svg, h('div', { class: 'lattice-controls' }, status)))
  update()
}
