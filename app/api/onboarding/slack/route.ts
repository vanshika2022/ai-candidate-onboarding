/**
 * POST /api/onboarding/slack
 * ──────────────────────────
 * Triggered fire-and-forget by /api/offers/[id]/sign after an offer is signed.
 *
 * Steps:
 *   A — Fetch application + candidate + job + offer_letter from Supabase
 *   B — Generate personalized welcome DM via Claude Sonnet
 *   C — Find candidate's Slack user ID by email (users.lookupByEmail)
 *       → If not found: store message in pending_slack_messages for later
 *         AND send welcome email via Resend as fallback
 *   D — Send welcome DM to candidate (conversations.open + chat.postMessage)
 *   E — Post hire notification to #hr channel (chat.postMessage)
 *   F — Return { success: true, dm_sent: boolean, hr_notified: boolean }
 *
 * All Slack API errors are logged and swallowed — this endpoint must never
 * cause the signing flow to fail.
 *
 * If SLACK_BOT_TOKEN is not configured, returns a mock success with a warning.
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/server'

// ── Slack API helper with retry (EC2: handles rate limiting) ─────────────────

async function slackPost(
  endpoint: string,
  body: Record<string, unknown>,
  token: string,
  retries = 2
): Promise<{ ok: boolean; error?: string; [key: string]: unknown }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`https://slack.com/api/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })

    // EC2: Slack returns 429 on rate limit with Retry-After header
    if (res.status === 429 && attempt < retries) {
      const retryAfter = parseInt(res.headers.get('retry-after') ?? '2', 10)
      console.warn(`[Slack] Rate limited on ${endpoint} — retrying in ${retryAfter}s (attempt ${attempt + 1}/${retries})`)
      await new Promise(r => setTimeout(r, retryAfter * 1000))
      continue
    }

    if (!res.ok) {
      throw new Error(`Slack ${endpoint} HTTP ${res.status}`)
    }
    return res.json()
  }
  throw new Error(`Slack ${endpoint} failed after ${retries} retries`)
}

async function slackGet(
  endpoint: string,
  params: Record<string, string>,
  token: string
): Promise<{ ok: boolean; [key: string]: unknown }> {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`https://slack.com/api/${endpoint}?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(`Slack ${endpoint} HTTP ${res.status}`)
  }
  return res.json()
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { application_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { application_id } = body
  if (!application_id) {
    return NextResponse.json({ error: 'application_id is required' }, { status: 400 })
  }

  // ── Mock mode — SLACK_BOT_TOKEN not configured ────────────────────────────
  const slackToken = process.env.SLACK_BOT_TOKEN
  if (!slackToken) {
    console.warn(
      '[onboarding/slack] SLACK_BOT_TOKEN is not set. ' +
      'Slack onboarding messages will not be sent. ' +
      'Set SLACK_BOT_TOKEN in .env.local to enable.'
    )
    return NextResponse.json({
      success: true,
      dm_sent: false,
      hr_notified: false,
      mock: true,
      reason: 'SLACK_BOT_TOKEN not configured',
    })
  }

  const supabase = createAdminClient()

  // ── Step A — Fetch application + candidate + job + offer_letter ───────────
  const { data: appRow, error: appError } = await supabase
    .from('applications')
    .select('id, ai_brief, candidates(full_name, email), jobs(title)')
    .eq('id', application_id)
    .single()

  if (appError || !appRow) {
    console.error('[onboarding/slack] Application not found:', appError?.message)
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidate = appRow.candidates as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const job       = appRow.jobs as any

  const fullName:       string = candidate?.full_name ?? 'Candidate'
  const candidateEmail: string = candidate?.email ?? ''
  const jobTitle:       string = job?.title ?? 'Role'
  const firstName:      string = fullName.split(' ')[0]

  // ── EC5: Idempotency — skip if we already queued or sent a message ─────
  if (candidateEmail) {
    const { data: existingMsg } = await supabase
      .from('pending_slack_messages')
      .select('id')
      .eq('candidate_email', candidateEmail)
      .limit(1)
      .maybeSingle()

    if (existingMsg) {
      console.log(`[onboarding/slack] Message already queued/sent for ${candidateEmail} — skipping duplicate`)
      return NextResponse.json({ success: true, dm_sent: false, hr_notified: false, duplicate: true })
    }
  }

  // Fetch most recent signed offer for start date and reporting manager
  const { data: offerRow } = await supabase
    .from('offer_letters')
    .select('signed_at, content')
    .eq('application_id', application_id)
    .eq('status', 'signed')
    .order('signed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const signedAt    = offerRow?.signed_at ?? null
  const startDate   = signedAt
    ? new Date(signedAt).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      })
    : 'your confirmed start date'

  // Extract reporting manager from offer letter HTML content
  const offerContent: string = (offerRow?.content as string) ?? ''
  const managerMatch = offerContent.match(/Reporting Manager:<\/strong>\s*([^<]+)/)
  const reportingManager: string = managerMatch?.[1]?.trim() || 'the team'

  // Fetch has_discrepancies from applications table
  const { data: appMeta } = await supabase
    .from('applications')
    .select('has_discrepancies')
    .eq('id', application_id)
    .single()

  const hasDiscrepancies: boolean =
    (appMeta as { has_discrepancies?: boolean } | null)?.has_discrepancies ?? false

  // ── Step B — Generate personalized welcome DM via Claude Sonnet ───────────
  let welcomeMessage = ''

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const claudeResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 300,
      system:
        'You write warm, professional Slack welcome messages for new hires. ' +
        'Be concise, friendly, first-name basis. Max 150 words. Plain text only — no JSON, no markdown.',
      messages: [
        {
          role: 'user',
          content:
            `Write a Slack DM for a new hire joining Niural.\n\n` +
            `First name: ${firstName}\n` +
            `Role: ${jobTitle}\n` +
            `Start date: ${startDate}\n` +
            `Reporting manager: ${reportingManager}\n\n` +
            `The message must include:\n` +
            `- A warm greeting using their first name\n` +
            `- Their role at Niural\n` +
            `- Their start date prominently mentioned\n` +
            `- A greeting from their manager (${reportingManager}) welcoming them to the team\n` +
            `- Onboarding next steps: join #general in Slack, check email for onboarding docs, set up their laptop and development environment\n` +
            `- Genuine excitement about them joining\n\n` +
            `Return plain text only. No JSON. No markdown. No bullet symbols.`,
        },
      ],
    })

    const textBlock = claudeResponse.content.find((b) => b.type === 'text')
    if (textBlock && textBlock.type === 'text') {
      welcomeMessage = textBlock.text.trim()
    }
  } catch (err) {
    console.error('[onboarding/slack] Claude message generation failed:', err)
    // Fallback message if Claude fails
    welcomeMessage =
      `Hey ${firstName}! Welcome to Niural — we're so excited to have you joining as ${jobTitle}. ` +
      `Your start date is ${startDate}. ` +
      `${reportingManager !== 'the team' ? `${reportingManager} and the rest of the team` : 'The team'} can't wait to work with you! ` +
      `A few things to do before Day 1: join #general in Slack, check your email for onboarding docs, ` +
      `and get your laptop and development environment set up. ` +
      `See you soon!`
  }

  let dmSent    = false
  let hrNotified = false

  // ── Step C — Find candidate's Slack user ID by email ─────────────────────
  let slackUserId: string | null = null

  try {
    const lookupResult = await slackGet(
      'users.lookupByEmail',
      { email: candidateEmail },
      slackToken
    )

    if (lookupResult.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      slackUserId = (lookupResult.user as any)?.id ?? null
    } else {
      console.warn(
        `[onboarding/slack] users.lookupByEmail returned ok=false for ${candidateEmail}:`,
        lookupResult.error
      )
    }
  } catch (err) {
    console.error(`[onboarding/slack] users.lookupByEmail failed for ${candidateEmail}:`, err)
  }

  // If user not found, store message for retry when they join the workspace
  // AND send a welcome email via Resend as fallback
  if (!slackUserId) {
    console.log(
      `[onboarding/slack] Candidate ${candidateEmail} not in Slack yet — ` +
      `queuing message in pending_slack_messages.`
    )

    // Step 1: Queue in pending_slack_messages
    const { error: insertError } = await supabase
      .from('pending_slack_messages')
      .insert({
        candidate_email: candidateEmail,
        message: welcomeMessage,
      })

    if (insertError) {
      console.error('[onboarding/slack] Failed to queue pending message:', insertError.message)
    }

    // Step 2: Send welcome email via Resend as fallback
    try {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      const toEmail = process.env.RESEND_TO_OVERRIDE || candidateEmail

      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
        to: toEmail,
        subject: `Welcome to Niural, ${firstName}! 🎉`,
        html: `
          <h2>Welcome to the Niural team, ${firstName}!</h2>
          <p>We're thrilled to have you joining as <strong>${jobTitle}</strong>.</p>
          <p>Your start date is <strong>${startDate}</strong>.</p>
          ${reportingManager !== 'the team' ? `<p><strong>${reportingManager}</strong> and the rest of the team can't wait to work with you!</p>` : ''}

          <h3>Your onboarding next steps:</h3>
          <ul>
            <li>Join our Slack workspace: <a href="https://join.slack.com/t/niuraldemo/shared_invite/zt-3tm6d417b-Ec962T7w4_oSTcEKwHb_WQ">Niural Slack</a></li>
            <li>Review the <a href="https://docs.google.com/document/d/niural-onboarding">Onboarding Guide</a></li>
            <li>Set up your laptop and development environment</li>
            <li>Check your email for IT access credentials</li>
            ${reportingManager !== 'the team' ? `<li>Reach out to ${reportingManager} with any questions before Day 1</li>` : ''}
          </ul>

          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
          <h3>Your AI-personalized welcome message:</h3>
          <blockquote style="margin:12px 0;padding:12px 16px;background:#f8fafc;border-left:3px solid #4f46e5;border-radius:4px;font-style:italic;color:#334155;">
            ${welcomeMessage.replace(/\n/g, '<br/>')}
          </blockquote>

          <p>Once you join Slack, you'll receive this message there too.</p>

          <p>Excited to have you on the team!<br/>
          The Niural Hiring Team</p>
        `,
      })
      console.log(`[onboarding/slack] Welcome email sent to ${toEmail} as Slack fallback`)
    } catch (emailErr: unknown) {
      const message = emailErr instanceof Error ? emailErr.message : String(emailErr)
      console.error(`[onboarding/slack] Welcome email failed: ${message}`)
    }
  }

  // ── Step D — Send welcome DM to candidate ────────────────────────────────
  if (slackUserId) {
    try {
      // Open a DM channel with the user
      const openResult = await slackPost(
        'conversations.open',
        { users: slackUserId },
        slackToken
      )

      if (!openResult.ok) {
        throw new Error(`conversations.open failed: ${openResult.error}`)
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dmChannelId: string = (openResult.channel as any)?.id

      if (!dmChannelId) {
        throw new Error('conversations.open returned no channel id')
      }

      // Send the DM
      const msgResult = await slackPost(
        'chat.postMessage',
        {
          channel: dmChannelId,
          text: welcomeMessage,
        },
        slackToken
      )

      if (!msgResult.ok) {
        throw new Error(`chat.postMessage (DM) failed: ${msgResult.error}`)
      }

      dmSent = true
      console.log(`[onboarding/slack] Welcome DM sent to ${firstName} (${slackUserId})`)
    } catch (err) {
      console.error('[onboarding/slack] Failed to send welcome DM:', err)
    }
  }

  // ── Step E — Post HR hire notification to #hiring channel ────────────────
  const hrChannelId = process.env.SLACK_HR_CHANNEL_ID

  if (hrChannelId) {
    const hrText = hasDiscrepancies
      ? `✅ ${fullName} has accepted their offer for ${jobTitle}. ⚠️ Note: AI screening flagged unverified discrepancies in their profile. Recommend verification before Day 1.`
      : `✅ ${fullName} has accepted their offer for ${jobTitle}. Clean profile — no discrepancies flagged. Start date: ${startDate}.`

    try {
      const hrResult = await slackPost(
        'chat.postMessage',
        {
          channel: hrChannelId,
          text: hrText,
        },
        slackToken
      )

      if (!hrResult.ok) {
        throw new Error(`chat.postMessage (HR) failed: ${hrResult.error}`)
      }

      hrNotified = true
      console.log(`[onboarding/slack] HR notification posted to channel ${hrChannelId}`)
    } catch (err) {
      console.error('[onboarding/slack] Failed to post HR notification:', err)
    }
  } else {
    console.warn('[onboarding/slack] SLACK_HR_CHANNEL_ID not set — skipping HR notification')
  }

  // ── Step F — Return result ────────────────────────────────────────────────
  return NextResponse.json({
    success: true,
    dm_sent: dmSent,
    hr_notified: hrNotified,
  })
}
