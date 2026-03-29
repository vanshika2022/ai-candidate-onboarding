/**
 * POST /api/webhooks/fireflies
 * ────────────────────────────
 * Production Fireflies.ai webhook handler.
 *
 * Fireflies POSTs to this URL after a meeting ends. We:
 *   1. Verify the HMAC-SHA256 signature on the raw body
 *   2. Match the meeting attendee email to a candidate in Supabase
 *   3. Fetch the full transcript from the Fireflies GraphQL API
 *   4. Persist the transcript and advance the application status to 'interviewed'
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FirefliesWebhookPayload {
  meetingId: string
  title: string
  duration: number
  attendees: string[]
}

interface FirefliesSentence {
  speaker_name: string
  raw_words: string
  start_time: number
}

interface FirefliesGraphQLResponse {
  data?: {
    transcript?: {
      title: string
      summary: string
      sentences: FirefliesSentence[]
    }
  }
  errors?: Array<{ message: string }>
}

interface TranscriptEntry {
  speaker: string
  text: string
  timestamp: number
}

// ─── HMAC signature verification ─────────────────────────────────────────────

function verifySignature(rawBody: string, receivedSignature: string): boolean {
  const secret = process.env.FIREFLIES_WEBHOOK_SECRET
  if (!secret) {
    console.error('[Fireflies webhook] FIREFLIES_WEBHOOK_SECRET is not set')
    return false
  }

  const expected = createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex')

  // Use timing-safe comparison to prevent timing attacks
  try {
    const expectedBuf = Buffer.from(expected, 'utf8')
    const receivedBuf = Buffer.from(receivedSignature, 'utf8')
    if (expectedBuf.length !== receivedBuf.length) return false
    return timingSafeEqual(expectedBuf, receivedBuf)
  } catch {
    return false
  }
}

// ─── Fireflies GraphQL fetch ──────────────────────────────────────────────────

async function fetchFirefliesTranscript(meetingId: string): Promise<{
  title: string
  summary: string
  entries: TranscriptEntry[]
} | null> {
  const apiKey = process.env.FIREFLIES_API_KEY
  if (!apiKey) {
    throw new Error('FIREFLIES_API_KEY is not set')
  }

  const query = `
    {
      transcript(id: "${meetingId}") {
        title
        summary
        sentences {
          speaker_name
          raw_words
          start_time
        }
      }
    }
  `

  const response = await fetch('https://api.fireflies.ai/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query }),
  })

  if (!response.ok) {
    throw new Error(
      `Fireflies GraphQL request failed: ${response.status} ${response.statusText}`
    )
  }

  const json = (await response.json()) as FirefliesGraphQLResponse

  if (json.errors?.length) {
    throw new Error(
      `Fireflies GraphQL errors: ${json.errors.map((e) => e.message).join(', ')}`
    )
  }

  const transcript = json.data?.transcript
  if (!transcript) {
    return null
  }

  const entries: TranscriptEntry[] = transcript.sentences.map((s) => ({
    speaker: s.speaker_name,
    text: s.raw_words,
    timestamp: s.start_time,
  }))

  return {
    title: transcript.title,
    summary: transcript.summary,
    entries,
  }
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Read raw body as text (required for HMAC verification) ───────────────
  let rawBody: string
  try {
    rawBody = await req.text()
  } catch (err) {
    console.error('[Fireflies webhook] Failed to read request body:', err)
    return NextResponse.json({ error: 'Failed to read body' }, { status: 400 })
  }

  // ── 2. Verify HMAC-SHA256 signature ────────────────────────────────────────
  const receivedSignature = req.headers.get('x-fireflies-signature') ?? ''
  if (!verifySignature(rawBody, receivedSignature)) {
    console.warn('[Fireflies webhook] Invalid signature — rejecting request')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // ── 3. Parse payload ────────────────────────────────────────────────────────
  let payload: FirefliesWebhookPayload
  try {
    payload = JSON.parse(rawBody) as FirefliesWebhookPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  const { meetingId, attendees = [] } = payload

  if (!meetingId) {
    return NextResponse.json({ error: 'meetingId is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // ── 4. Find application by matching attendee email to candidate ─────────────
  // attendees is an array of email strings; we try each one until we find a match
  let applicationId: string | null = null

  for (const email of attendees) {
    const normalizedEmail = email.trim().toLowerCase()

    const { data, error } = await supabase
      .from('applications')
      .select('id, status, candidates!inner(email)')
      .eq('candidates.email', normalizedEmail)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!error && data) {
      applicationId = data.id
      break
    }
  }

  if (!applicationId) {
    console.warn(
      `[Fireflies webhook] No application found for attendees: ${attendees.join(', ')}`
    )
    // Return 200 so Fireflies doesn't retry — this meeting may not be in our system
    return NextResponse.json(
      { success: false, reason: 'No matching application found' },
      { status: 200 }
    )
  }

  // ── 5. Fetch transcript from Fireflies GraphQL API ──────────────────────────
  let transcriptData: Awaited<ReturnType<typeof fetchFirefliesTranscript>>

  try {
    transcriptData = await fetchFirefliesTranscript(meetingId)
  } catch (err) {
    console.error('[Fireflies webhook] Failed to fetch transcript from Fireflies:', err)
    return NextResponse.json(
      { error: 'Failed to fetch transcript from Fireflies' },
      { status: 500 }
    )
  }

  if (!transcriptData) {
    console.warn(`[Fireflies webhook] Transcript not found for meetingId: ${meetingId}`)
    return NextResponse.json(
      { success: false, reason: 'Transcript not available yet' },
      { status: 200 }
    )
  }

  // ── 6. Idempotent transcript upsert (EC4: duplicate webhook fires) ───────────
  // If Fireflies retries the webhook, we update instead of creating a duplicate.
  const { data: existingTranscript } = await supabase
    .from('transcripts')
    .select('id')
    .eq('fireflies_id', meetingId)
    .maybeSingle()

  if (existingTranscript) {
    console.log(`[Fireflies webhook] Transcript for meetingId ${meetingId} already exists — skipping duplicate`)
    return NextResponse.json({ success: true, duplicate: true })
  }

  const { error: transcriptError } = await supabase.from('transcripts').insert({
    application_id: applicationId,
    fireflies_id: meetingId,
    summary: transcriptData.summary,
    full_transcript: transcriptData.entries,
    retrieved_at: new Date().toISOString(),
  })

  if (transcriptError) {
    console.error(
      '[Fireflies webhook] Failed to insert transcript:',
      transcriptError.message
    )
    return NextResponse.json({ error: transcriptError.message }, { status: 500 })
  }

  // ── 7. Advance application status → interviewed ──────────────────────────────
  // EC6: Accept transcripts from any interview-adjacent status, not just 'confirmed'
  const VALID_TRANSCRIPT_STATUSES = ['confirmed', 'interview_scheduled', 'slots_held', 'shortlisted']

  const { data: currentApp } = await supabase
    .from('applications')
    .select('status')
    .eq('id', applicationId)
    .single()

  if (currentApp && VALID_TRANSCRIPT_STATUSES.includes(currentApp.status)) {
    const { error: statusError } = await supabase
      .from('applications')
      .update({ status: 'interviewed' })
      .eq('id', applicationId)

    if (statusError) {
      console.error('[Fireflies webhook] Failed to update application status:', statusError.message)
    }
  } else if (currentApp) {
    console.warn(`[Fireflies webhook] Application ${applicationId} status is '${currentApp.status}' — not updating to interviewed`)
  }

  console.log(
    `[Fireflies webhook] Transcript stored for application ${applicationId} (meetingId: ${meetingId})`
  )

  return NextResponse.json({ success: true })
}
