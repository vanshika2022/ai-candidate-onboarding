/**
 * POST /api/offers/[id]/sign
 * ──────────────────────────
 * Public endpoint — no auth required. Called when a candidate submits their
 * signature from /sign/[id].
 *
 * Transitions offer → 'signed', application → 'hired', and sends confirmation
 * emails to both the candidate and the admin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  // ── 1. Parse body ─────────────────────────────────────────────────────────────
  let body: { signature_data?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { signature_data } = body
  if (!signature_data) {
    return NextResponse.json({ error: 'signature_data is required' }, { status: 400 })
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

  // Guard: only a 'sent' offer can be signed
  if (offer.status === 'signed') {
    return NextResponse.json(
      { error: 'This offer has already been signed' },
      { status: 400 }
    )
  }
  if (offer.status !== 'sent') {
    return NextResponse.json(
      { error: `Offer cannot be signed in its current status: '${offer.status}'` },
      { status: 400 }
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

  // ── 3. Capture signer IP ──────────────────────────────────────────────────────
  const signerIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'

  // ── 4. Update offer_letters → 'signed' ───────────────────────────────────────
  const { error: offerUpdateError } = await supabase
    .from('offer_letters')
    .update({
      status: 'signed',
      signed_at: new Date().toISOString(),
      signer_ip: signerIp,
    })
    .eq('id', offerId)

  if (offerUpdateError) {
    console.error('[offers/sign] Failed to update offer:', offerUpdateError.message)
    return NextResponse.json({ error: offerUpdateError.message }, { status: 500 })
  }

  // ── 5. Update applications → 'hired' ─────────────────────────────────────────
  const { error: appUpdateError } = await supabase
    .from('applications')
    .update({ status: 'hired' })
    .eq('id', offer.application_id)

  if (appUpdateError) {
    console.error('[offers/sign] Failed to update application status:', appUpdateError.message)
    // Don't fail — the offer is already signed. Log and continue.
  }

  // ── 6. Send emails via Resend ─────────────────────────────────────────────────
  const resend = new Resend(process.env.RESEND_API_KEY)
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'
  const adminEmail = process.env.ADMIN_EMAIL ?? fromEmail
  const toOverride = process.env.RESEND_TO_OVERRIDE

  const signedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  // Candidate confirmation email
  const candidateEmailHtml = `
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
      <div style="text-align:center;margin-bottom:28px;">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;background:#ecfdf5;border-radius:50%;">
          <span style="font-size:28px;">✓</span>
        </div>
      </div>
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f172a;text-align:center;">Welcome to Niural, ${candidateName}!</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
        Your offer for the <strong>${jobTitle}</strong> role has been successfully signed on ${signedDate}.
        We're thrilled to have you joining the team.
      </p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#334155;">
        Your onboarding details and next steps will follow shortly. In the meantime, feel free to reach out
        if you have any questions.
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 24px;">
      <p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8;">
        A copy of your signed offer has been recorded. We're excited to build the future of work together.
      </p>
    </div>
    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">Niural · The Future of Work</p>
    </div>
  </div>
</body>
</html>
  `.trim()

  // Admin alert email
  const adminEmailHtml = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Georgia,serif;">
  <div style="max-width:560px;margin:48px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="background:#0f172a;padding:28px 40px;">
      <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Niural Admin</p>
      <p style="margin:4px 0 0;font-size:12px;color:#94a3b8;letter-spacing:0.5px;text-transform:uppercase;">Offer Alert</p>
    </div>
    <div style="padding:40px;">
      <h1 style="margin:0 0 20px;font-size:20px;font-weight:700;color:#0f172a;">🎉 Offer Signed</h1>
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#334155;">
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-weight:600;width:40%;">Candidate</td>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">${candidateName}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-weight:600;">Email</td>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">${candidateEmail}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-weight:600;">Role</td>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">${jobTitle}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-weight:600;">Signed At</td>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">${signedDate}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-weight:600;">Signer IP</td>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-family:monospace;">${signerIp}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;font-weight:600;">Offer ID</td>
          <td style="padding:10px 0;font-family:monospace;font-size:12px;">${offerId}</td>
        </tr>
      </table>
      <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;">
        The application status has been automatically updated to <strong>hired</strong>.
        Begin onboarding when ready.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim()

  try {
    await Promise.allSettled([
      resend.emails.send({
        from: fromEmail,
        to: toOverride ?? candidateEmail,
        subject: `Welcome to Niural, ${candidateName}! Your offer is confirmed.`,
        html: candidateEmailHtml,
      }),
      resend.emails.send({
        from: fromEmail,
        to: toOverride ?? adminEmail,
        subject: `Offer signed — ${candidateName} accepted ${jobTitle}`,
        html: adminEmailHtml,
      }),
    ])
  } catch (err) {
    // Email failure must not block the sign response — the DB is already updated.
    console.error('[offers/sign] Email send error:', err)
  }

  // ── 7. Fire-and-forget: trigger Slack onboarding ─────────────────────────
  // Do NOT await — Slack delivery must never block the signing response.
  // The candidate's offer is already recorded; onboarding runs in the background.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  fetch(`${appUrl}/api/onboarding/slack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ application_id: offer.application_id }),
  }).catch((err) => console.error('[Slack] Onboarding trigger failed:', err))

  return NextResponse.json({ success: true })
}
