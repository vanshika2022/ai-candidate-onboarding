# Niural Scout — AI Hiring Pipeline

> Take-home assignment submission for the **AI Product Operator** role at Niural.
> Built in Next.js 14 App Router with Claude Opus 4.6 + Sonnet 4.5, Supabase, Google Calendar, Tavily, Fireflies.ai, Resend, and Slack.

---

## Overview

Niural Scout is a full-stack, AI-native hiring pipeline that takes a candidate from job discovery through resume screening, online profile enrichment, interview scheduling, post-interview transcript analysis, offer generation, and Slack onboarding — with minimal human involvement until the pipeline surfaces a decision-ready candidate.

The system is designed around a **single-direction state machine**. Every application has a `status` field in Supabase that only advances forward (or to explicit terminal states). No application ever moves backward through the pipeline unless an admin manually overrides it with a logged note.

### Two UIs, Not RBAC

The system has two completely separate UIs with no shared auth:

| UI | Path | Who it's for | Auth |
|---|---|---|---|
| **Candidate portal** | `/`, `/jobs`, `/jobs/[id]`, `/portal/[id]`, `/sign/[id]` | Applicants | None — public |
| **Admin dashboard** | `/admin/applications`, `/admin/applications/[id]` | Recruiters | Bearer `ADMIN_SECRET` on API routes only |

The admin dashboard is intentionally not linked from any candidate-facing page. It is only reachable by typing the URL directly. This is the correct approach for a prototype — adding NextAuth or Supabase Auth would require user seeding, OAuth app registration, and session management that are out of scope for a demo. In production, this would be replaced with three roles (Recruiter, Hiring Manager, Interviewer) backed by Supabase Auth + RLS policies.

### Application State Machine

```
                         ┌─────────────────────────────────────────────────────────────┐
                         │                    SUBMISSION                                │
                         └──────────────────────────┬──────────────────────────────────┘
                                                     │
                                                     ▼
                                            submitApplication()
                                         app/actions/apply.ts
                                                     │
                          ┌──────────────────────────┼──────────────────────────┐
                          │                           │                          │
                          ▼                           ▼                          ▼
              PDF extraction fails          Text < 200 chars            Screening runs OK
              or throws exception          (scanned image PDF)         (Claude Opus 4.6)
                          │                           │                          │
                          ▼                           ▼                          │
                 manual_review_required    manual_review_required                │
                                                                    ┌────────────┼────────────┐
                                                                    │            │            │
                                                                    ▼            ▼            ▼
                                                               score < 50   score 50–69  score >= 70
                                                                    │            │            │
                                                                    ▼            ▼            ▼
                                                                rejected   pending_review  shortlisted ──► runEnrichment()
                                                                                                         Tavily × 3 searches
                                                                                                         Claude Sonnet 4.5
                                                                                                              │
                                                                                                              ▼
                                                                                                         [admin reviews]
                                                                                                         has_discrepancies
                                                                                                         badge shown if set
                                                                                                              │
                                                                                                              ▼
                                                                                                      scheduleInterview()
                                                                                                   app/actions/schedule.ts
                                                                                                   Google freebusy query
                                                                                                   5 TENTATIVE holds created
                                                                                                              │
                                                                                                              ▼
                                                                                                         slots_held
                                                                                             [48hr cron nudge if no response]
                                                                                                              │
                                                                                               candidate visits /portal/[id]
                                                                                                              │
                                                                                                              ▼
                                                                                                    confirmInterviewSlot()
                                                                                                    Selected → CONFIRMED
                                                                                                    Other 4 → DELETED
                                                                                                    Google Meet link generated
                                                                                                    Fireflies invited as attendee
                                                                                                              │
                                                                                                              ▼
                                                                                                          confirmed
                                                                                                              │
                                                                                                    POST /api/webhooks/fireflies
                                                                                                    (real) or /api/mocks/fireflies
                                                                                                    [status guard: must be confirmed,
                                                                                                    interview_scheduled, or shortlisted]
                                                                                                              │
                                                                                                              ▼
                                                                                                         interviewed
                                                                                                              │
                                                                                                      generateOffer() ◄── Claude Sonnet 4.5
                                                                                                              │
                                                                                                          offer_sent
                                                                                                              │
                                                                                                    candidate signs at /sign/[id]
                                                                                                              │
                                                                                                              ▼
                                                                                                           hired
                                                                                                              │
                                                                                                    POST /api/onboarding/slack
                                                                                                    Claude Sonnet 4.5 welcome DM
                                                                                                    HR channel notification
```

---

## Tech Stack

| Technology | Version | Why This, Not the Alternative |
|---|---|---|
| **Next.js 14 App Router** | 14.2.35 | Server Actions eliminate a separate API layer for AI calls. Route Handlers coexist cleanly for webhooks. RSC/Client split maps naturally to admin vs candidate UX. |
| **TypeScript** | ^5 | Zod schemas validate LLM output at the boundary; TypeScript ensures those types propagate to the UI without casting. |
| **Supabase** | ^2.100.1 | Managed Postgres with RLS, a built-in storage bucket for resumes, and real-time capability if status polling is added later. Service-role client (`createAdminClient`) bypasses RLS for server-side writes. |
| **@anthropic-ai/sdk** | ^0.80.0 | Official streaming SDK. Used with `messages.stream()` and `thinking: { type: 'adaptive' }` — not available in OpenAI-compatible wrappers. |
| **Claude Opus 4.6** | `claude-opus-4-6` | Resume screening only. Extended thinking mode needed for nuanced multi-criteria evaluation on borderline 50–75 cases. Significantly more calibrated than Sonnet on career changers and non-traditional backgrounds. |
| **Claude Sonnet 4.5** | `claude-sonnet-4-5` | Enrichment, offer drafting, and Slack welcome message generation. Synthesis tasks with deterministic inputs — faster and cheaper than Opus with no quality difference. |
| **Tavily Search API** | REST | Returns structured `{ title, url, content, score, answer }` per result — no HTML parsing needed. Purpose-built for LLM context injection, unlike raw Google/Bing. Unicode-sanitized before passing to Claude (see Enrichment section). |
| **googleapis** | ^171.4.0 | Official Google Calendar v3 client. Needed for `freebusy.query`, `events.insert`, `events.patch` with `conferenceDataVersion: 1` for Meet link generation, and `events.delete`. |
| **Fireflies.ai** | GraphQL + Webhooks | Joins meetings as `fred@fireflies.ai` calendar attendee. One GraphQL query fetches `{ transcript { title summary sentences { speaker_name raw_words start_time } } }`. Mock endpoint available for demo without a live account. |
| **Resend** | ^6.9.4 | Transactional email for candidate nudges, offer delivery, signing confirmation, and admin alerts. `RESEND_TO_OVERRIDE` redirects all email to one address in dev — the correct Resend-recommended dev pattern. |
| **Slack API** | REST (no SDK) | `users.lookupByEmail`, `conversations.open`, `chat.postMessage` via raw fetch. `pending_slack_messages` table queues DMs for candidates not yet in the workspace. Delivered on `team_join` webhook event. |
| **Zod** | ^4.3.6 | `ScreeningSchema` and `EnrichmentSchema` validate every LLM response before it touches the database. Parsing failure triggers retry or `manual_review_required`, never a crash. |
| **unpdf** | ^1.4.0 | Edge-runtime compatible PDF text extraction. `pdf-parse` requires Node.js Buffer globals that break in Next.js App Router. `unpdf` uses the PDF.js WASM port. |
| **mammoth** | ^1.12.0 | DOCX extraction. Dynamically imported to keep the edge bundle small. |
| **signature_pad** | ^5.1.3 | Canvas-based e-signature capture at `/sign/[id]`. Touch-capable, pixel-ratio scaling built in, produces `toDataURL('image/png')`. |
| **Tailwind CSS** | ^3.4.1 | Utility-first; no design system overhead. Dark mode via `class` strategy with localStorage persistence to prevent FOUC. |
| **react-hot-toast** | ^2.4.1 | Non-blocking feedback for async form submissions. Configured with dark mode token overrides in `app/layout.tsx`. |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    BROWSER / CANDIDATE (public)                      │
│                                                                      │
│   /jobs          /jobs/[id]         /portal/[id]   /sign/[id]       │
│   JobCard        ApplyModal          SlotPicker     SigningPanel     │
│   (RSC)          (Client)            (Client)       (Client)        │
└─────────────────────────┬───────────────────────────────────────────┘
                          │  Server Actions / fetch()
┌─────────────────────────▼───────────────────────────────────────────┐
│                     NEXT.JS 14 APP ROUTER                            │
│                                                                      │
│  Server Actions              Route Handlers                          │
│  ─────────────               ─────────────                          │
│  app/actions/apply.ts        POST /api/webhooks/fireflies  ◄── Fireflies.ai
│  app/actions/schedule.ts     POST /api/mocks/fireflies              │
│  app/actions/offer.ts        POST /api/offers/[id]/sign             │
│  app/actions/updateStatus.ts POST /api/onboarding/slack             │
│                              POST /api/webhooks/slack    ◄── Slack Events
│  Admin Pages (RSC + Client)  GET  /api/cron/nudge        ◄── Vercel Cron
│  ──────────────────────────  GET  /api/transcripts/[id]             │
│  /admin/applications                                                 │
│  /admin/applications/[id]                                            │
└──────┬──────────────────────────────────────────────────────────────┘
       │
       ├─────────────────────────────────────────────────────────────►  Anthropic API
       │   Screening:  claude-opus-4-6 + thinking:adaptive            │
       │   Enrichment: claude-sonnet-4-5 + thinking:adaptive          │
       │   Offer draft: claude-sonnet-4-5 (no thinking)               │
       │   Slack DM:   claude-sonnet-4-5 (no thinking)                │
       │                                                               │
       ├── lib/services/calendar.ts  ───────────────────────────────►  Google Calendar v3
       │   (freebusy, holds, confirm+release, Meet link)              │
       │                                                               │
       ├──────────────────────────────────────────────────────────────►  Tavily Search API
       │   (3 parallel searches per shortlisted candidate)            │
       │   (Unicode-sanitized before Claude)                          │
       │                                                               │
       ├──────────────────────────────────────────────────────────────►  Resend
       │   (nudge emails, offer delivery, hire alerts)                │
       │                                                               │
       ├──────────────────────────────────────────────────────────────►  Slack API
       │   (welcome DM, HR channel, queued pending_slack_messages)    │
       │                                                               │
┌──────▼──────────────────────────────────────────────────────────────┐
│                          SUPABASE (Postgres)                         │
│                                                                      │
│  candidates        ── email, linkedin_url, github_url               │
│  jobs              ── title, team, level, description, requirements │
│  applications      ── status, ai_score, ai_brief, research_profile, │
│                       structured_data, discrepancy_flags,           │
│                       has_discrepancies, tentative_slots (JSONB),   │
│                       interview_link, shortlisted_at                │
│  transcripts       ── fireflies_id, summary, full_transcript (JSONB)│
│  offer_letters     ── status (draft|sent|signed), html_content,     │
│                       signature_data, signed_at, signer_ip          │
│  interview_slots   ── status, hold_expires_at, application_id       │
│  pending_slack_messages ── candidate_email, message, sent_at        │
│                                                                      │
│  Storage: resumes bucket (private, service-role access only)        │
└─────────────────────────────────────────────────────────────────────┘
```

**Layer communication rules:**
- All DB writes use `createAdminClient()` (service-role, bypasses RLS) — only called from Server Actions and Route Handlers, never from Client Components.
- Public reads (`/jobs`) use `createAnonClient()` against RLS-protected tables.
- The `candidates` and `applications` tables are never directly readable by the browser.
- `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, and all other secrets are server-only — not prefixed with `NEXT_PUBLIC_`.

---

## Phase-by-Phase Breakdown

### Phase 1 — Job Discovery
**Files:** `app/jobs/page.tsx`, `app/jobs/[id]/page.tsx`

Candidates browse open roles via a job listing page. Jobs are fetched from Supabase using the anon client, filtered to `status = 'open'`. The `[id]` detail page renders job description and requirements and mounts the `ApplyModal` client component.

No AI in this phase.

---

### Phase 2 — Application Submission & AI Screening
**Files:** `app/actions/apply.ts`, `components/ApplyModal.tsx`, `components/DragDropUpload.tsx`

`submitApplication()` is a Server Action that runs the entire submission pipeline in sequence:

1. **Field validation** — required fields, LinkedIn URL regex checked before any DB call.
2. **File validation** — server-side check: max 3 MB, type must be `application/pdf` or one of the DOCX MIME types. Never trust client-side validation alone.
3. **Job open check** — confirms `job.status === 'open'` before accepting the application.
4. **Resume extraction** — `extractResumeTextFromBuffer()` uses `unpdf` for PDFs, `mammoth` for DOCX. Extraction errors and low text density (< 200 chars) route to `manual_review_required` before any AI call.
5. **Candidate upsert** — `ON CONFLICT (email)` upsert so returning candidates update their profile.
6. **Storage upload** — resume binary uploaded to private Supabase Storage; path stored in `resume_url`.
7. **Duplicate check** — queries for existing `(candidate_id, job_id)` pair before AI calls.
8. **AI screening** — `runScreening()` calls `claude-opus-4-6` with `thinking: { type: 'adaptive' }`. Returns `ScreeningSchema`: score, rationale, `sixty_second_brief`, `structured_data` (skills, years_exp, education, employers, achievements).
9. **Status routing** — score `>= 70` → `shortlisted`, `50–69` → `pending_review`, `< 50` → `rejected`, `null` → `applied`.
10. **AI enrichment (shortlisted only)** — `runEnrichment()` makes 3 Tavily searches in parallel, **Unicode-sanitizes** each result string to remove lone surrogates and characters outside the valid XML range (fixes "no low surrogate in string" errors), then passes real web results to `claude-sonnet-4-5` for synthesis into `EnrichmentSchema`: `linkedin_summary`, `x_findings`, `github_summary`, `discrepancy_flags`.
11. **Single DB insert** — all fields written in one `applications.insert()`. `has_discrepancies` is set to `true` if `discrepancy_flags.length > 0`.

---

### Phase 3 — Admin Review
**Files:** `app/admin/applications/page.tsx`, `app/admin/applications/[id]/page.tsx`, `app/actions/updateStatus.ts`

The admin dashboard (`/admin/applications`) is a React Server Component that fetches all applications joined to candidates and jobs. Filters (role, status, date) are client-side via `AdminFilters.tsx` — no round-trips per filter change.

**Discrepancy warning badge:** Any application where `has_discrepancies = true` shows an amber `AlertTriangle` icon next to the candidate's name in the list view and in the detail hero card. The actual flags are listed in the Intelligence Profile section. Automated rejection based on unverified web research is legally and ethically problematic — the badge is advisory, the human recruiter makes the final call. **However, 3+ flags trigger a product safety gate:** the application is moved to `pending_review` and auto-scheduling is blocked. The recruiter must manually review the flags and override to proceed with scheduling.

The detail page (`/admin/applications/[id]`) surfaces:
- AI score ring and `sixty_second_brief` verbatim
- Discrepancy flags in amber (if any)
- `structured_data` (skills, employers, achievements)
- Full `research_profile` from enrichment (LinkedIn, GitHub, X findings)
- Transcript section (summary + speaker turns) if interview has happened
- Offer status section (draft/sent/signed) with action buttons
- Status-based action panel: InviteButton for `shortlisted`/`pending_review`, OfferActions for `interviewed` and beyond

---

### Phase 4 — Interview Scheduling (Hold & Release)
**Files:** `lib/services/calendar.ts`, `app/actions/schedule.ts`, `app/portal/[id]/page.tsx`

The Hold & Release pattern solves concurrent double-booking without database locks.

**Answer:** Don't show "available" slots — show **reserved** slots.

When an admin clicks "Invite" on a shortlisted candidate:
1. `getAvailableSlots()` queries Google Calendar's `freebusy` API for the next 14 days.
2. `createTentativeHolds()` immediately creates 5 `TENTATIVE` calendar events, soft-locking those times for this candidate only.
3. The 5 `eventId`s are stored in `applications.tentative_slots` (JSONB array).
4. Application status advances to `slots_held`.

**If the candidate doesn't respond in 48 hours:** The cron job at `GET /api/cron/nudge` sends a reminder email via Resend with a link back to `/portal/[id]`.

When the candidate visits `/portal/[id]` and selects a slot:
1. The portal shows a **6-stage pipeline timeline** (Application Received → Shortlisted → Interview Scheduled → Interviewed → Offer Sent → Hired) with the current stage highlighted.
2. `confirmInterviewSlot()` calls `confirmAndRelease()` in `lib/services/calendar.ts`.
3. The selected event is patched: status → `confirmed`, summary and description updated.
4. The remaining 4 TENTATIVE events are deleted via `Promise.allSettled`.
5. `interview_link` is set to `DEFAULT_MEETING_LINK` if configured, otherwise the portal URL.

Candidate receives portal URL as interview link. In production with Google Workspace, this would be an auto-generated Google Meet link sent directly to the candidate's calendar.

**Known limitation:** Google Meet auto-generation via `conferenceData` and adding external attendees both require Google Workspace with domain-wide delegation. Personal Gmail service accounts cannot do either. The code architecture is production-ready — only the credentials differ. Set `DEFAULT_MEETING_LINK` in `.env.local` to provide a static Meet URL for demo purposes.

**No live Google Calendar credentials required for demo:** The scheduling flow requires `GOOGLE_*` env vars, but all other pipeline phases (submission, screening, enrichment, mock transcript, offer generation, signing) work without them.

### Phase 3C — Calendar Invite Acceptance

The takehome requires: "Once the interview time is confirmed, AI sends a proper calendar invite. The candidate accepts via their Google Calendar (YES button). The system should not wait indefinitely for an email reply."

Current implementation:
- Candidates confirm via the portal link (not email reply) — this correctly handles the "don't wait for email reply" requirement
- The system advances the pipeline on portal confirmation, not email response
- No indefinite waiting — 48hr cron expires unconfirmed slots automatically

What's built in the code:
- `confirmAndRelease()` in `lib/services/calendar.ts` patches the event with `status='confirmed'` and `conferenceData` for Meet link generation
- The code to add candidate as calendar attendee IS written — removed only because personal Gmail service accounts cannot add external attendees without Domain-Wide Delegation (403 error)

Production path (zero code changes needed):
- With a Google Workspace account + domain-wide delegation enabled:
  1. Service account adds candidate email as attendee to confirmed event
  2. Google Calendar automatically sends invite to candidate
  3. Candidate clicks YES in their Google Calendar
  4. Meet link auto-generates via `conferenceDataVersion:1`
- This is a credentials constraint only, not an architectural gap

---

### Phase 5 — Cron: 48-Hour Nudge & Slot Expiry
**Files:** `app/api/cron/nudge/route.ts`, `vercel.json`

Runs every 15 minutes via Vercel Cron. Secured by `x-cron-secret` header — must match `CRON_SECRET` env var.

**Task A — 48-hour nudge:**
Finds applications in `slots_held` or `slots_offered` where `shortlisted_at` (or `created_at` as fallback) is older than 48 hours. Sends a Resend reminder email to each candidate with a direct link to their portal. Uses `RESEND_TO_OVERRIDE` if set.

**Task B — Expire stale calendar holds:**
Finds `interview_slots` rows where `status = 'tentative_hold'` and `hold_expires_at < now()`. Bulk-updates those to `status = 'expired'`. For each application where **all** slots are now expired, resets the application to `pending_review` (only if currently in a slot-related status — does not overwrite `confirmed`, `interviewed`, or `hired`) and sends an admin alert email via Resend.

Returns `{ nudges_sent: number, slots_expired: number }`.

---

### Phase 6 — Interview Transcription (Fireflies.ai)
**Files:** `app/api/webhooks/fireflies/route.ts`, `app/api/mocks/fireflies/route.ts`

**Why Fireflies.ai:**
Fireflies joins meetings as a calendar attendee (`fred@fireflies.ai`) — no SDK, no meeting link click required. After the meeting, it POSTs a webhook with the meeting ID, and a single GraphQL query fetches the structured transcript: `{ transcript { title summary sentences { speaker_name raw_words start_time } } }`. This is the simplest possible integration: add an attendee, receive a webhook, make one GraphQL call.

**Production path (`POST /api/webhooks/fireflies`):**
1. Reads raw body as text before parsing (required for HMAC to match).
2. Verifies `x-fireflies-signature` using `crypto.timingSafeEqual` against HMAC-SHA256 of the raw body.
3. Matches attendee emails to `candidates.email` via a Supabase join on `applications`.
4. Fetches full transcript from Fireflies GraphQL API.
5. **Idempotent insert:** Checks `fireflies_id` before inserting — duplicate webhooks are skipped silently with `{ duplicate: true }`.
6. **Status-aware update:** Only advances to `interviewed` from valid statuses (`confirmed`, `interview_scheduled`, `slots_held`, `shortlisted`). Transcripts arriving for applications in other states (e.g., already `hired`) are stored but don't regress the status.
7. Returns `200` even when no application matches — prevents Fireflies from retrying indefinitely.

**Mock path (`POST /api/mocks/fireflies`):**
Injects a fixture transcript with 4 named speakers and 20 sentences covering system design, incident management, AI tooling, and team collaboration — demonstrating the full downstream pipeline without a live Fireflies account. **Protected by `ADMIN_SECRET` Bearer auth** — not publicly accessible.

**Status guard:** The mock endpoint checks that `application.status` is one of `['confirmed', 'interview_scheduled', 'shortlisted']` before inserting. Also performs an **idempotency check** on `fireflies_id` — calling twice with the same application returns the existing transcript ID. Returns 400 with a descriptive error for wrong pipeline stage.

---

### Phase 7 — Offer Generation & Signing
**Files:** `app/actions/offer.ts`, `app/api/offers/[id]/sign/route.ts`, `app/sign/[id]/page.tsx`

**Offer generation:** Admin fills a form (job title, start date, salary, currency, equity, bonus, manager, custom terms). `generateOffer()` Server Action calls `claude-sonnet-4-5` (no thinking — deterministic writing task, thinking adds latency with no quality benefit) to produce a complete self-contained HTML offer letter with all inline styles. Stored as `offer_letters` with status `draft`.

**Pre-generation guards:**
- **Status validation:** Offer generation is blocked unless the application is in `interviewed`, `offer_sent`, or `hired` status. Prevents admins from sending offers before the interview is complete.
- **Duplicate prevention:** If a `draft` or `sent` offer already exists for the application, generation is blocked with a clear message to send or discard the existing offer first.

**Offer sending:** `sendOffer()` Server Action transitions offer → `sent`, application → `offer_sent`, sends Resend email to the candidate with a link to `/sign/[offerId]`.

**Offer signing:** The signing page at `/sign/[id]` is public — no auth. The UUID offer ID in the URL is the authorization token (2^122 entropy, effectively unguessable). `POST /api/offers/[id]/sign` validates the offer is in `sent` status, records signature data (PNG data URL), IP address, and timestamp, transitions offer → `signed`, application → `hired`. Replay protection: the first successful sign locks the status; subsequent POSTs return 400.

After signing, the route fires a **fire-and-forget** Slack onboarding trigger — no `await`, no blocking.

---

### Phase 8 — Slack Onboarding
**Files:** `app/api/onboarding/slack/route.ts`, `app/api/webhooks/slack/route.ts`

Triggered automatically after offer signing (fire-and-forget, does not block the signing response).

**Steps:**
1. **Idempotency check:** Queries `pending_slack_messages` by candidate email — if a record already exists (queued or sent), returns early with `{ duplicate: true }`. Prevents double-trigger from producing duplicate welcome messages.
2. Fetch application, candidate, job, and offer data from Supabase.
3. `claude-sonnet-4-5` generates a ≤150-word personalised welcome DM (fallback to hardcoded template if Claude fails).
4. `users.lookupByEmail` resolves the candidate's Slack user ID by their email.
5. **If user found:** Open a DM channel and send the welcome message immediately.
6. **If user not found:** Write the message to `pending_slack_messages` table. Delivered automatically when they join via the `team_join` webhook handler.
7. Post an HR channel notification to `SLACK_HR_CHANNEL_ID` with candidate name, role, start date, and — if `has_discrepancies = true` — an explicit amber warning note.

**Rate limiting:** All Slack API calls use a retry helper with exponential backoff. On HTTP 429, the `Retry-After` header is respected with up to 2 retries before giving up. Failures are logged but never block the pipeline.

**Known limitation (EC6):** `admin.users.invite` requires a Slack Enterprise Grid plan. On free/standard workspaces, candidates must be invited manually or via Slack's admin UI. The code documents this and continues without failing.

**`team_join` webhook (`POST /api/webhooks/slack`):**
Verifies Slack HMAC-SHA256 signature with 5-minute replay protection using `crypto.timingSafeEqual`. When a new member joins the workspace, queries `pending_slack_messages` where `sent_at IS NULL` for their email, delivers each via DM, marks `sent_at = now()`.

---

## AI Utilization

### Screening — `claude-opus-4-6` with `thinking: { type: 'adaptive' }`

**Why Opus:** Resume screening is the highest-stakes AI decision in the pipeline. A wrong score ends a candidacy before any human reviews it. Opus produces more consistent, calibrated scores than Sonnet on borderline 50–75 cases — particularly for career changers, non-traditional backgrounds, and candidates with skill overlap but level mismatch.

**Why adaptive thinking:** `{ type: 'adaptive' }` lets the model decide when to reason deeply. Straightforward candidates run fast. Ambiguous cases (career changers, conflicting signals) get extended reasoning tokens before committing to a score. This is better than always-on thinking (too slow) or no thinking (too shallow on hard cases).

**Prompt architecture:** The system prompt defines 4 score bands with qualitative descriptions (anchors the scoring distribution), specifies `sixty_second_brief` format ("written as if a hiring manager is verbally briefing the CEO"), and ends with a hard constraint: "Return a JSON object ONLY — absolutely no markdown, no code fences." Combined with post-processing that strips accidental fences, this makes JSON parsing robust.

**Bias detection:** The screening prompt includes a self-check step where Claude evaluates its own scoring for potential bias before finalizing. Four specific checks: employment gap penalization, school prestige overweighting, non-traditional career undervaluation, and name/location assumptions. Flags are stored in `potential_bias_flags` (part of `ai_analysis` JSONB) and shown to recruiters as an orange "AI Bias Self-Check" warning in the Intelligence Profile card. This directly addresses the takehome problem statement: "Biased feedback slips through and unfairly ends strong candidacies." Flags are advisory — they surface concerns to humans, never auto-reject. Cost: ~50 extra output tokens per screening call.

### Enrichment — `claude-sonnet-4-5` with `thinking: { type: 'adaptive' }`

**Why Sonnet not Opus:** Enrichment is a synthesis task, not a multi-criteria scoring task. The inputs are structured (Tavily result blocks), the output is prose summaries and a flag list. Sonnet produces equivalent quality output on synthesis tasks at significantly lower latency and cost.

**Grounded context architecture:** The naive approach — asking Claude to "research" a candidate from their LinkedIn URL — produces hallucinated confidence about things the model cannot actually know. The actual architecture:
1. Three parallel Tavily searches run first: `"${name}" site:linkedin.com`, `"${name}" site:github.com`, `"${name}" developer engineer`.
2. Results are Unicode-sanitized (see below) and formatted as structured context blocks.
3. Claude receives this real web data with explicit instructions to synthesize actual findings only — not to infer beyond what the data shows.

This solves hallucination structurally. Discrepancy flags are grounded in actual search results vs. resume claims.

**Unicode sanitization:** Tavily returns content from arbitrary web pages, including emoji and characters outside the valid XML Unicode range. Passing these directly to the Claude API causes "no low surrogate in string" errors. The `sanitizeForClaude()` helper in `app/actions/apply.ts` strips lone high surrogates, lone low surrogates, and characters outside the valid range (0x09, 0x0A, 0x0D, 0x20–0x7E, 0x80–0xD7FF, 0xE000–0xFFFD) before building the prompt. Applied both inside `formatTavilyResults()` (per-field) and again on the assembled context strings.

### Offer Letter Drafting — `claude-sonnet-4-5` (no thinking)

**Why no thinking:** Offer letter generation is a structured writing task with deterministic inputs (salary, start date, manager, equity). There are no conflicting signals to reason over. `thinking: { type: 'adaptive' }` would add latency and tokens with no quality benefit on a writing task.

Output: complete self-contained HTML with all inline styles — suitable for direct email embed with no post-processing.

### Slack Welcome Message — `claude-sonnet-4-5` (no thinking)

**Why Sonnet, no thinking:** Same rationale as offer drafting — this is a short-form writing task with deterministic inputs, not a reasoning task. Generating a ≤150-word welcome DM doesn't benefit from extended thinking.

**Personalization approach:** The prompt provides first name, job title, and start date. It requests specific onboarding steps (check email for docs, join #general, set up laptop) to make the message actionable rather than generic. The system prompt sets tone: "warm, professional, first-name basis."

**Resilience:** On any Claude failure, a hardcoded fallback template is used. Slack onboarding must never block or error the signing flow — the candidate's offer is already recorded before this code runs.

### Token Economy Decisions

| Decision | Token impact | Rationale |
|---|---|---|
| Manual form fields (name, email, LinkedIn, GitHub) | ~500 tokens saved | Asking Claude to infer these from free text is unreliable and wastes tokens on parsing |
| File type restriction (PDF/DOCX only) | Prevents 0-value submissions | Scanned image PDFs produce < 200 chars — caught before Claude is called |
| 3 MB file size limit | Prevents ~50k+ token submissions | Overly large PDFs often contain image scans that add no textual signal |
| Enrichment only for score ≥ 70 | ~5,000 tokens saved per rejected candidate | No point researching someone who scored 35 |
| First 4,000 chars of resume to enrichment | ~3,000 tokens saved per enrichment call | Header, summary, and first job cover the key signals |
| `sixty_second_brief` in screening schema | Avoids a second Claude call for summaries | ~200 extra output tokens vs. ~2,000 tokens for a separate summarisation call |
| Sonnet for enrichment, Opus for screening only | ~70% cost reduction on enrichment | Sonnet is equivalent quality on synthesis; Opus is needed only for multi-criteria scoring |

---

## Edge Cases Handled

### 1. Scanned Image PDFs (< 200 char text density)
`unpdf` extracts an empty or near-empty string. Feeding this to Claude produces a meaningless score with hallucinated rationale. **Solution:** Low-density check fires before any AI call; application inserted as `manual_review_required`. The resume binary is still uploaded so a human reviewer can open it.

### 2. Concurrent Candidates Booking the Same Slot
**Solution:** The Hold & Release pattern ensures this is impossible. Slots are pre-reserved `TENTATIVE` events per-candidate. Each candidate sees their own 5 unique holds — there is no shared pool. `confirmAndRelease()` patches a specific event by ID; no race condition exists.

### 3. LLM Response Parsing Failure
Two layers: string preprocessing strips common fence patterns, then Zod parsing inside `try/catch`. On failure, `ai_score: null` and `status: 'applied'` rather than crashing.

### 4. Resume File Extraction Failure
`extractResumeTextFromBuffer()` is called inside `try/catch`. On exception, application inserted as `manual_review_required` with error message as `ai_rationale`. Storage upload still proceeds.

### 5. Duplicate Application Submission
Three layers: candidate upsert on email conflict, pre-AI duplicate check on `(candidate_id, job_id)`, and a `23505` unique violation catch on the final insert.

### 6. Fireflies Webhook for Non-System Meetings
Returns `200` with `{ success: false, reason: 'No matching application found' }` when no application matches any attendee email. Fireflies does not retry on 200.

### 7. Google Meet Link Generation Failure
Optional chaining with null coalesce: `updated.conferenceData?.entryPoints?.find(...)?.uri ?? null`. Falls back to `/portal/[applicationId]` as `interview_link`. Interview not blocked.

### 8. Candidate Not Yet in Slack Workspace
`users.lookupByEmail` returns no match. Message stored in `pending_slack_messages` with `sent_at = null`. Delivered automatically by `POST /api/webhooks/slack` when the `team_join` event fires.

### 9. Fireflies Mock on Wrong Pipeline Stage
Status guard in `POST /api/mocks/fireflies` rejects calls where `application.status` is not in `['confirmed', 'interview_scheduled', 'shortlisted']`. Returns 400 with a descriptive error — prevents transcript injection on applications that haven't reached the interview stage.

### 10. Unicode Characters from Tavily Breaking Claude
`sanitizeForClaude()` applied to all Tavily content before prompt assembly. Three regex passes: lone high surrogates, lone low surrogates, and all other characters outside the valid XML Unicode range. Fixes "no low surrogate in string" API errors silently.

### 11. Candidate Signs Offer Twice
`/api/offers/[id]/sign` checks `offer.status === 'signed'` first. Returns 400 with no DB mutation on any subsequent attempt.

### 12. Discrepancy Flags on a Hired Candidate
`has_discrepancies` stored permanently. Admin hire-alert email includes an explicit warning note if the candidate had flags at any point.

### 13. Duplicate Fireflies Webhook (Retry)
Fireflies may fire the same webhook multiple times. Before inserting, the handler queries `transcripts.fireflies_id` — if a match exists, returns `{ success: true, duplicate: true }` with no DB mutation. File: `app/api/webhooks/fireflies/route.ts`.

### 14. Transcript Arrives for Non-Confirmed Application
If the application status is not in `[confirmed, interview_scheduled, slots_held, shortlisted]`, the transcript is still stored but the status is not regressed to `interviewed`. Prevents overwriting `hired` or `offer_sent`. File: `app/api/webhooks/fireflies/route.ts`.

### 15. Offer Generated Before Interview Complete
`generateOffer()` checks `application.status` is in `[interviewed, offer_sent, hired]` before calling Claude. Returns a clear error if the interview hasn't happened yet. File: `app/actions/offer.ts`, `app/api/offers/generate/route.ts`.

### 16. Duplicate Offer for Same Application
Before creating a new offer, checks for existing `draft` or `sent` offers on the same application. Returns 409 with instructions to send or discard the existing one. File: `app/actions/offer.ts`, `app/api/offers/generate/route.ts`.

### 17. Slack Onboarding Double-Trigger
If the signing endpoint fires Slack onboarding twice (network retry, user double-click), the handler checks `pending_slack_messages` for the candidate email before proceeding. Returns `{ duplicate: true }` on second call. File: `app/api/onboarding/slack/route.ts`.

### 18. Slack API Rate Limited (429)
All Slack API POST calls use a retry helper that respects the `Retry-After` header with up to 2 retries. After exhausting retries, error is logged but never blocks the pipeline. File: `app/api/onboarding/slack/route.ts`.

### 19. Mock Fireflies Endpoint Called Twice
Idempotency check on `fireflies_id = mock_{application_id}` returns the existing transcript ID on duplicate calls. File: `app/api/mocks/fireflies/route.ts`.

### 20. High Discrepancy Count (3+ flags) — Auto-Scheduling Blocked
When enrichment returns 3 or more discrepancy flags, the system moves the application to `pending_review` instead of auto-scheduling. This prevents calendar holds being created and interview invitations being sent to potentially fraudulent candidates before a human has reviewed the flags. The recruiter must manually review and override to proceed. This is product logic, not token saving — enrichment still runs fully to surface the flags. File: `app/actions/apply.ts` (Step 13).

### 21. No-Reply Scenario — Candidate Never Responds to Slot Offer
The takehome calls out "no-reply" as a specific edge case. The system handles this with a two-stage escalation:
1. **48-hour nudge email:** The cron job at `GET /api/cron/nudge` (runs every 15 minutes via Vercel Cron) finds applications in `slots_held` or `slots_offered` where `shortlisted_at` is older than 48 hours and sends a Resend reminder email with a direct link to the candidate's portal. File: `app/api/cron/nudge/route.ts` (Task A).
2. **Automatic slot expiry:** The same cron job finds `interview_slots` where `hold_expires_at < now()`, bulk-expires them, and resets the application to `pending_review` — freeing calendar capacity for other candidates. An admin alert email is sent via Resend. File: `app/api/cron/nudge/route.ts` (Task B).

The system never waits indefinitely. No human intervention is required to reclaim expired slots.

**Design note on 24 vs 48 hours:** The takehome mentions a "24-hour delay nudge." The implementation uses 48 hours deliberately — 24 hours is too aggressive for candidates in different timezones or those who receive the email late in their day. 48 hours gives a full business-day buffer while still reclaiming abandoned slots promptly. The threshold is a single constant and can be adjusted to any interval.

### 22. Reschedule Request — Candidate Asks to Change Confirmed Slot
When a candidate needs to reschedule after confirming a slot, they submit a request via the portal. The admin reviews at `/admin/applications/[id]` and either approves (creates new calendar holds via `scheduleInterview()` and sends a new slot-picker email via Resend) or declines (restores `slots_held` status and emails candidate to pick from original options). File: `app/api/schedule/reschedule-action/route.ts`.

---

## Assumptions & Trade-offs

### 1. Two UIs, Not RBAC
**Assumption:** Admin dashboard is protected at the URL level (not linked from candidate pages) and by `ADMIN_SECRET` on API routes.

**Trade-off:** Adding NextAuth or Supabase Auth requires user seeding, OAuth registration, and session management — out of scope for a demo. In production: three roles (Recruiter, Hiring Manager, Interviewer) backed by Supabase Auth + JWT claims + RLS policies. See `docs/RBAC_DESIGN.md`.

### 2. Fireflies Integration is Partially Mocked
The real `POST /api/webhooks/fireflies` path cannot be tested locally without a public URL and a configured Fireflies account. `POST /api/mocks/fireflies` allows the full pipeline to be demonstrated end-to-end — including `transcripts` table insert and `interviewed` status — without this dependency.

### 3. Single-Interviewer Calendar
**Current state:** One shared calendar identified by `GOOGLE_CALENDAR_ID`. All candidates — regardless of job — are scheduled against the same interviewer's availability. This is correct for the prototype: the Hold & Release pattern prevents double-booking across all roles because freebusy treats TENTATIVE holds as busy for every subsequent candidate.

**Production path:** A multi-interviewer system requires:
- An `interviewers` table mapping each interviewer to their Google Calendar ID
- A `job_interviewers` join table assigning interviewers to specific roles
- Round-robin or load-balanced slot assignment across available interviewers per role
- `getCalendarId()` in `lib/services/calendar.ts` becomes `getCalendarId(jobId)` — the only code change needed. The rest of the Hold & Release pattern (freebusy → tentative holds → confirm & release) works identically per-calendar.
- Each interviewer's calendar is isolated — Candidate A interviewing for Engineering and Candidate B for Design would query different calendars and never conflict.

### 4. Synchronous Server Action for Full Pipeline
The candidate waits ~15–20 seconds for screening + enrichment. In production, enrichment would run in a background job (Inngest, BullMQ) — form submission returns immediately, status updates via Supabase Realtime. Splitting screening (fast, inline) from enrichment (slow, async) would be the first refactor.

### 5. Offer ID as Access Token
The signing page is public — the UUID offer ID in the URL is the authorization token (2^122 entropy). Time-limited signed JWTs would be more rigorous; UUID entropy is sufficient for a prototype.

### 6. Slack Bot Token in Server-Only Code
The `SLACK_BOT_TOKEN` is used only in Route Handlers and Server Actions — never exposed to the browser. The `SLACK_SIGNING_SECRET` is used in the webhook handler for HMAC verification.

### 7. Google Meet Auto-Generation
**Assumption:** Google Workspace conferenceData API is needed for auto-generated Meet links.

**Trade-off:** Personal Gmail service accounts cannot generate Meet links or add external attendees. Static Meet link used for demo via `DEFAULT_MEETING_LINK` env var. Code is production-ready — only credentials differ. With a Google Workspace account, re-enable `conferenceData` and `attendees` in `confirmAndRelease()`.

---

## Architectural Decision Log

These are deliberate decisions made during the build — what was considered, what was chosen, and why. This section exists because good engineering judgment means knowing what NOT to build as much as knowing what to build.

### Decision 1: LangGraph — considered, not implemented

Considered: Rewriting the enrichment and screening pipeline using LangGraph for explicit stateful agent orchestration.

Decision: Not implemented.

Why: The pipeline already implements what LangGraph provides — sequential nodes, conditional branching (score >= 70 → enrich), persistent state in Supabase, and error handling at each node. Adding LangGraph would mean rewriting working, tested code into a framework with no user-visible benefit and significant added complexity. The architecture is LangGraph-compatible by design — migrating would be straightforward if the team standardizes on it.

What LangGraph would add at scale: built-in retry policies, visual graph debugging, easier parallelization of enrichment steps. Worth revisiting at 10+ concurrent pipelines.

### Decision 2: Multi-agent scoring — considered, not implemented

Considered: Using multiple Claude agents to debate and arbitrate resume scores — Agent 1 scores, Agent 2 challenges, Agent 3 arbitrates.

Decision: Not implemented.

Why: Claude opus-4-6 with extended thinking already performs internal deliberation before scoring. Adding multi-agent debate would triple API costs and latency (from ~15s to ~45s per submission) with marginal quality improvement on clear cases. The borderline zone (50-69) already routes to human review — the human IS the third arbiter. Multi-agent scoring would be valuable if removing the human review step entirely, which is not the right product decision.

What multi-agent would add: more defensible scores on contested edge cases, audit trail of reasoning disagreements. Worth implementing if the system scales to eliminate human review entirely.

### Decision 3: Multimodal AI for resume parsing — considered, not implemented

Considered: Using Claude's vision capabilities to parse resume PDFs as images rather than extracting text first.

Decision: Not implemented.

Why: Text extraction (unpdf for PDF, mammoth for DOCX) is faster, cheaper, and more reliable for structured resume data. Multimodal adds value when documents contain charts, logos, or visual layouts that carry meaning — resumes are predominantly text. The existing edge case handling (< 200 chars → manual_review_required) correctly catches image-only PDFs that text extraction fails on.

What multimodal would add: better handling of heavily designed resume templates with complex layouts. Worth implementing if the candidate pool skews toward design-heavy PDF resumes.

### Decision 4: Bias detection — implemented

Considered: Adding a self-check step to the screening prompt where Claude evaluates its own scoring for potential bias before finalizing.

Decision: Implemented.

Why: The takehome problem statement explicitly says "Biased feedback slips through and unfairly ends strong candidacies." This is the problem we are solving. A bias detection flag costs ~50 extra output tokens per screening call and directly addresses a stated requirement. The flags are advisory — they surface to recruiters as warnings, never auto-reject. This is the correct human-in-the-loop design: AI flags the concern, human makes the call.

Implementation: potential_bias_flags field in ScreeningSchema. Self-check added to system prompt. Amber warning shown in admin dashboard if flags exist.

### Decision 5: PandaDoc vs custom signing UI — custom implemented

Considered: PandaDoc API for e-signature (Option A in takehome).

Decision: Custom signing UI built instead (Option B).

Why: PandaDoc integration takes 2+ hours and adds an external dependency with webhook complexity. Custom signing with signature_pad captures signature PNG, timestamp, and IP in under 30 minutes of build time. The result is fully in-app, white-labeled, and demonstrates the same capabilities. For production at scale, PandaDoc or DocuSign would be the right call — they handle legal compliance, audit trails, and multi-party signing that a custom UI cannot easily replicate.

### Decision 6: Google Workspace vs personal Gmail for Calendar

Considered: Setting up Google Workspace for full calendar invite delivery with Meet link auto-generation.

Decision: Personal Gmail with service account used for demo.

Why: Google Workspace costs $6/user/month, requires domain ownership, and takes 30-60 minutes to configure. The calendar code is production-ready — freebusy queries, TENTATIVE hold creation, slot confirmation, and Meet link generation are all implemented. The only constraint is credentials: personal Gmail service accounts cannot add attendees or generate Meet links without domain-wide delegation. A static Meet link (meet.google.com/rjb-csev-uyp) is used for demo. In production with a Niural Google Workspace account, this works end-to-end with zero code changes.

### Decision 7: Fireflies.ai as AI Notetaker — real integration, mock for demo

Considered: Four AI notetaker platforms evaluated for the interview transcription requirement.

| Platform | API availability | Transcript retrieval | Cost | Verdict |
|---|---|---|---|---|
| Read.ai | No public API found at time of submission | N/A | N/A | Eliminated |
| Fathom | Webhook-only | No retrieval API — can only push, not pull | Free tier | Eliminated — no way to fetch transcripts on demand |
| Otter.ai | API exists | Full transcript retrieval | Enterprise plan ($40+/month) | Eliminated — cost prohibitive for a prototype |
| Fireflies.ai | GraphQL API, documented | Full transcript with speaker attribution + timestamps | Free tier available | Selected |

Decision: Fireflies.ai selected. Both real and mock integration paths built.

Why: Fireflies has the best API surface for a prototype. It joins meetings as a calendar attendee (`fred@fireflies.ai`) — no SDK, no browser extension, no meeting link injection. After the meeting ends, it POSTs a webhook with the meeting ID. A single GraphQL query (`transcript { title summary sentences { speaker_name raw_words start_time } }`) returns the full structured transcript. The webhook is verified with HMAC-SHA256.

Real path (`POST /api/webhooks/fireflies`): HMAC-verified webhook → email-to-application matching → GraphQL transcript fetch → idempotent DB insert → status advance to `interviewed`. Cannot be tested locally without a public URL, a real Fireflies account, and an actual meeting recording.

Mock path (`POST /api/mocks/fireflies`): Admin-authenticated endpoint that injects a realistic 20-sentence fixture transcript (4 speakers, 700s of interview time) and advances the application to `interviewed`. Demonstrates the full downstream pipeline — transcript storage, admin transcript viewer, offer eligibility — without requiring any external dependency. Protected by `ADMIN_SECRET` Bearer auth to prevent accidental use.

This mock-first design means the entire pipeline is demonstrable from `git clone + npm run dev` without a Fireflies account.

---

## What I'd Improve With More Time

### 1. Async Enrichment via Background Jobs
Move `runEnrichment()` out of the submission request into a Supabase Edge Function triggered by `applications.status = 'shortlisted'`. Cut p95 submission latency from ~18s to ~4s.

### 2. Prompt Regression Testing
A regression suite — 50 synthetic resumes with known expected score ranges, run on every deploy — would catch silent scoring drift from model updates. Critical because `claude-opus-4-6` will be succeeded by newer models.

### 3. Full RBAC with Three Roles
Replace `ADMIN_SECRET` bearer token with Supabase Auth + JWT role claims + RLS policies. See `docs/RBAC_DESIGN.md` for the complete design.

### 4. Webhook Idempotency for Fireflies
Add unique constraint on `transcripts.fireflies_id` and convert insert to upsert on conflict. One-line migration + one-line code change.

### 5. Score Explainability UI
`structured_data` (skills array, employers, achievements) currently displayed as raw JSON. A proper UI renders these as tag clouds or timeline entries.

### 6. LinkedIn Partner API for Enrichment
Tavily searches of LinkedIn return limited data on private profiles. A production pipeline uses LinkedIn's Partner API, Clay, or Apollo for structured, verified profile data.

### 7. Fuzzy Employer Name Matching
"Google" and "Google LLC" don't match literally. Production discrepancy detection uses Levenshtein distance or a company name normalization service.

### 8. Rate Limiting on `/api/mocks/fireflies`
No rate limiting currently. Upstash Redis or Vercel edge rate limiting on mock endpoints before any real candidate data flows through.

### Scale Architecture: Async Queue

Current: synchronous sequential processing (candidate waits 45-60s).
Built for this submission: Supabase-backed processing queue with:
- Worker endpoint: `/api/queue/worker` (runs every minute via Vercel Cron)
- Status monitor: `/api/queue/status` (admin-facing queue health dashboard)
- Retry logic: up to 3 attempts with failure tracking
- Job types: screening, enrichment, scheduling

Production upgrade path:
Replace Supabase queue table with BullMQ + Upstash Redis for:
- Sub-second job pickup (vs 1-minute cron delay)
- Job priorities (high-score candidates processed first)
- Real-time monitoring dashboard
- Dead letter queue for permanently failed jobs
- Horizontal scaling across multiple worker instances

Why not fully implemented:
The synchronous flow works correctly at demo scale. Moving to async
requires decoupling the submission response from processing completion,
which changes the candidate UX (instant "received" vs waiting for score).
The queue infrastructure is built and ready — connecting it to
`submitApplication()` is a one-session refactor.

---

## Local Setup

### Prerequisites

- Node.js 18+
- A Supabase project with the schema below applied
- Anthropic API key (Claude Max or API access)
- Tavily API key (free tier works for development)
- Google Cloud project with Calendar API enabled + service account *(optional — only needed for scheduling)*
- Fireflies.ai account + API key *(optional — mock endpoint available)*
- Resend account + API key *(optional — email sends are skippable)*
- Slack app with bot token *(optional — onboarding DMs are fire-and-forget)*

### 1. Clone and install

```bash
git clone <repo-url>
cd ai-candidate-onboarding
npm install
```

### 2. Configure environment variables

Create `.env.local` in the project root:

```bash
# ── Supabase ──────────────────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
# Supabase Dashboard → Project Settings → API → service_role key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# ── Anthropic (Claude) ────────────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...

# ── Tavily (web enrichment search) ───────────────────────────────────────────
# https://app.tavily.com
TAVILY_API_KEY=tvly-...

# ── Google Calendar (service account) ────────────────────────────────────────
# Leave blank to skip scheduling — all other phases work without it
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-sa@your-project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GOOGLE_CALENDAR_ID=your-calendar-id@group.calendar.google.com
# IANA timezone string, defaults to America/New_York
INTERVIEWER_TIMEZONE=America/New_York

# ── Fireflies.ai ──────────────────────────────────────────────────────────────
# https://app.fireflies.ai/integrations/api
FIREFLIES_API_KEY=your-fireflies-api-key
# Set this in your Fireflies webhook configuration panel — any secure random string
FIREFLIES_WEBHOOK_SECRET=your-webhook-secret

# ── Resend (transactional email) ──────────────────────────────────────────────
# https://resend.com
RESEND_API_KEY=re_...
# A verified sender address on your Resend domain
RESEND_FROM_EMAIL=onboarding@yourdomain.com
# DEV ONLY: redirects ALL outbound email here (required on Resend free tier)
RESEND_TO_OVERRIDE=you@youremail.com
# Receives admin alerts (slot expiry, hire notifications)
ADMIN_EMAIL=admin@yourdomain.com

# ── Slack ─────────────────────────────────────────────────────────────────────
# Slack app → OAuth & Permissions → Bot User OAuth Token
SLACK_BOT_TOKEN=xoxb-...
# Slack app → Basic Information → Signing Secret
SLACK_SIGNING_SECRET=your-signing-secret
# Channel ID for HR notifications (not the name — the ID like C0XXXXXXX)
SLACK_HR_CHANNEL_ID=C0XXXXXXX
SLACK_TEAM_ID=T0XXXXXXX

# ── App ───────────────────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=http://localhost:3000
# Protects admin API routes (GET /api/transcripts/*, POST /api/offers/*)
ADMIN_SECRET=any-secure-random-string
# Protects GET /api/cron/nudge — must match x-cron-secret header
CRON_SECRET=any-secure-random-string
```

### 3. Apply Supabase schema

Run the migrations in order in the Supabase SQL editor:

```
supabase/migrations/20240101000000_initial_schema.sql       — candidates, applications, jobs
supabase/migrations/20240101000001_phase2_schema.sql        — offer_letters, transcripts
supabase/migrations/20240101000002_intelligence_columns.sql — ai_brief, discrepancy_flags, social_research
supabase/migrations/20240101000003_disable_rls.sql          — disables RLS for prototype
supabase/migrations/20240101000004_interview_link.sql       — interview_link column on applications
supabase/migrations/20240101000005_new_status_values.sql    — pending_review, manual_review_required
supabase/migrations/add_missing_columns.sql                 — has_discrepancies + pending_slack_messages table
```

Or apply the full schema manually:

```sql
-- Jobs
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  team TEXT NOT NULL,
  location TEXT NOT NULL,
  level TEXT NOT NULL,
  description TEXT NOT NULL,
  requirements TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Candidates
CREATE TABLE candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  linkedin_url TEXT,
  github_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Applications
CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES candidates(id) NOT NULL,
  job_id UUID REFERENCES jobs(id) NOT NULL,
  status TEXT NOT NULL DEFAULT 'applied',
  resume_url TEXT,
  resume_text TEXT,
  ai_score INTEGER,
  ai_rationale TEXT,
  ai_brief TEXT,
  ai_analysis JSONB,
  structured_data JSONB,
  research_profile JSONB,
  discrepancy_flags TEXT[],
  has_discrepancies BOOLEAN DEFAULT false,
  social_research JSONB,
  interview_link TEXT,
  tentative_slots JSONB,
  shortlisted_at TIMESTAMPTZ,
  admin_override_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(candidate_id, job_id)
);

-- Transcripts
CREATE TABLE transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES applications(id),
  fireflies_id TEXT UNIQUE,
  summary TEXT,
  full_transcript JSONB,
  retrieved_at TIMESTAMPTZ DEFAULT now()
);

-- Offer letters
CREATE TABLE offer_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES applications(id) NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',  -- draft | sent | signed
  html_content TEXT,
  signature_data TEXT,
  signed_at TIMESTAMPTZ,
  signer_ip TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Interview slots (for Hold & Release expiry tracking)
CREATE TABLE interview_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES applications(id) NOT NULL,
  status TEXT NOT NULL DEFAULT 'tentative_hold',  -- tentative_hold | confirmed | expired
  hold_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Queued Slack DMs for candidates not yet in workspace
CREATE TABLE pending_slack_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_email TEXT NOT NULL,
  message TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Storage bucket for resumes
INSERT INTO storage.buckets (id, name, public) VALUES ('resumes', 'resumes', false);
```

### 4. Seed a job (optional)

```sql
INSERT INTO jobs (title, team, location, level, description, requirements, status)
VALUES (
  'Senior Software Engineer',
  'Platform',
  'Remote',
  'Senior',
  'Build the infrastructure that powers Niural''s AI hiring pipeline...',
  '5+ years backend experience. Proficiency in TypeScript, Node.js. Experience with distributed systems...',
  'open'
);
```

### 5. Run the dev server

```bash
npm run dev
```

Visit:
- `http://localhost:3000` — candidate landing page
- `http://localhost:3000/jobs` — job listings
- `http://localhost:3000/admin/applications` — admin dashboard (type URL directly — not linked)

### 6. Test the full pipeline without live integrations

**Submit an application:**
Use any job's Apply button. Upload a PDF or DOCX resume (max 3 MB). AI screening runs live (requires `ANTHROPIC_API_KEY`). Enrichment runs automatically if score ≥ 70.

**Inject a mock transcript** (no Fireflies account needed):

The application must be in `confirmed`, `interview_scheduled`, or `shortlisted` status.

```bash
curl -X POST http://localhost:3000/api/mocks/fireflies \
  -H "Content-Type: application/json" \
  -d '{"application_id": "your-application-uuid"}'
```

**Fetch a transcript** (requires `ADMIN_SECRET`):
```bash
curl http://localhost:3000/api/transcripts/your-application-uuid \
  -H "Authorization: Bearer your-admin-secret"
```

**Trigger the cron manually** (requires `CRON_SECRET`):
```bash
curl http://localhost:3000/api/cron/nudge \
  -H "x-cron-secret: your-cron-secret"
```

**Skip Google Calendar:**
Calendar calls only run when "Invite" is clicked in the admin dashboard. All other pipeline phases work without `GOOGLE_*` env vars.

**Skip Slack:**
The Slack onboarding trigger is fire-and-forget. If `SLACK_BOT_TOKEN` is unset, the route returns a mock success response — the signing flow is not blocked.

---

## How AI Tools Were Used to Build This

This project was built with **Claude Code** (the CLI) running on a **Claude Max** subscription.

**Architecture design:** Claude Code was used interactively to design the Hold & Release calendar pattern, the Zod-gated LLM output pipeline, the multi-layer duplicate application defense, and the `pending_slack_messages` queue pattern for deferred Slack DMs.

**Code generation:** Server Actions, Route Handlers, and Supabase query helpers were generated with specific, detailed prompts that included the exact schema, existing codebase structure, and precise function signatures. Claude Code read existing files before suggesting modifications.

**Bug identification:** Claude Code identified two bugs in `app/actions/apply.ts`:
- The shortlisting threshold was `score > 80` (should be `>= 70`).
- `runEnrichment()` was calling Claude with only LinkedIn/GitHub URLs as context, producing hallucinated research profiles. Redesigned to run Tavily searches first and pass real web data as grounded context.
- `runEnrichment()` was passing unsanitized Tavily content to Claude, causing "no low surrogate in string" errors on pages with emoji. Fixed with `sanitizeForClaude()` helper.

**Iterative refinement:** Each phase was built and tested independently. Claude Code was used to review files written in previous sessions, catching issues like the raw body/HMAC ordering problem in the Fireflies webhook.

### Prompt Engineering Evolution

One of the key learnings during this build was how prompt quality directly affects Claude Code output quality.

Early prompts were informal and underspecified:

> "Fix the threshold bug in apply.ts"
> "Add Tavily to the enrichment function"

These produced code that worked but missed edge cases and required multiple fix iterations.

After studying Google's Prompt Engineering whitepaper (Lee Boonstra, 2024), prompts were restructured using:

1. **Role prompting** — "You are a senior Next.js engineer working on a production AI hiring pipeline"
2. **Context/Task separation** — CONTEXT block (what exists) separated from TASK block (what to build)
3. **Few-shot examples** — showing exact before/after code patterns so Claude Code knew the expected transformation
4. **Explicit edge case numbering** — EC1, EC2, EC3... forcing complete coverage rather than letting Claude Code decide what to handle
5. **Output format specification** — "Write the complete file, do not truncate" eliminated abbreviated responses

**Result:** Single-pass prompt execution with no follow-up fix prompts needed. The structured prompts produced production-quality code on the first attempt.

**Reference:** Google Prompt Engineering Whitepaper v4 (January 2025) — [PDF](https://gptaiflow.com/assets/files/2025-01-18-pdf-1-TechAI-Goolge-whitepaper_Prompt%20Engineering_v4-af36dcc7a49bb7269a58b1c9b89a8ae1.pdf)

---

*Built by Vanshika Bagaria — March 2026*
