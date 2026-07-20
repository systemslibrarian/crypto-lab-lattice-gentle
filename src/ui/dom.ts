/** Tiny DOM helpers — no framework, just typed element construction. */

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v
    else if (k === 'text') el.textContent = v
    else el.setAttribute(k, v)
  }
  el.append(...children)
  return el
}

const SVG_NS = 'http://www.w3.org/2000/svg'

export function s(tag: string, attrs: Record<string, string> = {}, ...children: (Node | string)[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag) as SVGElement
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  el.append(...children)
  return el
}

/** A labelled integer input (spinbutton), clamped to [min, max]. */
export function intInput(
  id: string,
  label: string,
  value: number,
  min: number,
  max: number,
  onChange: (v: number) => void,
): { wrap: HTMLElement; input: HTMLInputElement } {
  const input = h('input', {
    type: 'number',
    id,
    value: String(value),
    min: String(min),
    max: String(max),
    step: '1',
    inputmode: 'numeric',
  })
  input.addEventListener('change', () => {
    const v = Math.max(min, Math.min(max, Math.round(Number(input.value) || 0)))
    input.value = String(v)
    onChange(v)
  })
  const wrap = h('label', { class: 'int-field', for: id }, h('span', { text: label }), input)
  return { wrap, input }
}

/** Status badge: icon + text + color (never color alone). */
export function badge(kind: 'ok' | 'warn' | 'bad' | 'info', text: string): HTMLElement {
  const icon = kind === 'ok' ? '✓' : kind === 'warn' ? '⚠' : kind === 'bad' ? '✗' : 'ℹ'
  return h(
    'span',
    { class: `badge badge-${kind}` },
    h('span', { class: 'badge-icon', 'aria-hidden': 'true', text: icon }),
    h('span', { text: ` ${text}` }),
  )
}
