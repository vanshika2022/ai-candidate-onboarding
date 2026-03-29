# Loom Recording Script — Niural Scout

> **Target:** 12-13 minutes. Leave 2 min buffer for 15 min max.
> **Tone:** Confident, natural, first-person. Narrate decisions, not just clicks.
> **Setup:** 1080p, dark mode, browser maximized, terminal in a separate tab.

---

## Pre-Recording Checklist

- [ ] `npm run dev` running on localhost:3000
- [ ] ngrok running (for Slack webhook)
- [ ] 3 jobs seeded in Supabase (Senior SWE, HR Ops Manager, Product Designer)
- [ ] Browser tabs ready: `/jobs`, `/admin/applications`, Supabase Table Editor, Slack workspace
- [ ] Have a PDF resume file ready to upload
- [ ] Know your ADMIN_SECRET and CRON_SECRET values
- [ ] Slack bot invited to #general channel (for member_joined_channel event)

---

## Demo Candidates

| Candidate | Email | Score | Purpose |
|-----------|-------|-------|---------|
| Fresh candidate | your email | Live | Submit live during recording |
| Existing candidates | from earlier testing | Various | Show admin dashboard depth |

---

## The Script

### [0:00–1:00] OPENING — The Problem

**SCREEN:** `/jobs` landing page — 3 job cards visible

**SAY:**

"Hi, I'm Vanshika. I built Niural Scout — an end-to-end AI-powered hiring pipeline for the AI Product Operator take-home.

The problem this solves: hiring is broken. Recruiters spend hours manually reviewing resumes, chasing calendar availability, copy-pasting interview notes, and drafting offer letters. Good candidates drop off because the process is too slow. And biased feedback slips through and unfairly ends strong candidacies.

Niural Scout automates, augments, and protects every step — from the moment a candidate views a job listing to their first Slack message on Day 1. Every phase is AI-augmented, but with deliberate human-in-the-loop checkpoints where decisions are consequential.

The entire system is built around a single-direction state machine. Every application has one status that only moves forward — applied, screening, shortlisted, slots held, confirmed, interviewed, offer sent, hired. No application ever moves backward unless an admin manually overrides it with a logged note. This makes the pipeline auditable and debuggable."

**TRANSITION:** "Let me show you the candidate experience first."

---

### [1:00–2:00] PHASE 01 — Career Portal & Application

**SCREEN:** `/jobs` page

**SAY:**

"Three open roles — Senior Software Engineer, HR Operations Manager, and Product Designer. Each has a full JD with title, team, location, experience level, responsibilities, and requirements."

**DO:** Click into one job listing → show the full JD → click Apply

**SAY:**

"The application form captures structured fields: name, email, LinkedIn URL — validated by regex — GitHub which is optional, and resume upload. PDF or DOCX only, max 3 megabytes.

A design decision here: I could have asked Claude to parse a free-text submission and extract the name, email, and LinkedIn. But that wastes about 500 tokens per submission on unreliable parsing. Structured form fields are cheaper, faster, and more reliable. Save the AI tokens for where they actually add value."

**DO:** Show file validation — try dragging a .txt or image file (should get rejected)

**SAY:**

"Client-side validation for UX, but I never trust client-only validation. The server re-validates file type and size before any AI call or storage write."

**DO:** Submit a real application with a valid resume

**SAY:**

"The submission triggers the full pipeline — resume extraction, AI screening, web research — all in one Server Action. Let me switch to the admin view while it processes."

**RECOVERY NOTE:** If submission fails, say "Let me show you existing candidates in the admin dashboard instead" and move to Phase 02.

---

### [2:00–5:30] PHASE 02 — AI Screening & Enrichment (THE CORE)

> **TIMING NOTE:** This is your longest and most important section. If running long, cut the Mike Peters rejection demo.

**SCREEN:** `/admin/applications` — table view

**SAY:**

"Admin dashboard — every application with AI score badges, status pills, and applied dates. Filters for role, status, and date range — all client-side, no round trips per filter change."

**DO:** Click into a high-scoring candidate (e.g., one with score 80+)

**SAY:**

"Let me walk through what the AI built for this candidate."

#### Intelligence Profile

**SCREEN:** Scroll to Intelligence Profile section (dark card with score ring)

**SAY:**

"Intelligence Profile — the AI score ring, a two-to-three sentence rationale referencing specific requirements met or missed, and the sixty-second brief. The brief is written as if a hiring manager is verbally briefing the CEO — lead with current role and years of experience, highlight two to three standout skills, note gaps, end with a recommendation signal."

#### Bias Detection

**SCREEN:** Show the AI Bias Self-Check section (orange box) if present

**SAY:**

"This is something the takehome doesn't explicitly ask for, but the problem statement says 'biased feedback slips through and unfairly ends strong candidacies.' So I added a bias self-check to the screening prompt. Before finalizing the score, Claude asks itself four questions: Am I penalizing employment gaps without evidence? Am I overweighting school prestige? Am I undervaluing non-traditional career paths? Am I making assumptions based on name or location? If yes to any, it flags the concern here. These are advisory — they surface to the recruiter as warnings, never auto-reject."

#### Two-Stage Screening Model

**SAY:**

"A key design decision: I use a two-stage screening model. Haiku runs first as a pre-screen — three hundred milliseconds, costs about a fifth of a cent. If the candidate is clearly unqualified — wrong field, less than one year experience — Haiku scores them and we skip the Opus call entirely. That saves about sixty percent of Opus costs at scale.

For candidates worth evaluating, Opus runs with extended thinking mode. The model reasons through conflicting signals before committing to a score. Career changers, non-traditional backgrounds, candidates with skill overlap but level mismatch — these are the cases where extended thinking earns its cost.

And then Sonnet handles enrichment — synthesizing web research. It's a synthesis task, not a multi-criteria scoring task. Sonnet is significantly faster and cheaper than Opus with no meaningful quality difference on writing tasks."

#### Scout Findings — Tavily Research

**SCREEN:** Scroll to Scout Findings (LinkedIn summary, GitHub summary, X findings)

**SAY:**

"For shortlisted candidates, the system runs three parallel Tavily searches — LinkedIn, GitHub, and general web. The results are passed as grounded context to Claude Sonnet.

This is important: the naive approach is asking Claude to 'research this person.' That hallucinates — Claude invents plausible-sounding LinkedIn job titles and GitHub repos. My approach: run the search first, pass real web data, and shift Claude's task from 'research' to 'synthesize.' Claude cannot add information beyond what Tavily returned.

All Tavily content goes through a unicode sanitizer before hitting the Claude API — lone surrogates and characters outside the valid XML range would cause API errors otherwise."

#### Discrepancy Flags

**SCREEN:** Show discrepancy flags section (amber box)

**SAY:**

"Discrepancy flags compare resume claims against actual web findings. But I made a deliberate distinction: a discrepancy means we found real data that contradicts the resume — 'resume says Stripe 2022 to present, LinkedIn shows Tesla.' That's a real flag. But 'LinkedIn profile not found' is not a contradiction — it's unverifiable. Those get prefixed with UNVERIFIABLE and don't count toward the safety threshold.

Five or more critical contradictions block auto-scheduling and move the candidate to pending review. Unverifiable items don't trigger this gate. The recruiter sees everything, but the automation only blocks on real evidence."

#### Rejected Candidate

**DO:** Go back to applications list, click into a low-scoring candidate if available

**SAY:**

"And here's a rejected candidate — score below fifty. Notice: no enrichment ran. No Tavily searches, no Sonnet synthesis. Why spend five thousand tokens researching someone who scored thirty-five? Enrichment only runs for candidates scoring seventy or above. Token economy matters."

**DO:** Show manual status override panel

**SAY:**

"Admin can override any status with a required written note. The system trusts AI for triage but keeps humans in the loop for consequential decisions."

**TRANSITION:** "Now let me show you what happens after shortlisting — calendar orchestration."

---

### [5:30–7:30] PHASE 03 — Calendar Orchestration

**SCREEN:** Show a candidate in `slots_held` status, then open their portal page

**SAY:**

"When a candidate is shortlisted, the system automatically queries Google Calendar's freebusy API for the next fourteen days, finds five available forty-five-minute slots within business hours, and immediately creates five TENTATIVE events on the interviewer's calendar.

This is the Hold and Release pattern — and it's how I solve the slot conflict problem the takehome calls out as a critical edge case."

#### Slot Conflict Prevention

**SAY:**

"The key insight: don't show available slots — show reserved slots. Each candidate gets their own five TENTATIVE holds. The freebusy API treats TENTATIVE events as busy. So when the next candidate is scheduled, those times are already blocked. Forty candidates could all score eighty-plus simultaneously. Each gets their own set of five unique holds. It's architecturally impossible to double-book — no database locks required.

When a candidate confirms one slot, it upgrades to CONFIRMED and the other four holds are deleted, freeing those times for future candidates."

**DO:** Show the portal page with 5 slot options

**SAY:**

"The candidate sees five options at their portal link. Clean UI — six-stage pipeline timeline showing where they are in the process."

**DO:** Confirm a slot

**SCREEN:** Show the confirmation email that arrives

**SAY:**

"Confirmation email with interview date, time, duration, and meeting link."

#### Rescheduling Flow

**SAY:**

"The takehome specifically requires rescheduling. If a candidate requests different times, the system uses Haiku to extract structured preferences from their reason — 'only available Mondays and Wednesdays after 2 PM' becomes preferred days Monday and Wednesday, earliest hour fourteen. Then code filters slots programmatically. Code can't accidentally pick Friday when the candidate said Monday. This is faster and more accurate than asking an LLM to pick from a list.

The admin sees the AI-suggested slots before approving. If they decline, the system auto-tries alternative slots up to two times before falling back to the original options."

#### 48-Hour Nudge

**SAY:**

"If the candidate doesn't respond within forty-eight hours, a cron job sends a reminder email with a direct link back to their portal. If all slots expire, the application resets to pending review and the admin gets an alert. No slots are held indefinitely."

**RECOVERY NOTE:** If calendar isn't connected, say: "Calendar integration requires Google service account credentials. The code is fully written and tested — freebusy queries, tentative holds, confirm and release. For the demo, the scheduling flow works end to end when credentials are configured."

**TRANSITION:** "Interview happens — let me show the transcript integration."

---

### [7:30–8:30] PHASE 04 — AI Notetaker Integration

**SCREEN:** Admin detail page for a confirmed candidate

**SAY:**

"I evaluated four AI notetaker platforms — Read.ai, Fathom, Otter.ai, and Fireflies.ai. Read.ai had no public API. Fathom has webhooks but no retrieval API — you can push but not pull. Otter.ai requires an enterprise plan at forty dollars a month. Fireflies has the best API surface: free tier, GraphQL for transcript retrieval, HMAC-verified webhooks, and it joins meetings as a calendar attendee — no SDK, no browser extension.

The real webhook handler is fully built — HMAC-SHA256 verification with timing-safe comparison, GraphQL transcript fetch, idempotent insert to prevent duplicate webhooks, and a status guard that prevents transcripts from regressing already-hired candidates."

**DO:** Click the "Simulate Interview Complete" button on the admin page

**SAY:**

"For the demo, this button triggers the same downstream pipeline — transcript stored, status advances to interviewed, and the offer form becomes available."

**SCREEN:** Show the transcript section appearing (summary + speaker turns)

**SAY:**

"Full transcript with speaker attribution and timestamps. Four speakers, twenty sentences, covering system design, incident management, AI tooling, and team collaboration."

**TRANSITION:** "The candidate passed the interview. Time for the offer."

---

### [8:30–10:00] PHASE 05 — Offer Letter & E-Signature

**SCREEN:** Admin detail page — offer form visible

**SAY:**

"The takehome requires the system to ask the hiring manager for job title, start date, salary, equity, bonus, manager, and custom terms. All of these are form fields — not AI-inferred. Compensation is a consequential decision. The human fills the form, Claude drafts the letter."

**DO:** Fill in the offer form fields

**DO:** Click Generate

**SAY:**

"Claude Sonnet generates a complete, self-contained HTML offer letter with all inline styles. No extended thinking — this is a structured writing task, not a reasoning task. Thinking would add latency with no quality benefit.

The letter is personalized using the candidate's AI brief and key achievements from screening. It's not a generic template — it references this specific candidate's background."

**DO:** Preview the offer letter → Click Send

**SAY:**

"Admin reviews before sending — human-in-the-loop protection. Pre-generation guards: blocked unless the interview is complete, blocked if a draft or sent offer already exists."

**SCREEN:** Show the signing page at `/sign/[offer-id]`

**SAY:**

"I chose Option B from the takehome — custom signing UI instead of PandaDoc. PandaDoc integration takes two-plus hours and adds an external dependency. Custom signing with signature pad captures the same data — signature PNG, timestamp, and IP address — in a white-labeled, in-app experience.

The signing page is public. The UUID offer ID in the URL is the access token — 2 to the power of 122 entropy, effectively unguessable. Replay protection: the first successful sign locks the status. Subsequent attempts return 400."

**DO:** Draw signature → check agreement box → click Sign

**SCREEN:** Show the success confirmation

**SAY:**

"Signature captured, IP logged, timestamp recorded. Application status moves to hired. Admin receives a hire alert email — and if the candidate had discrepancy flags, the alert includes an explicit warning."

**TRANSITION:** "Offer signed — the onboarding pipeline kicks off automatically."

---

### [10:00–11:30] PHASE 06 — Slack Onboarding

**SCREEN:** Slack workspace — #hiring channel

**SAY:**

"The moment the offer is signed, the system fires a Slack onboarding trigger. It's fire-and-forget — it never blocks the signing response. Two things happen."

**DO:** Show the HR channel notification

**SAY:**

"First, the HR channel gets a hire notification with the candidate's name, role, and start date. If the candidate had discrepancy flags, there's an explicit warning — the paper trail is maintained even after hiring.

Second, Claude Sonnet generates a personalized welcome DM. Not a template — a real AI-generated message using the candidate's name, role, start date, and manager name. The prompt specifies: warm, professional, first-name basis, include onboarding next steps."

**DO:** Show the welcome email that arrived (with start date, manager, Slack join link, onboarding resources)

**SAY:**

"If the candidate isn't in Slack yet — which is the typical case for a new hire — the message is queued in a pending Slack messages table. And we send a welcome email as fallback with the Slack workspace join link, onboarding resources, and the AI-generated welcome message.

The candidate always gets their welcome message, regardless of when they join Slack."

**DO:** Show Supabase Table Editor → `pending_slack_messages` table with queued message

**DO:** If Slack webhook is working: show the candidate joining Slack and the DM arriving

**SAY:**

"When the candidate clicks the Slack join link and enters the workspace, our webhook fires. It looks up pending messages by email, opens a DM channel, and delivers the personalized welcome message. The message is marked as sent — fully idempotent."

**RECOVERY NOTE:** If the Slack DM doesn't arrive live, say: "The webhook is verified and the queued message is in the database. In a stable network environment, joining the workspace triggers immediate delivery. The email fallback ensures the candidate always receives their welcome regardless."

**TRANSITION:** "That's the full pipeline end to end. Let me close with a few things I built beyond the requirements."

---

### [11:30–12:30] EXTRA INITIATIVE & CLOSING

**SCREEN:** README.md in the IDE — scroll through key sections

**SAY:**

"A few things I built that the assignment didn't explicitly ask for.

First — bias detection. The takehome says biased feedback slips through and unfairly ends strong candidacies. I added four anti-bias self-checks directly into the screening prompt. These surface as advisory warnings to the recruiter — they never auto-reject. The right design: AI flags the concern, human makes the call.

Second — the two-stage Haiku-Opus screening model. At five hundred candidates, running Opus on every resume costs real money. Haiku pre-screens in three hundred milliseconds. Clearly unqualified candidates — wrong field, no experience — get a fast score and skip Opus entirely. This saves about sixty percent of Opus costs with no quality loss on candidates that matter.

Third — the UNVERIFIABLE versus CRITICAL distinction in discrepancy flags. A missing LinkedIn profile is not the same as a contradicted employment history. The system treats them differently, and the auto-scheduling gate only triggers on real contradictions.

Fourth — I built a processing queue with a worker endpoint, retry logic, and a health dashboard. It's the foundation for scaling to asynchronous processing with BullMQ and Redis. The architecture is built — connecting it to the submission handler is a one-session refactor."

**SCREEN:** Show the Architectural Decision Log section in README

**SAY:**

"Every major decision is documented with what I considered, what I chose, and why. LangGraph — considered, not implemented, because the pipeline already does what LangGraph provides. Multi-agent scoring — considered, not implemented, because Opus with extended thinking already deliberates internally and the human reviewer is the third arbiter. Multimodal resume parsing — considered, not implemented, because text extraction is faster and cheaper for predominantly text documents.

Good judgment means knowing what not to build as much as what to build."

---

### [12:30–13:00] WHAT I'D BUILD NEXT

**SAY:**

"This is a working prototype, not a finished product. With more time, my priorities would be:

One — async job queue. The candidate currently waits fifteen to twenty seconds during screening. In production, the form submits instantly and AI processing runs in background with real-time status updates via Supabase Realtime.

Two — LinkedIn Partner API for structured profile data instead of Tavily web scraping. Eliminates the common-name ambiguity problem entirely.

Three — Google Workspace for real calendar invites with Meet link auto-generation. The code is fully written — only the credentials differ.

Four — prompt regression testing. A suite of fifty synthetic resumes with known expected scores, run on every deploy, to catch silent scoring drift from model updates.

The architecture is designed for all of these upgrades. None require a rewrite — only additions.

The README has the complete architectural decision log, all twenty-two edge cases documented, seven trade-offs with reasoning, and full setup instructions. The GitHub link is in the submission email. Thank you for reviewing — I'm excited about what this system could become at production scale."

---

## Post-Recording Checklist

- [ ] Video is 12-13 minutes (under 15 max)
- [ ] All 6 phases demonstrated with live interactions
- [ ] Design decisions narrated at every phase (not just clicking through)
- [ ] Edge cases mentioned: slot conflicts, 48hr nudge, duplicate apps, scanned PDFs, bias detection
- [ ] Limitations owned confidently (Google Workspace, Fireflies mock)
- [ ] Extra initiative highlighted: bias detection, Haiku pre-screen, UNVERIFIABLE distinction, queue
- [ ] Upload to Loom
- [ ] Add Loom link to top of README.md
- [ ] Push final commit
- [ ] Send submission email to nirajan@niural.com and rabin@niural.com
  - Subject: "AI Product Operator Assignment — Vanshika Bagaria"
  - Include: GitHub repo link + Loom link

---

## If Running Long — What To Cut

| Priority | Section | Cut to save |
|----------|---------|-------------|
| Cut first | Rejected candidate demo | 45 seconds |
| Cut second | Queue/status endpoint | 30 seconds |
| Cut third | Prompt engineering evolution | 30 seconds |
| Never cut | Bias detection explanation | — |
| Never cut | Hold & Release explanation | — |
| Never cut | Two-stage screening explanation | — |
| Never cut | Slack onboarding demo | — |

---

## If Something Breaks During Recording

| What breaks | What to say |
|-------------|-------------|
| Application submission fails | "Let me show you existing candidates in the admin dashboard — I have several from my testing." |
| Calendar slots don't load | "Calendar integration requires Google service account credentials. The code is fully built — let me show you the Hold and Release implementation in the code briefly." |
| Slack DM doesn't arrive | "The webhook is verified and the message is queued in the database. The email fallback ensures the candidate always receives their welcome." |
| Offer generation fails | "Claude API hiccup — let me show you an existing offer that was generated earlier." |
| Page loads slowly | "The screening pipeline takes fifteen to twenty seconds — Opus with extended thinking. In production, this moves to an async queue." |
| Bias flags don't appear | "Bias flags are advisory and only surface when Claude detects potential scoring bias. Not every candidate triggers them — which is the correct behavior." |
