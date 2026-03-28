# Niural Scout — AI Research Methodology

## Overview

Niural Scout is the AI intelligence layer embedded in the candidate application pipeline. It performs two sequential tasks: **resume screening** and (for top candidates) **online profile enrichment**. Both tasks are powered by Claude Opus 4.6 with adaptive thinking.

---

## Task 1: Resume Screening

**Trigger:** Every application submission.

**Model:** `claude-opus-4-6` with `thinking: { type: "adaptive" }`

**Inputs:**
- Extracted resume text (from PDF, DOCX, or TXT via `pdf-parse` / `mammoth`)
- Job title, team, level, description, and requirements from the `jobs` table

**Outputs stored in `ai_analysis` JSONB column:**
| Field | Type | Description |
|---|---|---|
| `score` | `integer (0–100)` | Fit score relative to the job requirements |
| `rationale` | `string` | 2–3 sentence explanation referencing specific matched/missed requirements |
| `sixty_second_brief` | `string` | 3–5 sentence verbal brief for the hiring manager, lead by current role + standout attributes |

**Outputs stored in `structured_data` JSONB column:**
| Field | Type | Description |
|---|---|---|
| `skills` | `string[]` | Extracted technical and soft skills |
| `years_exp` | `integer` | Inferred years of relevant professional experience |
| `education` | `string[]` | Degrees and institutions |
| `employers` | `string[]` | Past and present employers |
| `achievements` | `string[]` | Specific measurable achievements extracted from resume |

**Auto-shortlist rule:** If `score > 80`, `applications.status` is automatically set to `'shortlisted'` and Task 2 is triggered.

---

## Task 2: Online Profile Enrichment

**Trigger:** Only when `score > 80` (shortlisted candidates).

**Rationale:** Enrichment is resource-intensive (additional LLM call with extended thinking). Restricting it to high-scoring candidates ensures cost-efficiency while maximising signal for candidates most likely to advance.

**Model:** `claude-opus-4-6` with `thinking: { type: "adaptive" }`

**Inputs:**
- Candidate full name
- LinkedIn URL (required at application time)
- GitHub / Portfolio URL (optional)
- First 4,000 characters of resume text

**Outputs stored in `research_profile` JSONB column:**
| Field | Type | Description |
|---|---|---|
| `linkedin_summary` | `string` | 3–5 sentence analysis of professional brand, activity patterns, and network signals inferred from LinkedIn URL structure and resume cross-reference |
| `x_findings` | `string` | Assessment of likely X/Twitter presence or thought leadership activity |
| `github_summary` | `string` | Analysis of open-source footprint, contribution patterns, and notable projects (or "No GitHub URL provided") |
| `discrepancy_flags` | `string[]` | Specific inconsistencies between resume claims and expected online presence (e.g., title mismatches, timeline gaps, missing employers) |

---

## Methodology: Simulated Web Research

### Why "simulated"?

Claude Opus 4.6 does **not** have live internet access during these calls. Niural Scout does not perform real-time web scraping or API calls to LinkedIn, GitHub, or X.

Instead, the enrichment prompt instructs the model to:

1. **Parse URL structure** — A LinkedIn handle (e.g., `linkedin.com/in/janesmith-engineer`) provides indirect signals about professional identity and branding choices.
2. **Cross-reference resume claims** — The model compares stated roles, employers, dates, and skills against what a well-maintained online profile *would typically show* for a candidate with that background.
3. **Apply domain knowledge** — Claude's training data includes patterns from millions of professional profiles. It can reason about what a 5-year backend engineer at a major tech company's GitHub likely looks like, even without visiting the URL.
4. **Flag structural inconsistencies** — Gaps that a human recruiter would notice (e.g., a resume claiming a Director title at a well-known company that has no presence on a fresh LinkedIn account).

### What this is NOT:

- **Not a real-time search** — No HTTP requests are made to LinkedIn, GitHub, or any external service.
- **Not a scrape** — The model infers from URL patterns and resume text, not from scraped HTML.
- **Not verified data** — All enrichment output is probabilistic inference, not confirmed fact.

---

## Limitations

| Limitation | Impact | Mitigation |
|---|---|---|
| No live web access | LinkedIn / GitHub profiles not actually visited | Admin should independently verify key claims before hiring decisions |
| URL-only LinkedIn analysis | Cannot read endorsements, posts, or connection count | Use LinkedIn URL as a navigation shortcut in admin view |
| Hallucination risk | AI may infer projects or employers that don't exist | All enrichment fields are clearly labelled "Simulated Research" in the UI |
| GitHub analysis quality | Without reading actual repo content, code quality is estimated | Admin can click through to the provided GitHub URL for direct review |
| No X / Twitter API | X presence is estimated, not fetched | Treat X findings as directional, not factual |
| Resume parsing quality | PDF/DOCX extraction may lose formatting (tables, columns) | Parsed text is stored in `resume_text` for admin review |

---

## Upgrading to Real Web Research (Future)

To replace simulated research with live data, the following integrations would be needed:

1. **LinkedIn** — Requires a LinkedIn Partner API account (or a browser automation solution like Playwright). Direct scraping violates LinkedIn's ToS.
2. **GitHub** — The GitHub REST API (`/users/{username}/repos`, `/users/{username}/events`) is publicly available with rate limits. No auth required for public profiles.
3. **X (Twitter)** — Requires X API v2 Basic tier ($100/mo) for profile and tweet search access.

The server action in `app/actions/apply.ts` is structured so that the `runEnrichment()` function can be extended to make real API calls before passing data to Claude for synthesis — without changes to the rest of the pipeline.

---

## Data Retention & Privacy

All AI analysis data is stored in the `applications` table in Supabase under RLS policies that restrict read access to authenticated admin users. Candidate data is never sent to third-party services other than the Anthropic API for analysis. Resume text is stored server-side only and never surfaced to the candidate-facing UI.
