# Technical Decisions

> Each entry documents a significant technical choice — what alternatives existed and why I chose what I did.
> Format: simplified [Architecture Decision Records](https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions) (Michael Nygard).

---

### D-008: Candidate Time vs. Token Cost — Minimal Form Fields
**Status:** Accepted

**Problem:** More structured form fields (years of experience, skills, past companies) save ~900 tokens per submission by removing extraction work from the LLM. But more fields increase candidate drop-off (~4-7% per field).

**Options:**
1. Extensive form (8+ fields) — cheapest tokens, worst candidate experience
2. Minimal form (4 fields + resume) — more tokens, best completion rate
3. Configurable per job — minimal for senior roles, structured for high-volume roles

**Decision:** Option 2 for prototype, designed for Option 3 at scale.

**Why:** At < 50 apps/day, the extra ~900 tokens/submission costs ~$2/day. Losing a strong candidate to form friction costs infinitely more. Senior candidates have low tolerance for lengthy intake forms. At 500+/day, the math flips and Option 3 becomes worth the engineering investment.

---

### D-007: Two-Stage Screening — Haiku Pre-screen Before Opus
**Status:** Accepted

**Problem:** Running Opus on every resume is expensive (~$0.05/submission). Many applications are clear mismatches that don't need deep evaluation.

**Options:**
1. Opus for everything (highest quality, highest cost)
2. Sonnet for everything (fast, cheap, inconsistent on borderlines)
3. Haiku pre-screen → Opus only for viable candidates

**Decision:** Option 3.

**Why:** Haiku pre-screen costs ~$0.002 and takes ~300ms. Candidates scoring < 25 (wrong field, no experience) skip Opus entirely. Saves ~60% of Opus costs at scale. No quality loss on candidates that matter — Haiku only gates, it doesn't make final decisions.

---

### D-006: Opus for Screening, Sonnet for Everything Else
**Status:** Accepted

**Problem:** Need AI for scoring, enrichment, offer drafting, and messages. Single model or split?

**Options:**
1. Opus for everything (highest quality, 10x cost)
2. Sonnet for everything (fast, cheap, less reliable on borderlines)
3. Opus for screening only, Sonnet for synthesis tasks

**Decision:** Option 3.

**Why:** Screening is the highest-stakes AI decision — a wrong score ends a candidacy with no human review. Tested Sonnet on borderline resumes (50-72 range) and found inconsistent calibration on career changers and non-traditional backgrounds. Opus with extended thinking produces more defensible scores. Enrichment and offer drafting are synthesis tasks where Sonnet matches Opus quality at ~70% lower cost.

**What I learned:** Model selection should be per-task, not per-project.

---

### D-005: Tavily-First Enrichment (Anti-Hallucination Architecture)
**Status:** Accepted

**Problem:** Enrichment needs to surface a candidate's online presence (LinkedIn, GitHub, web). Asking Claude directly produces confident hallucinations — invented job titles, fake repos.

**Options:**
1. Ask Claude to "research" the candidate (hallucinates)
2. Run web searches first, pass results as grounded context to Claude
3. Use LinkedIn/GitHub APIs directly (requires enterprise accounts)

**Decision:** Option 2.

**Why:** Shifts Claude's task from "research this person" (generative, hallucination-prone) to "synthesize these findings" (grounded, verifiable). Claude cannot add information beyond what Tavily returned. Discrepancy flags are grounded in real data vs. resume claims, not LLM imagination. Option 3 is the production upgrade path but requires API partnerships not available for a prototype.

---

### D-004: Hold & Release Calendar Strategy
**Status:** Accepted

**Problem:** When offering interview slots, two candidates could pick the same time simultaneously.

**Options:**
1. Show available slots with no holds (race condition)
2. Database-level locking on slot selection
3. Immediately create TENTATIVE calendar events as soft-locks

**Decision:** Option 3.

**Why:** TENTATIVE events appear as "busy" in Google Calendar's freebusy API. Each candidate gets their own 5 unique holds — no shared pool, no race condition. When one is confirmed, the other 4 are deleted atomically. Zero double-booking without any database locking. Works at any scale with no code changes — the calendar API handles concurrency.

---

### D-003: Zod Validation on Every Claude Output
**Status:** Accepted

**Problem:** LLM outputs are non-deterministic. A missing score, null rationale, or malformed JSON could silently corrupt the database.

**Options:**
1. Trust Claude's output (hope for the best)
2. Regex-based validation (brittle)
3. Zod schema validation before any DB write

**Decision:** Option 3.

**Why:** Silent data corruption is harder to debug and explain than a visible failure. A null score stored as zero looks like a real score. A missing rationale displays as blank. Zod makes LLM failures loud and recoverable — parsing failure routes to `manual_review_required`, never a crash, never silent corruption.

---

### D-002: Discrepancy Flags as Advisory (Not Auto-Reject)
**Status:** Accepted

**Problem:** Enrichment sometimes finds mismatches between resume claims and web findings. Should the system auto-reject on discrepancies?

**Options:**
1. Auto-reject on any discrepancy (strict, risky)
2. Auto-reject on 3+ discrepancies (threshold)
3. Always advisory — flag for human review, never auto-reject

**Decision:** Option 3, with a safety gate: 3+ flags block auto-scheduling and move to `pending_review`.

**Why:** Automated rejection based on unverified web research is legally and ethically problematic. Tavily results are imperfect — private profiles, common names, company name variations ("Google" vs "Google LLC") produce false positives. The recruiter sees all flags and makes the final call. The safety gate ensures high-flag candidates get human attention before proceeding.

---

### D-001: Two UIs, Not RBAC
**Status:** Accepted (prototype)

**Problem:** Need separate access for candidates and admins.

**Options:**
1. Full RBAC with Supabase Auth + 3 roles (Recruiter, Hiring Manager, Interviewer)
2. Two separate UIs with Bearer token on admin routes
3. Single UI with login (shared auth, role-based views)

**Decision:** Option 2.

**Why:** RBAC requires auth provider setup, session management, middleware, and role tables — 2-3 days of infrastructure work with no functional benefit for a prototype with a single admin. Bearer token is secure enough for demo. Production: three roles via Supabase Auth + JWT claims + RLS policies (designed in `docs/RBAC_DESIGN.md`).
