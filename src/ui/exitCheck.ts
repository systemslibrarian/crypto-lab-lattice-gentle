/**
 * Exit check (GS-06) — five transfer questions. Each puts an idea from the
 * exhibits into a situation the page never displayed, so a right answer
 * demonstrates transfer, not recall of on-screen numbers. Feedback is
 * immediate, explains the why, and the summary reports first-try score.
 */
import { h, badge } from './dom'

interface Question {
  text: string
  options: string[]
  correct: number
  why: string
}

const QUESTIONS: Question[] = [
  {
    text: 'A friend replaces a lattice basis with a different basis of the same lattice. What can actually change?',
    options: [
      'The set of lattice points',
      'The length of the shortest nonzero vector',
      'How easily answers can be read off the description',
      'The absolute value of the determinant',
    ],
    correct: 2,
    why:
      'The point set, the shortest length, and |det| all belong to the lattice itself — every basis of it agrees on them (Exhibits 1–2). ' +
      'Only the quality of the description changes: a good basis makes rounding and short vectors easy to read off, a bad one hides them.',
  },
  {
    text: 'Does an ML-KEM recipient hold a secret good basis for some lattice?',
    options: [
      'Yes — the good basis is the decryption trapdoor',
      'No — the secret is a short vector hidden inside noisy modular equations',
      'Yes, but only at the real dimension of 256',
      'No — ML-KEM keeps no secret at all on the receiving side',
    ],
    correct: 1,
    why:
      'Basis quality is the geometric intuition, not the mechanism. In Kyber/ML-KEM the secret key is the short vector s with t = A·s + e ' +
      '(Exhibit 5); hardness comes from module-LWE, connected to lattice problems by security reductions — no honest party ever holds a good basis.',
  },
  {
    text: 'An attacker finds a short nonzero z with A·z ≡ 0 (mod q). Which problem did they solve, and what is its geometry?',
    options: [
      'LWE — a closest-vector (decoding) problem',
      'LWE — a shortest-vector problem',
      'SIS — a closest-vector (decoding) problem',
      'SIS — a shortest-vector problem',
    ],
    correct: 3,
    why:
      'A short kernel vector of A is exactly Short Integer Solutions, and it is a short vector in the lattice built from A — SVP in disguise. ' +
      'LWE is the other column: recovering s from b = A·s + e is decoding a point near the lattice, CVP/BDD in disguise (Exhibit 4).',
  },
  {
    text: 'A tampered ML-KEM ciphertext decapsulates to a key that does not match the sender’s. Which property failed?',
    options: [
      'Security — the scheme just leaked information',
      'Correctness — decryption has a bug',
      'None — implicit rejection is behaving exactly as specified',
      'The noise budget — an error coefficient crossed q/4',
    ],
    correct: 2,
    why:
      'FIPS 203 decapsulation never visibly refuses: an invalid ciphertext yields a pseudorandom fallback key derived from the secret value z, ' +
      'so outsiders cannot distinguish rejection from success (Exhibit 5). Mismatched keys on tampered input is the specified behavior, not a failure.',
  },
  {
    text: 'This page solves SVP outright and repairs bad bases before your eyes. Why does that not break ML-KEM?',
    options: [
      'Real schemes keep the modulus q secret',
      'Hardness appears only in high dimension, where the best known algorithms take exponential time',
      'ML-KEM does not actually rely on lattice problems',
      'The SHA-3 functions block lattice attacks',
    ],
    correct: 1,
    why:
      'Everything here is 2D, where Gauss solves SVP outright (Exhibit 3) — and q, A, and t are all public in LWE. The conjectured hardness lives in ' +
      'dimension in the hundreds, where BKZ-with-sieving costs grow exponentially. Small dimensions are for teaching; the security claim is elsewhere.',
  },
]

export function mountExitCheck(root: HTMLElement): void {
  const summary = h('p', { class: 'panel-status', role: 'status' })
  const retryRow = h('div', { class: 'button-row' })
  let answered = 0
  let firstTryCorrect = 0

  const renderAll = (): void => {
    answered = 0
    firstTryCorrect = 0
    summary.replaceChildren()
    retryRow.replaceChildren()
    const list = h('ol', { class: 'check-questions' })
    QUESTIONS.forEach((q, qi) => {
      const feedback = h('p', { class: 'panel-status', role: 'status' })
      const btns: HTMLButtonElement[] = q.options.map((opt, oi) => {
        const b = h('button', { type: 'button', text: opt })
        b.addEventListener('click', () => {
          const right = oi === q.correct
          for (const other of btns) other.disabled = true
          btns[q.correct].classList.add('check-correct')
          b.setAttribute('aria-pressed', 'true')
          feedback.replaceChildren(
            right ? badge('ok', 'right') : badge('warn', `not quite — the answer is “${q.options[q.correct]}”`),
            h('span', { text: ` ${q.why}` }),
          )
          answered++
          if (right) firstTryCorrect++
          if (answered === QUESTIONS.length) showSummary()
        })
        return b
      })
      list.append(
        h(
          'li',
          { class: 'check-q' },
          h('p', { class: 'hook', text: `${qi + 1}. ${q.text}` }),
          h('div', { class: 'button-row check-options', role: 'group', 'aria-label': `Question ${qi + 1} options` }, ...btns),
          feedback,
        ),
      )
    })
    root.replaceChildren(list, summary, retryRow)
  }

  function showSummary(): void {
    const n = firstTryCorrect
    const verdict =
      n === 5
        ? badge('ok', '5/5 on the first try — you can explain this page, not just replay it')
        : n >= 3
          ? badge('ok', `${n}/5 on the first try — solid transfer; reread the explanations you missed`)
          : badge('warn', `${n}/5 on the first try — worth another pass through the exhibits`)
    const retry = h('button', { type: 'button', text: 'Reset and try again' })
    retry.addEventListener('click', renderAll)
    summary.replaceChildren(
      verdict,
      h(
        'span',
        {},
        ' These five cover the invariance of the lattice, what the real secret is, LWE vs SIS, implicit rejection, and where hardness lives.',
      ),
    )
    retryRow.replaceChildren(retry)
  }

  renderAll()
}
