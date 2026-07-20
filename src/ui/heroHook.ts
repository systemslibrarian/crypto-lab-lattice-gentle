/**
 * Hero hook — the first-viewport experiment (GS-05). One question, three
 * buttons, and a live-computed answer: which of two bases of the SAME
 * lattice rounds the target closer? Same exact arithmetic as Exhibit 1
 * (the Example 2.24 basis pair), verified against exhaustive search.
 */
import { h, badge } from './dom'
import { babaiRound, sub, normSq, type Basis2, type Vec2 } from '../lattice/vec2'
import { closestVector } from '../lattice/svp'

const GOOD: Basis2 = [
  [5, 3],
  [2, 7],
]
const BAD: Basis2 = [
  [12, 13],
  [7, 10],
]
const T: Vec2 = [9, 2]

export function mountHeroHook(root: HTMLElement): void {
  const result = h('p', { class: 'panel-status hook-result', role: 'status' })
  const goodBtn = h('button', { type: 'button', text: 'B decodes closer' })
  const badBtn = h('button', { type: 'button', text: 'B′ decodes closer' })
  const tieBtn = h('button', { type: 'button', text: 'Same dots — they must tie' })

  const answer = (picked: 'good' | 'bad' | 'tie'): void => {
    for (const b of [goodBtn, badBtn, tieBtn]) b.disabled = true
    const rGood = babaiRound(GOOD, T)
    const rBad = babaiRound(BAD, T)
    const eGood = Math.sqrt(normSq(sub(T, rGood.point)))
    const eBad = Math.sqrt(normSq(sub(T, rBad.point)))
    const truth = closestVector(GOOD, T)
    const foundTruth = normSq(sub(T, rGood.point)) === truth.distSq
    const verdict =
      picked === 'good'
        ? badge('ok', 'correct')
        : picked === 'tie'
          ? badge('warn', 'the natural guess — and wrong')
          : badge('warn', 'not this time')
    result.replaceChildren(
      verdict,
      h(
        'span',
        {},
        ` Computed just now: rounding t = (${T[0]}, ${T[1]}) in B lands at (${rGood.point[0]}, ${rGood.point[1]}), ` +
          `error ≈ ${eGood.toFixed(2)}${foundTruth ? ' — the true closest lattice point, by exhaustive search' : ''}. ` +
          `The same rounding in B′, a basis of the identical grid, lands at (${rBad.point[0]}, ${rBad.point[1]}), ` +
          `error ≈ ${eBad.toFixed(2)} — ${(eBad / eGood).toFixed(1)}× the miss. ` +
          `The dots never changed; only their description did. `,
      ),
      h('a', { href: '#exhibit-1', text: 'Drag it yourself in Exhibit 1 →' }),
    )
  }
  goodBtn.addEventListener('click', () => answer('good'))
  badBtn.addEventListener('click', () => answer('bad'))
  tieBtn.addEventListener('click', () => answer('tie'))

  root.append(
    h(
      'div',
      { class: 'hero-hook', role: 'group', 'aria-label': 'Ten-second experiment' },
      h('p', { class: 'hook', text: 'Try it first — one grid of dots, two honest descriptions.' }),
      h(
        'p',
        { class: 'hook-question' },
        'Basis B has short arrows, basis B′ has long ones, and both generate ',
        h('em', { text: 'exactly the same dots' }),
        '. Decoding rounds the target t = (9, 2) to a nearby dot. Which description decodes better?',
      ),
      h('div', { class: 'button-row' }, goodBtn, badBtn, tieBtn),
      result,
    ),
  )
}
