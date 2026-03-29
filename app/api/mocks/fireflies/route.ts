// MOCK ENDPOINT — document in README, protect before production

/**
 * POST /api/mocks/fireflies
 * ─────────────────────────
 * Injects a realistic fixture transcript into the transcripts table
 * without requiring a live Fireflies.ai account.
 *
 * Simulates a senior engineering interview: 4 speakers, 20 sentences,
 * covering system design, past experience at scale, AI tooling, and
 * team collaboration.
 *
 * Body:   { application_id: string }
 * Returns { success: true, transcript_id: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

interface TranscriptEntry {
  speaker: string
  text: string
  timestamp: number
}

// ─── Fixture data ─────────────────────────────────────────────────────────────

function buildFixtureTranscript(): { summary: string; entries: TranscriptEntry[] } {
  // Speakers: Sarah (Interviewer), Alex (Candidate), Mike (Tech Lead), Priya (HR)
  // Timestamps: start at 0, increment 15–45 s between turns to feel natural
  const entries: TranscriptEntry[] = [
    {
      speaker: 'Sarah (Interviewer)',
      text: "Welcome, Alex — great to meet you. We have about an hour today. I'll kick us off with a quick intro, then hand to Mike for the technical deep-dive, and Priya will cover culture and process. Sound good?",
      timestamp: 0,
    },
    {
      speaker: 'Alex (Candidate)',
      text: "Perfect, thanks Sarah. I've been looking forward to this. I've spent the last seven years building and scaling backend infrastructure — most recently as a Staff Engineer at a Series C payments company where I owned the core transaction processing platform.",
      timestamp: 22,
    },
    {
      speaker: 'Mike (Tech Lead)',
      text: "Great background. Let's jump straight into system design. Say we need to process a million job applications per month — each triggers an async AI screening job that calls an LLM and writes structured output back to Postgres. Walk me through how you'd architect that end-to-end.",
      timestamp: 58,
    },
    {
      speaker: 'Alex (Candidate)',
      text: "I'd decouple ingestion from processing using a durable message queue — SQS or Kafka depending on your ops maturity. Each application submission publishes an event; a horizontally-scaled worker pool consumes it, calls the LLM with a timeout, validates the JSON output via schema, and writes to Postgres. The workers are stateless so auto-scaling is straightforward.",
      timestamp: 82,
    },
    {
      speaker: 'Mike (Tech Lead)',
      text: "What happens when the LLM call times out or returns a malformed response? Walk me through the failure path.",
      timestamp: 140,
    },
    {
      speaker: 'Alex (Candidate)',
      text: "The worker retries up to three times with exponential backoff — 1s, 4s, 16s. If all three fail, the message lands in a dead-letter queue and the application row is flagged as manual_review_required so a human can intervene. We never silently drop a record. The DLQ triggers a CloudWatch alarm so ops is paged within five minutes.",
      timestamp: 163,
    },
    {
      speaker: 'Mike (Tech Lead)',
      text: "Good. How do you avoid duplicate processing if a worker crashes mid-job and the message becomes visible again?",
      timestamp: 218,
    },
    {
      speaker: 'Alex (Candidate)',
      text: "All writes are idempotent — we use an upsert keyed on application_id with a processed_at timestamp. If the row already exists we skip the LLM call and ack the message. The LLM call itself is the expensive non-idempotent step, so we write a lock record before calling and check for it on retry.",
      timestamp: 238,
    },
    {
      speaker: 'Sarah (Interviewer)',
      text: "Let's shift to past experience. Tell me about the most technically challenging incident you've managed in production — what happened, how you responded, and what changed afterward.",
      timestamp: 292,
    },
    {
      speaker: 'Alex (Candidate)',
      text: "At my last company we had a zero-downtime migration go wrong. A new index on a 400-million-row table held an exclusive lock longer than expected and cascaded into connection pool exhaustion. We saw latency spike from 12ms to 8 seconds across all endpoints within 90 seconds of deploy. I rolled back the migration immediately, coordinated a war-room with five engineers, and we had full recovery in 22 minutes. The post-mortem added mandatory shadow-table migrations for any table above 10 million rows.",
      timestamp: 315,
    },
    {
      speaker: 'Priya (HR)',
      text: "That's a great example of staying calm under pressure. How do you communicate during an incident to stakeholders who aren't engineers — say, the CEO or a client-facing team?",
      timestamp: 388,
    },
    {
      speaker: 'Alex (Candidate)',
      text: "I use a three-part format: one sentence on what's broken, one sentence on user impact in plain language, and one sentence on what we're doing and when we expect resolution. I send updates every 15 minutes until resolved, even if the update is just 'still investigating'. Stakeholders handle uncertainty better when they hear from you regularly.",
      timestamp: 408,
    },
    {
      speaker: 'Mike (Tech Lead)',
      text: "Let's talk AI tooling specifically. You mentioned LLM integration — have you shipped LLM-powered features in production? What was the hardest engineering problem you ran into?",
      timestamp: 455,
    },
    {
      speaker: 'Alex (Candidate)',
      text: "Yes — we used Claude for extracting structured data from unstructured financial documents. The hardest problem was prompt regression: a model update silently shifted the output format for edge-case inputs and we didn't catch it for three days. After that we built a regression suite — a golden dataset of 200 documents with expected outputs — that runs on every deploy and blocks merge if accuracy drops more than two percent.",
      timestamp: 475,
    },
    {
      speaker: 'Mike (Tech Lead)',
      text: "How did you handle cost and latency at scale for those LLM calls? Did you do any caching or batching?",
      timestamp: 533,
    },
    {
      speaker: 'Alex (Candidate)',
      text: "We cached identical prompt hashes with a 24-hour TTL using Redis — about 18% of calls were cache hits. For latency we switched to streaming responses so the UI could start rendering immediately. We also tracked per-call token usage in a metrics table, which let us catch runaway prompts early and trim them before they hit token limits.",
      timestamp: 553,
    },
    {
      speaker: 'Priya (HR)',
      text: "How do you approach collaboration when you strongly disagree with a technical direction the team has already committed to?",
      timestamp: 608,
    },
    {
      speaker: 'Alex (Candidate)',
      text: "I flag it once, clearly and with specifics — here's the risk I see and here's what I'd do differently. If the team decides to proceed anyway I commit fully and make it work. What I avoid is litigating the decision repeatedly or building in escape hatches 'just in case I'm right'. Passive resistance is more corrosive than the original disagreement.",
      timestamp: 628,
    },
    {
      speaker: 'Sarah (Interviewer)',
      text: "Last thing from us — do you have any questions about the role, the team, or where the product is headed?",
      timestamp: 682,
    },
    {
      speaker: 'Alex (Candidate)',
      text: "A few. First, how does the engineering team currently handle the tension between shipping fast and maintaining reliability — is there a formal SLO process or is it more ad-hoc? And second, what does success look like for someone in this role at the 6-month mark, from your perspective?",
      timestamp: 700,
    },
  ]

  const summary =
    'Alex demonstrated strong technical depth across distributed systems design, LLM integration at scale, and incident management. They gave specific, metrics-grounded examples throughout — particularly around the payments platform migration incident and the prompt regression detection system. Communication instincts under pressure were excellent, and they showed mature thinking on team disagreement and commitment. Strong candidate overall; recommend advancing to the take-home stage.'

  return { summary, entries }
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 0. Admin auth (EC2: mock must be admin-only) ────────────────────────────
  const adminSecret = process.env.ADMIN_SECRET
  if (adminSecret) {
    const authHeader = req.headers.get('authorization') ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (token !== adminSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // ── 1. Parse body ─────────────────────────────────────────────────────────────
  let body: { application_id?: string }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { application_id } = body

  if (!application_id) {
    return NextResponse.json({ error: 'application_id is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // ── 2. Validate application exists ────────────────────────────────────────────
  const { data: application, error: fetchError } = await supabase
    .from('applications')
    .select('id, status')
    .eq('id', application_id)
    .single()

  if (fetchError || !application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  // ── 2b. Status guard — only allow mock at valid pipeline stages ───────────────
  const allowedStatuses = ['confirmed', 'interview_scheduled', 'shortlisted']
  if (!allowedStatuses.includes(application.status)) {
    return NextResponse.json(
      {
        error: `Cannot trigger mock transcript. Application status is '${application.status}' — must be confirmed, interview_scheduled, or shortlisted.`,
      },
      { status: 400 }
    )
  }

  // ── 2c. Idempotency — skip if transcript already exists for this application ─
  const { data: existingTranscript } = await supabase
    .from('transcripts')
    .select('id')
    .eq('fireflies_id', `mock_${application_id}`)
    .maybeSingle()

  if (existingTranscript) {
    console.log(`[Fireflies mock] Transcript already exists for application ${application_id} — skipping`)
    return NextResponse.json({ success: true, transcript_id: existingTranscript.id, duplicate: true })
  }

  // ── 3. Build and insert fixture transcript ────────────────────────────────────
  const { summary, entries } = buildFixtureTranscript()

  const { data: transcriptRow, error: transcriptError } = await supabase
    .from('transcripts')
    .insert({
      application_id,
      fireflies_id: `mock_${application_id}`,
      summary,
      full_transcript: entries,
      retrieved_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (transcriptError) {
    console.error('[Fireflies mock] Failed to insert transcript:', transcriptError.message)
    return NextResponse.json({ error: transcriptError.message }, { status: 500 })
  }

  // ── 4. Advance application status → interviewed ───────────────────────────────
  const { error: statusError } = await supabase
    .from('applications')
    .update({ status: 'interviewed' })
    .eq('id', application_id)

  if (statusError) {
    // Log but don't fail — transcript is already persisted
    console.error('[Fireflies mock] Failed to update application status:', statusError.message)
  }

  return NextResponse.json({
    success: true,
    transcript_id: transcriptRow.id,
  })
}
