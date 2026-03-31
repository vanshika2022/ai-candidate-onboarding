# AI Utilization

> Model selection, prompting strategy, bias detection, and why each AI call uses the model it uses.

---

## Model Map

| Task | Model | Thinking | Why this model |
|---|---|---|---|
| Resume screening | `claude-opus-4-6` | Adaptive | Highest-stakes decision — wrong score ends candidacy with no human review. Opus more calibrated than Sonnet on borderline 50–75 cases. |
| Enrichment synthesis | `claude-sonnet-4-5` | No | Synthesis task with structured inputs. Sonnet matches Opus quality at ~70% lower cost. |
| Offer letter drafting | `claude-sonnet-4-5` | No | Structured writing with deterministic inputs. No conflicting signals to reason over. |
| Slack welcome DM | `claude-sonnet-4-5` | No | Short-form writing. Has hardcoded fallback if Claude fails. |
| Schedule preference extraction | `claude-haiku-4-5` | No | Extract "Monday afternoons" → `{ preferred_days: ["monday"], earliest_hour: 12 }`. Code does filtering. |
| Pre-screening (triage) | `claude-haiku-4-5` | No | Gate obvious mismatches before expensive Opus call. ~300ms, ~$0.002. |

---

## Screening — `claude-opus-4-6` with `thinking: { type: 'adaptive' }`

**Why Opus:** Candidates scoring 55–72 have conflicting signals — right skills but wrong level, right experience but at smaller companies, career changers with transferable skills. Sonnet pattern-matches to a surface similarity score. Opus with adaptive thinking reasons through the tension before committing.

**Why adaptive (not always-on):** `{ type: 'adaptive' }` lets the model decide when to reason deeply. Straightforward candidates (clear 90+ or clear 20-) run fast. Ambiguous cases get extended reasoning. Better than always-on thinking (too slow) or no thinking (too shallow on hard cases).

**Prompt architecture:**
- 4 score bands with qualitative descriptions (anchors the scoring distribution)
- `sixty_second_brief` format: "written as if a hiring manager is verbally briefing the CEO"
- Hard constraint: "Return a JSON object ONLY — no markdown, no code fences"
- Post-processing strips accidental fences for robustness
- Output validated against `ScreeningSchema` (Zod)

**File:** `app/actions/apply.ts → runScreening()`

### Bias Detection

The screening prompt includes a self-check step. Before finalizing, Claude evaluates its own scoring for 4 specific biases:

1. Employment gap penalization
2. School prestige overweighting
3. Non-traditional career undervaluation
4. Name/location assumptions

Flags stored in `potential_bias_flags` (part of `ai_analysis` JSONB). Shown as orange "AI Bias Self-Check" warning in admin dashboard. Flags are advisory — they surface concerns to humans, never auto-reject.

**Cost:** ~50 extra output tokens per screening call. Directly addresses the problem statement: "Biased feedback slips through and unfairly ends strong candidacies."

---

## Enrichment — `claude-sonnet-4-5`

**Why Sonnet:** Enrichment is synthesis, not multi-criteria scoring. Inputs are structured Tavily result blocks, output is prose summaries + flag list. Equivalent quality to Opus at lower cost and latency.

**Grounded context architecture (anti-hallucination):**

The naive approach — asking Claude to "research" a candidate — hallucinates. Claude invents plausible LinkedIn titles and GitHub repos.

The actual architecture:
1. Three parallel Tavily searches: `"${name}" site:linkedin.com`, `"${name}" site:github.com`, `"${name}" developer engineer`
2. Results Unicode-sanitized via `sanitizeForClaude()` (strips lone surrogates, invalid XML chars)
3. Claude receives real web data with instructions to synthesize only — not infer beyond the data

Discrepancy flags are grounded in actual search results vs. resume claims. The system distinguishes DISCREPANCY (contradicted by evidence) from UNVERIFIABLE (data not found) — only real contradictions count toward the safety threshold.

**File:** `app/actions/apply.ts → runEnrichment()`

---

## Offer Letter — `claude-sonnet-4-5` (no thinking)

**Why no thinking:** Deterministic inputs (salary, start date, manager, equity). No conflicting signals. Thinking mode adds latency with zero quality benefit on a structured writing task.

Output: complete self-contained HTML with all inline styles. Personalized using `ai_brief` and `key_achievements` from screening.

**File:** `app/actions/offer.ts → generateOffer()` and `app/api/offers/generate/route.ts`

---

## Slack Welcome DM — `claude-sonnet-4-5` (no thinking)

Short-form writing with deterministic inputs (first name, role, start date, manager). ≤150 words. Hardcoded fallback template if Claude fails — Slack onboarding must never block signing.

**File:** `app/api/onboarding/slack/route.ts`

---

## Schedule Preference Extraction — `claude-haiku-4-5`

Cheapest, fastest model. Extracts structured preferences from free text:
- "Monday/Wednesday afternoons" → `{ preferred_days: ["monday", "wednesday"], earliest_hour: 12, latest_hour: 17 }`

**Code does all filtering.** Haiku only parses the natural language. This is reliable because code never mismatches "Monday" with Friday — unlike asking an LLM to pick slots from a list.

**File:** `app/api/schedule/preview-slots/route.ts → extractPreferences()`

---

## Unicode Sanitization

Tavily returns content from arbitrary web pages, including emoji and characters outside valid XML range. `sanitizeForClaude()` strips:
- Lone high surrogates
- Lone low surrogates
- Characters outside valid range (0x09, 0x0A, 0x0D, 0x20–0x7E, 0x80–0xD7FF, 0xE000–0xFFFD)

Applied per-field in `formatTavilyResults()` and again on assembled context strings. Fixes "no low surrogate in string" API errors.

**File:** `app/actions/apply.ts → sanitizeForClaude()`
