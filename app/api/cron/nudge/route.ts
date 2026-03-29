/**
 * GET /api/cron/nudge
 * ───────────────────
 * Scheduled cron endpoint. Runs every 15 minutes via Vercel Cron (see vercel.json).
 * Secured by x-cron-secret header — must match CRON_SECRET env var.
 *
 * ── Task A: 48-hour nudge ─────────────────────────────────────────────────────
 * Finds applications sitting in 'slots_held' or 'slots_offered' for 48+ hours
 * where the candidate has not yet selected an interview slot.
 * Sends a reminder email via Resend to each candidate.
 *
 * Note on timestamp: applications has no updated_at column. We use shortlisted_at
 * as the proxy — it marks when slots became relevant — with created_at as fallback
 * for records where shortlisted_at was not set (e.g. manual overrides).
 *
 * ── Task B: Expire stale calendar holds ──────────────────────────────────────
 * Finds interview_slots rows where status = 'tentative_hold' AND hold_expires_at
 * has passed. Marks them 'expired'. If ALL slots for an application are now
 * expired, resets the application to 'pending_review' and emails the admin.
 *
 * Returns: { nudges_sent: number, slots_expired: number }
 */

import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[cron/nudge] CRON_SECRET is not configured')
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const incomingSecret = req.headers.get('x-cron-secret') ?? ''
  if (incomingSecret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase   = createAdminClient()
  const resend     = new Resend(process.env.RESEND_API_KEY)
  const fromEmail  = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'
  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const adminEmail = process.env.ADMIN_EMAIL ?? fromEmail
  const toOverride = process.env.RESEND_TO_OVERRIDE ?? null

  let nudgesSent   = 0
  let slotsExpired = 0

  // ═══════════════════════════════════════════════════════════════════════════
  // Task A — 48-hour nudge
  // ═══════════════════════════════════════════════════════════════════════════

  // Fetch all applications currently waiting for the candidate to pick a slot.
  // We query both statuses: slots_held (set by scheduleInterview server action)
  // and slots_offered (legacy / manual override path).
  const { data: staleApps, error: staleError } = await supabase
    .from('applications')
    .select('id, shortlisted_at, created_at, candidates(full_name, email), jobs(title)')
    .in('status', ['slots_held', 'slots_offered'])

  if (staleError) {
    console.error('[cron/nudge] Task A — failed to fetch stale applications:', staleError.message)
  } else if (staleApps && staleApps.length > 0) {
    const cutoff   = new Date(Date.now() - 48 * 60 * 60 * 1000)

    for (const app of staleApps) {
      // Determine the effective "entered waiting state" timestamp.
      // shortlisted_at is the last meaningful timestamp before slots are offered.
      // Fall back to created_at for rows where shortlisted_at was not recorded.
      const effectiveTs = app.shortlisted_at
        ? new Date(app.shortlisted_at)
        : new Date(app.created_at)

      if (effectiveTs >= cutoff) {
        // Less than 48 hours — not yet time to nudge
        continue
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const candidate      = app.candidates as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const job            = app.jobs as any
      const candidateName: string = candidate?.full_name ?? 'there'
      const candidateEmail: string = candidate?.email ?? ''
      const jobTitle: string = job?.title ?? 'your applied role'

      if (!candidateEmail) {
        console.warn(`[cron/nudge] Task A — application ${app.id} has no candidate email, skipping`)
        continue
      }

      const portalLink = `${appUrl}/portal/${app.id}`
      const toEmail    = toOverride ?? candidateEmail

      const firstName = candidateName.split(' ')[0]

      const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Georgia,serif;">
  <div style="max-width:560px;margin:48px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="background:#4f46e5;padding:28px 40px;">
      <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Niural</p>
      <p style="margin:4px 0 0;font-size:12px;color:#c7d2fe;letter-spacing:0.5px;text-transform:uppercase;">The Future of Work</p>
    </div>
    <div style="padding:40px;">
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f172a;">Hi ${firstName},</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
        We noticed you haven&apos;t selected an interview slot yet for the
        <strong>${jobTitle}</strong> role at Niural.
      </p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
        The slots we&apos;ve reserved for you may expire soon. Please click below to
        choose a time that works for you — it only takes a few seconds.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${portalLink}"
           style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;
                  font-family:Georgia,serif;font-size:15px;font-weight:600;
                  padding:14px 36px;border-radius:8px;">
          Select Your Interview Slot
        </a>
      </div>
      <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;">
        Or copy this link into your browser:
      </p>
      <p style="margin:0 0 32px;font-size:13px;color:#4f46e5;word-break:break-all;">
        <a href="${portalLink}" style="color:#4f46e5;">${portalLink}</a>
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 24px;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">
        Application reference: <span style="font-family:monospace;">${app.id}</span>
      </p>
      <p style="margin:8px 0 0;font-size:13px;color:#94a3b8;">
        If you have any questions, reply to this email or reach out to your recruiter.
      </p>
    </div>
    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">Niural · The Future of Work</p>
    </div>
  </div>
</body>
</html>`.trim()

      try {
        const { error: emailError } = await resend.emails.send({
          from: fromEmail,
          to: toEmail,
          subject: 'Following up on your interview slot selection',
          html: emailHtml,
        })

        if (emailError) {
          console.error(
            `[cron/nudge] Task A — Resend error for application ${app.id}:`,
            emailError
          )
        } else {
          nudgesSent++
          console.log(
            `[cron/nudge] Task A — nudge sent to ${candidateEmail} (application ${app.id})`
          )
        }
      } catch (err) {
        console.error(
          `[cron/nudge] Task A — failed to send nudge for application ${app.id}:`,
          err
        )
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Task B — Expire stale calendar holds
  // ═══════════════════════════════════════════════════════════════════════════

  // Find all tentative_hold slots whose hold window has lapsed.
  // interview_slots is the schema table for individual slot rows with
  // expiry timestamps (distinct from applications.tentative_slots JSONB).
  const now = new Date().toISOString()

  const { data: expiredSlots, error: expiredFetchError } = await supabase
    .from('interview_slots')
    .select('id, application_id')
    .eq('status', 'tentative_hold')
    .lt('hold_expires_at', now)

  if (expiredFetchError) {
    console.error(
      '[cron/nudge] Task B — failed to fetch expired slots:',
      expiredFetchError.message
    )
  } else if (expiredSlots && expiredSlots.length > 0) {
    const expiredIds     = expiredSlots.map((s) => s.id)
    const affectedAppIds = Array.from(new Set(expiredSlots.map((s) => s.application_id as string)))

    // Mark all expired slots as 'expired' in one update
    const { error: updateError } = await supabase
      .from('interview_slots')
      .update({ status: 'expired' })
      .in('id', expiredIds)

    if (updateError) {
      console.error(
        '[cron/nudge] Task B — failed to update expired slots:',
        updateError.message
      )
    } else {
      slotsExpired = expiredIds.length
      console.log(`[cron/nudge] Task B — expired ${slotsExpired} slot(s)`)

      // For each affected application, check whether ALL its slots are now expired.
      // If so, reset the application to 'pending_review' and notify the admin.
      for (const appId of affectedAppIds) {
        // Count any remaining non-expired slots for this application
        const { data: remaining, error: remainingError } = await supabase
          .from('interview_slots')
          .select('id', { count: 'exact', head: true })
          .eq('application_id', appId)
          .neq('status', 'expired')

        if (remainingError) {
          console.error(
            `[cron/nudge] Task B — failed to count remaining slots for application ${appId}:`,
            remainingError.message
          )
          continue
        }

        // remaining is null when head: true — use the count property
        const remainingCount = (remaining as unknown as { count: number } | null)?.count ?? 0

        if (remainingCount > 0) {
          // Some slots still active — application stays as-is
          continue
        }

        // All slots expired — reset application to pending_review
        const { data: appRow, error: appFetchError } = await supabase
          .from('applications')
          .select('id, status, candidates(full_name, email), jobs(title)')
          .eq('id', appId)
          .single()

        if (appFetchError || !appRow) {
          console.error(
            `[cron/nudge] Task B — failed to fetch application ${appId}:`,
            appFetchError?.message
          )
          continue
        }

        // Only reset if the application is still in a slot-related status.
        // Don't overwrite confirmed/interviewed/hired states.
        const slotStatuses = ['slots_held', 'slots_offered', 'interview_scheduled']
        if (!slotStatuses.includes(appRow.status)) {
          console.log(
            `[cron/nudge] Task B — application ${appId} is in status '${appRow.status}', skipping reset`
          )
          continue
        }

        const { error: resetError } = await supabase
          .from('applications')
          .update({ status: 'pending_review' })
          .eq('id', appId)

        if (resetError) {
          console.error(
            `[cron/nudge] Task B — failed to reset application ${appId}:`,
            resetError.message
          )
          continue
        }

        console.log(
          `[cron/nudge] Task B — application ${appId} reset to pending_review (all slots expired)`
        )

        // Send admin alert
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const appCandidate = (appRow.candidates as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const appJob       = (appRow.jobs as any)
        const candidateName: string = appCandidate?.full_name ?? 'Unknown Candidate'
        const jobTitle: string      = appJob?.title ?? 'Unknown Role'

        const adminAlertHtml = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Georgia,serif;">
  <div style="max-width:560px;margin:48px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="background:#0f172a;padding:28px 40px;">
      <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Niural Admin</p>
      <p style="margin:4px 0 0;font-size:12px;color:#94a3b8;letter-spacing:0.5px;text-transform:uppercase;">Interview Slots Expired</p>
    </div>
    <div style="padding:40px;">
      <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#0f172a;">⏰ Interview Slots Expired</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#334155;">
        All interview slots for <strong>${candidateName}</strong> (${jobTitle}) have expired
        without the candidate selecting one.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#334155;">
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-weight:600;width:40%;">Candidate</td>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">${candidateName}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-weight:600;">Role</td>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">${jobTitle}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-weight:600;">New Status</td>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">pending_review</td>
        </tr>
        <tr>
          <td style="padding:10px 0;font-weight:600;">Application ID</td>
          <td style="padding:10px 0;font-family:monospace;font-size:12px;">${appId}</td>
        </tr>
      </table>
      <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;">
        The application has been reset to <strong>pending_review</strong>.
        Please log in to reschedule or take further action.
      </p>
    </div>
  </div>
</body>
</html>`.trim()

        try {
          const { error: adminEmailError } = await resend.emails.send({
            from: fromEmail,
            to: toOverride ?? adminEmail,
            subject: `Interview slots expired — ${candidateName} (${jobTitle})`,
            html: adminAlertHtml,
          })

          if (adminEmailError) {
            console.error(
              `[cron/nudge] Task B — admin alert email failed for application ${appId}:`,
              adminEmailError
            )
          } else {
            console.log(
              `[cron/nudge] Task B — admin alert sent for application ${appId}`
            )
          }
        } catch (err) {
          console.error(
            `[cron/nudge] Task B — failed to send admin alert for application ${appId}:`,
            err
          )
        }
      }
    }
  }

  // ── Result ────────────────────────────────────────────────────────────────
  console.log(
    `[cron/nudge] Complete — nudges_sent: ${nudgesSent}, slots_expired: ${slotsExpired}`
  )

  return NextResponse.json({
    nudges_sent:   nudgesSent,
    slots_expired: slotsExpired,
  })
}
