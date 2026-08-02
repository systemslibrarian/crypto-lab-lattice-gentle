/**
 * Exhibit 5 — toy-Kyber and toy-Dilithium at the exact toy parameters of the
 * course slides, reduced on-screen to MLWE and MSIS. Every number shown is
 * computed by the real algebra in src/kyber and src/dilithium.
 *
 * Fresh-randomness modes run from a visible seed (mulberry32) so experiments
 * are reproducible and shareable; the seed is for teaching only and the UI
 * says so. Async actions disable their controls while pending; each panel
 * announces one concise result sentence through a dedicated live region.
 */
import { h, s, badge } from './dom'
import {
  KYBER_KAT,
  KYBER_PARAMS,
  keygen,
  encrypt,
  decrypt,
  noiseBudget,
  randomKeyMaterial,
  randomEncRandomness,
  encaps,
  decaps,
  type KyberRandomness,
} from '../kyber/toyKyber'
import {
  DILITHIUM_KAT,
  DILITHIUM_PARAMS,
  keygenFrom,
  signAttempt,
  sign,
  verify,
  azMinusCt,
  highBits as dilHighBits,
  randomKeyMaterial as dilithiumRandomKeys,
  type DilithiumKeys,
  type Signature,
} from '../dilithium/toyDilithium'
import { polyToString, vecMods, type PolyVec, type Poly } from '../ring/rq'
import { mods } from '../fq/zq'
import { seededRand, randomSeed } from '../random'

const KP = { q: KYBER_PARAMS.q, n: KYBER_PARAMS.n }
const DP = { q: DILITHIUM_PARAMS.q, n: DILITHIUM_PARAMS.n }

function polyLine(name: string, f: Poly, p: { q: number; n: number }, symmetric = false): HTMLElement {
  return h('p', { class: 'mono poly-line' }, `${name} = ${polyToString(f, p, symmetric)}`)
}

function vecLines(name: string, v: PolyVec, p: { q: number; n: number }, symmetric = false): HTMLElement {
  const wrap = h('div', { class: 'poly-vec' })
  v.forEach((f, i) => wrap.append(polyLine(`${name}[${i + 1}]`, f, p, symmetric)))
  return wrap
}

/** A <details> whose open/closed state survives region re-renders. */
function inspect(state: { open: boolean }, label: string, ...children: (Node | string)[]): HTMLElement {
  const attrs: Record<string, string> = state.open ? { open: '' } : {}
  const d = h('details', attrs, h('summary', { text: label }), ...children)
  d.addEventListener('toggle', () => {
    state.open = (d as HTMLDetailsElement).open
  })
  return d
}

/** Toy-vs-standard delta table (GS-02): every deliberate deviation, up front. */
function deltaTable(rows: [string, string, string][]): HTMLElement {
  const table = h('table', { class: 'num-table delta-table' })
  table.append(
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('th', { scope: 'col', text: 'Property' }),
        h('th', { scope: 'col', text: 'This toy' }),
        h('th', { scope: 'col', text: 'FIPS standard' }),
      ),
    ),
  )
  const tbody = h('tbody')
  for (const [prop, toy, std] of rows) {
    tbody.append(
      h('tr', {}, h('th', { scope: 'row', text: prop }), h('td', { text: toy }), h('td', { text: std })),
    )
  }
  table.append(tbody)
  return h('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Toy versus standard comparison table' }, table)
}

/** Disable controls and mark the region busy while an async action runs. */
async function withBusy(btns: HTMLButtonElement[], region: HTMLElement, fn: () => Promise<void>): Promise<void> {
  if (region.getAttribute('aria-busy') === 'true') return // no duplicate runs
  btns.forEach((b) => (b.disabled = true))
  region.setAttribute('aria-busy', 'true')
  try {
    await fn()
  } catch (err) {
    region.append(h('p', {}, badge('bad', `action failed: ${err instanceof Error ? err.message : String(err)}`)))
  } finally {
    btns.forEach((b) => (b.disabled = false))
    region.setAttribute('aria-busy', 'false')
  }
}

export function mountExhibitSchemes(root: HTMLElement): void {
  const params = new URLSearchParams(location.search)
  const kseed = Number(params.get('kseed')) || randomSeed()
  const dseed = Number(params.get('dseed')) || randomSeed()
  const seeds = { k: kseed, d: dseed }
  root.append(kyberPanel(seeds), dilithiumPanel(seeds))
}

// ---------------------------------------------------------------------------
// toy-Kyber
// ---------------------------------------------------------------------------

function kyberPanel(seeds: { k: number; d: number }): HTMLElement {
  const { q } = KYBER_PARAMS
  let A = KYBER_KAT.A
  let sSec = KYBER_KAT.s
  let e = KYBER_KAT.e
  let m = [...KYBER_KAT.m]
  let rnd: KyberRandomness = { r: KYBER_KAT.r, e1: KYBER_KAT.e1, e2: KYBER_KAT.e2 }
  let mode: 'kat' | 'fresh' = 'kat'
  let noiseEta: number = KYBER_PARAMS.eta
  const inspectState = { keys: false, enc: false }

  const keyRegion = h('div', { class: 'scheme-region' })
  const encRegion = h('div', { class: 'scheme-region' })
  const decRegion = h('div', { class: 'scheme-region' })
  const kemRegion = h('div', { class: 'scheme-region' })
  const announce = h('p', { class: 'panel-status', role: 'status' })

  const modeRow = h('div', { class: 'button-row', role: 'group', 'aria-label': 'Kyber mode' })
  const katBtn = h('button', { type: 'button', text: 'Worked example from the slides', 'aria-pressed': 'true' })
  const freshBtn = h('button', { type: 'button', text: 'Fresh seeded keys', 'aria-pressed': 'false' })
  modeRow.append(katBtn, freshBtn)

  // --- seed controls (GS-07): reproducible teaching experiments ---
  const seedInput = h('input', { type: 'number', id: 'kyber-seed', min: '0', max: '999999', step: '1', value: String(seeds.k) })
  const rerollBtn = h('button', { type: 'button', text: 'Reroll seed' })
  const shareBtn = h('button', { type: 'button', text: 'Copy experiment link' })
  const seedRow = h(
    'div',
    { class: 'field-row seed-row' },
    h('label', { class: 'int-field', for: 'kyber-seed' }, h('span', { text: 'Experiment seed' }), seedInput),
    rerollBtn,
    shareBtn,
    h('span', { class: 'panel-note seed-note', text: 'seeded generation is for reproducible teaching, not key generation' }),
  )
  seedInput.addEventListener('change', () => {
    seeds.k = Math.max(0, Math.round(Number(seedInput.value) || 0))
    seedInput.value = String(seeds.k)
    if (mode === 'fresh') regenerate()
  })
  rerollBtn.addEventListener('click', () => {
    seeds.k = randomSeed()
    seedInput.value = String(seeds.k)
    if (mode === 'fresh') regenerate()
    else setFresh()
  })
  shareBtn.addEventListener('click', () => {
    // #exhibit-5 makes the link open directly on the schemes step in guided mode
    const url = `${location.origin}${location.pathname}?kseed=${seeds.k}&dseed=${seeds.d}#exhibit-5`
    void navigator.clipboard
      .writeText(url)
      .then(() => announce.replaceChildren(badge('ok', 'experiment link copied — same seeds reproduce every value')))
      .catch(() => announce.replaceChildren(badge('warn', `could not access the clipboard — link: ${url}`)))
  })

  function setFresh(): void {
    mode = 'fresh'
    katBtn.setAttribute('aria-pressed', 'false')
    freshBtn.setAttribute('aria-pressed', 'true')
    regenerate()
  }
  katBtn.addEventListener('click', () => {
    mode = 'kat'
    noiseEta = KYBER_PARAMS.eta
    noiseSlider.value = String(noiseEta)
    A = KYBER_KAT.A
    sSec = KYBER_KAT.s
    e = KYBER_KAT.e
    m = [...KYBER_KAT.m]
    rnd = { r: KYBER_KAT.r, e1: KYBER_KAT.e1, e2: KYBER_KAT.e2 }
    katBtn.setAttribute('aria-pressed', 'true')
    freshBtn.setAttribute('aria-pressed', 'false')
    update()
  })
  freshBtn.addEventListener('click', setFresh)

  /** Keys depend only on the seed; encryption noise on (seed, η) — so sliding
   *  η re-derives the errors deterministically while the keys stay fixed. */
  function regenerate(): void {
    const km = randomKeyMaterial(seededRand(seeds.k))
    A = km.A
    sSec = km.s
    e = km.e
    rnd = randomEncRandomness(noiseEta, seededRand((seeds.k ^ (noiseEta * 7919)) >>> 0))
    update()
  }

  // message bit toggles
  const bitRow = h('div', { class: 'button-row', role: 'group', 'aria-label': 'Message bits' })
  const bitBtns: HTMLButtonElement[] = []
  for (let i = 0; i < KYBER_PARAMS.n; i++) {
    const btn = h('button', { type: 'button', class: 'bit-btn', 'aria-pressed': String(m[i] === 1) })
    btn.textContent = `m${i} = ${m[i]}`
    btn.addEventListener('click', () => {
      m[i] = 1 - m[i]
      update()
    })
    bitBtns.push(btn)
    bitRow.append(btn)
  }

  // noise slider (break-it-yourself)
  const noiseSlider = h('input', {
    type: 'range',
    id: 'kyber-noise',
    min: '2',
    max: '34',
    step: '1',
    value: String(noiseEta),
  })
  noiseSlider.addEventListener('input', () => {
    noiseEta = Number(noiseSlider.value)
    if (mode === 'kat') setFresh()
    else {
      rnd = randomEncRandomness(noiseEta, seededRand((seeds.k ^ (noiseEta * 7919)) >>> 0))
      update()
    }
  })
  const noiseWrap = h(
    'label',
    { class: 'slider-field', for: 'kyber-noise' },
    h('span', {}, 'Error bound η for the sampled e₁, e₂ (an input distribution — the measured error ‖E‖∞ above is what decides): '),
    noiseSlider,
  )

  /** number line: the four coefficients of v − sᵀu between 0 and q. */
  function noisyLine(noisy: number[], decoded: number[]): SVGElement {
    const W = 460
    const H = 74
    const x = (v: number): number => 14 + (v / q) * (W - 28)
    const svg = s('svg', {
      viewBox: `0 0 ${W} ${H}`,
      role: 'img',
      class: 'noisy-line',
      'aria-label': `Coefficients of v minus s-transpose-u on the 0 to ${q} number line: ${noisy.join(', ')} decode to bits ${decoded.join('')}`,
    })
    svg.append(
      s('rect', { x: String(x(0)), y: '26', width: String(x(q / 4) - x(0)), height: '22', class: 'band-zero' }),
      s('rect', { x: String(x((3 * q) / 4)), y: '26', width: String(x(q) - x((3 * q) / 4)), height: '22', class: 'band-zero' }),
      s('rect', { x: String(x(q / 4)), y: '26', width: String(x((3 * q) / 4) - x(q / 4)), height: '22', class: 'band-one' }),
      s('line', { x1: String(x(0)), y1: '26', x2: String(x(0)), y2: '48', class: 'tick' }),
      s('line', { x1: String(x(q / 2)), y1: '26', x2: String(x(q / 2)), y2: '48', class: 'tick' }),
      s('text', { x: String(x(0)), y: '62', class: 'lv-label', 'text-anchor': 'middle' }, '0 → bit 0'),
      s('text', { x: String(x(q / 2)), y: '62', class: 'lv-label', 'text-anchor': 'middle' }, '⌈q/2⌉ = 69 → bit 1'),
      s('text', { x: String(x(q / 4)), y: '18', class: 'lv-label', 'text-anchor': 'middle' }, 'q/4'),
      s('text', { x: String(x((3 * q) / 4)), y: '18', class: 'lv-label', 'text-anchor': 'middle' }, '3q/4'),
    )
    noisy.forEach((v, i) => {
      svg.append(
        s('circle', { cx: String(x(v)), cy: '37', r: '5', class: `coeff-dot coeff-${decoded[i]}` }),
        s('text', { x: String(x(v)), y: '12', class: 'lv-label', 'text-anchor': 'middle' }, `x${i}`),
      )
    })
    return svg
  }

  function update(): void {
    bitBtns.forEach((btn, i) => {
      btn.textContent = `m${i} = ${m[i]}`
      btn.setAttribute('aria-pressed', String(m[i] === 1))
    })

    const { pk, sk } = keygen(A, sSec, e)
    keyRegion.replaceChildren(
      h('h4', { text: '1 · Key generation is an MLWE instance' }),
      h(
        'p',
        { class: 'panel-note' },
        `t = A·s + e in R₁₃₇ = Z₁₃₇[x]/(x⁴+1), k = 2. The public key is (A, t); the secret is the short vector s — not a basis of anything. Recovering s from (A, t) is the MLWE problem (exact formulation), the module version of the LWE panel above.`,
      ),
      vecLines('t = A·s + e (public)', pk.t, KP),
      inspect(
        { get open() { return inspectState.keys }, set open(v) { inspectState.keys = v } },
        'Inspect the secrets (teaching view — never public in a real scheme)',
        vecLines('s (secret)', vecMods(sSec, KP), KP),
        vecLines('e (secret noise)', vecMods(e, KP), KP),
      ),
    )

    const c = encrypt(pk, m, rnd)
    encRegion.replaceChildren(
      h('h4', { text: '2 · Encrypt: hide ⌈q/2⌉·m inside fresh noise' }),
      h('p', { class: 'mono poly-line' }, `message bits m = ${m.join('')}  →  m(x) encoded as ${polyToString(m.map((b) => b * 69), KP)}`),
      inspect(
        { get open() { return inspectState.enc }, set open(v) { inspectState.enc = v } },
        'Inspect every ciphertext value',
        vecLines('u = Aᵀ·r + e₁', c.u, KP),
        polyLine('v = tᵀ·r + e₂ + 69·m', c.v, KP),
      ),
    )

    const d = decrypt(sk, c)
    const budget = noiseBudget(e, sSec, rnd)
    const okBits = d.m.join('') === m.join('')
    decRegion.replaceChildren(
      h('h4', { text: '3 · Decrypt: v − sᵀ·u lands near 0 or near ⌈q/2⌉ — unless the noise crosses q/4' }),
      polyLine('v − sᵀ·u', d.noisy, KP),
      noisyLine(d.noisy, d.m),
      h(
        'p',
        {},
        h('span', { class: 'mono', text: `decoded bits: ${d.m.join('')} ` }),
        okBits ? badge('ok', 'matches the message') : badge('bad', 'DECRYPTION FAILED — bits flipped'),
      ),
      h(
        'p',
        {},
        h('span', {}, `Measured error: ‖E‖∞ = ‖eᵀr + e₂ − sᵀe₁‖∞ = ${budget.normInf}, ceiling q/4 ≈ ${budget.limit.toFixed(2)}. `),
        budget.ok ? badge('ok', 'under the ceiling — rounding must succeed') : badge('bad', 'over the ceiling — rounding can flip bits'),
      ),
      noiseWrap,
    )
    announce.replaceChildren(
      okBits
        ? badge('ok', `decryption succeeded: bits ${d.m.join('')}, measured error ${budget.normInf} < ${budget.limit.toFixed(2)}`)
        : badge('bad', `decryption failed: measured error ${budget.normInf} ≥ q/4 flipped bits (got ${d.m.join('')}, sent ${m.join('')})`),
    )
  }

  // KEM demo (FO with implicit rejection)
  const kemBtn = h('button', { type: 'button', text: 'Run KEM: encapsulate → decapsulate' })
  const tamperBtn = h('button', { type: 'button', text: 'Tamper with the ciphertext, then decapsulate' })
  async function runKem(tamper: boolean): Promise<void> {
    await withBusy([kemBtn, tamperBtn], kemRegion, async () => {
      const { pk, sk } = keygen(A, sSec, e, seededRand(seeds.k + 99))
      const enc = await encaps(pk, seededRand(seeds.k + 7))
      const c2 = tamper ? { u: enc.c.u, v: enc.c.v.map((x, i) => (i === 0 ? (x + 40) % q : x)) } : enc.c
      const dec = await decaps(sk, pk, c2)
      kemRegion.replaceChildren(
        h('p', { class: 'mono poly-line', text: `sender's key   K  = ${enc.K.slice(0, 32)}…` }),
        h('p', { class: 'mono poly-line', text: `receiver's key K′ = ${dec.K.slice(0, 32)}…` }),
        h(
          'p',
          {},
          dec.K === enc.K
            ? badge('ok', 'keys agree — the re-encryption check passed and the real key was derived')
            : badge('bad', 'keys differ — the receiver silently derived the implicit-rejection fallback key'),
        ),
        h(
          'p',
          { class: 'panel-note' },
          h('strong', { text: 'Internal teaching view (not visible on the wire): ' }),
          dec.match
            ? 're-encrypting the decrypted message reproduced the ciphertext byte for byte.'
            : 're-encryption did NOT reproduce the ciphertext, so decapsulation switched to the fallback key H(z ‖ c). The output is a same-length pseudorandom key either way — an attacker probing with malformed ciphertexts sees no failure signal. This is the implicit rejection of FIPS 203.',
        ),
      )
      announce.replaceChildren(
        dec.K === enc.K
          ? badge('ok', 'KEM: sender and receiver share the same key')
          : badge('bad', 'KEM: implicit rejection — receiver holds the fallback key, not the sender’s'),
      )
    })
  }
  kemBtn.addEventListener('click', () => void runKem(false))
  tamperBtn.addEventListener('click', () => void runKem(true))

  const panel = h(
    'div',
    { class: 'subpanel' },
    h('h3', { text: 'toy-Kyber — the ML-KEM teaching core at q=137, n=4, k=2 (slides V2 pp. 50–51)' }),
    h(
      'p',
      { class: 'panel-note' },
      'The exact toy parameters and worked example of the course slides. ML-KEM-768 (FIPS 203) runs the same three algebraic steps at q=3329, n=256, k=3 — and then adds normative machinery this toy deliberately omits. The differences are on the table below, before you run anything:',
    ),
    h(
      'details',
      {},
      h('summary', { text: 'Toy vs standard — exactly what differs (FIPS 203)' }),
      deltaTable([
        ['Ring dimension n', '4', '256'],
        ['Modulus q', '137', '3329'],
        ['Module rank k', '2', '2 / 3 / 4 by parameter set'],
        ['Hash / XOF', 'SHA-256 stand-in', 'SHA3-256/512, SHAKE128/256'],
        ['Compression & encoding', 'omitted', 'normative (d_u, d_v, byte encodings)'],
        ['Sampling', 'uniform small coeffs', 'CBD from PRF output'],
        ['Invalid ciphertext', 'implicit rejection (modelled)', 'implicit rejection (normative)'],
        ['Security claim', 'none — 16 plaintexts', 'parameter-set security target'],
      ]),
      h(
        'p',
        { class: 'panel-note' },
        h('a', { href: 'https://doi.org/10.6028/NIST.FIPS.203', text: 'FIPS 203 (ML-KEM)' }),
        ' is the normative reference.',
      ),
    ),
    modeRow,
    seedRow,
    bitRow,
    keyRegion,
    encRegion,
    decRegion,
    h(
      'details',
      {},
      h('summary', { text: 'The KEM layer: Fujisaki–Okamoto with implicit rejection, live' }),
      h(
        'p',
        {},
        'A KEM transports a random key, not your message. Decapsulation decrypts, re-encrypts what it found, and compares ciphertexts — but on a mismatch it does not announce failure: it outputs a pseudorandom fallback key derived from a secret z, indistinguishable on the wire from success (FIPS 203\'s implicit rejection). Both ciphertexts and both keys below are computed for real.',
      ),
      h('div', { class: 'button-row' }, kemBtn, tamperBtn),
      kemRegion,
    ),
    announce,
    h(
      'p',
      { class: 'what-this-isnt' },
      '⚠ What this isn\'t: with n = 4 there are only 16 messages — a toy for seeing the mechanism, brute-forceable by inspection, with no security claim. Full-parameter ML-KEM lives in crypto-lab-kyber-vault.',
    ),
  )
  update()
  return panel
}

// ---------------------------------------------------------------------------
// toy-Dilithium
// ---------------------------------------------------------------------------

function dilithiumPanel(seeds: { k: number; d: number }): HTMLElement {
  const { gamma1, gamma2, beta } = DILITHIUM_PARAMS
  let keys: DilithiumKeys = keygenFrom(DILITHIUM_KAT.A, DILITHIUM_KAT.s1, DILITHIUM_KAT.s2)
  let lastSig: Signature | null = null
  let lastMsg = ''
  let lastIsKat = false
  let signCounter = 0 // stale-result guard
  const inspectState = { keys: false, kat: false }

  const keyRegion = h('div', { class: 'scheme-region' })
  const signRegion = h('div', { class: 'scheme-region' })
  const verifyRegion = h('div', { class: 'scheme-region' })
  const announce = h('p', { class: 'panel-status', role: 'status' })

  const verifyBtn = h('button', { type: 'button', text: 'Verify' })
  const tamperMsgBtn = h('button', { type: 'button', text: 'Verify against a tampered message' })
  const tamperZBtn = h('button', { type: 'button', text: 'Tamper with z, then verify' })

  function setVerifyEnabled(on: boolean): void {
    for (const b of [verifyBtn, tamperMsgBtn, tamperZBtn]) b.disabled = !on
  }
  setVerifyEnabled(false)

  function renderKeys(): void {
    keyRegion.replaceChildren(
      h('h4', { text: '1 · Key generation is (again) an MLWE instance' }),
      h(
        'p',
        { class: 'panel-note' },
        't = A·s₁ + s₂ in R₁₆₄₁₇ = Z₁₆₄₁₇[x]/(x⁴+1), (k, ℓ) = (3, 2), η = 10. Public: (A, t). Secret: the short vectors (s₁, s₂) — again, no secret basis anywhere.',
      ),
      vecLines('t = A·s₁ + s₂', keys.t, DP),
      inspect(
        { get open() { return inspectState.keys }, set open(v) { inspectState.keys = v } },
        'Inspect the secrets (teaching view — never public in a real scheme)',
        vecLines('s₁', vecMods(keys.s1, DP), DP),
        vecLines('s₂', vecMods(keys.s2, DP), DP),
      ),
    )
  }

  const msgInput = h('input', {
    type: 'text',
    id: 'dil-msg',
    value: 'a gentle message',
    maxlength: '80',
  })
  const msgWrap = h('label', { class: 'text-field', for: 'dil-msg' }, h('span', { text: 'Message to sign: ' }), msgInput)

  const seedInput = h('input', { type: 'number', id: 'dil-seed', min: '0', max: '999999', step: '1', value: String(seeds.d) })
  const rerollBtn = h('button', { type: 'button', text: 'Reroll seed' })
  const seedRow = h(
    'div',
    { class: 'field-row seed-row' },
    h('label', { class: 'int-field', for: 'dil-seed' }, h('span', { text: 'Experiment seed' }), seedInput),
    rerollBtn,
    h('span', { class: 'panel-note seed-note', text: 'drives fresh keys and the signing masks — same seed, same attempts' }),
  )
  seedInput.addEventListener('change', () => {
    seeds.d = Math.max(0, Math.round(Number(seedInput.value) || 0))
    seedInput.value = String(seeds.d)
  })
  rerollBtn.addEventListener('click', () => {
    seeds.d = randomSeed()
    seedInput.value = String(seeds.d)
  })

  const katBtn = h('button', { type: 'button', text: 'Replay the slides’ worked example' })
  const signBtn = h('button', { type: 'button', text: 'Sign (live, with rejection sampling)' })
  const freshKeysBtn = h('button', { type: 'button', text: 'Fresh seeded keys' })

  freshKeysBtn.addEventListener('click', () => {
    keys = dilithiumRandomKeys(seededRand(seeds.d))
    lastSig = null
    signCounter++
    setVerifyEnabled(false)
    renderKeys()
    signRegion.replaceChildren(h('p', { text: 'New keys generated from the seed — sign a message to continue.' }))
    verifyRegion.replaceChildren()
    announce.replaceChildren(badge('info', `fresh keys from seed ${seeds.d} — downstream results were reset`))
  })

  katBtn.addEventListener('click', () => {
    keys = keygenFrom(DILITHIUM_KAT.A, DILITHIUM_KAT.s1, DILITHIUM_KAT.s2)
    renderKeys()
    const at = signAttempt(keys, DILITHIUM_KAT.y, DILITHIUM_KAT.c)
    lastSig = { c: at.c, z: at.z }
    lastMsg = ''
    lastIsKat = true
    signCounter++
    setVerifyEnabled(true)
    signRegion.replaceChildren(
      h('h4', { text: '2 · Sign: commit to w = A·y, answer z = y + c·s₁, abort if anything leaks' }),
      polyLine('c (challenge, fixed by the slides)', at.c, DP, true),
      vecLines('z = y + c·s₁ (published)', at.z, DP),
      h(
        'ul',
        { class: 'check-list', role: 'list' },
        h('li', { role: 'listitem' }, badge('ok', `‖z‖∞ = ${at.zNormInf} < γ₁ − β = ${gamma1 - beta}`)),
        h('li', { role: 'listitem' }, badge('ok', `‖r₀‖∞ = ${at.r0NormInf} < γ₂ − β = ${gamma2 - beta}`)),
        h('li', { role: 'listitem' }, badge('ok', 'both gates pass — this attempt is safe to publish')),
      ),
      inspect(
        { get open() { return inspectState.kat }, set open(v) { inspectState.kat = v } },
        'Inspect the full attempt (y, w, w₁, r₀)',
        vecLines('y (mask)', DILITHIUM_KAT.y, DP),
        vecLines('w = A·y', at.w, DP),
        vecLines('w₁ = HighBits(w, 2γ₂)', at.w1, DP),
        vecLines('r₀ = LowBits(w − c·s₂, 2γ₂)', at.r0, DP),
      ),
    )
    verifyRegion.replaceChildren(h('p', { text: 'Now press verify — or tamper first.' }))
    announce.replaceChildren(badge('ok', 'worked example replayed: both rejection gates pass, signature ready to verify'))
  })

  signBtn.addEventListener('click', () => {
    const runId = ++signCounter
    void withBusy([signBtn, katBtn, freshKeysBtn], signRegion, async () => {
      const msg = msgInput.value
      const res = await sign(keys, msg, 1000, seededRand((seeds.d ^ 0x5eed) >>> 0))
      if (runId !== signCounter) return // keys/mode changed while signing — drop stale result
      lastSig = res.signature
      lastMsg = msg
      lastIsKat = false
      setVerifyEnabled(true)
      const rows = res.attempts.map((at, i) =>
        h(
          'li',
          { role: 'listitem', class: at.accepted ? 'row-ok' : 'row-bad' },
          at.accepted
            ? badge('ok', `attempt ${i + 1}: ‖z‖∞ = ${at.zNormInf} < ${gamma1 - beta} and ‖r₀‖∞ = ${at.r0NormInf} < ${gamma2 - beta} — accepted`)
            : badge(
                'warn',
                `attempt ${i + 1}: aborted (${at.rejectedBecause === 'z' ? `‖z‖∞ = ${at.zNormInf} too close to the mask — would leak s₁` : `‖r₀‖∞ = ${at.r0NormInf} too big — HighBits could differ`}) — new y, retry`,
              ),
        ),
      )
      signRegion.replaceChildren(
        h('h4', { text: '2 · Sign: commit to w = A·y, answer z = y + c·s₁, abort if anything leaks' }),
        h(
          'p',
          { class: 'panel-note' },
          'Fiat–Shamir with aborts, live: each attempt draws a fresh mask y from the seed; if z or r₀ fails its bound, the attempt is thrown away — that rejection is what keeps s₁ out of the signature distribution.',
        ),
        h('ul', { class: 'check-list', role: 'list' }, ...rows),
        vecLines('z (published)', res.signature.z, DP),
        polyLine('c (published)', res.signature.c, DP, true),
      )
      verifyRegion.replaceChildren(h('p', { text: 'Signature ready — verify it, or tamper first.' }))
      announce.replaceChildren(
        badge('ok', `signed “${msg}” after ${res.attempts.length} attempt${res.attempts.length > 1 ? 's' : ''} (${res.attempts.length - 1} abort${res.attempts.length - 1 === 1 ? '' : 's'})`),
      )
    })
  })

  async function runVerify(msg: string, sig: Signature, label: string, tamperedMsg = false): Promise<void> {
    await withBusy([verifyBtn, tamperMsgBtn, tamperZBtn], verifyRegion, async () => {
      const v = await verify({ A: keys.A, t: keys.t }, msg, sig)
      verifyRegion.replaceChildren(
        h('h4', { text: '3 · Verify: recompute w₁′ = HighBits(A·z − c·t) and compare both sides' }),
        h('p', { class: 'panel-note', text: label }),
        h(
          'ul',
          { class: 'check-list', role: 'list' },
          h(
            'li',
            { role: 'listitem' },
            v.zBoundOk ? badge('ok', `‖z‖∞ = ${v.zNormInf} < ${gamma1 - beta}`) : badge('bad', `‖z‖∞ = ${v.zNormInf} ≥ ${gamma1 - beta} — rejected before any algebra`),
          ),
          h(
            'li',
            { role: 'listitem' },
            v.cPrime === null
              ? badge('bad', 'challenge not recomputed (z out of range)')
              : JSON.stringify(v.cPrime) === JSON.stringify(sig.c.map((x) => mods(x, DILITHIUM_PARAMS.q)))
                ? badge('ok', 'recomputed challenge from w₁′ equals the signed challenge')
                : badge('bad', 'recomputed challenge differs — w₁′ ≠ w₁'),
          ),
        ),
        vecLines('w₁′ = HighBits(A·z − c·t)', v.w1Prime, DP),
        h(
          'p',
          {},
          v.accepted
            ? tamperedMsg
              ? badge(
                  'warn',
                  'SIGNATURE ACCEPTED — a toy-scale forgery: with n = τ = 4 the challenge is just 4 sign bits, so a tampered message re-derives the same challenge about 1 time in 16. ML-DSA’s challenge space (τ = 39–60 of 256 coefficients) makes this chance negligible.',
                )
              : badge('ok', 'SIGNATURE ACCEPTED')
            : badge('bad', 'SIGNATURE REJECTED — the real verifier fails closed'),
        ),
      )
      announce.replaceChildren(
        v.accepted
          ? tamperedMsg
            ? badge('warn', 'verification: tampered message accepted — a toy-scale challenge collision (about 1 in 16)')
            : badge('ok', 'verification: signature accepted')
          : badge('bad', 'verification: signature rejected'),
      )
    })
  }

  /**
   * The slides' worked example fixes c directly (no hash), so its verification
   * is the slides' own check: recompute w₁′ = HighBits(A·z − c·t) and compare
   * with w₁ — "since w₁′ = w₁, H(μ‖w₁′) = H(μ‖w₁) and the signature is accepted".
   */
  function runVerifyKat(sig: Signature, label: string): void {
    const zPos = sig.z.map((f) => f.map((x) => ((x % DP.q) + DP.q) % DP.q))
    const zNormInf = Math.max(...zPos.flat().map((x) => Math.abs(mods(x, DP.q))))
    const zBoundOk = zNormInf < gamma1 - beta
    const target = azMinusCt({ A: keys.A, t: keys.t }, { c: [...sig.c], z: zPos })
    const w1p = target.map((f) => f.map((x) => dilHighBits(x)))
    const w1Match = JSON.stringify(w1p) === JSON.stringify(DILITHIUM_KAT.w1.map((f) => [...f]))
    const accepted = zBoundOk && w1Match
    verifyRegion.replaceChildren(
      h('h4', { text: '3 · Verify: recompute w₁′ = HighBits(A·z − c·t) and compare both sides' }),
      h('p', { class: 'panel-note', text: label }),
      h(
        'ul',
        { class: 'check-list', role: 'list' },
        h(
          'li',
          { role: 'listitem' },
          zBoundOk ? badge('ok', `‖z‖∞ = ${zNormInf} < ${gamma1 - beta}`) : badge('bad', `‖z‖∞ = ${zNormInf} ≥ ${gamma1 - beta} — rejected before any algebra`),
        ),
        h(
          'li',
          { role: 'listitem' },
          w1Match
            ? badge('ok', 'w₁′ equals the signer’s w₁ — the challenge hash would agree')
            : badge('bad', 'w₁′ differs from the signer’s w₁ — the challenge hash would disagree'),
        ),
      ),
      vecLines('w₁′ = HighBits(A·z − c·t)', w1p, DP),
      vecLines('w₁ (signer’s commitment)', DILITHIUM_KAT.w1, DP),
      h('p', {}, accepted ? badge('ok', 'SIGNATURE ACCEPTED') : badge('bad', 'SIGNATURE REJECTED — the real verifier fails closed')),
    )
    announce.replaceChildren(
      accepted ? badge('ok', 'verification: signature accepted') : badge('bad', 'verification: signature rejected'),
    )
  }

  verifyBtn.addEventListener('click', () => {
    if (!lastSig) return
    if (lastIsKat) runVerifyKat(lastSig, 'Verifying the untouched worked-example signature.')
    else void runVerify(lastMsg, lastSig, `Verifying the untouched signature on “${lastMsg}”.`)
  })
  tamperMsgBtn.addEventListener('click', () => {
    if (!lastSig) return
    if (lastIsKat) {
      verifyRegion.replaceChildren(
        h('p', {}, badge('info', 'the worked example fixes the challenge directly and signs no message — use “Sign (live)” to see message tampering rejected')),
      )
    } else {
      void runVerify(
        lastMsg + '!',
        lastSig,
        'Same signature, message changed by one character — the challenge re-derivation should now disagree (though with only 16 toy challenges, it collides about 1 time in 16).',
        true,
      )
    }
  })
  tamperZBtn.addEventListener('click', () => {
    if (!lastSig) return
    const z = lastSig.z.map((f) => [...f])
    z[0][0] += 1
    if (lastIsKat) runVerifyKat({ c: lastSig.c, z }, 'z[1] nudged by +1 — A·z moves, HighBits shifts, w₁′ no longer matches w₁.')
    else void runVerify(lastMsg, { c: lastSig.c, z }, 'z[1] nudged by +1 — A·z moves, HighBits shifts, the recomputed challenge disagrees.')
  })

  const panel = h(
    'div',
    { class: 'subpanel' },
    h('h3', { text: 'toy-Dilithium — the ML-DSA teaching core at q=16417, n=4, (k,ℓ)=(3,2) (slides V3 pp. 106–109)' }),
    h(
      'p',
      { class: 'panel-note' },
      'The exact toy parameters and worked example of the course slides, presented as the slides do: without t-compression or hint bits. ML-DSA-87 (FIPS 204) runs the same commit–challenge–answer–abort loop at scale, plus normative machinery listed below:',
    ),
    h(
      'details',
      {},
      h('summary', { text: 'Toy vs standard — exactly what differs (FIPS 204)' }),
      deltaTable([
        ['Ring dimension n', '4', '256'],
        ['Modulus q', '16417', '8380417'],
        ['(k, ℓ)', '(3, 2)', '(4,4) / (6,5) / (8,7) by parameter set'],
        ['Hash / XOF', 'SHA-256 stand-in', 'SHAKE128/256'],
        ['t compression + hints', 'omitted (slides §V3b)', 'normative (Power2Round, MakeHint/UseHint)'],
        ['Challenge weight τ', '4 of 4 coefficients', '39–60 of 256'],
        ['Encoding', 'none', 'normative bit-packing'],
        ['Security claim', 'none', 'parameter-set security target'],
      ]),
      h(
        'p',
        { class: 'panel-note' },
        h('a', { href: 'https://doi.org/10.6028/NIST.FIPS.204', text: 'FIPS 204 (ML-DSA)' }),
        ' is the normative reference.',
      ),
    ),
    h('div', { class: 'button-row' }, katBtn, signBtn, freshKeysBtn),
    seedRow,
    msgWrap,
    keyRegion,
    signRegion,
    h('div', { class: 'button-row' }, verifyBtn, tamperMsgBtn, tamperZBtn),
    verifyRegion,
    announce,
    h(
      'details',
      {},
      h('summary', { text: 'Why forging needs MSIS (security reduction, sketched)' }),
      h(
        'p',
        {},
        'A forger without s₁ must produce (c, z) with HighBits(A·z − c·t) hashing back to c. Writing A·z − c·t = 2γ₂·w₁ + w₀, that is a short solution (z, −w₀) to the linear system [A | I]·y = c·t + 2γ₂·w₁ — an instance of the (inhomogeneous) Module Short Integer Solution problem, the module version of the SIS panel above (slides V3 p. 111).',
      ),
    ),
    h(
      'p',
      { class: 'what-this-isnt' },
      '⚠ What this isn\'t: SHA-256 stands in for SHAKE, t-compression and hints are omitted, and n = 4 offers no security — the loop is real, the strength is not. Full-parameter ML-DSA lives in crypto-lab-dilithium-seal; lattice attacks on leaky signatures live in crypto-lab-nonce-lattice.',
    ),
  )
  renderKeys()
  signRegion.append(h('p', { text: 'Choose “Replay the slides’ worked example” or sign your own message.' }))
  return panel
}
