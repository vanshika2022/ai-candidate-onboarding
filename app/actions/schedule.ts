'use server'

/**
 * HOLD & RELEASE SCHEDULING STRATEGY
 * ─────────────────────────────────────────────────────────────────────────────
 * When an admin invites a candidate, we immediately create 5 "TENTATIVE" holds
 * on the interviewer's Google Calendar for each available slot. This soft-lock
 * prevents any other candidate from ever receiving the same slot — those blocks
 * are invisible to external calendar viewers until explicitly released.
 *
 * When the candidate confirms one slot:
 *   1. That single event is upgraded to CONFIRMED + Fireflies notetaker added.
 *   2. The remaining 4 TENTATIVE holds are deleted — returning that time back
 *      to the interviewer's availability pool for future candidates.
 *
 * This guarantees zero double-booking without requiring database-level locking.
 */

import { createAdminClient } from '@/lib/supabase/server'
import type { TentativeSlot } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  getAvailableSlots,
  createTentativeHolds,
  confirmAndRelease,
  SLOTS_TO_OFFER,
} from '@/lib/services/calendar'

// ─── Public types ─────────────────────────────────────────────────────────────
export type ScheduleResult =
  | { success: true; slots: TentativeSlot[] }
  | { success: false; error: string }

export type ConfirmResult =
  | { success: true }
  | { success: false; error: string }

// ─── Admin action: fetch 5 slots, hold them, update status → slots_held ───────
export async function scheduleInterview(applicationId: string): Promise<ScheduleResult> {
  const supabase = createAdminClient()

  const { data: app } = await supabase
    .from('applications')
    .select('candidates(full_name), jobs(title)')
    .eq('id', applicationId)
    .single()

  if (!app) return { success: false, error: 'Application not found.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidateName = (app.candidates as any)?.full_name ?? 'Candidate'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobTitle = (app.jobs as any)?.title ?? 'Role'

  // 1. Find available slots via freebusy
  let availableSlots: Array<{ start: string; end: string }>
  try {
    availableSlots = await getAvailableSlots()
  } catch (err) {
    console.error('[Calendar] freebusy failed:', err)
    return { success: false, error: 'Could not read calendar availability. Check service account credentials.' }
  }

  if (availableSlots.length < SLOTS_TO_OFFER) {
    return {
      success: false,
      error: `Only ${availableSlots.length} slot(s) found. Check the interviewer's calendar.`,
    }
  }

  // 2. Soft-lock: immediately create TENTATIVE holds on the calendar
  let tentativeSlots: TentativeSlot[]
  try {
    tentativeSlots = await createTentativeHolds(
      availableSlots.slice(0, SLOTS_TO_OFFER),
      candidateName,
      jobTitle
    )
  } catch (err) {
    console.error('[Calendar] tentative hold creation failed:', err)
    return { success: false, error: 'Failed to create calendar holds.' }
  }

  // 3. Persist event IDs in tentative_slots JSONB + transition to slots_held
  const { error } = await supabase
    .from('applications')
    .update({ status: 'slots_held', tentative_slots: tentativeSlots })
    .eq('id', applicationId)

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/applications')
  revalidatePath(`/admin/applications/${applicationId}`)

  return { success: true, slots: tentativeSlots }
}

// ─── Candidate action: confirm one slot, release the rest ─────────────────────
export async function confirmInterviewSlot(
  applicationId: string,
  selectedEventId: string
): Promise<ConfirmResult> {
  const supabase = createAdminClient()

  const { data: app } = await supabase
    .from('applications')
    .select('tentative_slots, candidates(full_name, email), jobs(title)')
    .eq('id', applicationId)
    .single()

  if (!app) return { success: false, error: 'Application not found.' }

  const tentativeSlots = (app.tentative_slots ?? []) as TentativeSlot[]
  const selectedSlot   = tentativeSlots.find(s => s.eventId === selectedEventId)

  if (!selectedSlot) return { success: false, error: 'Selected slot not found.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidateName  = (app.candidates as any)?.full_name ?? 'Candidate'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidateEmail = (app.candidates as any)?.email ?? ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobTitle = (app.jobs as any)?.title ?? 'Role'

  const toRelease = tentativeSlots.filter(s => s.eventId !== selectedEventId)

  // 1. Confirm the selected event + delete other holds
  // Returns DEFAULT_MEETING_LINK if set, null otherwise.
  // Portal URL used as fallback when no Meet link is available.
  let meetLink: string | null = null
  try {
    meetLink = await confirmAndRelease(selectedEventId, toRelease, candidateName, jobTitle, candidateEmail)
  } catch (err) {
    console.error('[Calendar] confirmAndRelease failed:', err)
    return { success: false, error: 'Failed to confirm calendar event.' }
  }

  // 2. Update application: status → confirmed, retain confirmed slot
  const { error } = await supabase
    .from('applications')
    .update({
      status:          'confirmed',
      interview_link:  meetLink ?? `${process.env.NEXT_PUBLIC_APP_URL}/portal/${applicationId}`,
      tentative_slots: [selectedSlot],   // retain for display
    })
    .eq('id', applicationId)

  if (error) return { success: false, error: error.message }

  // 3. Send confirmation email to candidate — never fail confirmation if email fails
  const interviewLink = meetLink ?? `${process.env.NEXT_PUBLIC_APP_URL}/portal/${applicationId}`
  const firstName = candidateName.split(' ')[0]
  const tz = process.env.INTERVIEWER_TIMEZONE ?? 'America/New_York'
  const interviewDate = new Date(selectedSlot.start).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone: tz,
  })

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const toEmail = process.env.RESEND_TO_OVERRIDE || candidateEmail

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: toEmail,
      subject: `Your interview is confirmed — ${jobTitle} at Niural`,
      html: `
        <h2>Your interview is confirmed!</h2>
        <p>Hi ${firstName},</p>
        <p>Your interview for <strong>${jobTitle}</strong> is scheduled.</p>
        <p><strong>Date:</strong> ${interviewDate}</p>
        <p><strong>Duration:</strong> 45 minutes</p>
        <p><strong>Join here:</strong> <a href="${process.env.DEFAULT_MEETING_LINK || interviewLink}">${process.env.DEFAULT_MEETING_LINK || interviewLink}</a></p>
        <p>Best,<br/>Niural Hiring Team</p>
      `,
    })
    console.log('[Confirm] Email sent to', toEmail)
  } catch (emailErr) {
    console.error('[Confirm] Email failed:', emailErr instanceof Error ? emailErr.message : emailErr)
  }

  revalidatePath('/admin/applications')
  revalidatePath(`/admin/applications/${applicationId}`)
  revalidatePath(`/portal/${applicationId}`)

  return { success: true }
}
