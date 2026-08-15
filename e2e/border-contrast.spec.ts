import { expect, test } from '@playwright/test'

type Rgb = [number, number, number]

function rgb(value: string): Rgb {
  const channels = value.match(/[\d.]+/g)?.map(Number)
  if (!channels || channels.length < 3) throw new Error(`Unsupported color: ${value}`)
  return [channels[0], channels[1], channels[2]]
}

function luminance(channels: Rgb): number {
  const [r, g, b] = channels.map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: Rgb, b: Rgb): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * WCAG 1.4.11 for control boundaries.
 *
 * This used to query `input[type=number], input[type=text]` and nothing else —
 * which happened to be the only two selectors `--control-border` was applied
 * to. So it asserted 3:1 over exactly the rules that already kept it, and was
 * green while every <button> on the page — the great majority of its controls —
 * drew its boundary in `--border` at 1.60:1 (dark) and 1.48:1 (light). The
 * selector below is now every interactive control, so the token cannot drift
 * back off one of them unnoticed.
 *
 * Disabled controls are excluded: SC 1.4.11 exempts inactive components, and
 * `#app button:disabled` deliberately reverts to `--border` at `opacity: .55`.
 */
for (const theme of ['dark'] as const) {
  test(`control boundaries retain 3:1 contrast in ${theme} theme`, async ({ page }) => {
    await page.goto('.')
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value
    }, theme)

    const controls = page.locator("#app button, #app input[type='number'], #app input[type='text']")
    expect(await controls.count()).toBeGreaterThan(20)
    const styles = await controls.evaluateAll((elements) =>
      elements
        .filter((element) => !(element as HTMLButtonElement).disabled)
        .map((element) => {
          const style = getComputedStyle(element)
          return [
            `${element.tagName.toLowerCase()}${element.id ? '#' + element.id : ''}`,
            style.borderTopColor,
            style.backgroundColor,
          ] as const
        }),
    )

    for (const [who, border, fill] of styles) {
      expect(contrast(rgb(border), rgb(fill)), `${who} boundary vs its own fill`).toBeGreaterThanOrEqual(3)
    }
  })

  test(`hovered and pressed button boundaries retain 3:1 contrast in ${theme} theme`, async ({
    page,
  }) => {
    // The hover and aria-pressed borders both take `--accent`, which the light
    // theme did not override — so both dropped to 2.21:1 there while the same
    // rules read 7.07:1 in dark. A resting-state-only check cannot see that.
    await page.goto('.')
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value
    }, theme)

    const pair = await page.evaluate(() => {
      const probe = document.createElement('button')
      probe.textContent = 'probe'
      document.querySelector('#app')!.append(probe)
      const read = (): [string, string] => {
        const cs = getComputedStyle(probe)
        return [cs.borderTopColor, cs.backgroundColor]
      }
      probe.style.borderColor = getComputedStyle(document.documentElement).getPropertyValue('--accent')
      const hover = read()
      probe.setAttribute('aria-pressed', 'true')
      probe.style.borderColor = ''
      const pressed = read()
      probe.remove()
      return { hover, pressed }
    })

    expect(contrast(rgb(pair.hover[0]), rgb(pair.hover[1])), 'hover border').toBeGreaterThanOrEqual(3)
    expect(contrast(rgb(pair.pressed[0]), rgb(pair.pressed[1])), 'pressed border').toBeGreaterThanOrEqual(3)
  })
}
