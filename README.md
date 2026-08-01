# Lattice Gentle

**SVP · LWE · SIS · A gentle walk to ML-KEM and ML-DSA** — a browser demo of the lattice foundations of post-quantum cryptography, built on Alfred Menezes' notes *"A gentle introduction to lattice-based cryptography"* ([eprint 2026/1098](https://eprint.iacr.org/2026/1098)) and the companion [cryptography101.ca](https://cryptography101.ca/kyber-dilithium/) Kyber/Dilithium course.

## What It Is

A lattice is the set of integer combinations of a few basis vectors. The same lattice has many bases, and the guiding intuition of lattice-based cryptography is one asymmetry: a **good basis** (short, nearly orthogonal vectors) makes the lattice's short and near vectors easy to find, while a **bad basis** of the *identical* lattice hides them. Hold the intuition loosely: the standardized schemes never hand honest users a secret good basis — their secrets are *short vectors* inside noisy modular equations, and their security is connected to high-dimensional lattice problems through the MLWE/MSIS formulations and security reductions, not a literal basis trapdoor. This demo walks that idea from a draggable 2D picture (SVP, CVP, Babai rounding) through the reduction algorithms that repair bases (Gauss, LLL with the Lovász condition), to the problems cryptography actually ships — **LWE** and **SIS** over F_q — and finally to **toy-Kyber (ML-KEM)** and **toy-Dilithium (ML-DSA)**, run end to end at the teaching notes' exact toy parameters (q=137 and q=16417, n=4).

Everything is computed live in the browser: exact integer lattice arithmetic, an instrumented Gauss and LLL reduction, real F_q and R_q = Z_q[x]/(x⁴+1) algebra, SHA-256 via WebCrypto, real Fiat–Shamir-with-aborts rejection sampling, and a KEM decapsulation with FIPS 203-style implicit rejection (a fallback key, never a visible failure). Fresh-randomness experiments run from a visible seed so any interesting case can be reproduced and shared. Every worked example from the notes and slides runs as a regression test in CI.

**Not production crypto** — a teaching demo. n = 4 offers no security (16 possible Kyber plaintexts), SHA-256 stands in for SHAKE, and 2D lattice problems are easy by design; the demo shows *why* the hardness assumptions have the shape they have, not that they hold.

## Guided and Reference Modes

The page opens in **Guided** mode: a ten-second prediction experiment sits in the first viewport (which basis decodes the target better? — answered by live arithmetic, verified against exhaustive search), and a progress rail walks one exhibit at a time — *Basis → SVP/CVP → Reduce → LWE & SIS → Schemes → Check* — with prev/next navigation and focus moved to each step's heading. **Reference** mode is the original all-on-one-page view for instructors and returning readers; the choice persists. The final *Check* step is a five-question exit check that tests **transfer, not recall**: lattice invariants under change of basis, what the real ML-KEM secret is (never a good basis), LWE-vs-SIS geometry, implicit rejection, and where hardness actually lives.

Deep links open any exhibit directly (`#exhibit-1` … `#exhibit-5`, `#exit-check`), and `?kseed=…&dseed=…` restores seeded experiment state in either mode — the "Copy experiment link" button emits both.

## Exhibits

1. **One lattice, many bases** — drag the basis vectors of the lattice from Example 2.24 of the notes (or type coordinates); exact integer arithmetic proves whether your basis still generates the same lattice, and Babai rounding decodes a draggable target point — the Closest Vector Problem, with the true closest vector found by exhaustive search for comparison. Presets replay the notes' good/bad basis pairs (Ex 2.7/2.8 and 2.24).
2. **Good basis, bad basis** — the Shortest Vector Problem: toggle between the two bases of Examples 2.7/2.8 and watch the highlighted shortest vector (found by brute force, never asserted) stay put while its visibility collapses.
3. **Gauss and LLL, step by step** — a real instrumented reduction: Gauss's algorithm on Examples 9.11 and 9.12 (watch ‖v‖² fall from 1.3×10¹⁰ to 6×10⁵), and full LLL on the 4D basis of Example 9.21 — every size-reduction, every Lovász check, every swap, replayed from the actual trace.
4. **LWE and SIS over F_q** — the notes' Example 4.3 (LWE: m=5, n=3, q=47) and Example 3.2 (SIS: n=3, m=5, q=13) verbatim. Type candidate solutions; both sides of every equation are computed and compared element by element, with independent accept/reject conditions reported independently.
5. **toy-Kyber and toy-Dilithium** — the slides' worked examples reproduced digit for digit, plus seeded fresh modes: encrypt/decrypt with a live noise-budget meter (drag the error size past q/4 and watch decryption break), a Fujisaki–Okamoto KEM whose decapsulation models FIPS 203 implicit rejection (tampered ciphertexts silently yield the fallback key), and Dilithium signing with visible rejection sampling and three tamper buttons the real verifier refuses. Each panel opens with a toy-vs-standard table listing every deliberate deviation from FIPS 203/204.

## When to Use It

- You've heard "Kyber is lattice-based" and want that phrase to mean something concrete.
- You're reading eprint 2026/1098 or taking the cryptography101.ca course and want the worked examples interactive.
- You teach a cryptography course and need a picture of SVP/CVP/LLL that is honest about what's real.
- **Do NOT use it** as a cryptographic implementation of anything — the parameters are toys, the hash is a stand-in, and none of this code is constant-time or side-channel hardened.

## Live Demo

**<https://systemslibrarian.github.io/crypto-lab-lattice-gentle/>**

Drag basis vectors and the CVP target, step the reductions, type LWE/SIS candidates, flip message bits, crank the Kyber noise past the q/4 ceiling, sign messages, and tamper with signatures — every accept/reject decision is made by the genuine arithmetic.

## What Can Go Wrong

- **Kyber decryption failure**: the error polynomial eᵀr + e₂ − sᵀe₁ must stay under q/4 in every coefficient; the demo's noise slider lets you cross the ceiling and watch bits flip. Real ML-KEM chooses parameters so this probability is cryptographically negligible.
- **Explicit failure signals**: a KEM that visibly rejects malformed ciphertexts hands attackers an oracle. FIPS 203 decapsulation therefore *implicitly* rejects — it outputs a pseudorandom fallback key — and the toy KEM models exactly that behavior.
- **Dilithium leakage without aborts**: publishing z = y + c·s₁ when ‖z‖∞ is too large leaks s₁'s distribution; the rejection-sampling loop (visible in Exhibit 5) is the fix, not an optimization.
- **Trusting a basis**: Exhibit 1 shows the same lattice looking trivial or hopeless depending on the basis — "given a basis" is doing enormous work in every lattice hardness statement.
- **Toy-size intuition**: everything here is brute-forceable; hardness only emerges in dimensions in the hundreds.

## Real-World Usage

- **ML-KEM (FIPS 203)** — key establishment in TLS (Chrome/Cloudflare X25519MLKEM768), Signal's PQXDH, Apple iMessage PQ3, AWS KMS hybrid TLS.
- **ML-DSA (FIPS 204)** — the lattice signature of NSA's CNSA 2.0 suite; certificate and firmware signing migrations in progress.
- Both stand on MLWE/MSIS — the module versions of the LWE and SIS problems in Exhibit 4, which are the F_q form of the SVP/CVP geometry in Exhibits 1–3.

## How to Run Locally

```bash
npm ci
npm run dev        # dev server
npm test           # 57 unit tests incl. 32 worked-example KATs
npm run build      # typecheck + production build
npm run test:a11y  # axe (both themes + guided shell), keyboard-only workflows,
                   # forced-colors/reduced-motion, overflow + first-viewport (port 4390)
```

## Related Demos

- [crypto-lab-kyber-vault](https://systemslibrarian.github.io/crypto-lab-kyber-vault/) — full-parameter ML-KEM
- [crypto-lab-dilithium-seal](https://systemslibrarian.github.io/crypto-lab-dilithium-seal/) — full-parameter ML-DSA
- [crypto-lab-nonce-lattice](https://systemslibrarian.github.io/crypto-lab-nonce-lattice/) — lattice attacks on leaky signatures (the attack lab this explainer is not)
- [crypto-lab-lwe-hints](https://systemslibrarian.github.io/crypto-lab-lwe-hints/) — LWE with side-channel hints
- [crypto-lab-pq-families](https://systemslibrarian.github.io/crypto-lab-pq-families/) — the non-lattice PQC families

## Build & Verify

- **57 Vitest unit tests**, colocated in `src/**/*.test.ts`, all passing — round-trips, fail-closed rejections, implicit-rejection behavior (fallback key determinism and separation from the real key), property checks (Gauss output attains λ₁ against brute force; LLL output verified LLL-reduced), and exhaustive solution counts for the LWE/SIS instances.
- **32 worked-example KATs** (regression tests against the teaching sources, not official FIPS/ACVP vectors) replaying examples verbatim from eprint 2026/1098 v1.1 (2D bases, CVP rounding, Gauss 9.11/9.12, Gram–Schmidt 9.6, LLL 9.21, SIS 3.2, LWE 4.3) and the cryptography101.ca slides, August 2024 (R_q arithmetic, MLWE q=541, toy-Kyber pp. 50–51, toy-Dilithium pp. 106–109).
- **Accessibility gate**: `@axe-core/playwright` scans the production build in **both themes** with every exhibit driven into its post-interaction states (including failure, tamper, and implicit-rejection states), plus a separate scan of the guided-mode shell; zero WCAG 2.1 A/AA violations. Also enforced: no horizontal overflow at 320/360/390/768 px and a 200% zoom equivalent (guided *and* reference views), the first experiment fitting a 390×844 first viewport, and **keyboard-only** completion of the guided walkthrough (with focus management asserted), Exhibit 1 editing, and the exit check — alongside forced-colors and reduced-motion runs. Axe coverage is automated; announcement quality is additionally addressed by giving each panel a single concise live region instead of announcing whole tables.
- **Deploy**: GitHub Actions → Pages; unit tests, typecheck, build, and the a11y gate all block a broken deploy.

### Manual checks still open

Two audit items cannot be automated and remain deliberately open:

- **Screen-reader pass**: one manual NVDA walkthrough of each exhibit's primary workflow (automated checks assert concise live regions and keyboard operability, not announcement *quality*).
- **Learner outcome study**: the exit check defines the five measurable outcomes; a usability session with representative novice learners (target: ≥80% first-try transfer without instructor help) has not been run.

---

*One of 170+ browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
