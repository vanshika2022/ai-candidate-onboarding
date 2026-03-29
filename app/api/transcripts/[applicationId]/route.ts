/**
 * GET /api/transcripts/[applicationId]
 * ──────────────────────────────────────
 * Admin-only endpoint that returns the transcript for a given application.
 *
 * Authentication: Authorization: Bearer <ADMIN_SECRET>
 *
 * Returns the most recent transcript row for the application, or 404 if none exists.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getTranscriptByApplication } from '@/lib/supabase/server'

// ─── GET handler ──────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: { applicationId: string } }
): Promise<NextResponse> {
  // ── 1. Verify admin Bearer token ──────────────────────────────────────────────
  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret) {
    console.error('[GET /api/transcripts] ADMIN_SECRET env var is not set')
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  if (token !== adminSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Validate param ─────────────────────────────────────────────────────────
  const { applicationId } = params

  if (!applicationId) {
    return NextResponse.json({ error: 'applicationId is required' }, { status: 400 })
  }

  // ── 3. Fetch transcript ───────────────────────────────────────────────────────
  const transcript = await getTranscriptByApplication(applicationId)

  if (!transcript) {
    return NextResponse.json(
      { error: 'Transcript not found for this application' },
      { status: 404 }
    )
  }

  return NextResponse.json(transcript)
}
