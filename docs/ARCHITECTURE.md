# Architecture Deep Dive

> Phase-by-phase breakdown, state machine, system diagram, and edge case catalog.

---

## Application State Machine

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
                                                                rejected   pending_review  shortlisted
                                                                                               │
                                                                                        runEnrichment()
                                                                                        Tavily × 3 + Sonnet
                                                                                               │
                                                                                        scheduleInterview()
                                                                                        5 TENTATIVE holds
                                                                                               │
                                                                                          slots_held
                                                                                    [48hr nudge if no response]
                                                                                               │
                                                                                    confirmInterviewSlot()
                                                                                    1 CONFIRMED, 4 DELETED
                                                                                               │
                                                                                          confirmed
                                                                                               │
                                                                                    Fireflies webhook/mock
                                                                                               │
                                                                                         interviewed
                                                                                               │
                                                                                    generateOffer() → Sonnet
                                                                                               │
                                                                                          offer_sent
                                                                                               │
                                                                                    candidate signs /sign/[id]
                                                                                               │
                                                                                            hired
                                                                                               │
                                                                                    Slack onboarding DM
```

Full status enum: `applied` | `screening` | `shortlisted` | `slots_offered` | `slots_held` | `interview_scheduled` | `confirmed` | `interviewed` | `offer_sent` | `hired` | `rejected` | `pending_review` | `manual_review_required`

---

## System Diagram

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
│  app/actions/apply.ts        POST /api/webhooks/fireflies           │
│  app/actions/schedule.ts     POST /api/mocks/fireflies              │
│  app/actions/offer.ts        POST /api/offers/[id]/sign             │
│  app/actions/updateStatus.ts POST /api/onboarding/slack             │
│                              POST /api/webhooks/slack               │
│  Admin Pages (RSC + Client)  GET  /api/cron/nudge                   │
│  /admin/applications         GET  /api/transcripts/[id]             │
│  /admin/applications/[id]                                            │
└──────┬──────────────────────────────────────────────────────────────┘
       │
       ├──► Anthropic API (Opus screening, Sonnet enrichment/offers/DMs)
       ├──► Tavily Search API (3 parallel searches per shortlisted candidate)
       ├──► Google Calendar v3 (freebusy, holds, confirm+release)
       ├──► Resend (nudge emails, offer delivery, hire alerts)
       ├──► Slack API (welcome DM, HR channel, queued messages)
       │
┌──────▼──────────────────────────────────────────────────────────────┐
│                          SUPABASE (Postgres)                         │
│  candidates · jobs · applications · transcripts · offer_letters     │
│  interview_slots · pending_slack_messages                            │
│  Storage: resumes bucket (private, service-role access only)        │
└─────────────────────────────────────────────────────────────────────┘
```

**Layer rules:**
- All DB writes use `createAdminClient()` (service-role, bypasses RLS) — only in Server Actions and Route Handlers.
- Public reads use `createAnonClient()` against RLS-protected tables.
- All secrets are server-only (not `NEXT_PUBLIC_` prefixed).

---

## Phase-by-Phase Breakdown

### Phase 1 — Job Discovery
**Files:** `app/jobs/page.tsx`, `app/jobs/[id]/page.tsx`

Jobs fetched from Supabase with anon client, filtered to `status = 'open'`. No AI.

### Phase 2 — Application & AI Screening
**Files:** `app/actions/apply.ts`, `components/ApplyModal.tsx`, `components/DragDropUpload.tsx`

`submitApplication()` Server Action pipeline:
1. Field + file validation (server-side, never trust client)
2. Resume extraction via `unpdf` (PDF) or `mammoth` (DOCX)
3. Low-density check (< 200 chars → `manual_review_required`)
4. Candidate upsert + storage upload + duplicate check
5. Haiku pre-screen → Opus screening with `thinking: { type: 'adaptive' }`
6. Score routing: ≥70 shortlisted, 50–69 pending_review, <50 rejected
7. Enrichment (shortlisted only): 3 Tavily searches → Unicode sanitize → Sonnet synthesis
8. Single DB insert with all fields

### Phase 3 — Admin Review
**Files:** `app/admin/applications/page.tsx`, `app/admin/applications/[id]/page.tsx`

Dashboard shows score badges, status pills, discrepancy warning badges. Detail page surfaces: AI score ring, rationale, sixty_second_brief, structured_data, research_profile, transcript section, offer status. Manual override panel with required written note. 3+ discrepancy flags block auto-scheduling.

### Phase 4 — Interview Scheduling (Hold & Release)
**Files:** `lib/services/calendar.ts`, `app/actions/schedule.ts`, `app/portal/[id]/page.tsx`

1. `getAvailableSlots()` — freebusy API, 14-day window, business hours, 30-min boundaries
2. `createTentativeHolds()` — 5 TENTATIVE events created immediately
3. Candidate picks slot at `/portal/[id]` → `confirmAndRelease()` upgrades to CONFIRMED, deletes other 4
4. 48-hour cron nudge for non-responders, automatic slot expiry

### Phase 5 — Interview Transcription
**Files:** `app/api/webhooks/fireflies/route.ts`, `app/api/mocks/fireflies/route.ts`

Real path: HMAC-SHA256 verified webhook → email matching → GraphQL fetch → idempotent insert → status advance.
Mock path: Admin-authenticated fixture injection for demo.

### Phase 6 — Offer & Signing
**Files:** `app/actions/offer.ts`, `app/api/offers/[id]/sign/route.ts`, `app/sign/[id]/page.tsx`

Sonnet drafts HTML offer letter. Admin reviews and sends. Candidate signs at `/sign/[offerId]` (public, UUID as access token). Signature PNG + IP + timestamp recorded. Replay protection via status check.

### Phase 7 — Slack Onboarding
**Files:** `app/api/onboarding/slack/route.ts`, `app/api/webhooks/slack/route.ts`

Fire-and-forget after signing. Sonnet generates personalized DM. If candidate not in Slack: queued in `pending_slack_messages`, delivered on `team_join` webhook. HR channel notification with discrepancy warning if applicable.

---

## Edge Cases Catalog

| # | Edge case | How it's handled | File |
|---|---|---|---|
| 1 | Scanned image PDF (< 200 chars) | Low-density check before AI → `manual_review_required` | `apply.ts` |
| 2 | Concurrent slot booking | TENTATIVE holds = per-candidate unique slots, no shared pool | `calendar.ts` |
| 3 | LLM malformed JSON | String preprocessing + Zod in try/catch → `manual_review_required` or `applied` | `apply.ts` |
| 4 | Resume extraction failure | try/catch → `manual_review_required`, resume still uploaded | `apply.ts` |
| 5 | Duplicate application | Candidate upsert + pre-AI duplicate check + 23505 catch | `apply.ts` |
| 6 | Fireflies webhook for unknown meeting | Returns 200 (prevents retry loop) | `webhooks/fireflies` |
| 7 | Meet link generation failure | Falls back to portal URL | `calendar.ts` |
| 8 | Candidate not in Slack | Queued in `pending_slack_messages`, delivered on `team_join` | `onboarding/slack` |
| 9 | Mock Fireflies on wrong status | Status guard: must be confirmed/scheduled/shortlisted | `mocks/fireflies` |
| 10 | Unicode from Tavily breaking Claude | `sanitizeForClaude()` strips lone surrogates | `apply.ts` |
| 11 | Double offer signing | Status check → 400 on subsequent attempts | `offers/[id]/sign` |
| 12 | Discrepancies on hired candidate | `has_discrepancies` permanent, noted in admin alert | `offers/[id]/sign` |
| 13 | Duplicate Fireflies webhook | `fireflies_id` check → skip on duplicate | `webhooks/fireflies` |
| 14 | Transcript for non-confirmed app | Stored but status not regressed | `webhooks/fireflies` |
| 15 | Offer before interview | Status guard blocks generation | `offer.ts` |
| 16 | Duplicate offer for same app | Checks existing draft/sent → 409 | `offer.ts` |
| 17 | Slack onboarding double-trigger | `pending_slack_messages` dedup by email | `onboarding/slack` |
| 18 | Slack rate limit (429) | Retry helper with `Retry-After` backoff | `onboarding/slack` |
| 19 | Mock Fireflies called twice | Idempotency on `mock_{app_id}` | `mocks/fireflies` |
| 20 | 3+ discrepancy flags | Blocks auto-scheduling → `pending_review` | `apply.ts` |
| 21 | Candidate ghosts slot offer | 48hr nudge email + automatic slot expiry via cron | `cron/nudge` |
| 22 | Reschedule request | Haiku extracts preferences, code filters slots, admin approves/declines | `schedule/` |
