/**
 * POST /api/offers/[id]/send
 * ──────────────────────────
 * Admin-only endpoint. Transitions a draft offer to 'sent' and emails the
 * candidate a link to the signing page.
 *
 * Authorization: Bearer <ADMIN_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  // ── 1. Admin auth ─────────────────────────────────────────────────────────────
  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret) {
    console.error('[offers/send] ADMIN_SECRET not configured')
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (token !== adminSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const offerId = params.id
  const supabase = createAdminClient()

  // ── 2. Fetch offer + application + candidate ───────────────────────────────────
  const { data: offer, error: offerError } = await supabase
    .from('offer_letters')
    .select('id, status, application_id, applications(candidate_id, job_id, candidates(full_name, email), jobs(title))')
    .eq('id', offerId)
    .single()

  if (offerError || !offer) {
    return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
  }

  if (offer.status !== 'draft') {
    return NextResponse.json(
      { error: `Offer is already '${offer.status}' — can only send a draft` },
      { status: 409 }
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const application = offer.applications as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidate = application?.candidates as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const job = application?.jobs as any

  const candidateName: string = candidate?.full_name ?? 'Candidate'
  const candidateEmail: string = candidate?.email ?? ''
  const jobTitle: string = job?.title ?? 'Role'

  if (!candidateEmail) {
    return NextResponse.json({ error: 'Candidate email not found' }, { status: 422 })
  }

  // ── 3. Transition offer status → 'sent' ───────────────────────────────────────
  const { error: offerUpdateError } = await supabase
    .from('offer_letters')
    .update({ status: 'sent' })
    .eq('id', offerId)

  if (offerUpdateError) {
    console.error('[offers/send] Failed to update offer status:', offerUpdateError.message)
    return NextResponse.json({ error: offerUpdateError.message }, { status: 500 })
  }

  // ── 4. Transition application status → 'offer_sent' ──────────────────────────
  const { error: appUpdateError } = await supabase
    .from('applications')
    .update({ status: 'offer_sent' })
    .eq('id', offer.application_id)

  if (appUpdateError) {
    // Log but don't fail — the offer status was already updated
    console.error('[offers/send] Failed to update application status:', appUpdateError.message)
  }

  // ── 5. Email candidate via Resend ─────────────────────────────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const signingUrl = `${appUrl}/sign/${offerId}`
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'
  // In development, Resend free tier only allows sending to the account's verified email.
  // RESEND_TO_OVERRIDE lets you redirect all outbound mail to yourself for testing.
  const toEmail = process.env.RESEND_TO_OVERRIDE ?? candidateEmail

  const resend = new Resend(process.env.RESEND_API_KEY)

  const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Georgia,serif;">
  <div style="max-width:560px;margin:48px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <!-- Header -->
    <div style="background:#4f46e5;padding:28px 40px;">
      <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Niural</p>
      <p style="margin:4px 0 0;font-size:12px;color:#c7d2fe;letter-spacing:0.5px;text-transform:uppercase;">The Future of Work</p>
    </div>
    <!-- Body -->
    <div style="padding:40px;">
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f172a;">You have an offer, ${candidateName}!</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
        Congratulations — we're thrilled to extend you an offer for the <strong>${jobTitle}</strong> role at Niural.
        Please review your offer letter and sign it at your earliest convenience.
      </p>
      <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:#334155;">
        This offer is valid for <strong>5 business days</strong>. Click the button below to read and sign your offer letter.
      </p>
      <!-- CTA -->
      <div style="text-align:center;margin:0 0 32px;">
        <a href="${signingUrl}"
           style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-family:Georgia,serif;font-size:15px;font-weight:600;padding:14px 36px;border-radius:8px;">
          Review &amp; Sign Your Offer
        </a>
      </div>
      <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;">
        Or copy this link into your browser:
      </p>
      <p style="margin:0 0 32px;font-size:13px;color:#4f46e5;word-break:break-all;">
        <a href="${signingUrl}" style="color:#4f46e5;">${signingUrl}</a>
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 24px;">
      <p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8;">
        If you have any questions, reply to this email or reach out to your recruiter.
        We're excited to have you join the team.
      </p>
    </div>
    <!-- Footer -->
    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">Niural · The Future of Work</p>
    </div>
  </div>
</body>
</html>
  `.trim()

  try {
    const { error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: 'Your offer from Niural',
      html: emailHtml,
    })

    if (emailError) {
      console.error('[offers/send] Resend error:', emailError)
      // Don't fail the endpoint — the status was already updated. The admin can resend.
    }
  } catch (err) {
    console.error('[offers/send] Failed to send email:', err)
  }

  return NextResponse.json({ success: true })
}
