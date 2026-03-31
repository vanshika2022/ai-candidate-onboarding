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
      text: "Thanks for joining us today. We have about 45 minutes. I'll start with some background questions, then we'll get into a technical discussion with Mike, and Priya will wrap up with a few team and culture questions.",
      timestamp: 0,
    },
    {
      speaker: 'Candidate',
      text: "Sounds great. Happy to be here. I've been doing backend and infrastructure work for the last several years, mostly in TypeScript and Node, working on API platforms and data pipelines. Most recently I've been focused on building systems that need to handle a lot of throughput while staying reliable.",
      timestamp: 18,
    },
    {
      speaker: 'Sarah (Interviewer)',
      text: "Tell me about a system you built that had to make decisions automatically but still keep humans in the loop for important calls.",
      timestamp: 52,
    },
    {
      speaker: 'Candidate',
      text: "Good question. We had a fraud detection system that scored transactions in real time. Anything above 90 was auto-blocked, anything below 30 was auto-approved, and everything in between went to a human reviewer. The key was getting the thresholds right. Too strict and you block legitimate customers. Too loose and fraud gets through. We ended up tuning the thresholds weekly based on false positive rates and letting the ops team adjust them without a code deploy.",
      timestamp: 68,
    },
    {
      speaker: 'Mike (Tech Lead)',
      text: "That's interesting because we deal with a similar problem here. When you have an AI making a screening decision about a person, how do you think about where to draw the line between automation and human review?",
      timestamp: 120,
    },
    {
      speaker: 'Candidate',
      text: "I think about it in terms of consequences. If the AI gets it wrong, what happens? For low stakes decisions, automate fully. For high stakes, the AI should recommend but a human should confirm. The worst case is when the AI makes a high stakes decision silently and nobody reviews it. You need clear routing. Clear cases go fast, ambiguous cases get flagged, and the human always has an override with a logged reason.",
      timestamp: 140,
    },
    {
      speaker: 'Mike (Tech Lead)',
      text: "How would you validate that an LLM is actually returning reliable structured output? We've had issues where the model returns slightly different formats depending on the input.",
      timestamp: 195,
    },
    {
      speaker: 'Candidate',
      text: "Schema validation on every response, no exceptions. I'd use something like Zod to define the exact shape you expect and parse every response through it before writing to the database. If it fails validation, don't crash, just route it to a fallback path. Maybe flag it for manual review or retry with a simpler prompt. The important thing is you never let bad data into your database silently. A null score that gets stored as zero looks like a real score and nobody catches it.",
      timestamp: 212,
    },
    {
      speaker: 'Sarah (Interviewer)',
      text: "When you're working with external APIs and web data that might be unreliable, how do you handle that in a pipeline?",
      timestamp: 268,
    },
    {
      speaker: 'Candidate',
      text: "You have to assume external data is messy. Unicode issues, missing fields, rate limits, timeouts. I sanitize everything before it touches my system. For web scraping or search results, I strip characters that could break downstream processing. For API calls, I set aggressive timeouts and have fallback behavior. The pipeline should degrade gracefully. If enrichment fails, the core decision still works, it just has less context.",
      timestamp: 285,
    },
    {
      speaker: 'Mike (Tech Lead)',
      text: "Let's talk about cost management with LLMs. If you're processing thousands of items through an AI pipeline, how do you keep token costs from getting out of control?",
      timestamp: 340,
    },
    {
      speaker: 'Candidate',
      text: "A few things. First, don't send everything to the most expensive model. Use a cheap fast model to triage and only send the hard cases to the expensive one. Second, cap your inputs. If a document is 10 pages but the signal is in the first 3, don't send all 10. Third, gate expensive operations. If step one already tells you the answer is no, don't run step two. And track token usage per call so you can spot when a prompt is consuming more than expected.",
      timestamp: 358,
    },
    {
      speaker: 'Priya (HR)',
      text: "How do you think about bias when you're building systems that evaluate people?",
      timestamp: 415,
    },
    {
      speaker: 'Candidate',
      text: "It's something you have to design for explicitly, not hope for. I'd want the model to check its own reasoning before finalizing. Things like, am I penalizing this person for an employment gap that has nothing to do with their ability? Am I overweighting where they went to school versus what they actually built? You can't eliminate bias but you can surface it. Show the flags to the human reviewer and let them make the call. The AI should never auto-reject based on something that might be biased.",
      timestamp: 432,
    },
    {
      speaker: 'Mike (Tech Lead)',
      text: "What about when you're comparing information from multiple sources and they don't match? Like a resume says one thing but an online profile says something different.",
      timestamp: 490,
    },
    {
      speaker: 'Candidate',
      text: "You need to distinguish between a real contradiction and missing data. If someone's resume says they were a Director but LinkedIn says Manager, that's worth flagging. But if you just can't find their Twitter profile, that's not a red flag, that's just missing information. I'd label those differently. Real contradictions get flagged for review. Missing data gets noted but doesn't count against them. And you definitely don't want to auto-reject based on unverified web scraping results. The data quality isn't good enough for that.",
      timestamp: 508,
    },
    {
      speaker: 'Priya (HR)',
      text: "Last question from me. What kind of team environment do you do your best work in?",
      timestamp: 570,
    },
    {
      speaker: 'Candidate',
      text: "Small teams with clear ownership. I like environments where I can own a system end to end, make decisions quickly, and ship without a lot of process overhead. But I also want code review and somebody who'll push back on my ideas when I'm wrong. The best teams I've been on had strong opinions loosely held. We'd debate the approach, pick one, commit, and move fast.",
      timestamp: 585,
    },
    {
      speaker: 'Sarah (Interviewer)',
      text: "Any questions for us?",
      timestamp: 635,
    },
    {
      speaker: 'Candidate',
      text: "Yeah, two things. How does the team handle on-call, and what does the first 90 days look like for someone in this role? I want to understand how quickly I'd be expected to ship versus ramp up.",
      timestamp: 645,
    },
  ]

  const summary =
    'Strong technical interview. Candidate demonstrated clear thinking on human-in-the-loop system design, LLM output validation, token cost management, and bias detection in AI-powered evaluation systems. Gave practical examples from production experience including fraud detection thresholds and data pipeline reliability. Showed mature perspective on distinguishing real data contradictions from missing information. Communication was direct and specific throughout. Recommended for next steps.'

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
