import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

/**
 * Drive every exhibit into its post-interaction states before scanning —
 * axe only checks what is in the DOM, so an unscanned state is an ungated
 * state. This walks all five exhibits: presets, steppers, accept AND reject
 * paths, tampering, implicit rejection, and the noise-overflow failure state.
 */
async function driveDemos(page: Page): Promise<void> {
  await page.addStyleTag({ content: `*,*::before,*::after{animation:none!important;transition:none!important}` })

  // guided mode is the default and hides most sections; the full-page scan
  // wants everything mounted, so switch to the reference view first
  await page.getByRole('button', { name: 'Reference', exact: true }).click()
  await expect(page.locator('#exhibit-5')).toBeVisible()

  // hero hook — the seductive wrong answer, exposing the warn feedback state
  await page.getByRole('button', { name: 'Same dots — they must tie' }).click()
  await expect(page.getByRole('link', { name: /Drag it yourself/ })).toBeVisible()

  // reveal all progressive disclosure
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach((d) => ((d as HTMLDetailsElement).open = true))
  })

  // Exhibit 1 — every preset, then a hand-edited basis that leaves the lattice
  const ex1 = page.locator('#exhibit-lattice')
  for (let i = 0; i < 4; i++) await ex1.getByRole('button').nth(i).click()
  await ex1.getByRole('button').first().click()
  await page.locator('#ex1-b1x').fill('4')
  await page.locator('#ex1-b1x').dispatchEvent('change') // "different lattice" warning state
  await expect(ex1.getByText('different lattice', { exact: false }).first()).toBeVisible()

  // Exhibit 2 — prediction prompt, then both bases of the toggle
  const ex2 = page.locator('#exhibit-svp')
  await ex2.getByRole('button', { name: /Predict: no/ }).click()
  await ex2.getByRole('button', { name: /Good basis/ }).click()
  await ex2.getByRole('button', { name: /Bad basis/ }).click()

  // Exhibit 3 — run each reduction to the end (exposes ok, fail and done lines)
  const ex3 = page.locator('#exhibit-reduce')
  for (const preset of [0, 1, 2]) {
    await ex3.getByRole('button').nth(preset).click()
    await ex3.getByRole('button', { name: 'Step' }).click()
    await ex3.getByRole('button', { name: 'Run to end' }).click()
    await expect(ex3.getByText('finished —', { exact: false }).first()).toBeVisible()
  }

  // Exhibit 4 — accepted solutions, the wrong guess, and the banned cheat
  const ex4 = page.locator('#exhibit-lwe-sis')
  await ex4.getByRole('button', { name: /Solution 1: s =/ }).click()
  await ex4.getByRole('button', { name: /wrong guess/ }).click()
  await ex4.getByRole('button', { name: /Solution 1: z =/ }).click()
  await ex4.getByRole('button', { name: /The cheat/ }).click()
  await ex4.getByRole('button', { name: /Solution 2: z =/ }).click()

  // Exhibit 5 / Kyber — fresh seeded keys, bit flip, KEM valid + implicit
  // rejection, then the noise-overflow failure state
  const ex5 = page.locator('#exhibit-schemes')
  await ex5.getByRole('button', { name: 'Fresh seeded keys' }).first().click()
  await ex5.getByRole('button', { name: /m0 =/ }).click()
  await ex5.getByRole('button', { name: 'Run KEM: encapsulate → decapsulate' }).click()
  await expect(ex5.getByText('keys agree', { exact: false }).first()).toBeVisible()
  await ex5.getByRole('button', { name: /Tamper with the ciphertext/ }).click()
  await expect(ex5.getByText('implicit-rejection fallback', { exact: false }).first()).toBeVisible()
  await page.locator('#kyber-noise').fill('34') // decryption-failure state
  await expect(ex5.getByText('DECRYPTION FAILED', { exact: false }).first()).toBeVisible()

  // Exhibit 5 / Dilithium — KAT replay + verify + tamper, then live sign + verify + tamper
  await ex5.getByRole('button', { name: /Replay the slides/ }).click()
  await ex5.getByRole('button', { name: 'Verify', exact: true }).click()
  await expect(ex5.getByText('SIGNATURE ACCEPTED', { exact: false }).first()).toBeVisible()
  await ex5.getByRole('button', { name: /Tamper with z/ }).click()
  await expect(ex5.getByText('SIGNATURE REJECTED', { exact: false }).first()).toBeVisible()
  // pin the signing seed: with 4-bit toy challenges a tampered message
  // collides (and is accepted as a labelled toy forgery) about 1/16 of the
  // time — seed 7 deterministically reaches the REJECTED state asserted below
  await page.locator('#dil-seed').fill('7')
  await ex5.getByRole('button', { name: /Sign \(live/ }).click()
  await expect(ex5.getByText(/signed “/, { exact: false }).first()).toBeVisible({ timeout: 15_000 })
  await ex5.getByRole('button', { name: 'Verify', exact: true }).click()
  await expect(ex5.getByText('SIGNATURE ACCEPTED', { exact: false }).first()).toBeVisible()
  await ex5.getByRole('button', { name: /tampered message/ }).click()
  await expect(ex5.getByText('SIGNATURE REJECTED', { exact: false }).first()).toBeVisible()

  // exit check — one wrong answer (warn feedback + revealed correct option),
  // four right ones, then the summary and reset states
  const check = page.locator('#exhibit-check')
  await check.getByRole('button', { name: 'The set of lattice points' }).click()
  await check.getByRole('button', { name: /the secret is a short vector/ }).click()
  await check.getByRole('button', { name: 'SIS — a shortest-vector problem' }).click()
  await check.getByRole('button', { name: /implicit rejection is behaving exactly/ }).click()
  await check.getByRole('button', { name: /Hardness appears only in high dimension/ }).click()
  await expect(check.getByText('on the first try', { exact: false })).toBeVisible()

  // re-open any disclosure the interactions may have replaced
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach((d) => ((d as HTMLDetailsElement).open = true))
  })
  await page.waitForTimeout(200)
}

async function scan(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  expect(
    violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 5),
    })),
  ).toEqual([])
}

test('no WCAG A/AA violations — dark theme', async ({ page }) => {
  await page.goto('.')
  await driveDemos(page)
  await scan(page)
})

test('no WCAG A/AA violations — light theme', async ({ page }) => {
  await page.goto('.')
  await page.locator('#cl-theme-toggle').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await driveDemos(page)
  await scan(page)
})

test('no WCAG A/AA violations — guided mode shell', async ({ page }) => {
  await page.goto('.')
  // guided is the default view; walk every step so the rail, prev/next and
  // exit-check states are all exercised, then scan the final state (the
  // exhibits' own content is covered by the reference-mode scans above)
  for (const label of ['2 · SVP/CVP', '3 · Reduce', '4 · LWE & SIS', '5 · Schemes', '6 · Check']) {
    await page.getByRole('button', { name: `Next: ${label} ›` }).click()
  }
  await expect(page.locator('#exit-check')).toBeVisible()
  await scan(page)
})

test('first-viewport experiment: input and response fit a 390×844 phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('.')
  // a meaningful input sits inside the first viewport, below the shared header
  const btn = page.getByRole('button', { name: 'B decodes closer' })
  const box = await btn.boundingBox()
  expect(box, 'hook button not rendered').not.toBeNull()
  expect(box!.y + box!.height, 'first interactive control is below the first screen').toBeLessThan(844)
  // and its response begins inside the same screen
  await btn.click()
  const result = page.locator('.hook-result')
  await expect(result).toBeVisible()
  const rbox = await result.boundingBox()
  expect(rbox!.y, 'the response starts below the first screen').toBeLessThan(844)
})

test('no horizontal overflow at phone widths and 200% desktop zoom', async ({ page }) => {
  for (const width of [320, 360, 390, 768]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('.')
    await page.waitForTimeout(300)
    const guidedOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(guidedOverflow, `guided view overflows horizontally at ${width}px`).toBeLessThanOrEqual(0)
    // reference mode mounts every section at once — the worst case
    await page.getByRole('button', { name: 'Reference', exact: true }).click()
    await page.waitForTimeout(300)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, `document overflows horizontally at ${width}px`).toBeLessThanOrEqual(0)
  }
  // 200% zoom approximation: halve the viewport CSS pixels at desktop width
  await page.setViewportSize({ width: 720, height: 450 })
  await page.goto('.')
  await page.getByRole('button', { name: 'Reference', exact: true }).click()
  await page.waitForTimeout(300)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow, 'document overflows at 200% zoom equivalent').toBeLessThanOrEqual(0)
})
