# Niural Scout — AI Research Methodology

## Overview

Niural Scout is the AI intelligence layer embedded in the candidate application pipeline. It performs two sequential tasks: **resume screening** (Claude Opus 4.6 with adaptive thinking) and, for shortlisted candidates, **online profile enrichment** (Tavily web search + Claude Sonnet 4.5 synthesis).

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

**Auto-shortlist rule:** If `score >= 70`, `applications.status` is automatically set to `'shortlisted'` and Task 2 is triggered.

---

## Task 2: Online Profile Enrichment

**Trigger:** Only when `score >= 70` (shortlisted candidates).

**Rationale:** Enrichment is resource-intensive (Tavily web searches + Sonnet synthesis). Restricting it to high-scoring candidates saves ~8,000 tokens per rejected candidate while maximising signal for candidates most likely to advance.

**Model:** `claude-sonnet-4-5` (synthesis task — no extended thinking needed)

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

## Methodology: Grounded Web Research via Tavily

### How enrichment works

Enrichment uses real web search data, not LLM inference. The architecture:

1. **Tavily Search API** — Three parallel searches run: `"${name}" site:linkedin.com`, `"${name}" site:github.com`, and `"${name}" developer engineer`. Returns structured results with titles, URLs, and content snippets.
2. **Unicode sanitization** — Tavily content from arbitrary web pages is cleaned (lone surrogates, invalid XML characters stripped) before passing to Claude.
3. **Claude Sonnet synthesis** — Receives real search results as grounded context with instructions to synthesize only what was found. Cannot add information beyond what Tavily returned.
4. **Discrepancy detection** — Compares resume claims against real web findings. Distinguishes between DISCREPANCY (contradicted by evidence) and UNVERIFIABLE (data not found).

### Why this architecture

The naive approach — asking Claude to "research" a candidate — produces hallucinated confidence. Claude invents plausible LinkedIn titles and GitHub repos that don't exist. Tavily-first architecture eliminates this structurally: Claude's task shifts from "research this person" to "synthesize these findings."

### Limitations of Tavily approach

- **Private LinkedIn profiles** return limited data
- **Common names** may match multiple people
- **Tavily search depth** is `basic` (not `advanced`) to control cost
- Production upgrade: LinkedIn Partner API + GitHub REST API for structured, verified data

---

## Limitations

| Limitation | Impact | Mitigation |
|---|---|---|
| Tavily returns limited data on private LinkedIn profiles | Enrichment may be sparse for candidates with restricted profiles | Admin can click through to LinkedIn URL for direct review |
| Common names produce multiple matches | Tavily may return results for a different person with the same name | Discrepancy flags surface mismatches for human verification |
| No direct GitHub API integration | Repo details inferred from Tavily search snippets, not API data | Production upgrade: GitHub REST API for structured repo/contribution data |
| No X / Twitter API | X presence found via general web search, not API | Treat X findings as directional, not verified |
| Resume parsing quality | PDF/DOCX extraction may lose formatting (tables, columns) | Parsed text stored in `resume_text` for admin review |

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
