/**
 * Exhibit 5 — toy-Kyber and toy-Dilithium at the exact toy parameters of the
 * course slides, reduced on-screen to MLWE and MSIS. Every number shown is
 * computed by the real algebra in src/kyber and src/dilithium.
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

export function mountExhibitSchemes(root: HTMLElement): void {
  root.append(kyberPanel(), dilithiumPanel())
}

// ---------------------------------------------------------------------------
// toy-Kyber
// ---------------------------------------------------------------------------

function kyberPanel(): HTMLElement {
  const { q } = KYBER_PARAMS
  let A = KYBER_KAT.A
  let sSec = KYBER_KAT.s
  let e = KYBER_KAT.e
  let m = [...KYBER_KAT.m]
  let rnd: KyberRandomness = { r: KYBER_KAT.r, e1: KYBER_KAT.e1, e2: KYBER_KAT.e2 }
  let mode: 'kat' | 'fresh' = 'kat'
  let noiseEta: number = KYBER_PARAMS.eta

  const keyRegion = h('div', { class: 'scheme-region' })
  const encRegion = h('div', { class: 'scheme-region' })
  const decRegion = h('div', { class: 'scheme-region', role: 'status' })
  const kemRegion = h('div', { class: 'scheme-region', role: 'status' })

  const modeRow = h('div', { class: 'button-row', role: 'group', 'aria-label': 'Kyber mode' })
  const katBtn = h('button', { type: 'button', text: 'Worked example from the slides', 'aria-pressed': 'true' })
  const freshBtn = h('button', { type: 'button', text: 'Fresh random keys', 'aria-pressed': 'false' })
  modeRow.append(katBtn, freshBtn)
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
  freshBtn.addEventListener('click', () => {
    mode = 'fresh'
    regenerate()
    katBtn.setAttribute('aria-pressed', 'false')
    freshBtn.setAttribute('aria-pressed', 'true')
  })

  function regenerate(): void {
    const km = randomKeyMaterial()
    A = km.A
    sSec = km.s
    e = km.e
    rnd = randomEncRandomness(noiseEta)
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
    if (mode === 'kat') {
      // switching to live noise leaves the fixed worked example
      mode = 'fresh'
      katBtn.setAttribute('aria-pressed', 'false')
      freshBtn.setAttribute('aria-pressed', 'true')
      regenerate()
    } else {
      rnd = randomEncRandomness(noiseEta)
      update()
    }
  })
  const noiseWrap = h(
    'label',
    { class: 'slider-field', for: 'kyber-noise' },
    h('span', {}, 'Error size η for e₁, e₂ (drag past the ceiling and watch decryption break): '),
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
    // bands: near 0 (and near q) → bit 0; near q/2 → bit 1
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
        `t = A·s + e in R₁₃₇ = Z₁₃₇[x]/(x⁴+1), k = 2. The public key is (A, t); the secret is s. Recovering s from (A, t) is the MLWE problem — the module version of the LWE panel above.`,
      ),
      vecLines('s (secret)', vecMods(sSec, KP), KP),
      vecLines('e (secret noise)', vecMods(e, KP), KP),
      vecLines('t = A·s + e (public)', pk.t, KP),
    )

    const c = encrypt(pk, m, rnd)
    encRegion.replaceChildren(
      h('h4', { text: '2 · Encrypt: hide ⌈q/2⌉·m inside fresh noise' }),
      h('p', { class: 'mono poly-line' }, `message bits m = ${m.join('')}  →  m(x) encoded as ${polyToString(m.map((b) => b * 69), KP)}`),
      vecLines('u = Aᵀ·r + e₁', c.u, KP),
      polyLine('v = tᵀ·r + e₂ + 69·m', c.v, KP),
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
        h('span', {}, `Noise budget: ‖eᵀr + e₂ − sᵀe₁‖∞ = ${budget.normInf}, ceiling q/4 ≈ ${budget.limit.toFixed(2)}. `),
        budget.ok ? badge('ok', 'under the ceiling — rounding must succeed') : badge('bad', 'over the ceiling — rounding can flip bits'),
      ),
      noiseWrap,
    )
  }

  // KEM demo (FO re-encryption)
  const kemBtn = h('button', { type: 'button', text: 'Run KEM: encapsulate → decapsulate' })
  const tamperBtn = h('button', { type: 'button', text: 'Tamper with the ciphertext, then decapsulate' })
  async function runKem(tamper: boolean): Promise<void> {
    const { pk, sk } = keygen(A, sSec, e)
    const enc = await encaps(pk)
    const c2 = tamper ? { u: enc.c.u, v: enc.c.v.map((x, i) => (i === 0 ? (x + 40) % q : x)) } : enc.c
    const dec = await decaps(sk, pk, c2)
    kemRegion.replaceChildren(
      h('p', { class: 'mono poly-line', text: `sender's key  K  = ${enc.K.slice(0, 32)}…` }),
      h('p', { class: 'mono poly-line', text: `receiver's key K′ = ${dec.K ? dec.K.slice(0, 32) + '…' : '(rejected — no key released)'}` }),
      h(
        'p',
        {},
        dec.match
          ? badge('ok', 'FO check passed: re-encryption reproduced the ciphertext byte for byte; keys match')
          : badge('bad', 'FO check failed: re-encrypted ciphertext differs — decapsulation refuses to release a key'),
      ),
    )
  }
  kemBtn.addEventListener('click', () => void runKem(false))
  tamperBtn.addEventListener('click', () => void runKem(true))

  const panel = h(
    'div',
    { class: 'subpanel' },
    h('h3', { text: `toy-Kyber — a working ML-KEM at q=137, n=4, k=2 (slides V2)` }),
    h(
      'p',
      { class: 'panel-note' },
      'The exact toy parameters and worked example of the course slides. Real ML-KEM-768 runs the same three steps with q=3329, n=256, k=3 — only the sizes change, never the shape.',
    ),
    modeRow,
    bitRow,
    keyRegion,
    encRegion,
    decRegion,
    h(
      'details',
      {},
      h('summary', { text: 'The KEM layer: Fujisaki–Okamoto, live' }),
      h(
        'p',
        {},
        'A KEM does not encrypt your message — it transports a random key. Decapsulation decrypts, then re-encrypts what it found and compares ciphertexts before releasing the key (plaintext awareness). Both ciphertexts are computed here for real, with SHA-256 supplying the derandomization.',
      ),
      h('div', { class: 'button-row' }, kemBtn, tamperBtn),
      kemRegion,
    ),
    h(
      'p',
      { class: 'what-this-isnt' },
      '⚠ What this isn\'t: with n = 4 there are only 16 messages — a toy for seeing the mechanism, brute-forceable by inspection. Full-parameter ML-KEM lives in crypto-lab-kyber-vault.',
    ),
  )
  update()
  return panel
}

// ---------------------------------------------------------------------------
// toy-Dilithium
// ---------------------------------------------------------------------------

function dilithiumPanel(): HTMLElement {
  const { gamma1, gamma2, beta } = DILITHIUM_PARAMS
  let keys: DilithiumKeys = keygenFrom(DILITHIUM_KAT.A, DILITHIUM_KAT.s1, DILITHIUM_KAT.s2)
  let lastSig: Signature | null = null
  let lastMsg = ''
  let lastIsKat = false

  const keyRegion = h('div', { class: 'scheme-region' })
  const signRegion = h('div', { class: 'scheme-region', role: 'status' })
  const verifyRegion = h('div', { class: 'scheme-region', role: 'status' })

  function renderKeys(): void {
    keyRegion.replaceChildren(
      h('h4', { text: '1 · Key generation is (again) an MLWE instance' }),
      h(
        'p',
        { class: 'panel-note' },
        't = A·s₁ + s₂ in R₁₆₄₁₇ = Z₁₆₄₁₇[x]/(x⁴+1), (k, ℓ) = (3, 2), η = 10. Public: (A, t). Secret: (s₁, s₂).',
      ),
      vecLines('s₁', vecMods(keys.s1, DP), DP),
      vecLines('s₂', vecMods(keys.s2, DP), DP),
      vecLines('t = A·s₁ + s₂', keys.t, DP),
    )
  }

  const msgInput = h('input', {
    type: 'text',
    id: 'dil-msg',
    value: 'a gentle message',
    maxlength: '80',
  })
  const msgWrap = h('label', { class: 'text-field', for: 'dil-msg' }, h('span', { text: 'Message to sign: ' }), msgInput)

  const katBtn = h('button', { type: 'button', text: 'Replay the slides’ worked example' })
  const signBtn = h('button', { type: 'button', text: 'Sign (live, with rejection sampling)' })
  const freshKeysBtn = h('button', { type: 'button', text: 'Fresh random keys' })

  freshKeysBtn.addEventListener('click', () => {
    keys = dilithiumRandomKeys()
    lastSig = null
    renderKeys()
    signRegion.replaceChildren(h('p', { text: 'New keys generated — sign a message to continue.' }))
    verifyRegion.replaceChildren()
  })

  katBtn.addEventListener('click', () => {
    keys = keygenFrom(DILITHIUM_KAT.A, DILITHIUM_KAT.s1, DILITHIUM_KAT.s2)
    renderKeys()
    const at = signAttempt(keys, DILITHIUM_KAT.y, DILITHIUM_KAT.c)
    lastSig = { c: at.c, z: at.z }
    lastMsg = ''
    lastIsKat = true
    signRegion.replaceChildren(
      h('h4', { text: '2 · Sign: commit to w = A·y, answer z = y + c·s₁, abort if anything leaks' }),
      vecLines('y (mask)', DILITHIUM_KAT.y, DP),
      vecLines('w = A·y', at.w, DP),
      vecLines('w₁ = HighBits(w, 2γ₂)', at.w1, DP),
      polyLine('c (challenge)', at.c, DP, true),
      vecLines('z = y + c·s₁', at.z, DP),
      h(
        'ul',
        { class: 'check-list', role: 'list' },
        h('li', { role: 'listitem' }, badge('ok', `‖z‖∞ = ${at.zNormInf} < γ₁ − β = ${gamma1 - beta}`)),
        h('li', { role: 'listitem' }, badge('ok', `‖r₀‖∞ = ${at.r0NormInf} < γ₂ − β = ${gamma2 - beta}`)),
        h('li', { role: 'listitem' }, badge('ok', 'both gates pass — this attempt is safe to publish')),
      ),
    )
    verifyRegion.replaceChildren(h('p', { text: 'Now press verify — or tamper first.' }))
  })

  signBtn.addEventListener('click', () => {
    void (async () => {
      const msg = msgInput.value
      const res = await sign(keys, msg)
      lastSig = res.signature
      lastMsg = msg
      lastIsKat = false
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
          'Fiat–Shamir with aborts, live: each attempt draws a fresh mask y; if z or r₀ fails its bound, the attempt is thrown away — that rejection is what keeps s₁ out of the signature distribution.',
        ),
        h('ul', { class: 'check-list', role: 'list' }, ...rows),
        vecLines('z (published)', res.signature.z, DP),
        polyLine('c (published)', res.signature.c, DP, true),
      )
      verifyRegion.replaceChildren(h('p', { text: 'Signature ready — verify it, or tamper first.' }))
    })()
  })

  const verifyBtn = h('button', { type: 'button', text: 'Verify' })
  const tamperMsgBtn = h('button', { type: 'button', text: 'Verify against a tampered message' })
  const tamperZBtn = h('button', { type: 'button', text: 'Tamper with z, then verify' })

  async function runVerify(msg: string, sig: Signature, label: string): Promise<void> {
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
      h('p', {}, v.accepted ? badge('ok', 'SIGNATURE ACCEPTED') : badge('bad', 'SIGNATURE REJECTED — the real verifier fails closed')),
    )
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
    const at = { c: sig.c, z: zPos }
    const target = azMinusCtLocal(at)
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
  }

  function azMinusCtLocal(sig: { c: readonly number[]; z: number[][] }): number[][] {
    return azMinusCt({ A: keys.A, t: keys.t }, { c: [...sig.c], z: sig.z })
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
      void runVerify(lastMsg + '!', lastSig, 'Same signature, message changed by one character — the challenge re-derivation must now disagree.')
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
    h('h3', { text: 'toy-Dilithium — a working ML-DSA at q=16417, n=4, (k,ℓ)=(3,2) (slides V3)' }),
    h(
      'p',
      { class: 'panel-note' },
      'The exact toy parameters and worked example of the course slides, without t-compression. Real ML-DSA-87 runs the same loop with q=8380417, n=256, (k,ℓ)=(8,7).',
    ),
    h('div', { class: 'button-row' }, katBtn, signBtn, freshKeysBtn),
    msgWrap,
    keyRegion,
    signRegion,
    h('div', { class: 'button-row' }, verifyBtn, tamperMsgBtn, tamperZBtn),
    verifyRegion,
    h(
      'details',
      {},
      h('summary', { text: 'Why forging needs MSIS' }),
      h(
        'p',
        {},
        'A forger without s₁ must produce (c, z) with HighBits(A·z − c·t) hashing back to c. Writing A·z − c·t = 2γ₂·w₁ + w₀, that is a short solution (z, −w₀) to the linear system [A | I]·y = c·t + 2γ₂·w₁ — an instance of the (inhomogeneous) Module Short Integer Solution problem, the module version of the SIS panel above (slides V3 p. 111).',
      ),
    ),
    h(
      'p',
      { class: 'what-this-isnt' },
      '⚠ What this isn\'t: SHA-256 stands in for SHAKE, t is uncompressed, and n = 4 offers no security — the mechanism is real, the strength is not. Full-parameter ML-DSA lives in crypto-lab-dilithium-seal; lattice attacks on leaky signatures live in crypto-lab-nonce-lattice.',
    ),
  )
  renderKeys()
  signRegion.append(h('p', { text: 'Choose “Replay the slides’ worked example” or sign your own message.' }))
  return panel
}
