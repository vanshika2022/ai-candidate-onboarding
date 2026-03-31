# Niural Scout — AI Hiring Pipeline

> Take-home assignment for the **AI Product Operator** role at Niural.
> Application → AI screening → enrichment → interview scheduling → offer → e-signature → Slack onboarding.

### [Watch the Full Walkthrough →](https://www.youtube.com/watch?v=IsHxpDddllE)

---

## Quick Start

```bash
git clone <repo-url>
cd ai-candidate-onboarding
npm install
cp .env.example .env.local   # Fill in API keys (see Environment Variables below)
npm run dev
```

**Visit:**
- `http://localhost:3000` — candidate portal
- `http://localhost:3000/admin/applications` — admin dashboard (type URL directly)

### Commands

```bash
npm run dev          # Start dev server at localhost:3000
npm run seed         # Seed 9 demo candidates across every pipeline state (no AI calls)
npm run reset        # Clear offers/feedback/Slack — re-test the full flow without re-seeding
npm run build        # Production build
npm run lint         # ESLint
```

**`npm run seed`** creates candidates in every state — rejected, pending review, shortlisted with discrepancy flags, slots held, interviewed (with transcript + feedback), offer sent, hired with Slack DM queued, manual review required, and reschedule requested. Run once after applying migrations.

**`npm run reset`** clears offer letters, interview feedback, and Slack messages, then resets hired/offer_sent candidates back to `interviewed`. Use this to re-test the feedback → offer → sign → Slack flow without re-seeding everything.

**Test the full pipeline live:** Submit a real application (requires `ANTHROPIC_API_KEY` + `TAVILY_API_KEY`). Inject a mock transcript:
```bash
curl -X POST localhost:3000/api/mocks/fireflies \
  -H "Content-Type: application/json" \
  -d '{"application_id": "UUID"}'
```

---

## Tech Stack

| Technology | Why this, not the alternative |
|---|---|
| **Next.js 14 App Router** | Server Actions eliminate a separate API layer. RSC/Client split maps to admin vs. candidate UX. |
| **Supabase** | Managed Postgres + storage bucket for resumes + RLS-bypass via service-role for admin ops. |
| **Claude Opus 4.6** | Resume screening only. Extended thinking for borderline 50-75 cases. More calibrated than Sonnet on career changers. |
| **Claude Sonnet 4.5** | Enrichment, offer drafting, Slack DMs. Synthesis tasks — faster and cheaper, no quality difference. |
| **Claude Haiku 4.5** | Pre-screen triage + schedule preference extraction. ~300ms, ~$0.002/call. |
| **Tavily** | Grounded web search for enrichment. Structured results, no HTML parsing. Anti-hallucination architecture. |
| **Google Calendar v3** | Freebusy queries + TENTATIVE hold & release pattern. Zero double-booking without DB locks. |
| **Fireflies.ai** | GraphQL transcript retrieval + HMAC webhook. Mock endpoint for demo without live account. |
| **Resend** | Transactional email. `RESEND_TO_OVERRIDE` for dev (Resend-recommended pattern). |
| **Zod** | Validates every LLM response before DB write. Silent corruption is worse than a visible failure. |
| **signature_pad** | Canvas e-signature at `/sign/[id]`. Touch-capable, pixel-ratio aware. |

---

## Architecture

```
CANDIDATE                          ADMIN
/jobs  /portal/[id]  /sign/[id]   /admin/applications  /admin/applications/[id]
         │                              │
         ▼                              ▼
┌──────────────────── NEXT.JS 14 APP ROUTER ────────────────────┐
│  Server Actions          Route Handlers                        │
│  apply.ts  schedule.ts   /api/webhooks/fireflies  /api/cron/* │
│  offer.ts  updateStatus  /api/offers/[id]/sign                │
│                          /api/onboarding/slack                 │
└────┬──────────┬──────────┬──────────┬──────────┬──────────────┘
     │          │          │          │          │
     ▼          ▼          ▼          ▼          ▼
  Anthropic   Tavily    Google     Resend     Slack
  (Claude)   (search)  Calendar   (email)    (DMs)
     │
     ▼
  Supabase (Postgres + Storage)
```

**Pipeline:** Applied → Haiku pre-screen → Opus screening → shortlisted (≥70) → Tavily+Sonnet enrichment → admin schedules → 5 tentative calendar holds → candidate confirms 1 → interviewed → Sonnet offer letter → candidate signs → hired → Slack DM

Full architecture diagram, state machine, and phase-by-phase breakdown: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**

---

## Key Decisions

| Decision | What I chose | Why |
|---|---|---|
| **Two-model screening** | Haiku triage → Opus scoring → Sonnet enrichment | Per-task model selection. Opus only where calibration matters (borderlines). Haiku gates obvious rejects. Sonnet for synthesis. |
| **Anti-hallucination enrichment** | Tavily searches first, Claude synthesizes real results | Eliminates invented LinkedIn titles and GitHub repos. Claude can't add beyond what Tavily returned. |
| **Hold & Release scheduling** | 5 TENTATIVE calendar events per candidate | Freebusy API treats tentative as busy. Zero double-booking, no DB locks, no race conditions. |
| **Bias self-check in screening** | Claude evaluates its own score for 4 biases before finalizing | Addresses "biased feedback unfairly ends strong candidacies." Advisory flags, never auto-reject. |
| **Zod on every LLM output** | Schema validation before any DB write | Null score stored as zero looks real. Missing rationale displays as blank. Zod makes failures loud. |
| **Minimal form fields** | 4 fields + resume (AI extracts the rest) | Saves candidate time, accepts ~900 extra tokens/app. At scale: expand forms for high-volume roles. |

Full decision log with options considered and trade-offs: **[DECISIONS.md](DECISIONS.md)**

---

## Token Economy

| Candidate path | AI calls | ~Tokens |
|---|---|---|
| Clear reject (Haiku < 25) | Haiku only | 1,200 |
| Rejected (25–49) | Haiku + Opus | 10,000–12,000 |
| Shortlisted (70+) | Haiku + Opus + Tavily + Sonnet | 18,000–22,000 |
| Full hire (through signing) | All above + Sonnet offer + DM | 23,000–27,000 |

**Guiding principle:** Every token buys a decision code alone can't make. Validation, scheduling, and email are algorithmic (zero tokens). Scoring, synthesis, and drafting are where LLM tokens earn their cost.

**Scale strategy:** Vector pre-filter → batch evaluation → resume chunking → configurable model tiers per deployment size.

Full token analysis, candidate-time-vs-cost trade-off, and 6-stage scale roadmap: **[docs/TOKEN_STRATEGY.md](docs/TOKEN_STRATEGY.md)**

---

## What I'd Build Next

1. **Async job queue** — Form returns instantly, AI runs in background via Inngest/BullMQ. Cuts candidate wait from ~20s to ~2s.
2. **LinkedIn Partner API** — Structured profile data instead of Tavily web scraping. Eliminates common-name ambiguity.
3. **Prompt regression testing** — 50 synthetic resumes with expected score ranges, run on every deploy.
4. **Full RBAC** — Three roles (Recruiter, Hiring Manager, Interviewer) via Supabase Auth. Designed in [docs/RBAC_DESIGN.md](docs/RBAC_DESIGN.md).

---

## Documentation

| Document | What it covers |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | State machine, system diagram, phase-by-phase breakdown, 22 edge cases |
| [docs/AI_UTILIZATION.md](docs/AI_UTILIZATION.md) | Model selection, prompting strategy, bias detection, Unicode sanitization |
| [docs/TOKEN_STRATEGY.md](docs/TOKEN_STRATEGY.md) | Token budget, candidate-time-vs-cost trade-off, 6-stage scale roadmap |
| [docs/RBAC_DESIGN.md](docs/RBAC_DESIGN.md) | Production RBAC design with 3 roles, RLS policies, migration path |
| [DECISIONS.md](DECISIONS.md) | 8 key technical decisions with options considered and reasoning |
| [RESEARCH_APPROACH.md](RESEARCH_APPROACH.md) | AI intelligence layer methodology and limitations |
| [CLAUDE.md](CLAUDE.md) | Full system context for Claude Code (development reference) |

---

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role (server-only) |
| `ANTHROPIC_API_KEY` | Yes | Claude API |
| `TAVILY_API_KEY` | Yes | Web enrichment search |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Optional | Calendar scheduling |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Optional | Calendar scheduling |
| `GOOGLE_CALENDAR_ID` | Optional | Calendar scheduling |
| `FIREFLIES_API_KEY` | Optional | Transcript retrieval (mock available) |
| `RESEND_API_KEY` | Optional | Transactional email |
| `RESEND_FROM_EMAIL` | Optional | Sender address |
| `RESEND_TO_OVERRIDE` | Dev only | Redirect all email to one address |
| `ADMIN_SECRET` | Yes | Bearer token for admin routes |
| `NEXT_PUBLIC_APP_URL` | Yes | Base URL (`http://localhost:3000` for dev) |

Full env var documentation with setup links: **[CLAUDE.md](CLAUDE.md)** → Environment Variables section

---

## Supabase Schema

```bash
# Apply migrations in order:
supabase/migrations/20240101000000_initial_schema.sql
supabase/migrations/20240101000001_phase2_schema.sql
supabase/migrations/20240101000002_intelligence_columns.sql
supabase/migrations/20240101000003_disable_rls.sql
supabase/migrations/20240101000004_interview_link.sql
supabase/migrations/20240101000005_new_status_values.sql
supabase/migrations/add_missing_columns.sql
```

---

Built with [Claude Code](https://claude.ai/code) as the primary coding environment.
