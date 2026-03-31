# Token Economy & Scale Strategy

> How every AI token is spent, why, and how the strategy evolves at 10x–1000x volume.

---

## The Core Trade-off: Candidate Time vs. Token Cost

Every hiring pipeline makes a fundamental choice: how much work does the candidate do vs. how much work does the AI do?

```
MORE FORM FIELDS                              FEWER FORM FIELDS
(candidate does the work)                     (AI does the work)
──────────────────────────────────────────────────────────────────►

├─ Name, email, LinkedIn, GitHub         ├─ Just upload resume
├─ Years of experience (dropdown)        ├─ AI extracts everything
├─ Top 3 skills (tag selector)           ├─ AI infers skills from text
├─ Past companies (text fields)          ├─ AI parses employment history
├─ Tools/frameworks (checkboxes)         ├─ AI identifies tech stack
├─ Highest education (dropdown)          ├─ AI finds education section
│                                        │
│  Token cost: LOW (~800 input tokens)   │  Token cost: HIGH (~2,500 input)
│  Candidate time: 5–8 minutes           │  Candidate time: 1–2 minutes
│  Extraction accuracy: 100%             │  Extraction accuracy: ~92%
│  Drop-off risk: HIGHER                 │  Drop-off risk: LOWER
└────────────────────────────────────────└──────────────────────────
```

**What we chose:** 4 structured fields (name, email, LinkedIn, GitHub) + resume upload. Minimal form, AI handles extraction.

**The token math if more fields were added:**

| Field (if added to form) | Tokens saved per app | What the model no longer extracts |
|---|---|---|
| Years of experience (dropdown) | ~150 | No parsing "8+ years" from resume context |
| Top skills (tag selector, pick 5) | ~200 | No inferring skills from job descriptions |
| Past companies (up to 3, text) | ~250 | No parsing employer names from formats |
| Tools/frameworks (checkboxes) | ~200 | No scanning for technology mentions |
| Highest education (dropdown) | ~100 | No locating/parsing education section |
| **Total if all added** | **~900 saved** | **Less work = faster, cheaper, more accurate** |

**When each approach wins:**

| Scenario | Best approach | Why |
|---|---|---|
| **High-volume roles** (500+ apps) | More form fields | 500 × 900 = 450k tokens/day saved. Junior roles expect structured forms. |
| **Executive/senior roles** (< 50 apps) | Minimal form | Senior candidates have low form tolerance. Losing a VP to friction costs more than $0.05 in tokens. |
| **High drop-off funnel** (60%+ abandon) | Minimal form | Every additional field increases abandonment ~4-7%. |
| **Internal hiring/referrals** | More form fields | Motivated candidates, no drop-off risk. Pure upside. |

**Prototype decision:** Optimize for candidate experience at this volume (< 50 apps/day). At scale, forms expand for high-volume roles and stay minimal for senior roles — configurable per job.

---

## Current Token Budget Per Candidate Path

| Candidate path | AI calls made | Estimated tokens |
|---|---|---|
| **Clear reject** (Haiku pre-screen < 25) | Haiku only | ~1,200 |
| **Rejected** (score 25–49) | Haiku + Opus | ~10,000–12,000 |
| **Pending review** (50–69) | Haiku + Opus | ~10,000–12,000 |
| **Shortlisted** (70+) | Haiku + Opus + Tavily×3 + Sonnet | ~18,000–22,000 |
| **Full hire** (through signing) | All above + Sonnet offer + Slack DM | ~23,000–27,000 |

## Every AI Call in the Pipeline

| # | Call | Model | max_tokens | Thinking | Est. input | Trigger |
|---|------|-------|-----------|----------|-----------|---------|
| 1 | Haiku Pre-screen | `claude-haiku-4-5` | 800 | No | ~300–400 | Every application |
| 2 | Opus Screening | `claude-opus-4-6` | 8,000 | Adaptive | ~1,500–2,000 | After Haiku (unless "skip") |
| 3 | Sonnet Enrichment | `claude-sonnet-4-5` | 5,000 | No | ~2,500–3,500 | Score ≥ 70 only |
| 4 | Sonnet Offer Letter | `claude-sonnet-4-5` | 4,096 | No | ~700–1,000 | Per offer generation |
| 5 | Haiku Schedule Extract | `claude-haiku-4-5` | 150 | No | ~150–250 | Reschedule with reason |
| 6 | Sonnet Slack DM | `claude-sonnet-4-5` | 300 | No | ~150–250 | Offer signed |

---

## Design Decisions That Save Tokens Before AI Runs

### 1. Structured form fields (~500 tokens saved per submission)
Name, email, LinkedIn, GitHub as discrete fields — not parsed from free text. HTML form validation solves this for free.

### 2. File validation gates before any AI call
Server-side checks (PDF/DOCX only, ≤ 3 MB, ≥ 200 chars extracted text) run before the Anthropic API is ever called. A 5 MB scanned-image PDF that extracts 12 characters would waste ~2,000 tokens on a meaningless screening call.

### 3. Enrichment gated on score ≥ 70
A candidate who scored 35 never triggers Tavily or Sonnet enrichment. Saves ~8,000 tokens per rejected candidate. At 100 apps/day with 30% shortlist rate: ~560,000 tokens/day saved.

### 4. Resume truncation for enrichment (first 4,000 chars only)
Enrichment gets header + summary + first role only. Later career history is already captured by screening's `structured_data` output. Saves ~3,000 tokens per enrichment call.

### 5. Resume cap: 12,000 chars to Opus screening
Opus receives `resumeText.slice(0, 12000)` — approximately 3,000 tokens or 4-5 pages of content. This covers the signal-dense sections (header, summary, recent 2-3 roles) for any resume. Without this cap, a 10-page academic CV sends ~10,000 tokens; a malicious 3MB text-stuffed PDF could send ~125,000 tokens (~$3+ per submission). Combined with Haiku's 2,000-char cap and enrichment's 4,000-char cap, every AI call in the pipeline has a bounded input cost.

### 6. One-shot sixty_second_brief
Captured in the screening response schema (~200 extra output tokens) instead of a separate summarization call (~2,000 tokens for new prompt + full resume context again).

### 7. Interview scheduling uses zero AI tokens
Pure algorithm: Google Calendar freebusy API → scan 14 days → skip weekends → skip outside 9-5 → skip conflicts → return 5 slots. Haiku (~150 tokens) only fires on reschedule requests to extract preferences from free text. Code does all filtering.

---

## Scale Strategy: What Changes at Volume

### Stage 1 — Minimum Requirements Gate (Before Any AI)

**Problem at 500+/day:** Sending every resume to Opus burns tokens on candidates who don't meet hard requirements (e.g., applying Senior with 1 year experience).

**Approach:** Extract minimum requirements from JD as structured bullet points. Programmatic keyword/pattern check before any AI call:

```
JD requirement: "5+ years backend experience"
Resume scan: regex for year patterns near "experience" → found "2 years"
Result: BELOW_MINIMUM → reject, zero AI tokens
```

**Why not built today — the bias problem:** Rule-based filtering is strict. "5+ years backend" as a hard gate rejects a candidate with 4 years backend + 3 years full-stack who is clearly qualified. A career changer with 10 years in adjacent fields gets filtered before AI can evaluate transferable skills.

The current approach — let Opus see everything and reason with bias self-checks — is deliberately more expensive because it's fairer. At scale, the gate would be a **soft filter** (flag + fast-track to Haiku) rather than a hard reject. The candidate still gets evaluated, just cheaper.

### Stage 2 — Vector Matching (Replace Prompt-Based Relevancy)

**Problem:** Every screening call sends the full JD (~500-800 tokens) + full resume (~1,000-1,500 tokens). The LLM re-reads the JD on every application. 1,000 apps × 800 tokens = 800,000 tokens just on the JD.

**Approach:** Embed JD once. Embed each resume. Cosine similarity as pre-filter:

| Similarity | Action | Token cost |
|---|---|---|
| > 0.85 | Fast-track to Opus | Full screening tokens |
| 0.60–0.85 | Haiku relevancy check | ~1,200 tokens |
| < 0.60 | Auto-reject "role mismatch" | ~$0.0001 (embedding only) |

**Why this is more optimal:** Embedding costs ~$0.0001 vs. ~$0.05 for Opus. Vector similarity answers "is this person even in the right field?" at 500x lower cost.

**Implementation:** JD embeddings in Supabase `pgvector`. Computed once on job creation, cached indefinitely (recomputed only on JD edit).

### Stage 3 — Batch Evaluation (Amortize Prompt Tokens)

**Problem:** System prompt + JD + rubric (~1,500 tokens) sent with every resume. 100 apps = 150,000 tokens of repeated context.

**Approach:** Batch 4 resumes per API call:

```
Individual: 4 × (1,500 + 1,200) = 10,800 input tokens
Batched:    1 × (1,500 + 4×1,200) =  6,300 input tokens
                                      ~40% savings
```

**Trade-off:** Adds latency per call but processes more per dollar. Requires async queue — candidates get "Application received" immediately, score arrives later.

### Stage 4 — Resume Chunking (Handle Large Resumes)

**Current assumption:** Most resumes are 1,000–1,500 tokens (1–2 pages).

**Problem:** Senior/academic/government resumes can hit 5–10 pages (3,000–8,000 tokens). Full text wastes tokens on low-signal content.

**Chunking strategy:**

```
Resume (6,000 tokens)
  │
  ├── Chunk 1: Header + Summary + Recent Role (first 2,000 tokens)
  │   → Primary scoring input (sent to Opus)
  │
  ├── Chunk 2: Earlier career history (tokens 2,001–4,000)
  │   → Sent ONLY if Chunk 1 score is borderline (50–75)
  │
  └── Chunk 3: Education, certifications, publications (4,001+)
      → Metadata extraction only (Haiku, ~200 output tokens)
```

**How to implement:**
1. Estimate tokens: `text.length / 4`
2. If ≤ 2,000: send full resume (no change from current)
3. If > 2,000: split at section boundaries (regex for "Experience", "Education", "Skills")
4. Score Chunk 1. If borderline, re-evaluate with Chunk 1 + Chunk 2
5. Extract metadata from Chunk 3 via Haiku (~150 max_tokens)

**Impact:** 6,000-token resume scoring 85 on Chunk 1 costs ~3,500 instead of ~7,500. Borderline candidates get full context (same cost). Chunking never reduces quality, only cost on clear cases.

### Stage 5 — Model & Subscription Configuration

| Deployment | Screening | Enrichment | Thinking | Strategy |
|---|---|---|---|---|
| **Prototype** (current) | Opus 4.6 | Sonnet 4.5 | Adaptive | Individual eval, full resume |
| **Startup** (< 50/day) | Opus 4.6 | Sonnet 4.5 | Adaptive | Individual eval, full resume |
| **Growth** (50–500/day) | Sonnet 4.5 | Haiku 4.5 | Off | Chunking + min requirements gate |
| **Enterprise** (500+/day) | Vector → Sonnet | Haiku 4.5 | Off | Batching + chunking + vectors |

Model IDs, max_tokens, and thinking mode are environment variables — switching from Opus to Sonnet is a one-line env change, not a code change.

### Stage 6 — Enrichment at Scale

**What 5,000 output tokens covers today:**
- LinkedIn summary: ~800–1,200 tokens
- GitHub summary: ~600–1,000 tokens
- General web findings: ~400–800 tokens
- Discrepancy analysis: ~300–500 tokens

**Scale improvements:**
1. **Direct API scraping** — LinkedIn Partner API + GitHub REST API for structured data. Eliminates HTML parsing uncertainty, resolves private-profile problem.
2. **Interview feedback integration** — Fireflies transcript summary (~2,000 tokens) merges with screening data into one decision-ready view. No additional AI call needed.
3. **Enrichment caching** — Same candidate applying to multiple roles reuses cached enrichment (7-day TTL). Zero token cost on second application.

---

## Token Flow Diagram

```
                    APPLICATION RECEIVED
                           │
                    ┌──────▼──────┐
                    │ File valid? │ ◄── Zero tokens (server validation)
                    │ ≤3MB, PDF/  │
                    │ DOCX, ≥200  │
                    │ chars text  │
                    └──────┬──────┘
                           │ Yes
                    ┌──────▼──────┐
          FUTURE →  │ Vector      │ ◄── ~$0.0001 per resume (embedding)
          (scale)   │ similarity  │     Filters obvious role mismatches
                    └──────┬──────┘
                           │ > 0.60
                    ┌──────▼──────┐
                    │ Haiku       │ ◄── ~1,200 tokens
                    │ pre-screen  │     Routes clear rejects from Opus
                    └──────┬──────┘
                           │ ≥ 25
                    ┌──────▼──────┐
                    │ Opus        │ ◄── ~10,000 tokens (with thinking)
                    │ screening   │     Score + rationale + bias check
                    └──────┬──────┘
                           │ ≥ 70
                    ┌──────▼──────┐
                    │ Tavily ×3   │ ◄── External API (no LLM tokens)
                    │ + Sonnet    │     + ~8,000 tokens for synthesis
                    │ enrichment  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ Scheduling  │ ◄── Zero AI tokens (algorithm only)
                    │ (calendar)  │     Haiku on reschedule (~150 tokens)
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ Sonnet      │ ◄── ~5,000 tokens
                    │ offer       │     Structured writing, no thinking
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ Sonnet      │ ◄── ~500 tokens
                    │ Slack DM    │     Could be a template at scale
                    └─────────────┘
```

**Guiding principle:** Every token should buy a decision that code alone cannot make. Validation, filtering, scheduling, and email delivery are algorithmic. Scoring nuanced resumes, synthesizing web research, and drafting professional correspondence are where LLM tokens earn their cost.

As volume grows, the boundary shifts: more decisions move from "AI evaluates" to "code filters, AI evaluates the survivors."
