/**
 * POST /api/schedule/reschedule-request
 * ──────────────────────────────────────
 * Candidate-facing endpoint (no auth). Called when a candidate wants
 * different interview time slots than the ones offered.
 *
 * Body: { application_id: string, reason?: string }
 *
 * SQL migration (run in Supabase SQL editor):
 *
 *   ALTER TABLE applications
 *   ADD COLUMN IF NOT EXISTS reschedule_requested_at TIMESTAMPTZ,
 *   ADD COLUMN IF NOT EXISTS reschedule_reason TEXT,
 *   ADD COLUMN IF NOT EXISTS reschedule_status TEXT;
 *   ALTER TYPE app_status ADD VALUE IF NOT EXISTS 'reschedule_requested';
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Parse body ──────────────────────────────────────────────────────────
  let body: { application_id?: string; reason?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { application_id, reason } = body
  if (!application_id) {
    return NextResponse.json({ error: 'application_id is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // ── 2. Fetch application ─────────────────────────────────────────────────
  const { data: app, error: fetchError } = await supabase
    .from('applications')
    .select('id, status, reschedule_status, candidates(full_name, email), jobs(title)')
    .eq('id', application_id)
    .single()

  if (fetchError || !app) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  // Step A: Must be in slots_held
  if (app.status !== 'slots_held') {
    return NextResponse.json(
      { error: `Cannot request reschedule — application status is '${app.status}'. Must be 'slots_held'.` },
      { status: 400 }
    )
  }

  // Step B: Prevent duplicate reschedule requests
  if (app.reschedule_status === 'pending_admin') {
    return NextResponse.json(
      { error: 'Already requested' },
      { status: 400 }
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidateName = (app.candidates as any)?.full_name ?? 'Candidate'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobTitle = (app.jobs as any)?.title ?? 'Role'

  // ── Step C: Update application ───────────────────────────────────────────
  const { error: updateError } = await supabase
    .from('applications')
    .update({
      status: 'reschedule_requested',
      reschedule_requested_at: new Date().toISOString(),
      reschedule_reason: reason?.trim() || null,
      reschedule_status: 'pending_admin',
      tentative_slots: null,
    })
    .eq('id', application_id)

  if (updateError) {
    console.error('[Reschedule] Failed to update application:', updateError.message)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // ── Step D: Email admin via Resend ───────────────────────────────────────
  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const adminEmail = process.env.ADMIN_EMAIL ?? process.env.RESEND_FROM_EMAIL ?? 'admin@niural.com'
    const toEmail = process.env.RESEND_TO_OVERRIDE || adminEmail
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: toEmail,
      subject: `Reschedule request — ${candidateName} for ${jobTitle}`,
      html: `
        <h2>Reschedule Request</h2>
        <p><strong>${candidateName}</strong> has requested different interview times for <strong>${jobTitle}</strong>.</p>
        <p><strong>Reason:</strong> ${reason?.trim() || 'No reason provided'}</p>
        <p style="margin-top:24px;">
          <a href="${appUrl}/admin/applications/${application_id}"
             style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">
            View Candidate Profile &rarr;
          </a>
        </p>
      `,
    })
    console.log(`[Reschedule] Admin notification sent for ${application_id}`)
  } catch (err) {
    // Email failure must not block the response
    console.error('[Reschedule] Failed to send admin email:', err)
  }

  // ── Step E: Return success ───────────────────────────────────────────────
  return NextResponse.json({ success: true })
}
