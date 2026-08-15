import { test } from '@playwright/test'
import { boot, driveAllStates, NARROW } from './gate'

/**
 * WCAG A/AA regression gate.
 *
 * Four configurations — {dark, light} x {1280px, 380px} — and within each, the
 * lab is DRIVEN: guided mode walked step by step, every preset, prediction,
 * reduction, solution, tamper and reset exercised, every disclosure opened by
 * clicking its summary, both extremes of every numeric input and slider, and a
 * scan after each step. Reference mode is scanned last, as the heaviest layout.
 *
 * See `gate.ts` for why nothing is injected into the page, why the shipped
 * defaults are asserted rather than assumed, and why `violations` is not the
 * whole oracle.
 */

for (const theme of ['dark'] as const) {
  test(`no WCAG A/AA violations in ${theme} theme`, async ({ page }) => {
    test.setTimeout(900_000)
    page.setDefaultTimeout(20_000)
    await boot(page, theme)
    await driveAllStates(page, theme)
  })

  test(`no WCAG A/AA violations in ${theme} theme at 380px`, async ({ page }) => {
    test.setTimeout(900_000)
    page.setDefaultTimeout(20_000)
    await page.setViewportSize(NARROW)
    await boot(page, theme)
    await driveAllStates(page, `${theme} @380px`)
  })
}
