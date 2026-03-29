# Niural AI Hiring Pipeline — Claude Code Context

## Stack

Next.js 14 App Router, Supabase Postgres + Storage, Claude API (Opus 4.6 + Sonnet 4.5),
Tailwind CSS, Resend, Google Calendar API, Tavily API, Fireflies.ai, signature_pad

---

## Non-negotiable Rules

- **ALWAYS** use `createAdminClient()` from `lib/supabase/server.ts` for all DB ops
- **ALWAYS** use `claude-sonnet-4-5` for enrichment, offer drafting, and Slack messages
- **ALWAYS** use `claude-opus-4-6` with `thinking: { type: 'adaptive' }` for screening only
- **NEVER** expose the service role key to the browser — it must stay in Server Actions and Route Handlers only
- All admin routes must verify `Authorization: Bearer === process.env.ADMIN_SECRET`
- All Resend `send` calls: `const to = process.env.RESEND_TO_OVERRIDE || candidateEmail`
- Every Claude API call must have a Zod schema that validates the response before any DB write
- File uploads are validated server-side before any AI call or storage write (max 3 MB, PDF/DOCX only)

---

## Candidate State Machine

```
applied → pending_review → shortlisted → slots_held → confirmed →
                                                               interviewed → offer_sent → hired
applied → rejected
applied → manual_review_required
```

Full status enum (defined in `lib/supabase.ts → AppStatus`):
`applied` | `screening` | `shortlisted` | `slots_offered` | `slots_held` |
`interview_scheduled` | `confirmed` | `interviewed` | `offer_sent` | `hired` |
`rejected` | `pending_review` | `manual_review_required`

---

## Local Setup

### Prerequisites

Node.js 18+, a Supabase project, and API keys listed below.

```bash
git clone <repo>
cd ai-candidate-onboarding
npm install
cp .env.example .env.local
# Fill in all env vars (see list below)
npm run dev
```

### Environment Variables

| Variable | Required | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase Dashboard → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase Dashboard → Project Settings → API → anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase Dashboard → Project Settings → API → service_role secret key |
| `ANTHROPIC_API_KEY` | Yes | console.anthropic.com → API Keys |
| `TAVILY_API_KEY` | Yes | app.tavily.com → API Keys |
| `FIREFLIES_API_KEY` | Yes | app.fireflies.ai → Integrations → API |
| `FIREFLIES_WEBHOOK_SECRET` | Yes | Set any secure random string here; paste the same value into your Fireflies webhook config |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Yes | Google Cloud Console → IAM → Service Accounts → your account email |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Yes | Google Cloud Console → Service Account → Keys → Add Key → JSON; copy `private_key` value and replace literal `\n` with `\\n` |
| `GOOGLE_CALENDAR_ID` | Yes | Google Calendar Settings → Integrate Calendar → Calendar ID (looks like an email address) |
| `INTERVIEWER_TIMEZONE` | No | IANA timezone string, e.g. `America/New_York`. Defaults to `America/New_York` |
| `RESEND_API_KEY` | Yes | resend.com → API Keys |
| `RESEND_FROM_EMAIL` | Yes | A sender address on your verified Resend domain, e.g. `onboarding@yourdomain.com`. Use `onboarding@resend.dev` for dev (Resend sandbox) |
| `RESEND_TO_OVERRIDE` | Dev only | Your own email. When set, ALL outbound emails are routed here. Required on Resend free tier which restricts unverified recipients |
| `ADMIN_EMAIL` | Yes | Email address that receives hire notification alerts |
| `ADMIN_SECRET` | Yes | Any secure random string. Used as Bearer token for all `/api/offers/*` and `/api/transcripts/*` admin routes |
| `NEXT_PUBLIC_APP_URL` | Yes | Base URL of the app. `http://localhost:3000` for dev, your production domain for prod |

### Supabase Migrations

Run these in order in the Supabase SQL editor or via `supabase db push`:

```
supabase/migrations/20240101000000_initial_schema.sql      — candidates, applications, jobs tables
supabase/migrations/20240101000001_phase2_schema.sql       — offer_letters, transcripts tables
supabase/migrations/20240101000002_intelligence_columns.sql — ai_brief, discrepancy_flags, social_research
supabase/migrations/20240101000003_disable_rls.sql         — disables RLS for prototype (admin client used everywhere)
supabase/migrations/20240101000004_interview_link.sql      — interview_link column on applications
supabase/migrations/20240101000005_new_status_values.sql   — adds pending_review, manual_review_required statuses
supabase/migrations/add_missing_columns.sql                — has_discrepancies column + pending_slack_messages table
```

---

## Tech Stack

| Technology | Version | What it does | Why this choice |
|---|---|---|---|
| `next` | 14.2.35 | React framework — App Router, Server Actions, Route Handlers | Server Components eliminate client/server round-trips for data fetching; Server Actions replace REST endpoints for form submissions |
| `@supabase/supabase-js` | 2.100 | Postgres DB, file storage, real-time | Managed Postgres with a great JS client; storage bucket for resumes with signed URL generation; RLS-bypass via service role for admin operations |
| `@anthropic-ai/sdk` | 0.80 | Claude Opus 4.6 (screening) + Sonnet 4.5 (enrichment, offers) | Native streaming support; `thinking: { type: 'adaptive' }` for extended reasoning on borderline screenings |
| `googleapis` | 171.4 | Google Calendar v3 — freebusy queries, event CRUD, Meet links | Official client handles OAuth and service account auth; `conferenceDataVersion: 1` triggers automatic Meet link generation |
| `resend` | 6.9 | Transactional email for offer delivery, signing confirmation, and hire alerts | Deliverability-focused, simple API, free tier sufficient for prototype volume |
| `signature_pad` | 5.1 | Canvas-based e-signature capture at `/sign/[id]` | Lightweight, touch-capable, pixel-ratio scaling built in; produces `toDataURL('image/png')` for storage |
| `zod` | 4.3 | Runtime validation of all Claude JSON outputs | Silent data corruption (missing score, null rationale) is worse than a visible error; Zod makes LLM failures loud |
| `mammoth` | 1.12 | DOCX text extraction | Handles complex DOCX structure without native Node.js binary dependencies |
| `unpdf` | 1.4 | WASM-based PDF text extraction | Edge-runtime compatible (no native modules); more reliable than `pdf-parse` for Next.js App Router |
| `react-hot-toast` | 2.4 | Toast notifications for form submission errors | Zero-dependency, accessible, works with `useTransition` |
| `lucide-react` | 0.460 | Icon system | Tree-shakeable SVG icons; consistent 14-20px sizing throughout |
| `tailwindcss` | 3.4 | Utility CSS | Dark mode via `class` strategy; custom tokens in `tailwind.config.ts` for `card-border` and `muted` |

---

## System Architecture

Five layers, each with one responsibility:

```
CLIENT LAYER
  /careers          — candidate portal (public)
  /admin            — recruiter dashboard (Bearer-protected)
  /sign/[id]        — offer signing page (public, offer ID = access token)
  /portal/[id]      — candidate slot picker (public, application ID = access token)

API LAYER (Next.js App Router Route Handlers)
  POST /api/offers/generate          — Claude generates HTML offer letter
  POST /api/offers/[id]/send         — Transitions draft→sent, emails candidate
  POST /api/offers/[id]/sign         — Candidate signs; updates DB, sends emails
  GET  /api/transcripts/[appId]      — Fetch Fireflies transcript by application
  POST /api/webhooks/fireflies        — Production HMAC-verified Fireflies webhook
  POST /api/mocks/fireflies           — Demo transcript injection (no live Fireflies needed)

AI WORKER LAYER
  claude-opus-4-6  + thinking:adaptive  — resume scoring (app/actions/apply.ts → runScreening)
  claude-sonnet-4-5 + thinking:adaptive — enrichment synthesis (app/actions/apply.ts → runEnrichment)
  claude-sonnet-4-5                     — offer letter HTML generation (app/api/offers/generate/route.ts)
  Tavily API (3 parallel searches)      — web research for shortlisted candidates

DATA LAYER
  Supabase Postgres — all application state (applications, candidates, jobs, offer_letters, transcripts)
  Supabase Storage  — resume files (private bucket, signed URLs for admin access)

INTEGRATION LAYER
  Google Calendar   — slot holds and confirmed invites (lib/services/calendar.ts)
  Resend            — candidate offer emails, signing confirmation, admin hire alerts
  Fireflies.ai      — interview transcripts via GraphQL API + HMAC webhook
```

---

## Candidate Experience (End to End)

1. Views job listings at `/careers` — pulled from Supabase `jobs` table, filtered to `status = 'open'`
2. Clicks "Apply" — `ApplyModal` opens with form fields: name, email, LinkedIn URL, GitHub URL, resume upload
3. Uploads resume — `DragDropUpload` validates PDF/DOCX ≤ 3 MB client-side before submit
4. Submits form — `submitApplication` Server Action runs on the server:
   - Server re-validates file type and size (never trust client-only validation)
   - Extracts resume text via `unpdf` (PDF) or `mammoth` (DOCX)
   - Uploads file to Supabase Storage private bucket
   - Calls `claude-opus-4-6` with extended thinking to score resume 0–100 against job requirements
5. If score ≥ 70: Tavily searches LinkedIn, GitHub, and general web presence in parallel; Claude Sonnet synthesizes findings and generates `discrepancy_flags`
6. Application stored with status: `shortlisted` (≥70) / `pending_review` (50–69) / `rejected` (<50) / `manual_review_required` (bad file)
7. Success screen in modal shows AI Fit Score and status
8. Admin schedules interview — candidate receives email with link to `/portal/[applicationId]` containing 5 time slot options
9. Candidate picks a slot at `/portal/[id]` — `confirmInterviewSlot` Server Action fires:
   - Selected TENTATIVE Google Calendar event is upgraded to CONFIRMED with Google Meet link
   - All other TENTATIVE holds are deleted
   - Calendar invite with Meet link is sent to candidate's email
10. Interview happens — Fireflies bot joins, records, and POSTs transcript to `/api/webhooks/fireflies`
11. Admin generates offer letter — form at `/admin/applications/[id]` collects salary, equity, start date, manager; Claude Sonnet drafts complete HTML offer letter
12. Admin reviews and clicks Send — candidate receives email with link to `/sign/[offerId]`
13. Candidate reads offer at `/sign/[id]`, draws signature on canvas, checks agreement box, clicks Sign
14. `/api/offers/[id]/sign` validates offer is still `sent`, records signature data, IP, and timestamp; transitions offer → `signed`, application → `hired`
15. Candidate receives confirmation email; admin receives hire alert with candidate details

---

## Admin Experience (End to End)

1. Dashboard at `/admin/applications` — table of all applications, AI score badges, status pills, applied dates
2. Warning badge on any candidate where `has_discrepancies = true` — visible in application list and detail page
3. Candidate detail at `/admin/applications/[id]`:
   - Hero card: name, email, status, role, LinkedIn/GitHub links, resume download (signed URL, 60 min)
   - Intelligence Profile (dark card): AI score ring, 2–3 sentence rationale, discrepancy flags in amber
   - Analysis Detail: 60-second brief written for hiring manager → CEO verbal briefing
   - Structured Profile: skills tags, years experience, education, employers, key achievements
   - Scout Findings: LinkedIn summary, GitHub summary, X/Twitter findings (all grounded in Tavily results)
   - Resume text: raw extracted text for verification
4. Manual Override panel (right column): admin can transition status to any value with a required written note
5. Schedule Interview button (InviteButton component): triggers `scheduleInterview` Server Action which queries Google Calendar freebusy, creates 5 TENTATIVE holds, stores slot data, emails candidate
6. After candidate confirms slot: calendar event upgrades to CONFIRMED, Google Meet link stored in `interview_link`
7. Post-interview: full Fireflies transcript visible at `/api/transcripts/[applicationId]` (admin-only, Bearer auth)
8. Generate Offer form: collects job title, start date, salary, currency, equity, bonus, reporting manager, custom terms; Claude Sonnet drafts offer letter HTML
9. Admin reviews rendered offer letter, clicks Send — candidate email fires via Resend
10. Dashboard updates the moment offer is signed (revalidate = 0 on all admin pages)
11. Admin receives Slack/email notification on hire — includes discrepancy warning if `has_discrepancies = true`

---

## AI Utilization

### SCREENING — claude-opus-4-6 with extended thinking

**Why Opus:** Resume screening is the highest-stakes AI decision in the pipeline. A wrong score at this stage ends a candidacy before it starts, with no human review. Opus produces more consistent, calibrated scores than Sonnet on the borderline 50–75 range where conflicting signals exist.

**Why extended thinking:** Candidates who score 55–72 often have strong signals in some dimensions and weak ones in others — e.g., right skills but wrong level, or the right experience but at smaller companies. `thinking: { type: 'adaptive' }` forces the model to reason through the tension before committing to a number, rather than pattern-matching to a surface similarity score. This produces more defensible outputs on borderline cases.

**Implementation:** `app/actions/apply.ts → runScreening()`. Uses `messages.stream()` with `stream.finalMessage()`. Thinking blocks are skipped when extracting the text response. Output validated against `ScreeningSchema` (Zod).

### ENRICHMENT AND SYNTHESIS — claude-sonnet-4-5 with extended thinking

**Why Sonnet:** Enrichment (synthesizing Tavily results), offer letter drafting, and Slack message generation are synthesis tasks. They require good writing and reasoning but not deep deliberation over conflicting signals. Sonnet is significantly faster and cheaper than Opus for these tasks with no meaningful quality difference in the output.

**Why Tavily first:** Enrichment used to hallucinate — Claude would invent plausible-sounding LinkedIn job titles and GitHub repos that didn't exist. The fix: run Tavily searches first, pass real web results as grounded context, and shift Claude's task from "research this person" to "synthesize these actual findings." Claude cannot add information beyond what Tavily returned.

**Implementation:** `app/actions/apply.ts → runEnrichment()`. Three parallel Tavily searches (LinkedIn, GitHub, general), results formatted as structured context, passed to Claude Sonnet. Output validated against `EnrichmentSchema` (Zod).

### OFFER LETTER DRAFTING — claude-sonnet-4-5 (no thinking)

**Why no thinking:** Offer letter generation is a structured writing task with deterministic inputs (salary, start date, manager). There is no reasoning over conflicting signals. Thinking mode adds latency and tokens with no quality benefit for this task.

**Implementation:** `app/api/offers/generate/route.ts`. Uses `messages.create()` (not streaming). Injects all compensation fields plus `ai_brief` from screening. Strips markdown fences before storing. Output: complete self-contained HTML with all inline styles.

### TOKEN ECONOMY DECISIONS

| Decision | Token impact | Rationale |
|---|---|---|
| Manual form fields (name, email, LinkedIn, GitHub) | ~500 tokens saved per submission | Asking Claude to infer these from free text is unreliable and wastes tokens on parsing |
| File type restriction (PDF/DOCX only, no TXT/images) | Prevents 0-value submissions | Scanned image PDFs produce < 200 chars of extracted text — caught by low-density check before Claude is called |
| 3 MB file size limit | Prevents ~50k+ token resume submissions | Overly large PDFs often contain image scans or embedded media that add no textual signal |
| Enrichment only for score ≥ 70 | ~5,000 tokens saved per rejected candidate | No point researching someone who scored 35. Enrichment is only valuable for candidates already worth a second look |
| First 4,000 chars of resume to enrichment | ~3,000 tokens saved per enrichment call | The header, summary, and first job cover the key signals. Passing the full resume to enrichment wastes tokens on formatting and later career details already captured by screening |
| `sixty_second_brief` in screening schema | Avoids a second Claude call for summaries | Capturing the brief in the same screening call costs ~200 extra output tokens vs. ~2,000 tokens for a separate summarization call |

---

## Architectural Decisions

### 1. TWO UIs NOT RBAC

**What was built:** `/careers` for candidates (no auth), `/admin` for recruiters (Bearer token). No login system.

**Why for prototype:** Role-based access control requires an auth provider (NextAuth, Supabase Auth), session management, middleware, and role tables. For a prototype the priority is a demonstrable pipeline, not auth infrastructure. The `ADMIN_SECRET` Bearer check is sufficient to prevent public access to admin routes.

**Production approach:** Three roles managed via Supabase Auth + RLS policies — Recruiter (sees all candidates), Hiring Manager (sees shortlisted and above), Interviewer (sees only their assigned candidates). Admin routes enforce role via JWT claims, not a shared secret.

### 2. HOLD AND RELEASE CALENDAR STRATEGY

**What was built:** When admin schedules an interview, 5 TENTATIVE events are created on the interviewer's Google Calendar immediately (`createTentativeHolds` in `lib/services/calendar.ts`). These soft-locks prevent any other candidate from seeing the same slot while the first candidate decides. When the candidate confirms one slot, `confirmAndRelease` upgrades the selected event to CONFIRMED (with Google Meet link), and deletes the other 4 TENTATIVE holds atomically in a single operation.

**Why:** The alternative — showing slots to candidates with no holds — creates a race condition where multiple candidates are offered the same slot and two confirm simultaneously. The hold strategy guarantees zero double-booking without database-level locks.

**Production caveat:** TENTATIVE holds are never automatically cleaned up if a candidate doesn't respond. A cron job at `/api/cron/release-expired-holds` should release holds older than 48 hours.

### 3. DISCREPANCY FLAGS ARE ADVISORY

**What was built:** Candidates with discrepancy flags between their resume and Tavily web findings stay shortlisted. `has_discrepancies = true` triggers a warning badge in the admin dashboard. The flags are shown prominently in the Intelligence Profile dark card.

**Why:** Automated rejection based on unverified web research is legally and ethically problematic. Tavily results are imperfect — private LinkedIn profiles return limited data, common names produce multiple matches, and company name variations (e.g. "Google" vs. "Google LLC") can produce false positive flags. The human recruiter makes the final call.

**What this means for hiring:** If a candidate is hired despite flags, the admin email alert explicitly notes the discrepancy warning. The paper trail is maintained.

### 4. MOCK-FIRST INTEGRATION DESIGN

**What was built:** Every external integration has a documented mock path. `POST /api/mocks/fireflies` inserts a realistic 20-sentence fixture transcript (4 speakers, 700s of interview time) and transitions the application to `interviewed` — demonstrating the full downstream pipeline without requiring a live Fireflies account or meeting.

**Why:** External integrations (Fireflies, Google Calendar, Slack) require account setup, live credentials, and real events that can't be reliably reproduced in a demo environment. Mock paths make the full pipeline demonstrable to evaluators from a `git clone + npm run dev`.

**Production requirement:** The mock endpoint must be removed or protected behind `ADMIN_SECRET` before any real candidate data flows through the system.

### 5. ZOD SCHEMA ON EVERY CLAUDE OUTPUT

**What was built:** `ScreeningSchema` and `EnrichmentSchema` in `app/actions/apply.ts` validate every Claude JSON response before any DB write. If Claude returns malformed JSON, a missing field, or an out-of-range score, `ZodError` is thrown, caught by the `try/catch`, and the application is either flagged for `manual_review_required` or the enrichment is silently skipped.

**Why:** Silent data corruption — a null score stored as zero, a missing rationale displayed as blank — is harder to debug and harder to explain to a recruiter than a visible failure. Schema validation makes LLM failures explicit and recoverable.

### 6. OFFER ID AS ACCESS TOKEN

**What was built:** The signing page at `/sign/[id]` is public — no authentication. The UUID offer ID in the URL is the authorization token. The API route `/api/offers/[id]/sign` validates that the offer exists and is in `sent` status before accepting a signature.

**Why:** Requiring a candidate to create an account to sign an offer creates unnecessary friction at the highest-stakes moment of the hiring process. The offer ID is unguessable (UUID v4, 2^122 entropy). Replay attacks are prevented because the first successful sign transitions status to `signed`, and all subsequent POST requests return 400.

---

## Edge Cases

| Case | How it's handled | File |
|---|---|---|
| **Duplicate application** | After candidate upsert, queries `applications` by `candidate_id + job_id`. Returns 400 "already applied" before any AI call or storage write. | `app/actions/apply.ts:285` |
| **Image or scanned PDF resume** | `unpdf` extracts < 200 chars from image-based PDFs. Low-density check fires before any Claude call; application inserted as `manual_review_required` with explanatory rationale. | `app/actions/apply.ts:316` |
| **File too large or wrong format** | Server validates size ≤ 3 MB and type in {PDF, DOCX} before upsert or storage write. `DragDropUpload` catches it client-side first (600ms UX feedback). | `app/actions/apply.ts:265`, `components/DragDropUpload.tsx:33` |
| **Calendar slot conflict (two candidates, same slot)** | TENTATIVE holds created immediately on admin invite. Once a hold exists, `freebusy` query returns that block as busy for all subsequent candidates. No slot is ever offered twice. | `lib/services/calendar.ts → createTentativeHolds` |
| **Candidate doesn't respond to slot offer** | TENTATIVE holds remain. Admin can re-invite with new slots. Production: cron job to release holds older than 48 hours. | `lib/services/calendar.ts` |
| **Borderline AI score (50–69)** | Status set to `pending_review` — not auto-rejected, not auto-shortlisted. Human recruiter views the candidate and makes the call. | `app/actions/apply.ts:300` |
| **Candidate signs offer twice** | `/api/offers/[id]/sign` checks `offer.status === 'signed'` first. Returns 400 "already been signed" with no DB mutation. | `app/api/offers/[id]/sign/route.ts:47` |
| **Discrepancy flags on a hired candidate** | `has_discrepancies` stored permanently in DB. Admin hire-alert email from `/api/offers/[id]/sign` includes an explicit note if the candidate had flags. | `app/api/offers/[id]/sign/route.ts` |
| **Claude returns malformed JSON** | `JSON.parse` or `ZodError` is caught in `try/catch`. Screening failure → application inserted as `applied` with null score. Enrichment failure → silently skipped, application shortlisted without research. | `app/actions/apply.ts` |
| **Fireflies webhook for unknown meeting** | Webhook returns 200 (not 404) for meetings with no matching application email. Prevents Fireflies from retrying indefinitely. | `app/api/webhooks/fireflies/route.ts` |

---

## Trade-offs

| Decision | What production looks like | Why this was right for a prototype |
|---|---|---|
| Shared `ADMIN_SECRET` bearer token for all admin routes | JWT-based auth with Supabase Auth, role claims, and RLS policies | Implementing full RBAC adds 2–3 days of auth infrastructure work. Bearer token is secure enough for a demo environment with a single admin |
| Synchronous Server Action for full pipeline (screening + enrichment ~20–30s) | Async job queue (BullMQ, Inngest) — form submits instantly, AI work runs in background, webhook notifies admin | Synchronous execution is simpler to reason about and debug. A job queue requires Redis or a managed worker service and adds operational complexity not needed for a prototype |
| `RESEND_TO_OVERRIDE` to redirect all email in dev | Proper Resend domain verification + per-environment sender addresses | Resend free tier restricts delivery to verified addresses. Override env var is the correct Resend-recommended dev pattern |
| Mock Fireflies endpoint (`/api/mocks/fireflies`) | Protected behind `ADMIN_SECRET`, removed from production bundle via env-based routing | Demo without a live Fireflies account. Must be protected before real candidates interact with the system |
| Offer ID as signing access token (no login) | Time-limited signed tokens (e.g. JWT with 5-day expiry tied to offer ID) | UUID entropy is sufficient for prototype. JWTs add token management complexity (issuance, refresh, revocation) not needed at this scale |
| Google Service Account for Calendar auth | Per-recruiter OAuth2 so each recruiter's calendar is used | Service account is simpler to configure and sufficient when one calendar is shared by the team. Per-recruiter OAuth requires storing refresh tokens per user |

---

## What I'd Improve With More Time

1. **Async job queue for AI pipeline:** The current Server Action blocks for 20–30 seconds during screening + enrichment. Production systems use a queue (Inngest, BullMQ) — form submission returns immediately, Claude runs in background, status updates via Supabase Realtime subscription.

2. **LinkedIn API or enrichment data provider:** Tavily searches of LinkedIn return limited data on private profiles. A production pipeline uses LinkedIn's Partner API, Clay, or Apollo for structured, verified profile data with employer + title history. This eliminates the common-name ambiguity problem entirely.

3. **Fuzzy employer name matching in discrepancy detection:** "Google" and "Google LLC" don't match literally. Production discrepancy detection uses fuzzy string matching (Levenshtein distance) or a company name normalization service before flagging employer mismatches.

4. **Full RBAC with three roles:** Recruiter (all candidates) → Hiring Manager (shortlisted+) → Interviewer (assigned only). Supabase Auth + JWT role claims + RLS policies replace the shared `ADMIN_SECRET`.

5. **Interviewer feedback form:** A structured post-interview form at `/admin/applications/[id]/feedback` stored in Supabase. Data fed back into a hiring decision view alongside the AI score and transcript.

6. **Offer letter PDF generation:** Render the Claude-generated HTML with Puppeteer or a headless Chrome service, store the PDF in Supabase Storage, attach it to the candidate confirmation email.

7. **48-hour candidate reminder email:** A scheduled cron job (Vercel Cron, Supabase pg_cron) emails candidates who haven't picked an interview slot within 48 hours.

8. **Live Google Calendar credentials for production:** Replace the service account pattern with per-recruiter OAuth2 so the calendar reflects each recruiter's actual schedule, not a shared company calendar.

---

## How This Was Built

This project was built using **Claude Code** (Anthropic's CLI) as the primary coding environment.

**System design first:** CLAUDE.md (this file) was written before any feature code. Each phase began with a spec — describing inputs, outputs, failure modes, and edge cases — before implementation started. This prevented scope creep and kept each phase independently testable.

**Phase-by-phase construction:**
- Phase 1: Candidate portal (`/careers`), application form, resume extraction, Claude Opus screening, Zod validation, Supabase persistence
- Phase 2: Admin dashboard (`/admin`), AI enrichment via Tavily + Claude Sonnet, discrepancy flags, status machine
- Phase 3: Google Calendar integration — hold & release scheduling, candidate slot picker at `/portal/[id]`, Google Meet link generation
- Phase 4: Fireflies.ai webhook with HMAC-SHA256 verification, GraphQL transcript fetch, mock endpoint for demo
- Phase 5: AI offer letter generation (Claude Sonnet), Resend email delivery, in-browser signature capture (`signature_pad`), signing page at `/sign/[id]`

**Mock-first integration philosophy:** Every external integration (Fireflies, Google Calendar, Resend) has a mock path or override env var. This means the full pipeline is demonstrable from `npm run dev` without live external accounts. Mocks are clearly labelled and designed to be removed before production.

**Validation at every boundary:** Form inputs are validated client-side for UX and server-side for security. LLM outputs are validated with Zod before any DB write. External API calls are wrapped in `try/catch` with graceful degradation (enrichment failure doesn't block screening, email failure doesn't block signing).
