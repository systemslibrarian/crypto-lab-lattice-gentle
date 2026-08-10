import AxeBuilder from '@axe-core/playwright'
import { expect, type Locator, type Page } from '@playwright/test'
import { auditContrast, formatContrastFailures } from './contrast'

export const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

/** A phone-width viewport, for the WCAG 1.4.10 reflow half of the gate. */
export const NARROW = { width: 380, height: 800 }

/**
 * Shared machinery for the WCAG gate.
 *
 * Three rules govern everything here:
 *
 *  1. NOTHING IS INJECTED INTO THE PAGE BEFORE A SCAN. The spec this replaces
 *     opened with `addStyleTag({ content: '*{animation:none;transition:none}' })`
 *     and twice ran `document.querySelectorAll('details').forEach(d => d.open = true)`.
 *     Force-opening a disclosure is not the same as opening it: it skips the
 *     summary that is the actual control, and on this page it manufactures a
 *     document no visitor has — all ten disclosures open at once, including the
 *     two "Inspect the secrets" teaching views that are the whole point of
 *     being closed by default.
 *
 *  2. EVERY SCAN ASSERTS ITS CONTENT IS PRESENT FIRST, and there are scans well
 *     past first paint. The old spec drove the whole lab and then scanned ONCE,
 *     at the end — so every intermediate state it built (the degenerate basis,
 *     the wrong-answer feedback, each reduction step) was thrown away
 *     unmeasured. This one scans after every step.
 *
 *  3. `violations` IS NOT THE WHOLE ORACLE. See `scan`.
 */

/**
 * Wait for every running animation and transition to drain.
 *
 * Transitions drain in waves, not in one batch, so a poll for "nothing running
 * right now" can exit through a gap between waves. Require quiescence to hold
 * for several consecutive frames instead. This lab's own stylesheet declares no
 * animation or transition at all; the shared header declares four.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __quietFrames?: number }
      const running = document.getAnimations().filter((a) => a.playState === 'running')
      w.__quietFrames = running.length === 0 ? (w.__quietFrames ?? 0) + 1 : 0
      return w.__quietFrames >= 6
    },
    undefined,
    { timeout: 20_000, polling: 'raf' },
  )
}

/**
 * Assert that reduced motion left the page visible, not merely un-animated.
 *
 * The failure mode this guards against is an element whose only route to its
 * visible state is an animation, in a stylesheet whose reduced-motion block
 * cancels that animation without restoring its end state — the element then
 * renders at `opacity: 0` for every reader with the preference set. This lab
 * has no reduced-motion block, which is exactly why the assertion has to be a
 * measurement rather than a reading of the stylesheet.
 */
async function expectNotBlank(page: Page, label: string): Promise<void> {
  const invisible = await page.evaluate(() => {
    const out: string[] = []
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim()
      if (!own) continue
      // Deliberately hidden subtrees are not "blank", they are closed. Guided
      // mode hides five of six steps with the `hidden` attribute, so this
      // filter is doing real work on every scan.
      if (!(el as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true })) continue
      let effective = 1
      let node: Element | null = el
      while (node) {
        effective *= parseFloat(getComputedStyle(node).opacity)
        node = node.parentElement
      }
      if (effective === 0) {
        out.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}`)
      }
    }
    return Array.from(new Set(out))
  })
  expect(invisible, `no visible text may render at opacity 0 in state: ${label}`).toEqual([])
}

/**
 * Load the page in a known theme with reduced motion actually in effect, and
 * assert the content every scan relies on is really on the page.
 *
 * `test.use({ reducedMotion })` silently does nothing on Playwright 1.61.1, so
 * the emulation is applied imperatively BEFORE the navigation and then
 * *asserted* from inside the page.
 *
 * The DEFAULTS are asserted, not assumed. GUIDED mode is the default and it
 * hides five of the six steps behind the `hidden` attribute — a gate that
 * jumps straight to Reference mode (as the replaced spec did, on its first
 * line) never scans the shell most visitors actually load. The seeds are
 * pinned through the query string because `mountExhibitSchemes` falls back to
 * `randomSeed()`, and an unpinned seed makes toy-Dilithium's 4-bit challenge
 * accept a tampered message about one run in sixteen.
 */
export async function boot(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript((t) => localStorage.setItem('theme', t), theme)
  await page.goto('?kseed=1234&dseed=7')
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'reduced-motion emulation must actually be in effect',
  ).toBe(true)
  // index.html's anti-flash script stamps data-theme for both values, and it
  // reads the same 'theme' key the shared header's toggle writes.
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme)

  await expect(page.locator('#intro')).toBeVisible()
  await expect(page.locator('#exhibit-1')).toBeVisible()
  await expect(page.locator('#hero-hook button').first()).toBeVisible()

  // Guided is the shipped default: step 1 visible, the rest hidden.
  await expect(page.getByRole('button', { name: 'Guided', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  for (const id of ['exhibit-2', 'exhibit-3', 'exhibit-4', 'exhibit-5', 'exit-check']) {
    await expect(page.locator(`#${id}`)).toBeHidden()
  }

  await settle(page)
  await expectNotBlank(page, `${theme} first paint`)
}

/**
 * Assert the page does not require horizontal scrolling.
 *
 * WCAG 1.4.10 (Reflow, AA). axe has no rule for this at all. The replaced spec
 * did check this, at four widths — but only `scrollWidth - clientWidth`, which
 * cannot see a viewport-level clip, and it never named the culprit.
 */
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement
    // `body { overflow-x: hidden }` propagates to the viewport when `html`
    // leaves `overflow` at `visible`, so `scrollWidth` stays equal to
    // `clientWidth` even when content is CUT OFF — a worse 1.4.10 outcome than
    // a scrollbar, and invisible to the standard check. This lab does not have
    // that rule today, which is why the check has to look for it: a later "fix"
    // that adds it would otherwise make this oracle permanently green.
    const clippedByViewport = ['hidden', 'clip'].includes(
      getComputedStyle(document.body).overflowX,
    )
    if (!clippedByViewport && doc.scrollWidth <= doc.clientWidth) return null

    // Only elements that actually push the DOCUMENT sideways are culprits. A
    // wide table inside an `overflow-x: auto` wrapper has a huge bounding rect
    // but is clipped by its scroller and contributes nothing to the document's
    // scroll width — naming it sends you off fixing the wrong element. Every
    // numeric table on this page is exactly such a case.
    const clipped = (el: Element): boolean => {
      let n = el.parentElement
      // Stop BEFORE <body>: when a viewport-level clip exists, body itself
      // answers "hidden" to this walk, every element reads as clipped, and the
      // oracle reports nothing at all — which is the failure it exists to
      // catch. Only a genuine scroller INSIDE the page excuses an overflow.
      while (n && n !== doc && n !== document.body) {
        const ox = getComputedStyle(n).overflowX
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true
        n = n.parentElement
      }
      return false
    }

    const over = Array.from(document.querySelectorAll('body *'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && x.r.right > doc.clientWidth + 1)
      .sort((a, b) => b.r.right - a.r.right)
    const escaping = over.filter((x) => !clipped(x.el))
    if (!escaping.length) return null
    const widest = escaping[0]
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      widest:
        `${widest.el.tagName.toLowerCase()}${widest.el.id ? '#' + widest.el.id : ''}` +
        `${widest.el.getAttribute('class') ? '.' + widest.el.getAttribute('class')!.trim().split(/\s+/).join('.') : ''}` +
        ` @${Math.round(widest.r.width)}px right=${Math.round(widest.r.right)}`,
    }
  })
  expect(overflow, `page must not scroll horizontally in state: ${label}`).toBeNull()
}

/**
 * Every scrolling container must be operable from the keyboard (WCAG 2.1.1).
 * If it holds no focusable content it needs `tabindex="0"`, so it becomes a
 * focus target arrow keys can then scroll. This page has seven candidates —
 * five `.table-scroll` wrappers, `.reduce-matrix`, and `#app details` — and the
 * ones that already carry `tabindex="0"` are why this is a regression test.
 */
export async function expectScrollersReachable(page: Page, label: string): Promise<void> {
  const unreachable = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])'
    return Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      .filter((el) => {
        const cs = getComputedStyle(el)
        return (
          ['auto', 'scroll'].includes(cs.overflowX) || ['auto', 'scroll'].includes(cs.overflowY)
        )
      })
      .filter((el) => el.tabIndex < 0 && !el.querySelector(FOCUSABLE))
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}` +
          ` (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`,
      )
  })
  expect(
    Array.from(new Set(unreachable)),
    `scrolling regions with no keyboard route in state: ${label}`,
  ).toEqual([])
}

/**
 * When `A11Y_COLLECT` is set, `scan` records failures instead of throwing.
 *
 * A strict gate reports the first failing assertion in the first failing state
 * and stops, so a page with defects in several states needs one full run per
 * defect to enumerate them. The collection pass turns that into a single run.
 * It is a debugging aid only: `A11Y_COLLECT` is never set in CI or in the
 * committed workflow, it prints every finding as it happens, and it FAILS at
 * the end via `reportCollected` — so a green collection run cannot be mistaken
 * for a green gate.
 */
const COLLECTING = !!process.env.A11Y_COLLECT
const collected: string[] = []

function record(entry: string): void {
  collected.push(entry)
  // Printed as it happens, not only at the end: a hard assertion later in the
  // drive would otherwise abort the test before anything collected so far was
  // ever shown.
  console.log(`\n[A11Y_COLLECT #${collected.length}] ${entry}`)
}

function softExpect(actual: unknown, message: string, expected: unknown): void {
  if (!COLLECTING) {
    expect(actual, message).toEqual(expected)
    return
  }
  try {
    expect(actual, message).toEqual(expected)
  } catch {
    record(`${message}\n  ${JSON.stringify(actual, null, 2)}`)
  }
}

/** Fail the test if the collection pass recorded anything. */
export function reportCollected(): void {
  if (!COLLECTING) return
  expect(collected, `A11Y_COLLECT recorded ${collected.length} failure(s)`).toEqual([])
}

/**
 * Scan the page as it currently stands.
 *
 * Five assertions, because axe's `violations` array alone is not a complete
 * oracle — and `violations` was the ONLY oracle the replaced spec had:
 *
 *  - `violations` — the usual WCAG A/AA rule failures.
 *  - `incomplete` — axe's "could not decide" bucket, which never reaches the
 *    violations array. The one rule id allowed to remain incomplete is
 *    `color-contrast`, and only because the next assertion computes those
 *    ratios arithmetically. Everything else there is a real result axe simply
 *    could not finish — including `aria-prohibited-attr`, where an
 *    `aria-label` on a role-less div hides.
 *  - arithmetic contrast — composite-aware WCAG 1.4.3 over every text node.
 *    Load-bearing here: every surface tint on this page is a `color-mix`
 *    wash, which axe files as incomplete rather than judging.
 *  - keyboard reachability of scrolling regions — WCAG 2.1.1.
 *  - reflow — WCAG 1.4.10, which axe has no rule for at all.
 */
export async function scan(page: Page, label: string): Promise<void> {
  if (process.env.A11Y_TIME) console.log(`[t=${Date.now() % 1e7}] scan: ${label}`)
  await settle(page)
  await expectNotBlank(page, label)
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()

  const violations = results.violations.map((v) => ({
    state: label,
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
  }))
  softExpect(violations, `axe violations in state: ${label}`, [])

  const unexplainedIncomplete = results.incomplete
    .filter((v) => v.id !== 'color-contrast')
    .map((v) => ({
      state: label,
      id: v.id,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
    }))
  softExpect(unexplainedIncomplete, `axe incomplete results in state: ${label}`, [])

  const contrast = Array.from(new Set(formatContrastFailures(await auditContrast(page))))
  softExpect(contrast, `measured contrast failures in state: ${label}`, [])

  await expectScrollersReachable(page, label)
  await expectNoHorizontalOverflow(page, label)
}

/** Set a number input and fire the `change` its listener is bound to. */
async function setNumber(page: Page, selector: string, value: string): Promise<void> {
  const input = page.locator(selector)
  await input.fill(value)
  await input.dispatchEvent('change')
}

/** Open a `<details>` the way a visitor does — by clicking its summary. */
async function openDetails(details: Locator): Promise<void> {
  await details.locator('> summary').click()
  await expect(details).toHaveAttribute('open', '')
}

/**
 * Drive the lab through every state that renders content, scanning each.
 *
 * The shape follows the lab's own: guided mode walks six steps, and each step
 * is driven to its branches before `Next` is pressed. Reference mode — every
 * exhibit mounted at once — is scanned last, because that is the heaviest
 * layout and the one most likely to reflow badly. Every wait is on a real
 * completion signal (a status line changing, a disclosure reporting `open`),
 * never a fixed timeout; the replaced spec used `waitForTimeout(200)` and
 * `waitForTimeout(300)` in five places.
 */
export async function driveAllStates(page: Page, theme: string): Promise<void> {
  await scan(page, `${theme} / guided step 1 (first paint)`)

  // --- the hero hook: the seductive wrong answer, and its disabled aftermath -
  await page.getByRole('button', { name: 'Same dots — they must tie' }).click()
  await expect(page.locator('.hook-result')).toContainText('the natural guess')
  await expect(page.getByRole('link', { name: /Drag it yourself/ })).toBeVisible()
  await scan(page, `${theme} / hero hook answered (warn + disabled buttons)`)

  // --- Exhibit 1: every preset, a foreign lattice, and a degenerate basis ----
  const ex1 = page.locator('#exhibit-lattice')
  const presets = ex1.getByRole('group', { name: 'Basis presets' }).getByRole('button')
  const presetCount = await presets.count()
  expect(presetCount, 'exhibit 1 must offer basis presets').toBe(4)
  for (let i = 0; i < presetCount; i++) {
    const name = (await presets.nth(i).textContent()) ?? String(i)
    await presets.nth(i).click()
    await expect(ex1.locator('.panel-status').first()).not.toBeEmpty()
    await scan(page, `${theme} / exhibit 1 preset: ${name.trim()}`)
  }

  // A hand-edited b1 that leaves the lattice — the "different lattice" warning.
  await presets.first().click()
  await setNumber(page, '#ex1-b1x', '4')
  await expect(ex1.getByText('different lattice', { exact: false }).first()).toBeVisible()
  await scan(page, `${theme} / exhibit 1 basis leaves the lattice`)

  // det = 0: the degenerate branch, which also swaps the CVP readout for its
  // "needs two independent basis vectors" text. The replaced spec never
  // reached it.
  await setNumber(page, '#ex1-b1x', '2')
  await setNumber(page, '#ex1-b1y', '4')
  await setNumber(page, '#ex1-b2x', '4')
  await setNumber(page, '#ex1-b2y', '8')
  await expect(ex1.getByText('degenerate', { exact: false }).first()).toBeVisible()
  await expect(ex1.getByText('CVP needs two independent', { exact: false })).toBeVisible()
  await scan(page, `${theme} / exhibit 1 degenerate basis (det = 0)`)

  // Both extremes of the coordinate inputs, which clamp to [-14, 14].
  await setNumber(page, '#ex1-tx', '-14')
  await setNumber(page, '#ex1-ty', '14')
  await expect(page.locator('#ex1-tx')).toHaveValue('-14')
  await scan(page, `${theme} / exhibit 1 target at the input extremes`)

  // --- step 2: SVP/CVP ------------------------------------------------------
  await nextStep(page, '2 · SVP/CVP')
  await expect(page.locator('#exhibit-2')).toBeVisible()
  await scan(page, `${theme} / guided step 2`)

  const ex2 = page.locator('#exhibit-svp')
  await ex2.getByRole('button', { name: /Predict: yes/ }).click()
  await expect(ex2.getByText('not quite', { exact: false }).first()).toBeVisible()
  await scan(page, `${theme} / exhibit 2 prediction answered (wrong)`)
  await ex2.getByRole('button', { name: /Good basis/ }).click()
  await expect(ex2.getByRole('button', { name: /Good basis/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await scan(page, `${theme} / exhibit 2 good basis (pressed state)`)
  await ex2.getByRole('button', { name: /Bad basis/ }).click()
  await expect(ex2.getByText('the basis hides the answer', { exact: false })).toBeVisible()
  await scan(page, `${theme} / exhibit 2 bad basis`)

  // --- step 3: reduction stepper -------------------------------------------
  await nextStep(page, '3 · Reduce')
  await expect(page.locator('#exhibit-3')).toBeVisible()
  await scan(page, `${theme} / guided step 3 (before any step)`)

  const ex3 = page.locator('#exhibit-reduce')
  const reducePresets = ex3.getByRole('group', { name: 'Reduction examples' }).getByRole('button')
  const reduceCount = await reducePresets.count()
  expect(reduceCount, 'exhibit 3 must offer reduction examples').toBe(3)
  for (let i = 0; i < reduceCount; i++) {
    const name = (await reducePresets.nth(i).textContent()) ?? String(i)
    await reducePresets.nth(i).click()
    await ex3.getByRole('button', { name: 'Step', exact: true }).click()
    await expect(ex3.locator('.reduce-line')).toHaveCount(1)
    await scan(page, `${theme} / exhibit 3 ${name.trim()} — one step`)
    await ex3.getByRole('button', { name: 'Run to end' }).click()
    await expect(ex3.getByText('finished —', { exact: false }).first()).toBeVisible()
    await scan(page, `${theme} / exhibit 3 ${name.trim()} — run to end`)
    await ex3.getByRole('button', { name: 'Reset', exact: true }).click()
    await expect(ex3.getByText('Press Step to run', { exact: false })).toBeVisible()
    await scan(page, `${theme} / exhibit 3 ${name.trim()} — reset`)
  }

  // --- step 4: LWE and SIS --------------------------------------------------
  await nextStep(page, '4 · LWE & SIS')
  await expect(page.locator('#exhibit-4')).toBeVisible()
  await scan(page, `${theme} / guided step 4 (both panels rejecting s = 0)`)

  const ex4 = page.locator('#exhibit-lwe-sis')
  for (const d of await ex4.locator('details').all()) await openDetails(d)
  await scan(page, `${theme} / exhibit 4 all disclosures open`)

  await ex4.getByRole('button', { name: /Solution 1: s =/ }).click()
  await expect(ex4.getByText('accepted:', { exact: false }).first()).toBeVisible()
  await scan(page, `${theme} / exhibit 4 LWE accepted`)
  await ex4.getByRole('button', { name: /wrong guess/ }).click()
  await expect(ex4.getByText('rejected:', { exact: false }).first()).toBeVisible()
  await scan(page, `${theme} / exhibit 4 LWE rejected`)
  await ex4.getByRole('button', { name: /Solution 1: z =/ }).click()
  await expect(ex4.getByText('valid SIS solution', { exact: false })).toBeVisible()
  await scan(page, `${theme} / exhibit 4 SIS valid`)
  await ex4.getByRole('button', { name: /The cheat/ }).click()
  await expect(ex4.getByText('the trivial answer is banned', { exact: false })).toBeVisible()
  await scan(page, `${theme} / exhibit 4 SIS banned cheat`)

  // --- step 5: toy-Kyber and toy-Dilithium ---------------------------------
  await nextStep(page, '5 · Schemes')
  await expect(page.locator('#exhibit-5')).toBeVisible()
  await scan(page, `${theme} / guided step 5 (worked example from the slides)`)

  const ex5 = page.locator('#exhibit-schemes')
  for (const d of await ex5.locator('details').all()) await openDetails(d)
  await scan(page, `${theme} / exhibit 5 all disclosures open (incl. the secret inspectors)`)

  await ex5.getByRole('button', { name: 'Fresh seeded keys' }).first().click()
  await expect(
    ex5.getByRole('button', { name: 'Fresh seeded keys' }).first(),
  ).toHaveAttribute('aria-pressed', 'true')
  await scan(page, `${theme} / exhibit 5 Kyber fresh seeded keys`)

  await ex5.getByRole('group', { name: 'Message bits' }).getByRole('button').first().click()
  await scan(page, `${theme} / exhibit 5 Kyber message bit flipped`)

  await ex5.getByRole('button', { name: 'Run KEM: encapsulate → decapsulate' }).click()
  await expect(ex5.getByText('keys agree', { exact: false }).first()).toBeVisible()
  await scan(page, `${theme} / exhibit 5 KEM keys agree`)
  await ex5.getByRole('button', { name: /Tamper with the ciphertext/ }).click()
  await expect(ex5.getByText('implicit-rejection fallback', { exact: false }).first()).toBeVisible()
  await scan(page, `${theme} / exhibit 5 KEM implicit rejection`)

  // The noise slider is the break-it-yourself control; both extremes matter.
  // Its maximum is the only route to the DECRYPTION FAILED state.
  await page.locator('#kyber-noise').fill('34')
  await page.locator('#kyber-noise').dispatchEvent('input')
  await expect(ex5.getByText('DECRYPTION FAILED', { exact: false }).first()).toBeVisible()
  await scan(page, `${theme} / exhibit 5 Kyber decryption failure at eta = 34`)
  await page.locator('#kyber-noise').fill('2')
  await page.locator('#kyber-noise').dispatchEvent('input')
  await expect(ex5.getByText('under the ceiling', { exact: false }).first()).toBeVisible()
  await scan(page, `${theme} / exhibit 5 Kyber back under the ceiling at eta = 2`)

  // Clipboard access is denied in this context, so the share button exercises
  // its rejection path — a real warn state with the URL spelled out.
  await ex5.getByRole('button', { name: 'Copy experiment link' }).click()
  await expect(ex5.locator('.panel-status').first()).not.toBeEmpty()
  await scan(page, `${theme} / exhibit 5 share-link result`)

  // toy-Dilithium: replay, verify, both tampers, then a live signature.
  await ex5.getByRole('button', { name: /Replay the slides/ }).click()
  await ex5.getByRole('button', { name: 'Verify', exact: true }).click()
  await expect(ex5.getByText('SIGNATURE ACCEPTED', { exact: false }).first()).toBeVisible()
  await scan(page, `${theme} / exhibit 5 Dilithium replay accepted`)
  await ex5.getByRole('button', { name: /Tamper with z/ }).click()
  await expect(ex5.getByText('SIGNATURE REJECTED', { exact: false }).first()).toBeVisible()
  await scan(page, `${theme} / exhibit 5 Dilithium tampered z rejected`)

  await ex5.getByRole('button', { name: /Sign \(live/ }).click()
  await expect(ex5.getByText(/signed “/, { exact: false }).first()).toBeVisible({
    timeout: 30_000,
  })
  await scan(page, `${theme} / exhibit 5 Dilithium live signature`)
  await ex5.getByRole('button', { name: 'Verify', exact: true }).click()
  await expect(ex5.getByText('SIGNATURE ACCEPTED', { exact: false }).first()).toBeVisible()
  await scan(page, `${theme} / exhibit 5 Dilithium live signature verified`)
  await ex5.getByRole('button', { name: /tampered message/ }).click()
  await expect(ex5.getByText('SIGNATURE REJECTED', { exact: false }).first()).toBeVisible()
  await scan(page, `${theme} / exhibit 5 Dilithium tampered message rejected`)

  // --- step 6: the exit check ----------------------------------------------
  await nextStep(page, '6 · Check')
  await expect(page.locator('#exit-check')).toBeVisible()
  await scan(page, `${theme} / guided step 6 (unanswered)`)

  const check = page.locator('#exhibit-check')
  // Q1 answered WRONG first: that is the only route to the warn feedback and
  // to `.check-correct` — the revealed right answer on a disabled button.
  await check.getByRole('button', { name: 'The set of lattice points' }).click()
  await expect(check.getByText('not quite', { exact: false }).first()).toBeVisible()
  await expect(check.locator('button.check-correct')).toHaveCount(1)
  await scan(page, `${theme} / exit check wrong answer (warn + revealed correct)`)

  for (const name of [
    /the secret is a short vector/,
    /SIS — a shortest-vector problem/,
    /implicit rejection is behaving exactly/,
    /Hardness appears only in high dimension/,
  ]) {
    await check.getByRole('button', { name }).click()
  }
  await expect(check.getByText('on the first try', { exact: false })).toBeVisible()
  await scan(page, `${theme} / exit check summary`)

  await check.getByRole('button', { name: 'Reset and try again' }).click()
  await expect(check.locator('button.check-correct')).toHaveCount(0)
  await scan(page, `${theme} / exit check reset`)

  // --- reference mode: every exhibit mounted at once ------------------------
  await page.getByRole('button', { name: 'Reference', exact: true }).click()
  await expect(page.locator('#exhibit-5')).toBeVisible()
  await expect(page.locator('#exhibit-1')).toBeVisible()
  await scan(page, `${theme} / reference mode (all exhibits mounted)`)

  // --- the skip link, which only paints while focused ----------------------
  await page.locator('.cl-skip-link').focus()
  await expect(page.locator('.cl-skip-link')).toBeFocused()
  await scan(page, `${theme} / skip link focused`)

  reportCollected()
}

/** Press the guided-mode Next button and confirm it landed. */
async function nextStep(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: `Next: ${label} ›` }).click()
  await expect(
    page.getByRole('navigation', { name: 'Lesson progress' }).getByRole('button', { name: label }),
  ).toHaveAttribute('aria-current', 'step')
}
