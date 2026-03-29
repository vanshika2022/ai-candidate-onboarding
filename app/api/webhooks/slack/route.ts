/**
 * POST /api/webhooks/slack
 * ────────────────────────
 * Handles Slack Events API callbacks.
 *
 * Supported events:
 *   url_verification — Slack challenge handshake during webhook setup
 *   team_join        — New workspace member joined; deliver any queued DMs
 *
 * Security:
 *   Every request (except url_verification during initial setup) is verified
 *   using HMAC-SHA256 against SLACK_SIGNING_SECRET.
 *   Signature format: "v0=" + hex(HMAC-SHA256("v0:{timestamp}:{rawBody}", secret))
 *   Rejects requests with timestamps older than 5 minutes (replay protection).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'

// ── Slack API helper ──────────────────────────────────────────────────────────

async function slackPost(
  endpoint: string,
  body: Record<string, unknown>,
  token: string
): Promise<{ ok: boolean; [key: string]: unknown }> {
  const res = await fetch(`https://slack.com/api/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`Slack ${endpoint} HTTP ${res.status}`)
  }
  return res.json()
}

// ── Signature verification ────────────────────────────────────────────────────

function verifySlackSignature(
  rawBody: string,
  timestamp: string,
  signature: string,
  signingSecret: string
): boolean {
  // Reject stale requests (replay attack protection: 5-minute window)
  const requestTime = parseInt(timestamp, 10)
  const nowSeconds  = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSeconds - requestTime) > 300) {
    return false
  }

  const baseString = `v0:${timestamp}:${rawBody}`
  const hmac       = createHmac('sha256', signingSecret)
  hmac.update(baseString, 'utf8')
  const computed = `v0=${hmac.digest('hex')}`

  // Use timing-safe comparison to prevent timing attacks
  try {
    return timingSafeEqual(
      Buffer.from(computed, 'utf8'),
      Buffer.from(signature, 'utf8')
    )
  } catch {
    // Buffers differ in length — definitely not equal
    return false
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Read raw body as text — required for correct HMAC computation.
  // Using req.text() preserves byte-exact content; req.json() would re-serialize.
  const rawBody = await req.text()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let event: any
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // ── Step A — Handle url_verification (Slack app setup handshake) ──────────
  // Slack sends this when the Events API URL is first configured.
  // Must return the challenge value immediately, before signature check.
  if (event.type === 'url_verification') {
    return NextResponse.json({ challenge: event.challenge })
  }

  // ── Step B — Verify Slack request signature ───────────────────────────────
  const signingSecret = process.env.SLACK_SIGNING_SECRET
  if (!signingSecret) {
    console.error('[webhooks/slack] SLACK_SIGNING_SECRET is not configured')
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const timestamp = req.headers.get('x-slack-request-timestamp') ?? ''
  const signature = req.headers.get('x-slack-signature') ?? ''

  if (!timestamp || !signature) {
    return NextResponse.json({ error: 'Missing Slack signature headers' }, { status: 401 })
  }

  if (!verifySlackSignature(rawBody, timestamp, signature, signingSecret)) {
    console.warn('[webhooks/slack] Signature verification failed')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // ── Step C — Handle team_join or member_joined_channel event ─────────────
  // team_join: fires when a new user joins the Slack workspace (workspace event)
  // member_joined_channel: fires when user joins a channel (bot event) — used as
  //   fallback because team_join requires workspace event subscription which isn't
  //   available on all Slack app types. New members auto-join #general, triggering this.
  const eventType = event.event?.type
  if (event.type === 'event_callback' && (eventType === 'team_join' || eventType === 'member_joined_channel')) {
    const slackToken = process.env.SLACK_BOT_TOKEN
    if (!slackToken) {
      console.warn('[webhooks/slack] SLACK_BOT_TOKEN not set — cannot deliver queued messages')
      return NextResponse.json({ ok: true })
    }

    let memberEmail = ''
    let slackUserId = ''

    if (eventType === 'team_join') {
      // team_join includes full user profile
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newMember: any = event.event.user
      memberEmail = newMember?.profile?.email ?? ''
      slackUserId = newMember?.id ?? ''
    } else {
      // member_joined_channel — only has user ID, need to fetch email via users.info
      slackUserId = event.event.user ?? ''
      if (slackUserId) {
        try {
          const qs = new URLSearchParams({ user: slackUserId }).toString()
          const res = await fetch(`https://slack.com/api/users.info?${qs}`, {
            headers: { Authorization: `Bearer ${slackToken}` },
          })
          const userData = await res.json() as { ok: boolean; user?: { profile?: { email?: string } } }
          if (userData.ok) {
            memberEmail = userData.user?.profile?.email ?? ''
          }
        } catch (err) {
          console.error('[webhooks/slack] users.info failed:', err)
        }
      }
    }

    if (!memberEmail || !slackUserId) {
      console.warn(`[webhooks/slack] ${eventType} event missing email or user id — skipping`)
      return NextResponse.json({ ok: true })
    }

    console.log(`[webhooks/slack] ${eventType}: ${memberEmail} (${slackUserId}) joined`)

    const supabase = createAdminClient()

    // Check for any unsent queued messages for this email
    const { data: pendingRows, error: fetchError } = await supabase
      .from('pending_slack_messages')
      .select('id, message')
      .eq('candidate_email', memberEmail)
      .is('sent_at', null)
      .order('created_at', { ascending: true })

    if (fetchError) {
      console.error('[webhooks/slack] Failed to fetch pending messages:', fetchError.message)
      return NextResponse.json({ ok: true })
    }

    if (!pendingRows || pendingRows.length === 0) {
      console.log(`[webhooks/slack] No pending messages for ${memberEmail}`)
      return NextResponse.json({ ok: true })
    }

    console.log(
      `[webhooks/slack] Delivering ${pendingRows.length} queued message(s) to ${memberEmail}`
    )

    for (const row of pendingRows) {
      try {
        // Open a DM channel with the new member
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

        // Send the queued message
        const msgResult = await slackPost(
          'chat.postMessage',
          {
            channel: dmChannelId,
            text: row.message,
          },
          slackToken
        )

        if (!msgResult.ok) {
          throw new Error(`chat.postMessage failed: ${msgResult.error}`)
        }

        // Mark as delivered
        const { error: updateError } = await supabase
          .from('pending_slack_messages')
          .update({ sent_at: new Date().toISOString() })
          .eq('id', row.id)

        if (updateError) {
          console.error(
            `[webhooks/slack] Failed to mark message ${row.id} as sent:`,
            updateError.message
          )
        } else {
          console.log(
            `[webhooks/slack] Delivered queued message ${row.id} to ${memberEmail}`
          )
        }
      } catch (err) {
        console.error(
          `[webhooks/slack] Failed to deliver queued message ${row.id} to ${memberEmail}:`,
          err
        )
        // Continue to next message — don't abort the entire batch
      }
    }
  }

  // Return 200 for all valid event types (Slack retries on non-2xx responses)
  return NextResponse.json({ ok: true })
}
