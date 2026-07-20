/**
 * Guided / Reference shell (GS-05). Guided mode walks the exhibits one step
 * at a time behind a progress rail — Basis → SVP/CVP → Reduce → LWE·SIS →
 * Schemes → Check — with prev/next navigation and managed focus. Reference
 * mode is the original all-on-one-page view for instructors and returning
 * readers. Deep links (#exhibit-N) open the owning step directly; the
 * ?kseed/?dseed query parameters keep restoring exhibit state in both modes.
 */
import { h } from './dom'

type Mode = 'guided' | 'reference'

interface Step {
  label: string
  sections: string[] // section element ids, in DOM order
}

const STEPS: Step[] = [
  { label: '1 · Basis', sections: ['intro', 'exhibit-1'] },
  { label: '2 · SVP/CVP', sections: ['exhibit-2'] },
  { label: '3 · Reduce', sections: ['exhibit-3'] },
  { label: '4 · LWE & SIS', sections: ['exhibit-4'] },
  { label: '5 · Schemes', sections: ['exhibit-5'] },
  { label: '6 · Check', sections: ['exit-check', 'honest'] },
]

const MODE_KEY = 'lg-mode'

function stepOfSection(id: string): number {
  return STEPS.findIndex((s) => s.sections.includes(id))
}

export function mountGuide(barRoot: HTMLElement, navRoot: HTMLElement): void {
  const sections = new Map<string, HTMLElement>()
  for (const s of STEPS) {
    for (const id of s.sections) {
      const el = document.getElementById(id)
      if (el) sections.set(id, el)
    }
  }

  let mode: Mode = ((): Mode => {
    const saved = localStorage.getItem(MODE_KEY)
    return saved === 'reference' || saved === 'guided' ? saved : 'guided'
  })()
  let step = ((): number => {
    const fromHash = stepOfSection(location.hash.slice(1))
    return fromHash >= 0 ? fromHash : 0
  })()

  // --- mode toggle ---
  const guidedBtn = h('button', { type: 'button', text: 'Guided' })
  const referenceBtn = h('button', { type: 'button', text: 'Reference' })
  guidedBtn.addEventListener('click', () => setMode('guided'))
  referenceBtn.addEventListener('click', () => setMode('reference'))
  const modeGroup = h(
    'div',
    { class: 'button-row guide-modes', role: 'group', 'aria-label': 'Reading mode' },
    guidedBtn,
    referenceBtn,
    h('span', {
      class: 'guide-mode-hint',
      text: 'Guided: one exhibit at a time. Reference: the whole page at once.',
    }),
  )

  // --- progress rail ---
  const railBtns: HTMLButtonElement[] = STEPS.map((s, i) => {
    const b = h('button', { type: 'button', text: s.label })
    b.addEventListener('click', () => {
      if (mode === 'guided') goToStep(i, true)
      else sections.get(s.sections[0])?.scrollIntoView()
    })
    return b
  })
  const rail = h('nav', { class: 'guide-rail', 'aria-label': 'Lesson progress' }, ...railBtns)

  // --- prev / next ---
  const prevBtn = h('button', { type: 'button' })
  const nextBtn = h('button', { type: 'button' })
  prevBtn.addEventListener('click', () => goToStep(step - 1, true))
  nextBtn.addEventListener('click', () => goToStep(step + 1, true))
  const nav = h('div', { class: 'guide-nav' }, prevBtn, nextBtn)

  function setMode(next: Mode): void {
    mode = next
    localStorage.setItem(MODE_KEY, next)
    apply()
    if (next === 'reference') sections.get(STEPS[step].sections[0])?.scrollIntoView()
  }

  function goToStep(i: number, moveFocus: boolean): void {
    step = Math.max(0, Math.min(STEPS.length - 1, i))
    apply()
    const first = sections.get(STEPS[step].sections[0])
    if (first) {
      const url = new URL(location.href)
      url.hash = STEPS[step].sections[0]
      history.replaceState(null, '', url)
      if (moveFocus) {
        const heading = first.querySelector('h2')
        if (heading) {
          heading.setAttribute('tabindex', '-1')
          heading.focus()
        }
        first.scrollIntoView()
      }
    }
  }

  function apply(): void {
    guidedBtn.setAttribute('aria-pressed', String(mode === 'guided'))
    referenceBtn.setAttribute('aria-pressed', String(mode === 'reference'))
    const inStep = new Set(STEPS[step].sections)
    for (const [id, el] of sections) el.hidden = mode === 'guided' && !inStep.has(id)
    railBtns.forEach((b, i) => {
      if (mode === 'guided' && i === step) b.setAttribute('aria-current', 'step')
      else b.removeAttribute('aria-current')
    })
    nav.hidden = mode === 'reference'
    prevBtn.hidden = step === 0
    nextBtn.hidden = step === STEPS.length - 1
    if (step > 0) prevBtn.textContent = `‹ Back: ${STEPS[step - 1].label}`
    if (step < STEPS.length - 1) nextBtn.textContent = `Next: ${STEPS[step + 1].label} ›`
  }

  // deep links: opening or following #exhibit-N lands on the owning step
  window.addEventListener('hashchange', () => {
    const target = stepOfSection(location.hash.slice(1))
    if (target >= 0 && mode === 'guided' && target !== step) goToStep(target, true)
  })

  barRoot.append(modeGroup, rail)
  navRoot.append(nav)
  apply()
}
