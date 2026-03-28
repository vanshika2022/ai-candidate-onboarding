/**
 * POST /api/webhook/fireflies
 * ───────────────────────────
 * Mock Fireflies.ai webhook endpoint.
 *
 * In production, Fireflies would POST to this URL after a meeting ends,
 * carrying the transcript and summary. The real payload uses their GraphQL
 * schema; this mock accepts a simplified version for local development.
 *
 * Expected body:
 * {
 *   "application_id": "<uuid>",       // Niural application ID
 *   "fireflies_id":   "<string>",     // Fireflies meeting ID (optional, auto-generated if absent)
 *   "candidate_name": "<string>",     // Used for mock transcript generation
 *   "job_title":      "<string>"      // Used for mock transcript generation
 * }
 *
 * On success: writes a row to the `transcripts` table and updates
 * the application status to 'interviewed'.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { generateMockTranscript } from '@/lib/services/fireflies'

export async function POST(req: NextRequest) {
  // ── 1. Parse body ──────────────────────────────────────────────────────────
  let body: {
    application_id?: string
    fireflies_id?: string
    candidate_name?: string
    job_title?: string
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { application_id, candidate_name = 'Candidate', job_title = 'Role' } = body

  if (!application_id) {
    return NextResponse.json({ error: 'application_id is required' }, { status: 400 })
  }

  // ── 2. Verify application exists ──────────────────────────────────────────
  const supabase = createAdminClient()

  const { data: app, error: fetchError } = await supabase
    .from('applications')
    .select('id, status, candidates(full_name), jobs(title)')
    .eq('id', application_id)
    .single()

  if (fetchError || !app) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  // ── 3. Generate mock transcript ───────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolvedName = (app.candidates as any)?.full_name ?? candidate_name
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolvedTitle = (app.jobs as any)?.title ?? job_title

  const transcript = generateMockTranscript(application_id, resolvedName, resolvedTitle)

  // ── 4. Insert transcript row ──────────────────────────────────────────────
  const { error: transcriptError } = await supabase.from('transcripts').insert({
    application_id,
    fireflies_id:     transcript.fireflies_id,
    summary:          transcript.summary,
    full_transcript:  {
      action_items:     transcript.action_items,
      entries:          transcript.full_transcript,
    },
    retrieved_at: transcript.retrieved_at,
  })

  if (transcriptError) {
    console.error('[Fireflies webhook] transcript insert failed:', transcriptError.message)
    return NextResponse.json({ error: transcriptError.message }, { status: 500 })
  }

  // ── 5. Advance application status → interviewed ───────────────────────────
  const { error: statusError } = await supabase
    .from('applications')
    .update({ status: 'interviewed' })
    .eq('id', application_id)
    .in('status', ['confirmed', 'interview_scheduled'])  // only advance if interview was scheduled

  if (statusError) {
    console.error('[Fireflies webhook] status update failed:', statusError.message)
    // Don't fail the webhook — transcript is already saved
  }

  return NextResponse.json({
    ok: true,
    fireflies_id: transcript.fireflies_id,
    application_id,
  })
}
