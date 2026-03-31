/**
 * POST /api/schedule/preview-slots
 * ─────────────────────────────────
 * Admin-only endpoint. Returns available slots for a reschedule request,
 * filtered by the candidate's stated preferences.
 *
 * Approach: Haiku extracts structured preferences (days + time range) from
 * the candidate's reason, then slots are filtered PROGRAMMATICALLY.
 * This is faster (~300ms Haiku + 0ms filter) and 100% accurate — code
 * never picks Friday when the candidate said Monday/Wednesday.
 *
 * Authorization: Bearer <ADMIN_SECRET>
 * Body: { application_id: string, exclude_slots?: string[] }
 * Returns: { slots: Array<{ start, end, label }>, ai_reasoning: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/server'
import { getAvailableSlots, SLOTS_TO_OFFER } from '@/lib/services/calendar'

// Day name → JS getDay() value
const DAY_MAP: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
}

interface SchedulePreferences {
  preferred_days: string[]   // e.g. ["monday", "wednesday"]
  earliest_hour: number      // e.g. 14 for "after 2 PM"
  latest_hour: number        // e.g. 17 for "before 5 PM"
  reasoning: string
}

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
  let body: { application_id?: string; exclude_slots?: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { application_id, exclude_slots } = body
  if (!application_id) {
    return NextResponse.json({ error: 'application_id is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // ── 3. Fetch application + reschedule reason ───────────────────────────────
  const { data: app, error: fetchError } = await supabase
    .from('applications')
    .select('id, reschedule_reason, tentative_slots, candidates(full_name), jobs(title)')
    .eq('id', application_id)
    .single()

  if (fetchError || !app) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  const rescheduleReason = (app.reschedule_reason as string | null) ?? ''

  // ── 4. Check Google Calendar credentials ───────────────────────────────────
  const hasCalendarCreds =
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY &&
    process.env.GOOGLE_CALENDAR_ID

  if (!hasCalendarCreds) {
    return NextResponse.json({
      slots: [],
      ai_reasoning: 'Google Calendar credentials not configured — cannot fetch live availability.',
      no_calendar: true,
    })
  }

  // ── 5. Fetch available slots + extract preferences IN PARALLEL ─────────────
  const prefsPromise = rescheduleReason.trim()
    ? extractPreferences(rescheduleReason)
    : Promise.resolve(null)

  // When candidate has preferences, fetch more slots (30) so we can filter
  // down to matching days/times. Without this, getAvailableSlots(5) returns
  // the first 5 free slots (e.g. all Friday) and never checks Mon/Wed.
  const fetchCount = rescheduleReason.trim() ? 30 : SLOTS_TO_OFFER

  let allSlots: Array<{ start: string; end: string }>
  try {
    allSlots = await getAvailableSlots(fetchCount)
  } catch (err) {
    console.error('[preview-slots] freebusy failed:', err)
    return NextResponse.json({ error: 'Could not read calendar availability' }, { status: 500 })
  }

  // Filter out previously declined slots
  const excludeSet = new Set(exclude_slots ?? [])
  const candidateSlots = excludeSet.size > 0
    ? allSlots.filter(s => !excludeSet.has(s.start))
    : allSlots

  if (candidateSlots.length === 0) {
    return NextResponse.json({
      slots: [],
      ai_reasoning: 'No available slots found in the next 14 days.',
    })
  }

  // ── 6. Format slots for display ────────────────────────────────────────────
  const tz = process.env.INTERVIEWER_TIMEZONE ?? 'America/New_York'
  const formattedSlots = candidateSlots.map(s => ({
    start: s.start,
    end: s.end,
    label: new Date(s.start).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz,
      timeZoneName: 'short',
    }),
  }))

  // ── 7. Apply preference filter (programmatic — fast and accurate) ──────────
  const prefs = await prefsPromise

  // Only apply filter if Haiku returned real preferences (not just defaults 9-17 with no days)
  const hasRealPrefs = prefs && (
    prefs.preferred_days.length > 0 ||
    prefs.earliest_hour !== 9 ||
    prefs.latest_hour !== 17
  )
  if (hasRealPrefs && prefs) {
    const allowedDays = new Set(
      prefs.preferred_days
        .map(d => DAY_MAP[d.toLowerCase()])
        .filter((n): n is number => n !== undefined)
    )

    const filtered = formattedSlots.filter(slot => {
      const dt = new Date(slot.start)
      // Extract day and hour in the interviewer's timezone using Intl API
      const dayStr = dt.toLocaleDateString('en-US', { weekday: 'long', timeZone: tz }).toLowerCase()
      const hourStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', hour12: false, timeZone: tz })
      const day = DAY_MAP[dayStr] ?? dt.getDay()
      const hour = parseInt(hourStr, 10)

      // Day filter: if candidate specified days, only include those
      if (allowedDays.size > 0 && !allowedDays.has(day)) return false

      // Time filter: must be within candidate's preferred window
      if (hour < prefs.earliest_hour) return false
      if (hour >= prefs.latest_hour) return false

      return true
    })

    if (filtered.length > 0) {
      console.log(`[preview-slots] Filtered ${formattedSlots.length} → ${filtered.length} slots | days: ${prefs.preferred_days.join(',')} | ${prefs.earliest_hour}:00-${prefs.latest_hour}:00`)
      return NextResponse.json({
        slots: filtered.slice(0, SLOTS_TO_OFFER),
        ai_reasoning: prefs.reasoning,
      })
    }

    // Preferences too restrictive — no matches. Return all with explanation.
    console.log(`[preview-slots] No slots match preferences (${prefs.preferred_days.join(',')}, ${prefs.earliest_hour}-${prefs.latest_hour}) — returning all`)
    return NextResponse.json({
      slots: formattedSlots.slice(0, SLOTS_TO_OFFER),
      ai_reasoning: `No slots match "${rescheduleReason}" exactly — showing all available times. Admin can adjust manually.`,
    })
  }

  // ── 8. No reason or extraction failed — return top slots ───────────────────
  return NextResponse.json({
    slots: formattedSlots.slice(0, SLOTS_TO_OFFER),
    ai_reasoning: rescheduleReason
      ? 'Could not parse scheduling preferences — showing next available slots.'
      : 'No specific preferences stated — showing next available slots.',
  })
}

// ─── Extract structured preferences via Haiku (fast: ~300ms) ─────────────────
// Haiku extracts days + time range as structured data. Code does the filtering.
// This is reliable because code never mismatches "Monday" with Friday.
async function extractPreferences(reason: string): Promise<SchedulePreferences | null> {
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: `Extract scheduling preferences from a candidate's reschedule reason.
Return JSON only:
{
  "preferred_days": ["monday", "wednesday"],
  "earliest_hour": 14,
  "latest_hour": 17,
  "reasoning": "Candidate prefers Mon/Wed afternoons after 2 PM"
}

Rules:
- preferred_days: lowercase day names. Empty array if no day preference stated.
- earliest_hour: 0-23 integer. Use 9 if not specified (business hours start).
- latest_hour: 0-23 integer. Use 17 if not specified (business hours end).
- "after 2 PM" → earliest_hour: 14
- "before noon" → latest_hour: 12
- "mornings" → earliest_hour: 9, latest_hour: 12
- "afternoons" → earliest_hour: 12, latest_hour: 17
- If reason has no time preferences (e.g. "conflict with another meeting"), return empty days and default hours.`,
      messages: [{
        role: 'user',
        content: reason,
      }],
    })

    const textBlock = message.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') return null

    const raw = textBlock.text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()

    const parsed = JSON.parse(raw) as SchedulePreferences

    // Validate
    if (!Array.isArray(parsed.preferred_days)) parsed.preferred_days = []
    if (typeof parsed.earliest_hour !== 'number') parsed.earliest_hour = 9
    if (typeof parsed.latest_hour !== 'number') parsed.latest_hour = 17

    console.log(`[preview-slots] Extracted preferences: days=${parsed.preferred_days.join(',')||'any'} hours=${parsed.earliest_hour}-${parsed.latest_hour}`)
    return parsed
  } catch (err) {
    console.warn('[preview-slots] Preference extraction failed:', err instanceof Error ? err.message : String(err))
    return null
  }
}
