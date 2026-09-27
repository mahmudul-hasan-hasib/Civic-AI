# CivicLens — Project Status Report

**Track 01: AI for Digital Public Infrastructure & Governance**
*Build with AI: Code for Communities*

| Field | Value |
|---|---|
| Platform | CivicLens · AI Civic Intelligence Platform |
| App root | `civic-ai/` (Next.js app; git repo root is the parent directory) |
| Audit date | 2026-09-28 |
| Build status | `tsc --noEmit` clean · `eslint src/` clean · `npm run build` passes |
| Head commit | `d4e7857 fix issue` (working tree clean) |
| Files audited | `src/app/page.tsx` (2042 L), `src/app/api/analyze/route.ts` (528 L), `src/app/civic-shared.ts` (398 L), `src/components/CivicMap.tsx` (100 L), `src/app/layout.tsx`, `package.json`, `next.config.ts`, `.gitignore`, `README.md` |

> **Update — critical blocker RESOLVED.** The audit found the AI triage path non-functional (all three configured models returned HTTP 404, so every request fell through to the heuristic). This has since been **fixed and verified end-to-end**: the cascade is now `gemini-3.8-flash` → `gemini-3.1-flash-lite` → `gemini-3.5-flash` with `thinkingConfig` applied per model, malformed model output now cascades instead of silently misclassifying, and responses carry model-aware `confidence` plus a new `active_model` field. Live requests return `is_fallback: false` with a real model. See §5.1.

---

## 1. Executive Summary & Project Identity

**Platform title:** CivicLens · AI Civic Intelligence Platform

**Problem statement.** Citizens report civic problems in the languages they actually speak — Bengali, Hindi, English, and romanised Hinglish with inconsistent spelling. Municipal intake systems expect typed English in a fixed category taxonomy, so most reports are abandoned, mis-filed, or triaged by whoever happens to read them first. Nothing tells a resident *when* their complaint will be resolved, and nothing tells a policymaker that a ward's budget is failing to match where complaints are actually concentrated.

**Target demographic.**
- **Primary:** urban citizens reporting in Bangla or Hindi, including low-literacy users who will not type in English and users on mid-range mobile devices.
- **Secondary:** frontline ward engineers who need a routing queue and an SLA clock.
- **Tertiary:** municipal policymakers and planners who need live triage state plus an evidence base for reallocating capex between service categories.

**Core value proposition.** CivicLens closes the loop between a vernacular citizen report and a municipal budget decision:

```
voice / text in Bangla·Hindi·English
  → in-browser speech-to-text (interim, editable)
  → Gemini triage: translate → categorise → urgency-score → route to department
  → geotag into a 10-ward grid, cluster correlated reports into Super Incidents
  → issue a citizen receipt (tracking ID, reference hash, live SLA countdown)
  → aggregate into a ward-level budget-vs-demand gap view for policymakers
```

The distinguishing claim is **bidirectional accountability**: the citizen gets a verifiable receipt with a countdown and a reference hash they can quote in follow-up, while the policymaker gets the aggregate view that justifies reallocating budget. Neither half is useful alone.

---

## 2. Technical Stack & Architecture Audit

### 2.1 Stack

| Layer | Technology | Version (from `package.json`) |
|---|---|---|
| Framework | Next.js (App Router, Turbopack) | 16.3.6 |
| UI runtime | React / React DOM | 19.2.8 |
| Language | TypeScript, `strict: true` | ^5 |
| Styling | Tailwind CSS v4 via `@tailwindcss/postcss` | ^4 |
| Fonts | Geist Sans / Geist Mono via `next/font` | — |
| Icons | `lucide-react` | ^1.48.0 |
| Mapping | `leaflet` + `react-leaflet` | ^1.9.4 / ^5.0.0 |
| AI SDK | `@google/genai` | ^2.24.0 |
| Lint | ESLint 9 + `eslint-config-next` | 9 / 16.3.6 |

### 2.2 Mapping — commercial API keys: **confirmed none**

- **Basemap:** OpenStreetMap raster tiles, `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, with required ODbL attribution (`src/components/CivicMap.tsx:26–28`).
- **Marker imagery:** Leaflet default icons from `unpkg.com` (`CivicMap.tsx:20–24`).
- **No** Google Maps, Mapbox, or any other commercial/keyed tile provider is referenced. The only credential in the entire application is `GEMINI_API_KEY`, read server-side only.
- **No `next.config.ts` image/remote-pattern config is required** — Leaflet loads tiles as plain browser requests, not through `next/image`. `next.config.ts` is still the unmodified create-next-app stub.
- Map renders client-only: `dynamic(() => import("@/components/CivicMap"), { ssr: false })` with a skeleton fallback (`src/app/page.tsx:92–99`).

### 2.3 Core AI pipeline — `src/app/api/analyze/route.ts`

| Aspect | Implementation |
|---|---|
| SDK | `@google/genai`, constructed as `new GoogleGenAI({ apiKey })` from `process.env.GEMINI_API_KEY` |
| **Configured cascade** | `gemini-3.8-flash` → `gemini-3.1-flash-lite` → `gemini-3.5-flash`, as `CascadeModel` descriptors carrying `tier`, `supportsThinkingBudget`, and `baseConfidence` |
| **Cascade status** | ✅ **Live and verified** — real Google AI responses with `is_fallback: false`; see §5.1 |
| Native system instruction | Passed as `config.systemInstruction` (string, `ContentUnion`), **not** embedded in `contents` — correct SDK usage |
| Structured output | `responseMimeType: "application/json"` + `responseSchema` (`Type.OBJECT`) |
| Required schema fields | `category`, `urgency_score`, `summary_en`, `extracted_location`, `actionable_recommendation`, `assigned_department` |
| Thinking budget | `thinkingConfig: { thinkingBudget: 0 }` applied per descriptor where supported; omitted for models that reject it (e.g. `gemini-flash-lite-latest` returns 400) |
| Malformed output | Throws `ModelOutputError` → advances the cascade; only an exhausted cascade engages the heuristic |
| Response envelope | Also returns `lat`, `lng`, `created_at`, `is_fallback`, `active_model`, `latency_ms`, `confidence` |
| Per-attempt timeout | `AbortSignal.timeout(ATTEMPT_TIMEOUT_MS)` with `ATTEMPT_TIMEOUT_MS = 40_000` |
| Failure handling | Any model error logs and advances to the next model; after the cascade, the heuristic resolver answers |
| **Always-200 contract** | Missing key, blank input, malformed JSON, absent body, and total cascade failure all return HTTP 200 with a complete payload |

**Life-safety enforcement (defence in depth).** Two independent layers, both verified by live test:
1. `isCriticalHazard()` gates on the specified multilingual hazard pattern, then requires either a hard term (sparking, transformer, electrocution, live wire, fire, blast…) or ≥2 soft terms, so a bare "power outage" is *not* mis-flagged as a grid emergency.
2. `normalizeGeminiResult()` re-inspects the model's own output and force-overrides to urgency 5 + `Hazardous Infrastructure & Grid Emergency` + `State DISCOM / Power Emergency Cell` if a hazard signal appears. The model cannot return a 2/5 for a sparking transformer.

Verified live results (heuristic path): transformer sparking (Hindi), live wire over water (Bengali), electrocution risk (English), gas leak → **all U5 / hazard / DISCOM**. Power outage → U4 Electricity. No water → U4 Water Supply. Pothole → U3 Roads. Overflowing bin → U3 Sanitation. Faded markings and park trimming → U2.

### 2.4 Hydration resilience & client-mount stabilization

| Measure | Location | Purpose |
|---|---|---|
| `useSyncExternalStore` mount gate | `page.tsx:598`, constants `174–176` | Server snapshot `false`, client snapshot `true`. Renders only a loading shell during SSR, so the dynamic dashboard is never server-rendered and cannot mismatch. Replaces the `setState`-in-effect pattern, which this repo's `react-hooks/set-state-in-effect` rule rejects. |
| Extension attribute scrubber | `layout.tsx:21, 31–39` | Inline `MutationObserver` stripping `bis_*` / `data-bis*` / `data-bitwarden*` attributes at parse, at `DOMContentLoaded`, and on later attribute mutations. Targets Bitwarden-class injections that cause `Hydration failed`-class attribute mismatches. |
| `suppressHydrationWarning` | `layout.tsx:27, 30`; gate elements `page.tsx:938, 942, 944, 1952` | Root-level plus app-owned markup. |
| Deferred time reads | `SlaCountdown` (`page.tsx:1941`), `RelativeTime` (`512–527`) | Both initialise to `null` and compute in effects, so no `Date.now()` runs during the hydration render. |
| `ssr: false` map import | `page.tsx:92–99` | Leaflet touches `window` at import time. |

Verified: served HTML is 12,078 bytes and contains only the loading shell; no dashboard markup and no seed ticket IDs reach the server response. The scrubber was syntax-checked and passed a mock-DOM simulation covering three injection timings (pre-script, mid-hydration, post-`DOMContentLoaded`) while preserving legitimate attributes such as Next's `hidden`.

### 2.5 Architecture notes

- **No persistence layer.** All state is in-memory React state; seeds are rebuilt on every load. A page refresh wipes submitted tickets.
- **No authentication or role model.** The citizen and policymaker workspaces are client-side tabs, not access-controlled.
- **Budget figures are simulated** and are disclosed as such in the footer and in the exported receipt disclaimer.

---

## 3. Implemented Differentiators

Status legend: **Completed** = implemented and verified · **Partial** = implemented but a dependency or path is not currently exercisable · **Pending** = not implemented.

### 3.1 Vernacular speech-to-text intake — **Completed**

- In-browser Web Speech API via `window.SpeechRecognition ?? window.webkitSpeechRecognition`; **no server-side STT** anywhere in the codebase.
- Languages: `bn-IN` (বাংলা), `hi-IN` (हिन्दी), `en-IN` (English India), selectable via `BN`/`HI`/`EN` chips; script-matched textarea placeholders per language.
- `continuous: true`, `interimResults: true`, `maxAlternatives: 1`; interim text appends live via a base-transcript ref so typed text is never clobbered.
- Six mapped error states (`not-allowed`, `no-speech`, `audio-capture`, `network`, `aborted`, default) — **every message ends with an explicit "type your grievance below" instruction**, so a failed mic never dead-ends the user.
- Editable transcript before submission; original submission text is retained in the receipt.

### 3.2 Municipal Budget vs. Citizen Demand Gap Analysis — **Completed**

- `demandAnalysis(reports, wardScope)` computes per-category complaint share vs. `BASE_BUDGET_ALLOCATION` (Roads 40 / Water 25 / Drainage 15 / Sanitation 10 / Electricity 10), `deficitPct = demandPct − budgetPct`, sorts by deficit, and derives `gapIndex = 100 − Σ min(demand, budget)`.
- Mismatch threshold: `deficitPct > 20`; banner quantifies the reallocation: e.g. *"Drainage absorbs 40.0% of citizen demand but only 15% of ward capex — a 25.0 pp shortfall. Reallocate $250k…"*.
- Ward scope selector: "All wards (city-wide)" plus all 10 wards; each ticket is assigned to a ward by nearest-neighbour Haversine.
- Gap Index is also surfaced as a KPI with colour thresholds (≥45 red, ≥25 amber, else emerald).
- **Verified:** first load yields Drainage +25.0 pp, gap index 25, `$250k` reallocation banner.

### 3.3 Spatial incident clustering & deduplication — **Completed**

- `clusterReports()` joins reports of the **same category** within `CLUSTER_RADIUS_METERS = 500` using the Haversine great-circle formula (6371 km radius).
- Running centroid, member union, latest-report override of summary/location/action, `clusterId = CL-{n}`, sorted by member count then recency.
- **Urgency escalation on join:** second member boosts the cluster by +1 (capped 5); third-and-later joins apply damping to prevent runaway escalation.
- UI: map popups show "Super Incident · Reported by N citizens in the last H hours"; ticket rows show an amber "Consolidated Cluster · N Citizens Impacted" badge; overlays report total citizens impacted.
- **Verified:** the seeded Keraniganj pair (~118 m apart, both Drainage) forms a 2-member cluster whose urgency is correctly boosted 4 → 5.

### 3.4 Bi-directional citizen transparency receipt — **Completed (one minor inconsistency)**

Fields shown: tracking ID `CIVIC-2026-XXXXXXXX`; ward queue; "Dispatched · Under Investigation" status; dispatch department (prefers the AI's `assigned_department`, falls back to a category map); SLA tier label; **live-ticking SLA countdown** (1 s interval, `SLA EXPIRED` on expiry); emergency sub-block for U≥5; resolve-by timestamp otherwise; **reference hash** `REF-XXXXXXXX`; category and urgency badges; location; urgency meter; English summary; recommended action; original submission; geotag.

Actions: copy `CivicLens Receipt {tracking_id} · REF-{reference_hash}` with 2 s confirmation; download a standalone HTML receipt (13-row table, gradient header, disclaimer) as `civic-receipt-{tracking_id}.html`.

Reference hash is a real FNV-1a 32-bit digest of `trackingId:createdAt`, zero-padded to 8 uppercase hex chars.

**Inconsistency (minor):** seeds hash `tracking_id + seed.id` (`page.tsx:416`) while live reports hash `tracking_id + created_at` (`page.tsx:859`). Harmless for the demo, but the seed hash is not derivable from anything shown on the receipt — pick one convention.

### 3.5 Live AI telemetry / resilience indicator — **Working (both branches now reachable)**

- Telemetry state `{ mode: "primary" | "resilient", latency_ms, confidence }`, set on every submission from `is_fallback`.
- Panel shows mode pill ("Primary — Gemini cascade online" vs "Resilient Fail-Safe engaged"), latency in ms, confidence %, and last ticket ID; standby copy before the first submission; explanatory text explaining the fail-safe.
- The receipt additionally shows a fallback banner when the heuristic resolver was used.
- **Now verified in both states:** after the §5.1 fix, live submissions read **"Primary — Gemini cascade online"** with a real model ID and 1.5–9 s latency. The resilient branch is reachable and was exercised deliberately via fault injection (§5.1), which is exactly the resilience the panel claims.

### 3.6 Supporting capabilities — **Completed**

CSV export of all tickets (10 columns, `civic-tickets-YYYY-MM-DD.csv`); priority queue (top 5 by urgency); demand-distribution bars; four KPI cards with progress bars; live session snapshot on the citizen side; severity filters (All / Urgent 4-5 / Critical 5); four-step plain-language pipeline explainer; emergency-escalation advisory; 10 seeded reports with relative timestamps; a deliberate 2-member seed cluster.

### 3.7 Not implemented

Automated test suite (no Jest/Vitest/Playwright); persistence or database; authentication/roles; offline or PWA support; service worker; push notifications; server-side speech-to-text; multilingual UI chrome (only complaint input is vernacular; all dashboard chrome is English); explicit reduced-motion handling.

---

## 4. Hackathon Rubric Alignment (Qualitative Assessment)

No numeric scores are assigned here. Scoring is left to the judges; the assessment below is strictly evidence-based.

### 4.1 Real-World Impact & Actionability

**Evidence observed**
- The output is an *action*, not a label: every receipt carries a department, an SLA tier, a concrete deadline, and a recommended dispatch instruction ("Deploy emergency pumping units within 2 hours, desilt the outfall…").
- The ward budget-vs-demand panel converts complaint distribution into a **budget reallocation figure** (`$250k` on the default dataset) — a decision artefact, not a dashboard widget.
- Clustering converts N duplicate citizen complaints into one Super Incident, which is the difference between "five tickets" and "one incident with five witnesses" for a ward engineer.
- Receipts give citizens standing to follow up (tracking ID + reference hash + live countdown), and the CSV export gives a municipal office an actionable queue file.

**Architectural strengths**
- Urgency is calibrated against explicit life-safety anchors, and the anchors are enforced in code, not merely prompted. A wire on water cannot be scored 2/5 even if the model tries.
- Every failure path still produces a filed, routed, timestamped ticket — the resilience posture matches the "never lose a citizen report" requirement of civic systems.

**Concrete vulnerabilities and gaps**
- **No closed loop back to the municipality.** Nothing is written to a work-order system; routing is advisory. A judge may ask "who actually receives this dispatch?" and the honest answer is a human reading a dashboard.
- **No persistence.** Everything resets on refresh, so the "live" dashboard cannot accumulate a real day's complaints.
- **Budget model is hardcoded and uniform** — all 10 wards share the same `BASE_BUDGET_ALLOCATION`, so the ward selector varies only complaint counts, not budget realism.
- **Simulated figures**, though disclosed in-app and in the receipt footer.
- Ward dataset is Dhaka-centric (Ward 01 · Mirpur … Ward 10 · Uttara) while UI locales are `bn-IN`/`hi-IN`/`en-IN`; a judge may read the geo-data as generic rather than grounded.

### 4.2 Google AI Depth & Technical Resilience

**Evidence observed**
- Correct modern SDK usage: `@google/genai`, native `config.systemInstruction` (not prompt-stuffed), `responseMimeType` + `responseSchema` with an all-required field list, and structured normalisation on the way back.
- A three-rung model cascade with per-attempt `AbortSignal.timeout`, advance-on-any-error, and a heuristic resolver as the terminal fallback.
- Telemetry is first-class: `latency_ms` measured from request start (measured *after* the model call resolves, not before the await), `confidence` (tier-based 0.90–0.97 for the model path, signal-derived 0.70–0.78 for the heuristic), an `active_model` field naming the model that actually answered, and an `is_fallback` flag surfaced in two places in the UI.
- Emergency guardrails: the hazard gate, the hard-term/soft-term distinction that avoids flagging "power outage" as a grid emergency, and the post-hoc force-override of model output.

**Architectural strengths**
- The always-200 contract is comprehensive and was verified against empty, malformed, blank, and body-less requests. For civic infrastructure, "the citizen always gets a receipt" is a genuinely correct product decision.
- Life-safety invariants are enforced outside the model. Prompt-only safety would be a legitimate criticism; this design is not vulnerable to it.
- The heuristic fallback is a real classifier, not a stub — it reproduces the rubric's tiering.

**Concrete vulnerabilities and gaps — all three critical findings from the audit have since been remediated**
- ✅ **All three cascade models were retired/unavailable for this key** (§5.1). The cascade now runs `gemini-3.8-flash` → `gemini-3.1-flash-lite` → `gemini-3.5-flash`, verified live with `is_fallback: false`. "Google AI Depth" is now demonstrated by behaviour, not just by code.
- ✅ **Silent degradation on unparseable model output.** `normalizeGeminiResult` now throws `ModelOutputError` on empty, non-object, unparseable, or schema-invalid output, and the loop advances to the next model. Verified by fault injection: a corrupted primary model recovers at the next rung, and only an exhausted cascade engages the heuristic.
- ✅ **Unverifiable "confidence" number.** The hardcoded `0.92` is gone. Confidence is now derived per model tier (`0.97` primary / `0.95` deep / `0.90` lite) and reduced by `0.03` per omitted optional field, with the heuristic band tightened to `0.70–0.78`. It is still a rule-based estimate, not model logprobs, and is best described that way.
- ✅ **`thinkingConfig` interaction is now handled** per model, which removes the token-truncation cause of invalid JSON.
- **No model-quality evaluation harness.** Nothing measures classification accuracy or urgency calibration against labelled complaints.
- **The 40 s per-attempt timeout is not bounded for the user.** With no client-side `AbortController`, a three-model cascade can keep a citizen staring at a spinner for up to ~120 s. The client `fetch` has no timeout at all. In practice the observed worst case is ~40 s.

### 4.3 Vernacular Edge Inclusion

**Evidence observed**
- Real multilingual input handling, not a translation façade: regex triggers and category keywords in Bangla, Devanagari, and English, including romanised forms; ward/sector/road/landmark extraction in all three scripts; urgency inferred from vernacular trigger words.
- Speech-to-text in `bn-IN`, `hi-IN`, `en-IN` with live interim transcript, editable before submit, and original text preserved in the receipt.
- Script-matched placeholders show a native-language example, so a user who cannot read English still recognises the expected input shape.
- Zero-literacy accommodations: 2-letter `BN`/`HI`/`EN` chips, a four-step visual pipeline explainer, a "Life-safety emergency?" escalation advisory, and a character counter confirming input registered.
- The heuristic fallback means **the product still functions for a non-English speaker during a total AI outage** — arguably the strongest inclusion argument in the build.

**Architectural strengths**
- Degrading to a typed input on every speech failure means voice is an accelerator, never a gate.
- Language handling survives the AI being down; this is a real accessibility property, not a UI promise.

**Concrete vulnerabilities and gaps**
- **Browser-dependent STT.** Web Speech API is unavailable or network-blocked in Firefox and in several mobile browsers; the app degrades to typing, which is exactly the population this feature is meant to serve. No server-side STT fallback exists.
- **The mic button is always rendered and never disabled or hidden** when the API is missing, so unsupported browsers get a control that fails on click.
- **Only the input is vernacular.** All dashboard chrome, receipts, SLA labels, and CSV headers are English-only, so a Bangla-only policymaker or a citizen reading their receipt is not served.
- **No auto language detection**; the user must select the language manually, and a wrong selection degrades transcription quality.
- **No offline or low-bandwidth mode.** A 3G connection with no speech service is a realistic and unhandled case.
- **No `prefers-reduced-motion` handling**; spinners and pulses run unconditionally.
- **The ARIA tablist has no roving tabindex or arrow-key navigation** — semantically a tablist, keyboard-behaved as plain buttons.

---

## 5. Verification Checklist & Remaining Pre-Submission Steps

### 5.1 ✅ RESOLVED — the AI cascade is dead → fixed and verified

**What the audit found.** Live probe of all three originally configured models against the current `GEMINI_API_KEY` (v1beta `generateContent`):

| Previously configured model | HTTP | API response |
|---|---|---|
| `gemini-2.5-flash` | **404** | "This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash…" |
| `gemini-2.0-flash` | **404** | "This model models/gemini-2.0-flash is no longer available. Please update your code to use models/gemini-3.8-flash…" |
| `gemini-1.5-flash` | **404** | "models/gemini-1.5-flash is not found for API version v1beta…" |

At audit time every live POST returned `is_fallback: true` and a `[Heuristic Fallback Redressal]` summary.

**The fix, as applied to `route.ts`.** Models available to this key, probed with the route's actual `systemInstruction` + `responseSchema` payload:

| Now in the cascade | Tier | HTTP | Latency | Schema honoured | Notes |
|---|---|---|---|---|---|
| `gemini-3.8-flash` | primary | 200 | 1.5 s / 11.2 s | ✅ | Also returns **503 "high demand"** intermittently — a live demonstration that the cascade is necessary |
| `gemini-3.1-flash-lite` | lite | 200 | ~1.3 s | ✅ | Fast and stable; `thinkingBudget: 0` accepted |
| `gemini-3.5-flash` | deep | 200 | 20.4 s | ✅ | Slow; good last-resort rung |
| ~~`gemini-flash-latest`~~ | — | 503 / 400 | — | — | Saturated, and **rejects** `thinkingConfig`; not in the cascade |
| ~~`gemini-flash-lite-latest`~~ | — | 200 (no `thinkingConfig`) / 400 (with) | 1.4 s | ✅ | Works, but cannot accept the thinking flag; not in the cascade |

Three changes were applied:
1. **`MODEL_CASCADE` rebuilt as `CascadeModel` descriptors** — each entry carries `id`, `tier`, `supportsThinkingBudget`, and `baseConfidence`, so thinking flags and confidence are per-model rather than global. `thinkingConfig: { thinkingBudget: 0 }` is spread into the config only where supported. Root cause of the old invalid JSON: thinking tokens count against `maxOutputTokens` — `gemini-3.5-flash` returned `finishReason: MAX_TOKENS` with `thoughtsTokenCount: 290`; with the flag, `finish=STOP`, `thoughts=0`.
2. **Malformed output is now a cascade failure.** `normalizeGeminiResult` throws `ModelOutputError` on an empty completion, non-object JSON, unparseable JSON, or a payload missing `category` / `summary_en` / a numeric `urgency_score`. The loop catches it and advances; the cascade is only declared dead once every rung fails.
3. **Telemetry is now model-aware.** `confidence` is tier-based (0.97 / 0.95 / 0.90) minus 0.03 per omitted optional field, heuristic band tightened to 0.70–0.78, and a new `active_model` field names the model that actually answered (`heuristic-fail-safe` on fallback).

**Verification.** Live multilingual posts now return `is_fallback: false` with a real model, e.g. `model=gemini-3.1-flash-lite, conf=0.9, latency≈1.6 s`, hazard cases still forcing U5 / `Hazardous Infrastructure & Grid Emergency` / `State DISCOM / Power Emergency Cell`.

A **latency bug was found and fixed during this work**: `latency_ms` was computed as an argument *before* the awaited model call, so every response reported ~1 ms. It is now measured after the call resolves.

Cascade behaviour was then proved with temporary fault injection (since removed, verified by SHA-256 and a clean typecheck/lint/build):

| Injected fault | Result |
|---|---|
| Primary model's output truncated only | **Recovered at the next rung** — `is_fallback: false`, `active_model=gemini-3.1-flash-lite` |
| Truncated JSON on every model | Cascade exhausted → heuristic, `active_model=heuristic-fail-safe`, `confidence=0.74` |
| Missing required fields | Rejected → heuristic |
| `urgency_score: "high"` (wrong type) | Rejected → heuristic |
| Top-level JSON array | Rejected → heuristic |
| Empty completion | Rejected → heuristic |

Note on method: the first fault-injection run was invalid because `.env.local` is a single line with no trailing newline, so appending the test variable corrupted the API key. The harness was corrected and the file restored to its byte-identical original.

### 5.2 Verified working (as of this audit)

- [x] `npx tsc --noEmit` — clean, strict mode
- [x] `npx eslint src/` — clean
- [x] `npm run build` — succeeds (`/` static, `/api/analyze` dynamic)
- [x] API always-200: empty object, malformed JSON, blank `input_text`, no body
- [x] Hazard classification: transformer / live wire / electrocution / gas leak → U5 + hazard category + DISCOM
- [x] Rubric tiering: power outage U4, no-water U4, pothole U3, overflowing bin U3, faded markings U2, park trimming U2
- [x] Clustering: seeded Keraniganj pair forms a 2-member Super Incident, urgency boosted 4 → 5
- [x] Budget panel: Drainage +25.0 pp mismatch → "$250k" reallocation banner; gap index 25
- [x] Receipt: tracking ID + FNV-1a reference hash, copy action, downloadable HTML receipt, 1 s SLA countdown
- [x] Hydration: served HTML is the loading shell only (12,078 B); no dashboard markup or seed IDs in the response
- [x] Extension scrubber: syntax-checked and passed a mock-DOM simulation across three injection timings
- [x] Secret hygiene: `.env.local` is gitignored and **not tracked**; `GEMINI_API_KEY` is read only in the server route
- [ ] Primary AI path — **blocked by §5.1**

### 5.3 Pre-submission fixes

| # | Priority | Item | Detail |
|---|---|---|---|
| 1 | ✅ **Done** | Restore the AI cascade | **Completed and verified** — new model set, per-model `thinkingBudget`, cascade-on-parse-failure, model-aware `confidence` and `active_model` (§5.1). Live requests return `is_fallback: false`; a `latency_ms` mis-measurement found during the work was also fixed. |
| 2 | 🔴 **High** | Replace `README.md` | The repository still contains the **unedited create-next-app boilerplate** (generic Next.js intro, "Deploy on Vercel" default text). For a judged submission this is the most visible unpolished artifact — it currently communicates nothing about CivicLens. Template below. |
| 3 | 🟠 Medium | No test suite | `tsc`/`lint`/`build` pass, but there is no unit test for the two algorithms that carry the product's credibility: `haversineMeters`/`clusterReports` and `demandAnalysis`. Even a handful of Vitest cases would materially change a "technical execution" impression. |
| 4 | 🟠 Medium | Add a client-side timeout | `handleSubmit` has no `AbortController`; a full cascade can block the UI for ~120 s. Add a 20–30 s client timeout that surfaces the receipt anyway via the resilient path. |
| 5 | 🟠 Medium | `.env.example` | None exists. Note that the `.gitignore` rule `.env*` would ignore `.env.example` too — add a negation (`!.env.example`) when creating it. |
| 6 | 🟡 Low | Filter/export consistency | CSV export and the priority queue both use the unfiltered `reports` array, so the active severity filter does not apply to them. The ward scope selector affects only the budget panel, not the map, KPIs, or ticket list. Judges clicking around will notice. |
| 7 | 🟡 Low | Receipt hash convention | Seeds hash `seed.id`, live reports hash `created_at` (`page.tsx:416` vs `859`). Unify. |
| 8 | 🟡 Low | Branding | `public/` still holds the five default create-next-app SVGs and the default favicon. |
| 9 | 🟡 Low | Capability-gate the mic | Hide or disable the mic button when `SpeechRecognition` is unavailable instead of failing on click. |

**Explicitly verified as *not* a defect:** the `layout.tsx` metadata title is `CivicLens · AI Civic Intelligence Platform` with a correct U+00B7 middle dot. A byte-level check confirms **no U+FFFD replacement character anywhere in the file**, and the served `<title>` is correct. An earlier report of a corrupted character was a false positive caused by PowerShell's ANSI default decoding of the UTF-8 bytes (`0xC2 0xB7` → "Â·"). **No edit was made and none is needed.**

### 5.4 Submission assets

#### A. GitHub README

Current state: **boilerplate — rewrite before submitting.** Required sections:

1. **Header** — CivicLens · AI Civic Intelligence Platform, Track 01, one-line problem statement.
2. **Problem & solution** — the vernacular-report → budget-allocation gap, in three sentences plus one diagram.
3. **Feature list** — vernacular STT (BN/HI/EN) · Gemini triage with strict urgency rubric · 500 m Super Incident clustering · bi-directional receipt with tracking ID, reference hash, and live SLA · ward budget-vs-demand gap analysis · live AI telemetry with fail-safe.
4. **Tech stack** — Next.js 16.3.6, React 19, TypeScript strict, Tailwind v4, Leaflet/react-leaflet on **OpenStreetMap tiles (no commercial map key)**, `@google/genai` ^2.24.0.
5. **Setup** — Node ≥18 → `npm i` → create `.env.local` with `GEMINI_API_KEY=…` → `npm run dev` → <http://localhost:3000>. **Never commit the key.** Add `!.env.example` to `.gitignore` if you ship one.
6. **Architecture** — one block diagram: client (STT, geolocation) → `POST /api/analyze` → systemInstruction + schema → model cascade → heuristic fail-safe → clustering → dashboard/receipt.
7. **Verification** — `npm run lint`, `npx tsc --noEmit`, `npm run build`, plus a curl example showing a U5 hazard response.
8. **Deployment** — Vercel: import, root directory `civic-ai` (nested repo), add `GEMINI_API_KEY` in Environment Variables, deploy. Render alternative: Node 20 web service, `npm ci && npm run build`, start `npm run start`, health check `/`.
9. **Honest limitations** — simulated budget figures, in-memory demo data, browser-dependent STT. Stating these pre-empts judge objections and reads as engineering maturity.

#### B. Demo video outline (3–5 min)

| Time | Scene | Must show |
|---|---|---|
| 0:00–0:30 | Hook | The problem in one line; CivicLens as the bridge from vernacular report to budget decision. |
| 0:30–1:20 | **Citizen intake** | Select বাংলা, record a live complaint such as "পানির উপর বিদ্যুতের তার ঝুলে আছে", show the **interim transcript updating live**, edit it, submit. |
| 1:20–2:10 | **AI triage + receipt** | **The AI Engine Status panel must read "Primary — Gemini cascade online"** — this works now that §5.1 is fixed. Show latency and confidence, U5 + hazard category + DISCOM routing, then the receipt: tracking ID, `REF-` hash, copy + download, SLA countdown at 2 h. |
| 2:10–2:45 | **Clustering** | Policymaker tab: Super Incident popup on the OSM map (2 citizens, Keraniganj), cluster badge in the ticket list, "citizens impacted" overlay, severity filter narrowing the map. |
| 2:45–3:30 | **Budget vs demand** | Drainage at +25 pp, gap index 25, "$250k" reallocation banner, ward selector changing the picture, CSV export, priority queue. |
| 3:30–4:00 | **Resilience** | Explain the fail-safe and the always-200 contract; if time allows, demo a live hazard submission to show the U5 invariant. |
| 4:00–4:30 | Close | Impact statement, deployed URL, QR code to the repo. |

Recording tip: capture the terminal showing a `gemini-3.8-flash` 503 immediately cascading to `gemini-3.1-flash-lite` — it proves the resilience architecture is real, not decorative.

#### C. Slide deck

1. Title, team, Track 01
2. Problem statement and target users
3. Solution overview with architecture diagram
4. **Google AI depth** — systemInstruction rubric, JSON schema, three-rung cascade, hazard invariants, fail-safe
5. Vernacular and edge inclusion — BN/HI/EN STT, typing fallback, no-service resilience
6. The four differentiators, one slide each or a 2×2 grid
7. Live demo flow
8. Impact, tech stack, deployment
9. Limitations and roadmap (persistence, work-order integration, server STT, multilingual chrome)
10. Thank you + repo/QR

#### D. Deployment

**Vercel (recommended).** Import the repository; Framework Preset *Next.js*; **Root Directory `civic-ai`** (the app is nested in the repo root); Environment Variables → add `GEMINI_API_KEY`; build `npm run build`; deploy. Post-deploy smoke test: `GET /` returns 200 and `POST /api/analyze` returns 200 with `is_fallback: false`. OSM tiles need no key and `next.config.ts` needs no image configuration.

**Render (alternative).** Web Service, Node 20, build `npm ci && npm run build`, start `npm run start`, `GEMINI_API_KEY` in Environment, health check path `/`.

---

*End of report. All line references were read directly from source at the commit audited above. Verification results reflect the development environment at `http://localhost:3000` on 2026-09-28.*
