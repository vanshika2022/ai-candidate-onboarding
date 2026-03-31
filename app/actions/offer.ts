'use server'

/**
 * app/actions/offer.ts
 * ────────────────────
 * Server Actions for the admin offer-letter workflow.
 *
 * generateOffer — calls Claude Sonnet to produce an HTML offer letter and
 *                 persists a 'draft' row to offer_letters.
 *
 * sendOffer     — transitions offer → 'sent', application → 'offer_sent',
 *                 and emails the candidate a signing link via Resend.
 *
 * Both use createAdminClient() — service role key never leaves the server.
 * Model: claude-sonnet-4-5 (no thinking — offer drafting is a writing task).
 */

import Anthropic from '@anthropic-ai/sdk'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ── Types ─────────────────────────────────────────────────────────────────────

export type GenerateOfferResult =
  | { success: true; offerId: string; content: string }
  | { success: false; error: string }

export type SendOfferResult =
  | { success: true }
  | { success: false; error: string }

// ── generateOffer ─────────────────────────────────────────────────────────────

export async function generateOffer(
  formData: FormData
): Promise<GenerateOfferResult> {
  const applicationId    = (formData.get('application_id') as string)?.trim()
  const jobTitle         = (formData.get('job_title') as string)?.trim()
  const startDate        = (formData.get('start_date') as string)?.trim()
  const baseSalary       = (formData.get('base_salary') as string)?.trim()
  const currency         = (formData.get('currency') as string)?.trim() || 'USD'
  const equity           = (formData.get('equity') as string)?.trim() || null
  const bonus            = (formData.get('bonus') as string)?.trim() || null
  const reportingManager = (formData.get('reporting_manager') as string)?.trim()
  const customTerms      = (formData.get('custom_terms') as string)?.trim() || null

  if (!applicationId || !jobTitle || !startDate || !baseSalary || !reportingManager) {
    return { success: false, error: 'job_title, start_date, base_salary, and reporting_manager are required.' }
  }

  const supabase = createAdminClient()

  // Fetch application + candidate + job for context
  const { data: application, error: appError } = await supabase
    .from('applications')
    .select('id, ai_brief, structured_data, candidates(full_name, email), jobs(title, team, location)')
    .eq('id', applicationId)
    .single()

  if (appError || !application) {
    return { success: false, error: 'Application not found.' }
  }

  // EC3: Block offer generation if application hasn't reached 'interviewed'
  const { data: appStatus } = await supabase
    .from('applications')
    .select('status')
    .eq('id', applicationId)
    .single()

  const OFFER_ELIGIBLE_STATUSES = ['interviewed', 'offer_sent', 'hired']
  if (appStatus && !OFFER_ELIGIBLE_STATUSES.includes(appStatus.status)) {
    return {
      success: false,
      error: `Cannot generate offer — application status is '${appStatus.status}'. Interview must be completed first.`,
    }
  }

  // EC6: Check for existing draft/sent offer to avoid duplicates
  const { data: existingOffer } = await supabase
    .from('offer_letters')
    .select('id, status')
    .eq('application_id', applicationId)
    .in('status', ['draft', 'sent'])
    .maybeSingle()

  if (existingOffer) {
    return {
      success: false,
      error: `An offer already exists for this application (status: '${existingOffer.status}'). Please send or discard the existing offer first.`,
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidate = application.candidates as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const job       = application.jobs as any

  const candidateName: string = candidate?.full_name ?? 'Candidate'
  const candidateEmail: string = candidate?.email ?? ''
  const jobTeam: string   = job?.team ?? ''
  const jobLocation: string = job?.location ?? 'Remote'

  // Fetch interview feedback (required to generate offer)
  const { data: feedbackRow } = await supabase
    .from('interview_feedback')
    .select('rating, comments')
    .eq('application_id', applicationId)
    .maybeSingle()

  if (!feedbackRow) {
    return {
      success: false,
      error: 'Interview feedback is required before generating an offer. Please submit feedback first.',
    }
  }

  const interviewerComments: string = feedbackRow.comments ?? ''
  const interviewerRating: number = feedbackRow.rating ?? 0

  // Build the Claude prompt
  const equityLine = equity ? `<li><strong>Equity:</strong> ${equity}</li>` : ''
  const bonusLine  = bonus  ? `<li><strong>Performance Bonus:</strong> ${bonus}</li>` : ''
  const customLine = customTerms
    ? `<h3 style="font-size:15px;font-weight:600;color:#1e293b;margin:24px 0 8px;">Additional Terms</h3><p style="margin:0 0 12px;">${customTerms}</p>`
    : ''

  const todayFormatted = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  const userMessage = `
Generate a complete, professional HTML offer letter for the following candidate and role.
Return ONLY the HTML — no markdown, no code fences, no explanation.

CANDIDATE: ${candidateName}
EMAIL: ${candidateEmail}
ROLE: ${jobTitle}
TEAM: ${jobTeam}
LOCATION: ${jobLocation}
START DATE: ${startDate}
BASE SALARY: ${currency} ${baseSalary} per year
EQUITY: ${equity ?? 'N/A'}
BONUS: ${bonus ?? 'N/A'}
REPORTING TO: ${reportingManager}
CUSTOM TERMS: ${customTerms ?? 'None'}
AI BRIEF ABOUT CANDIDATE: ${application.ai_brief ?? 'Not available'}
INTERVIEWER RATING: ${interviewerRating}/5
INTERVIEWER COMMENTS: ${interviewerComments}

Requirements:
- Full self-contained HTML document (includes <html>, <head>, <body>)
- All styles must be inline (no <style> tags, no external CSS)
- Company letterhead: "Niural" in indigo (#4f46e5), tagline "The Future of Work"
- Professional serif body font (Georgia, serif) at 15px, line-height 1.7
- Max-width 720px, centered, white background, subtle border, padding 48px
- Today's date (${todayFormatted}) in the header
- Formal salutation: "Dear ${candidateName},"
- Opening paragraph welcoming the candidate and referencing the role, weaving in the interviewer's positive comments naturally (e.g. if comments mention cultural fit, say "we believe you'd be a great cultural fit"; if they mention technical strength, reference that). Use the interviewer comments to make the letter feel warm and specific to THIS candidate. Only include positive sentiments — do not reference any negative or neutral observations.
- Compensation section as a styled list with all applicable items:
${equityLine}
${bonusLine}
  <li><strong>Base Salary:</strong> ${currency} ${baseSalary} annually</li>
  <li><strong>Start Date:</strong> ${startDate}</li>
  <li><strong>Location:</strong> ${jobLocation}</li>
  <li><strong>Reporting Manager:</strong> ${reportingManager}</li>
- A paragraph about Niural's mission (AI-native HR platform transforming hiring)
- Benefits section (health, dental, vision, 401k, unlimited PTO, equity — tailor to what applies)
${customLine}
- Legal boilerplate: employment at-will, contingent on background check, offer expires in 5 business days
- Signature block at bottom: signing area labeled "Accepted by:", with name/date lines
- Close: "We're excited to have you join the team." signed by "The Niural Team"
`.trim()

  let offerHtml: string

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      system: `You are a senior HR writer at Niural, a modern AI-native HR platform.
Your task is to write complete, professional employment offer letters in HTML.
The HTML must be self-contained with all styles inline so it renders correctly in any browser.
Return ONLY the raw HTML — no markdown fences, no explanation, no preamble.
The letter must be polished, warm, and legally sound.`,
      messages: [{ role: 'user', content: userMessage }],
    })

    const textBlock = message.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text content in Claude response')
    }

    offerHtml = textBlock.text
      .replace(/^```(?:html)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()
  } catch (err) {
    console.error('[generateOffer] Claude call failed:', err)
    return { success: false, error: 'Failed to generate offer letter. Please try again.' }
  }

  // Persist draft to offer_letters
  const { data: offerRow, error: insertError } = await supabase
    .from('offer_letters')
    .insert({
      application_id: applicationId,
      pandadoc_id: `internal_${applicationId}`,
      content: offerHtml,
      status: 'draft',
    })
    .select('id')
    .single()

  if (insertError) {
    console.error('[generateOffer] DB insert failed:', insertError.message)
    return { success: false, error: insertError.message }
  }

  revalidatePath(`/admin/applications/${applicationId}`)

  return { success: true, offerId: offerRow.id, content: offerHtml }
}

// ── sendOffer ─────────────────────────────────────────────────────────────────

export async function sendOffer(
  offerId: string,
  applicationId: string
): Promise<SendOfferResult> {
  if (!offerId || !applicationId) {
    return { success: false, error: 'offerId and applicationId are required.' }
  }

  const supabase = createAdminClient()

  // Fetch offer + candidate + job
  const { data: offer, error: offerError } = await supabase
    .from('offer_letters')
    .select('id, status, application_id, applications(candidate_id, job_id, candidates(full_name, email), jobs(title))')
    .eq('id', offerId)
    .single()

  if (offerError || !offer) {
    return { success: false, error: 'Offer not found.' }
  }

  if (offer.status !== 'draft') {
    return { success: false, error: `Offer is already '${offer.status}' — can only send a draft.` }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const application = offer.applications as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidate   = application?.candidates as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const job         = application?.jobs as any

  const candidateName: string  = candidate?.full_name ?? 'Candidate'
  const candidateEmail: string = candidate?.email ?? ''
  const jobTitle: string       = job?.title ?? 'Role'

  if (!candidateEmail) {
    return { success: false, error: 'Candidate email not found.' }
  }

  // Transition offer → 'sent'
  const { error: offerUpdateError } = await supabase
    .from('offer_letters')
    .update({ status: 'sent' })
    .eq('id', offerId)

  if (offerUpdateError) {
    return { success: false, error: offerUpdateError.message }
  }

  // Transition application → 'offer_sent'
  await supabase
    .from('applications')
    .update({ status: 'offer_sent' })
    .eq('id', applicationId)

  // Email candidate via Resend
  const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const signingUrl  = `${appUrl}/sign/${offerId}`
  const fromEmail   = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'
  const toEmail     = process.env.RESEND_TO_OVERRIDE ?? candidateEmail

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
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f172a;">You have an offer, ${candidateName}!</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
        Congratulations — we're thrilled to extend you an offer for the <strong>${jobTitle}</strong> role at Niural.
        Please review your offer letter and sign it at your earliest convenience.
      </p>
      <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:#334155;">
        This offer is valid for <strong>5 business days</strong>. Click the button below to read and sign your offer letter.
      </p>
      <div style="text-align:center;margin:0 0 32px;">
        <a href="${signingUrl}"
           style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-family:Georgia,serif;font-size:15px;font-weight:600;padding:14px 36px;border-radius:8px;">
          Review &amp; Sign Your Offer
        </a>
      </div>
      <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;">Or copy this link into your browser:</p>
      <p style="margin:0 0 32px;font-size:13px;color:#4f46e5;word-break:break-all;">
        <a href="${signingUrl}" style="color:#4f46e5;">${signingUrl}</a>
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 24px;">
      <p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8;">
        If you have any questions, reply to this email or reach out to your recruiter.
        We're excited to have you join the team.
      </p>
    </div>
    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">Niural · The Future of Work</p>
    </div>
  </div>
</body>
</html>`.trim()

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: 'Your offer from Niural',
      html: emailHtml,
    })
  } catch (err) {
    // Email failure is non-fatal — status was already updated
    console.error('[sendOffer] Resend error:', err)
  }

  revalidatePath(`/admin/applications/${applicationId}`)
  revalidatePath('/admin/applications')

  return { success: true }
}
