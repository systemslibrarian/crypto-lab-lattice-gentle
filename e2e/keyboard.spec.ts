import { expect, test } from '@playwright/test'

/**
 * Keyboard operability, deep links, and media-feature coverage (GS-09).
 * Activation everywhere below is by keyboard (focus + Enter / typing), never
 * by pointer, so a passing run demonstrates the workflows are completable
 * without a mouse — including guided-mode focus management.
 */

const CORRECT_ANSWERS = [
  'How easily answers can be read off the description',
  'No — the secret is a short vector hidden inside noisy modular equations',
  'SIS — a shortest-vector problem',
  'None — implicit rejection is behaving exactly as specified',
  'Hardness appears only in high dimension, where the best known algorithms take exponential time',
]

test('guided walkthrough is keyboard operable and moves focus to each step heading', async ({ page }) => {
  await page.goto('.')
  // guided is the default: only the Basis step is visible
  await expect(page.locator('#exhibit-1')).toBeVisible()
  await expect(page.locator('#exhibit-2')).toBeHidden()

  const steps = [
    { name: 'Next: 2 · SVP/CVP ›', visible: '#exhibit-2', heading: '#ex2-h' },
    { name: 'Next: 3 · Reduce ›', visible: '#exhibit-3', heading: '#ex3-h' },
    { name: 'Next: 4 · LWE & SIS ›', visible: '#exhibit-4', heading: '#ex4-h' },
    { name: 'Next: 5 · Schemes ›', visible: '#exhibit-5', heading: '#ex5-h' },
    { name: 'Next: 6 · Check ›', visible: '#exit-check', heading: '#check-h' },
  ]
  for (const s of steps) {
    await page.getByRole('button', { name: s.name }).focus()
    await page.keyboard.press('Enter')
    await expect(page.locator(s.visible)).toBeVisible()
    await expect(page.locator(s.heading)).toBeFocused()
  }
  await expect(page.locator('#exhibit-1')).toBeHidden()

  // the rail jumps back to the start
  await page.getByRole('button', { name: '1 · Basis' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#exhibit-1')).toBeVisible()
  await expect(page.locator('#exit-check')).toBeHidden()
})

test('deep link opens the owning guided step and seeds still restore', async ({ page }) => {
  await page.goto('./?kseed=42&dseed=7#exhibit-4')
  await expect(page.locator('#exhibit-4')).toBeVisible()
  await expect(page.locator('#exhibit-1')).toBeHidden()
  // the seeded experiment state is restored even while its section is hidden
  await expect(page.locator('#kyber-seed')).toHaveValue('42')
})

test('exit check completes keyboard-only and reports a first-try score', async ({ page }) => {
  await page.goto('./#exit-check')
  await expect(page.locator('#exit-check')).toBeVisible()
  const check = page.locator('#exhibit-check')
  for (const answer of CORRECT_ANSWERS) {
    await check.getByRole('button', { name: answer }).focus()
    await page.keyboard.press('Enter')
  }
  await expect(check.getByText('5/5 on the first try', { exact: false })).toBeVisible()
  // reset restores a fresh, answerable check
  await check.getByRole('button', { name: 'Reset and try again' }).focus()
  await page.keyboard.press('Enter')
  await expect(check.getByRole('button', { name: CORRECT_ANSWERS[0] })).toBeEnabled()
})

test('Exhibit 1 basis editing works keyboard-only', async ({ page }) => {
  await page.goto('.')
  const b1x = page.locator('#ex1-b1x')
  await b1x.focus()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('4')
  await page.keyboard.press('Tab') // commit via change event, no pointer involved
  await expect(
    page.locator('#exhibit-lattice').getByText('different lattice', { exact: false }).first(),
  ).toBeVisible()
})

test('forced colors: interactions still expose text-visible state', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' })
  await page.goto('.')
  await page.getByRole('button', { name: 'B decodes closer' }).focus()
  await page.keyboard.press('Enter')
  // the verdict and the computed numbers arrive as text, not color alone
  await expect(page.getByText('correct', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('the true closest lattice point', { exact: false })).toBeVisible()
})

test('reduced motion: guided navigation still works', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('.')
  await page.getByRole('button', { name: 'Next: 2 · SVP/CVP ›' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#exhibit-2')).toBeVisible()
})
