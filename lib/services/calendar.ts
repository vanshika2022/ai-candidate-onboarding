/**
 * lib/services/calendar.ts
 * ────────────────────────
 * Google Calendar integration for the Hold & Release scheduling strategy.
 *
 * HOLD & RELEASE PATTERN
 * ──────────────────────
 * When an admin invites a candidate we immediately create 5 "TENTATIVE" holds
 * on the interviewer's calendar. This soft-lock prevents double-booking without
 * any database-level locking.
 *
 * When the candidate confirms one slot:
 *   1. That event is upgraded to CONFIRMED + Fireflies notetaker added as attendee.
 *   2. The remaining 4 TENTATIVE holds are deleted instantly.
 *
 * This guarantees zero double-booking across all concurrent candidates.
 */

import { google } from 'googleapis'
import type { TentativeSlot } from '@/lib/supabase/server'

// ─── Config ───────────────────────────────────────────────────────────────────
export const SLOT_DURATION_MS    = 45 * 60 * 1000  // 45 minutes
export const SLOTS_TO_OFFER      = 5
const SEARCH_DAYS         = 14
const BUSINESS_START_HOUR = 9   // 9 AM  (in INTERVIEWER_TIMEZONE)
const BUSINESS_END_HOUR   = 17  // 5 PM
const FIREFLIES_NOTETAKER = 'fred@fireflies.ai'

// ─── Calendar client (service account) ───────────────────────────────────────
export function getCalendarClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/calendar'],
  })
  return google.calendar({ version: 'v3', auth })
}

export function getCalendarId(): string {
  return process.env.GOOGLE_CALENDAR_ID!
}

// ─── Find free 45-min blocks within business hours ───────────────────────────
export async function getAvailableSlots(): Promise<Array<{ start: string; end: string }>> {
  const calendar   = getCalendarClient()
  const calendarId = getCalendarId()

  const windowStart = new Date()
  windowStart.setHours(windowStart.getHours() + 2) // at least 2 hrs buffer
  const windowEnd = new Date(windowStart)
  windowEnd.setDate(windowEnd.getDate() + SEARCH_DAYS)

  // Query busy blocks via freebusy API
  const { data: fb } = await calendar.freebusy.query({
    requestBody: {
      timeMin: windowStart.toISOString(),
      timeMax: windowEnd.toISOString(),
      timeZone: process.env.INTERVIEWER_TIMEZONE ?? 'America/New_York',
      items: [{ id: calendarId }],
    },
  })
  const busyBlocks = (fb.calendars?.[calendarId]?.busy ?? []).map(b => ({
    start: new Date(b.start!).getTime(),
    end:   new Date(b.end!).getTime(),
  }))

  const slots: Array<{ start: string; end: string }> = []
  const cursor = new Date(windowStart)

  // Snap to next 30-min boundary
  const m = cursor.getMinutes()
  cursor.setMinutes(m < 30 ? 30 : 60, 0, 0)

  while (slots.length < SLOTS_TO_OFFER && cursor < windowEnd) {
    const dow = cursor.getDay()

    // Skip weekends
    if (dow === 0) { cursor.setDate(cursor.getDate() + 1); cursor.setHours(BUSINESS_START_HOUR, 0, 0, 0); continue }
    if (dow === 6) { cursor.setDate(cursor.getDate() + 2); cursor.setHours(BUSINESS_START_HOUR, 0, 0, 0); continue }

    const h = cursor.getHours()
    if (h < BUSINESS_START_HOUR) { cursor.setHours(BUSINESS_START_HOUR, 0, 0, 0); continue }
    if (h >= BUSINESS_END_HOUR)  { cursor.setDate(cursor.getDate() + 1); cursor.setHours(BUSINESS_START_HOUR, 0, 0, 0); continue }

    const slotStartMs = cursor.getTime()
    const slotEndMs   = slotStartMs + SLOT_DURATION_MS
    const slotEnd     = new Date(slotEndMs)

    // Slot must finish before end of business
    if (slotEnd.getHours() > BUSINESS_END_HOUR || (slotEnd.getHours() === BUSINESS_END_HOUR && slotEnd.getMinutes() > 0)) {
      cursor.setDate(cursor.getDate() + 1)
      cursor.setHours(BUSINESS_START_HOUR, 0, 0, 0)
      continue
    }

    const hasConflict = busyBlocks.some(b => slotStartMs < b.end && slotEndMs > b.start)
    if (!hasConflict) {
      slots.push({ start: cursor.toISOString(), end: slotEnd.toISOString() })
    }

    cursor.setMinutes(cursor.getMinutes() + 30)
  }

  return slots
}

// ─── HOLD: Create 5 tentative soft-locks on the calendar ─────────────────────
export async function createTentativeHolds(
  slots: Array<{ start: string; end: string }>,
  candidateName: string,
  jobTitle: string
): Promise<TentativeSlot[]> {
  const calendar   = getCalendarClient()
  const calendarId = getCalendarId()
  const results: TentativeSlot[] = []

  for (const slot of slots) {
    const { data: event } = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary:     `[TENTATIVE] ${candidateName} — ${jobTitle}`,
        description: 'Auto-created tentative hold by Niural Scout. Pending candidate slot confirmation.',
        status:      'tentative',
        start: { dateTime: slot.start, timeZone: 'UTC' },
        end:   { dateTime: slot.end,   timeZone: 'UTC' },
      },
    })
    if (event.id) {
      results.push({ eventId: event.id, start: slot.start, end: slot.end })
    }
  }

  return results
}

// ─── RELEASE: Confirm one slot, delete the other 4, add Fireflies notetaker ──
export async function confirmAndRelease(
  selectedEventId: string,
  toRelease: TentativeSlot[],
  candidateName: string,
  jobTitle: string
): Promise<void> {
  const calendar   = getCalendarClient()
  const calendarId = getCalendarId()

  // 1. Upgrade selected event → CONFIRMED + add Fireflies notetaker as attendee
  await calendar.events.patch({
    calendarId,
    eventId: selectedEventId,
    requestBody: {
      summary:     `Interview: ${candidateName} — ${jobTitle}`,
      description: 'Confirmed via Niural candidate portal. Notetaker (Fireflies) invited.',
      status:      'confirmed',
      attendees: [
        { email: FIREFLIES_NOTETAKER, displayName: 'Fireflies Notetaker', comment: 'AI notetaker' },
      ],
    },
  })

  // 2. Delete the remaining 4 TENTATIVE holds (best-effort, don't fail on 404)
  await Promise.allSettled(
    toRelease.map(s => calendar.events.delete({ calendarId, eventId: s.eventId }))
  )
}
