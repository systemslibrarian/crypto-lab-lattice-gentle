/**
 * Exhibit 3 — Lattice reduction, one step at a time. A real Gauss reduction
 * (Examples 9.11 and 9.12 of the notes) and a real LLL run (Example 9.21),
 * driven from the instrumented implementations — the stepper replays the
 * actual trace, it does not animate a canned story.
 */
import { h, badge } from './dom'
import { LatticeView } from './latticeView'
import { gaussReduce, type GaussStep } from '../lattice/gauss'
import { lllReduce, gramSchmidt, type VecN } from '../lattice/lll'
import { normSq, type Basis2, type Vec2 } from '../lattice/vec2'

interface Frame {
  text: string
  kind: 'step' | 'check-ok' | 'check-fail' | 'done'
  basis: VecN[]
}

const fmtVec = (v: VecN): string => `(${v.join(', ')})`

function gaussFrames(B: Basis2): Frame[] {
  const { reduced, steps } = gaussReduce(B)
  const frames: Frame[] = steps.map((st: GaussStep, i) => ({
    kind: 'step',
    text:
      `Iteration ${i + 1}: u = ${fmtVec(st.u)} (‖u‖² = ${st.uNormSq}), v = ${fmtVec(st.v)} (‖v‖² = ${st.vNormSq}). ` +
      `μ = ⟨u,v⟩/‖u‖² ≈ ${st.mu.toFixed(3)}, c = ⌊μ⌉ = ${st.c}, so v ← v − ${st.c}·u = ${fmtVec(st.vNew)}.`,
    basis: [[...st.u], [...st.vNew]],
  }))
  frames.push({
    kind: 'done',
    text:
      `c = 0, so |μ| ≤ ½ and the basis is Gauss-reduced: [${fmtVec(reduced[0])}, ${fmtVec(reduced[1])}]. ` +
      `By Theorem 9.13 the first vector attains λ₁ = √${normSq(reduced[0])}.`,
    basis: [[...reduced[0]], [...reduced[1]]],
  })
  return frames
}

function lllFrames(B: VecN[]): Frame[] {
  const { reduced, events, swaps } = lllReduce(B)
  const frames: Frame[] = []
  for (const ev of events) {
    if (ev.type === 'size-reduce') {
      frames.push({
        kind: 'step',
        text:
          `Size-reduce: μ${ev.i + 1},${ev.j + 1} ≈ ${ev.mu.toFixed(3)}, so b${ev.i + 1} ← b${ev.i + 1} − ${ev.q}·b${ev.j + 1}: ` +
          `${fmtVec(ev.before)} → ${fmtVec(ev.after)}.`,
        basis: ev.basis.map((b) => [...b]),
      })
    } else if (ev.type === 'lovasz') {
      frames.push({
        kind: ev.ok ? 'check-ok' : 'check-fail',
        text:
          `Lovász condition at k = ${ev.k + 1}: ‖b*${ev.k + 1}‖² = ${ev.lhs.toFixed(2)} ${ev.ok ? '≥' : '<'} ` +
          `(¾ − μ²)·‖b*${ev.k}‖² = ${ev.rhs.toFixed(2)} — ${ev.ok ? 'holds' : 'VIOLATED'}.`,
        basis: ev.basis.map((b) => [...b]),
      })
    } else if (ev.type === 'swap') {
      frames.push({
        kind: 'step',
        text: `Swap b${ev.k} and b${ev.k + 1}, then size-reduce again.`,
        basis: ev.basis.map((b) => [...b]),
      })
    } else {
      frames.push({
        kind: 'done',
        text:
          `All Lovász checks hold — the basis is LLL-reduced after ${swaps} swaps: ` +
          reduced.map(fmtVec).join(', ') +
          `. Squared lengths: ${reduced.map((v) => v.reduce((s, x) => s + x * x, 0)).join(', ')}.`,
        basis: reduced.map((b) => [...b]),
      })
    }
  }
  return frames
}

interface Preset {
  name: string
  intro: string
  frames: () => Frame[]
  drawable: boolean
  dim: number
}

const PRESETS: Preset[] = [
  {
    name: 'Gauss — Ex 9.11',
    intro: 'Basis (3,5), (4,7): two long, nearly parallel vectors. Watch each subtraction peel a multiple of the shorter vector off the longer one.',
    frames: () =>
      gaussFrames([
        [3, 5],
        [4, 7],
      ]),
    drawable: true,
    dim: 2,
  },
  {
    name: 'Gauss — Ex 9.12 (big numbers)',
    intro: 'Basis (47928, 63649), (68827, 91412): the same algorithm on 5-digit vectors — 7 iterations shrink ‖v‖² from 1.3×10¹⁰ to 6×10⁵.',
    frames: () =>
      gaussFrames([
        [47928, 63649],
        [68827, 91412],
      ]),
    drawable: false,
    dim: 2,
  },
  {
    name: 'LLL — Ex 9.21 (4-dimensional)',
    intro: 'The 4D basis of Example 9.6. LLL alternates size-reduction (the Gauss subtraction, generalized) with the Lovász condition, which decides when to swap neighbouring vectors.',
    frames: () =>
      lllFrames([
        [-5, -2, 5, 1],
        [3, 5, 2, 3],
        [0, 1, 2, -3],
        [-3, -4, -4, -5],
      ]),
    drawable: false,
    dim: 4,
  },
]

export function mountExhibitReduce(root: HTMLElement): void {
  let preset = PRESETS[0]
  let frames = preset.frames()
  let idx = -1 // -1 = initial state, before any step

  const view = new LatticeView({ extent: 8, sizePx: 340 }, 'Basis vectors during Gauss reduction')
  const intro = h('p', { class: 'panel-note' })
  // No explicit role: an <ol> already exposes `list`, and the redundant
  // `role="list"` made axe apply `aria-required-children` to it — which fails
  // whenever the log is empty. It is empty at first paint and after every
  // Reset, so the page shipped an ARIA violation in its own default state.
  // It is also hidden while empty, so a screen reader is not handed an
  // announced-but-contentless list.
  const log = h('ol', { class: 'reduce-log' })
  const matrix = h('div', { class: 'reduce-matrix', role: 'region', 'aria-label': 'Current basis', tabindex: '0' })
  const status = h('p', { class: 'panel-status', role: 'status' })

  const presetRow = h('div', { class: 'button-row', role: 'group', 'aria-label': 'Reduction examples' })
  for (const p of PRESETS) {
    const btn = h('button', { type: 'button', text: p.name })
    btn.addEventListener('click', () => {
      preset = p
      frames = p.frames()
      idx = -1
      update()
    })
    presetRow.append(btn)
  }

  const stepBtn = h('button', { type: 'button', text: 'Step' })
  const runBtn = h('button', { type: 'button', text: 'Run to end' })
  const resetBtn = h('button', { type: 'button', text: 'Reset' })
  stepBtn.addEventListener('click', () => {
    if (idx < frames.length - 1) idx++
    update()
  })
  runBtn.addEventListener('click', () => {
    idx = frames.length - 1
    update()
  })
  resetBtn.addEventListener('click', () => {
    idx = -1
    update()
  })

  function currentBasis(): VecN[] {
    if (idx >= 0) return frames[idx].basis
    return preset.name.includes('9.21')
      ? [
          [-5, -2, 5, 1],
          [3, 5, 2, 3],
          [0, 1, 2, -3],
          [-3, -4, -4, -5],
        ]
      : preset.name.includes('9.12')
        ? [
            [47928, 63649],
            [68827, 91412],
          ]
        : [
            [3, 5],
            [4, 7],
          ]
  }

  function update(): void {
    intro.textContent = preset.intro
    // log lines revealed so far
    log.hidden = idx < 0
    log.replaceChildren(
      ...frames.slice(0, idx + 1).map((f, i) => {
        const li = h('li', { class: `reduce-line reduce-${f.kind}` })
        const icon = f.kind === 'check-ok' ? '✓ ' : f.kind === 'check-fail' ? '✗ ' : f.kind === 'done' ? '★ ' : ''
        li.append(h('span', { text: `${icon}${f.text}` }))
        if (i === idx) li.classList.add('reduce-current')
        return li
      }),
    )
    // basis matrix
    const B = currentBasis()
    const gsInfo =
      preset.dim > 2
        ? (() => {
            const { Bstar } = gramSchmidt(B.map((b) => [...b]))
            return Bstar.map((v) => v.reduce((s, x) => s + x * x, 0))
          })()
        : null
    matrix.replaceChildren(
      h('p', { class: 'matrix-title', text: idx === frames.length - 1 ? 'Reduced basis (rows)' : 'Current basis (rows)' }),
      ...B.map((b, i) =>
        h(
          'p',
          { class: 'matrix-row mono' },
          `b${i + 1} = ${fmtVec(b)}  ‖b${i + 1}‖² = ${b.reduce((s, x) => s + x * x, 0)}` +
            (gsInfo ? `  ‖b*${i + 1}‖² ≈ ${gsInfo[i].toFixed(1)}` : ''),
        ),
      ),
    )
    // geometry for the drawable preset
    view.svg.style.display = preset.drawable ? '' : 'none'
    if (preset.drawable) {
      const b1 = B[0] as unknown as Vec2
      const b2 = B[1] as unknown as Vec2
      // the lattice itself never changes during reduction — only the basis does
      const original: Basis2 = [
        [3, 5],
        [4, 7],
      ]
      view.render({ lattice: original, basis: [b1, b2], parallelogram: true })
      view.setAriaLabel(
        `The fixed lattice of Example 9.11 with the current basis vectors b1 ${fmtVec(b1)} and b2 ${fmtVec(b2)}.`,
      )
    }
    status.replaceChildren(
      idx === -1
        ? h('span', {}, 'Press Step to run the first iteration of the real algorithm.')
        : idx === frames.length - 1
          ? badge('ok', `finished — ${frames.length} recorded steps`)
          : h('span', {}, `Step ${idx + 1} of ${frames.length}.`),
    )
  }

  root.append(
    presetRow,
    intro,
    h('div', { class: 'button-row' }, stepBtn, runBtn, resetBtn),
    h('div', { class: 'reduce-layout' }, view.svg, h('div', { class: 'reduce-panel' }, matrix, status)),
    log,
  )
  update()
}
