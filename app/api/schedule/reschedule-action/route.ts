/**
 * POST /api/schedule/reschedule-action
 * ─────────────────────────────────────
 * Admin-only endpoint. Approves or declines a candidate's reschedule request.
 *
 * If approved: calls scheduleInterview() to create new calendar holds and
 *              email candidate, then sets reschedule_status = 'new_slots_sent'.
 * If declined: restores status to 'slots_held', sets reschedule_status = 'declined',
 *              and emails candidate to pick from original options.
 *
 * Authorization: Bearer <ADMIN_SECRET>
 * Body: { application_id: string, action: 'approve' | 'decline' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { scheduleInterview } from '@/app/actions/schedule'

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Admin auth ──────────────────────────────────────────────────────────
  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (token !== adminSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Parse body ──────────────────────────────────────────────────────────
  let body: { application_id?: string; action?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { application_id, action } = body

  if (!application_id) {
    return NextResponse.json({ error: 'application_id is required' }, { status: 400 })
  }

  if (action !== 'approve' && action !== 'decline') {
    return NextResponse.json({ error: "action must be 'approve' or 'decline'" }, { status: 400 })
  }

  const supabase = createAdminClient()

  // ── 3. Fetch application ───────────────────────────────────────────────────
  const { data: app, error: fetchError } = await supabase
    .from('applications')
    .select('id, status, reschedule_status, candidates(full_name, email), jobs(title)')
    .eq('id', application_id)
    .single()

  if (fetchError || !app) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  if (app.reschedule_status !== 'pending_admin') {
    return NextResponse.json(
      { error: `No pending reschedule request (current status: '${app.reschedule_status ?? 'none'}')` },
      { status: 400 }
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidateName = (app.candidates as any)?.full_name ?? 'Candidate'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidateEmail = (app.candidates as any)?.email ?? ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobTitle = (app.jobs as any)?.title ?? 'Role'
  const firstName = candidateName.split(' ')[0]
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const portalUrl = `${appUrl}/portal/${application_id}`

  // ── 4. Handle APPROVE ────────────────────────────────────────────────────
  if (action === 'approve') {
    // Delegate to scheduleInterview — creates new calendar holds and sends
    // the candidate an email with the slot-picker portal link
    const result = await scheduleInterview(application_id)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    // Update reschedule_status (scheduleInterview already set status → slots_held)
    const { error: updateError } = await supabase
      .from('applications')
      .update({ reschedule_status: 'new_slots_sent' })
      .eq('id', application_id)

    if (updateError) {
      console.error('[Reschedule-approve] DB update failed:', updateError.message)
    }

    // Send candidate email with new slot-picker link
    try {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      const toEmail = process.env.RESEND_TO_OVERRIDE || candidateEmail

      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
        to: toEmail,
        subject: `New interview slots available — ${jobTitle} at Niural`,
        html: `
          <h2>New interview times available</h2>
          <p>Hi ${firstName},</p>
          <p>We've found new interview slots for your ${jobTitle} interview.</p>
          <p>Please select your preferred time:</p>
          <p>
            <a href="${portalUrl}"
               style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
              Select your interview slot &rarr;
            </a>
          </p>
          <p>You have 48 hours to select before slots expire.</p>
          <p>Best,<br/>Niural Hiring Team</p>
        `,
      })
      console.log(`[Reschedule-approve] Email sent to ${toEmail}`)
    } catch (err) {
      console.error('[Reschedule-approve] Email failed (non-blocking):', err)
    }

    return NextResponse.json({ success: true })
  }

  // ── 5. Handle DECLINE ────────────────────────────────────────────────────
  if (action === 'decline') {
    // Restore to slots_held and mark reschedule as declined
    const { error: updateError } = await supabase
      .from('applications')
      .update({
        status: 'slots_held',
        reschedule_status: 'declined',
      })
      .eq('id', application_id)

    if (updateError) {
      console.error('[Reschedule-decline] DB update failed:', updateError.message)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Email candidate to pick from original options
    try {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      const toEmail = process.env.RESEND_TO_OVERRIDE || candidateEmail

      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
        to: toEmail,
        subject: `Interview scheduling update — ${jobTitle} at Niural`,
        html: `
          <h2>Interview scheduling update</h2>
          <p>Hi ${firstName},</p>
          <p>We couldn't accommodate your rescheduling request at this time.
          Please select from your original options:</p>
          <p>
            <a href="${portalUrl}"
               style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
              Select your interview slot &rarr;
            </a>
          </p>
          <p>Best,<br/>Niural Hiring Team</p>
        `,
      })
      console.log(`[Reschedule-decline] Email sent to ${toEmail}`)
    } catch (err) {
      console.error('[Reschedule-decline] Email failed:', err)
    }

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unexpected state' }, { status: 500 })
}
