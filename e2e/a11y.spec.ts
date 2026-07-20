import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

/**
 * Drive every exhibit into its post-interaction states before scanning —
 * axe only checks what is in the DOM, so an unscanned state is an ungated
 * state. This walks all five exhibits: presets, steppers, accept AND reject
 * paths, tampering, and the noise-overflow failure state.
 */
async function driveDemos(page: Page): Promise<void> {
  await page.addStyleTag({ content: `*,*::before,*::after{animation:none!important;transition:none!important}` })

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
  await page.waitForTimeout(100)

  // Exhibit 2 — both bases of the toggle
  const ex2 = page.locator('#exhibit-svp')
  await ex2.getByRole('button').nth(1).click()
  await ex2.getByRole('button').nth(0).click()
  await ex2.getByRole('button').nth(1).click()

  // Exhibit 3 — run each reduction to the end (exposes ok, fail and done lines)
  const ex3 = page.locator('#exhibit-reduce')
  for (const preset of [0, 1, 2]) {
    await ex3.getByRole('button').nth(preset).click()
    await ex3.getByRole('button', { name: 'Step' }).click()
    await ex3.getByRole('button', { name: 'Run to end' }).click()
    await page.waitForTimeout(50)
  }

  // Exhibit 4 — accepted solutions, the wrong guess, and the banned cheat
  const ex4 = page.locator('#exhibit-lwe-sis')
  await ex4.getByRole('button', { name: /Solution 1: s =/ }).click()
  await ex4.getByRole('button', { name: /wrong guess/ }).click()
  await ex4.getByRole('button', { name: /Solution 1: z =/ }).click()
  await ex4.getByRole('button', { name: /The cheat/ }).click()
  await ex4.getByRole('button', { name: /Solution 2: z =/ }).click()

  // Exhibit 5 / Kyber — fresh keys, bit flip, KEM both paths, then noise overflow
  const ex5 = page.locator('#exhibit-schemes')
  await ex5.getByRole('button', { name: 'Fresh random keys' }).first().click()
  await ex5.getByRole('button', { name: /m0 =/ }).click()
  await ex5.getByRole('button', { name: 'Run KEM: encapsulate → decapsulate' }).click()
  await page.waitForTimeout(300)
  await ex5.getByRole('button', { name: /Tamper with the ciphertext/ }).click()
  await page.waitForTimeout(300)
  await page.locator('#kyber-noise').fill('34') // decryption-failure state
  await page.waitForTimeout(100)

  // Exhibit 5 / Dilithium — KAT replay + verify + tamper, then live sign + verify + tamper
  await ex5.getByRole('button', { name: /Replay the slides/ }).click()
  await ex5.getByRole('button', { name: 'Verify', exact: true }).click()
  await page.waitForTimeout(200)
  await ex5.getByRole('button', { name: /Tamper with z/ }).click()
  await page.waitForTimeout(200)
  await ex5.getByRole('button', { name: /Sign \(live/ }).click()
  await page.waitForTimeout(700)
  await ex5.getByRole('button', { name: 'Verify', exact: true }).click()
  await page.waitForTimeout(300)
  await ex5.getByRole('button', { name: /tampered message/ }).click()
  await page.waitForTimeout(300)
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
