/**
 * POST /api/offers/generate
 * ─────────────────────────
 * Admin-only endpoint. Calls Claude Sonnet to generate an HTML offer letter
 * and persists it to offer_letters with status='draft'.
 *
 * Authorization: Bearer <ADMIN_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/server'

interface GenerateOfferBody {
  application_id: string
  job_title: string
  start_date: string
  base_salary: string
  currency: string
  equity: string | null
  bonus: string | null
  reporting_manager: string
  custom_terms: string | null
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Admin auth ─────────────────────────────────────────────────────────────
  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret) {
    console.error('[offers/generate] ADMIN_SECRET not configured')
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (token !== adminSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Parse body ─────────────────────────────────────────────────────────────
  let body: GenerateOfferBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    application_id,
    job_title,
    start_date,
    base_salary,
    currency,
    equity,
    bonus,
    reporting_manager,
    custom_terms,
  } = body

  if (!application_id || !job_title || !start_date || !base_salary || !currency || !reporting_manager) {
    return NextResponse.json(
      { error: 'application_id, job_title, start_date, base_salary, currency, and reporting_manager are required' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  // ── 3. Fetch application + candidate + job ────────────────────────────────────
  const { data: application, error: appError } = await supabase
    .from('applications')
    .select('id, ai_brief, structured_data, candidates(full_name, email), jobs(title, team, location)')
    .eq('id', application_id)
    .single()

  if (appError || !application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  // EC3: Block offer generation if interview not completed
  const { data: appStatus } = await supabase
    .from('applications')
    .select('status')
    .eq('id', application_id)
    .single()

  const OFFER_ELIGIBLE_STATUSES = ['interviewed', 'offer_sent', 'hired']
  if (appStatus && !OFFER_ELIGIBLE_STATUSES.includes(appStatus.status)) {
    return NextResponse.json(
      { error: `Cannot generate offer — application status is '${appStatus.status}'. Interview must be completed first.` },
      { status: 400 }
    )
  }

  // EC6: Check for existing draft/sent offer
  const { data: existingOffer } = await supabase
    .from('offer_letters')
    .select('id, status')
    .eq('application_id', application_id)
    .in('status', ['draft', 'sent'])
    .maybeSingle()

  if (existingOffer) {
    return NextResponse.json(
      { error: `An offer already exists (status: '${existingOffer.status}'). Send or discard it first.` },
      { status: 409 }
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidate = application.candidates as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const job = application.jobs as any

  const candidateName: string = candidate?.full_name ?? 'Candidate'
  const candidateEmail: string = candidate?.email ?? ''
  const jobTeam: string = job?.team ?? ''
  const jobLocation: string = job?.location ?? 'Remote'

  // Extract achievements from structured_data for personalization
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const structuredData = application.structured_data as any
  const achievements: string[] = Array.isArray(structuredData?.achievements)
    ? structuredData.achievements
    : []

  // ── 4. Generate offer letter HTML via Claude Sonnet ───────────────────────────
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const equityLine = equity ? `<li><strong>Equity:</strong> ${equity}</li>` : ''
  const bonusLine = bonus ? `<li><strong>Performance Bonus:</strong> ${bonus}</li>` : ''
  const customLine = custom_terms
    ? `<h3 style="font-size:15px;font-weight:600;color:#1e293b;margin:24px 0 8px;">Additional Terms</h3><p style="margin:0 0 12px;">${custom_terms}</p>`
    : ''

  const userMessage = `
Generate a complete, professional HTML offer letter for the following candidate and role.
Return ONLY the HTML — no markdown, no code fences, no explanation.

CANDIDATE: ${candidateName}
EMAIL: ${candidateEmail}
ROLE: ${job_title}
TEAM: ${jobTeam}
LOCATION: ${jobLocation}
START DATE: ${start_date}
BASE SALARY: ${currency} ${base_salary} per year
EQUITY: ${equity ?? 'N/A'}
BONUS: ${bonus ?? 'N/A'}
REPORTING TO: ${reporting_manager}
CUSTOM TERMS: ${custom_terms ?? 'None'}
AI BRIEF ABOUT CANDIDATE: ${application.ai_brief ?? 'Not available'}
KEY ACHIEVEMENTS: ${achievements.length > 0 ? achievements.join('; ') : 'Not available'}

Requirements:
- Full self-contained HTML document (includes <html>, <head>, <body>)
- All styles must be inline (no <style> tags, no external CSS)
- Company letterhead: "Niural" in indigo (#4f46e5), tagline "The Future of Work"
- Professional serif body font (Georgia, serif) at 15px, line-height 1.7
- Max-width 720px, centered, white background, subtle border, padding 48px
- Today's date (${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}) in the header
- Formal salutation: "Dear ${candidateName},"
- Opening paragraph welcoming the candidate by name, referencing the role, and acknowledging their specific background using the AI brief and key achievements (make the letter feel personalized to THIS candidate)
- Compensation section as a styled list with all applicable items:
${equityLine}
${bonusLine}
  <li><strong>Base Salary:</strong> ${currency} ${base_salary} annually</li>
  <li><strong>Start Date:</strong> ${start_date}</li>
  <li><strong>Location:</strong> ${jobLocation}</li>
  <li><strong>Reporting Manager:</strong> ${reporting_manager}</li>
- A paragraph about Niural's mission (AI-native HR platform transforming hiring)
- Benefits section (health, dental, vision, 401k, unlimited PTO, equity — tailor to what applies)
${customLine}
- Legal boilerplate: employment at-will, contingent on background check, offer expires in 5 business days
- Signature block at bottom: signing area labeled "Accepted by:", with name/date lines
- Close: "We're excited to have you join the team." signed by "The Niural Team"
`.trim()

  let offerHtml: string

  try {
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

    // Strip accidental markdown fences if present
    offerHtml = textBlock.text
      .replace(/^```(?:html)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()
  } catch (err) {
    console.error('[offers/generate] Claude call failed:', err)
    return NextResponse.json({ error: 'Failed to generate offer letter' }, { status: 500 })
  }

  // ── 5. Persist to offer_letters ───────────────────────────────────────────────
  const { data: offerRow, error: insertError } = await supabase
    .from('offer_letters')
    .insert({
      application_id,
      pandadoc_id: `internal_${application_id}`,
      content: offerHtml,
      status: 'draft',
    })
    .select('id')
    .single()

  if (insertError) {
    console.error('[offers/generate] DB insert failed:', insertError.message)
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({
    offer_id: offerRow.id,
    content: offerHtml,
  })
}
