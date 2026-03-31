'use server'

/**
 * app/actions/feedback.ts
 * ──────────────────────
 * Server Action for submitting post-interview feedback (rating + comments).
 * Both fields are required. Feedback gates offer letter generation.
 *
 * Uses createAdminClient() — service role key never leaves the server.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const FeedbackSchema = z.object({
  application_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comments: z.string().min(1, 'Comments are required'),
})

export type SubmitFeedbackResult =
  | { success: true; rejected: boolean }
  | { success: false; error: string }

export async function submitInterviewFeedback(
  formData: FormData
): Promise<SubmitFeedbackResult> {
  const raw = {
    application_id: (formData.get('application_id') as string)?.trim(),
    rating: Number(formData.get('rating')),
    comments: (formData.get('comments') as string)?.trim(),
  }

  const parsed = FeedbackSchema.safeParse(raw)
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? 'Invalid input'
    return { success: false, error: firstError }
  }

  const { application_id, rating, comments } = parsed.data
  const supabase = createAdminClient()

  // Verify application exists and is in 'interviewed' status
  const { data: app, error: appError } = await supabase
    .from('applications')
    .select('id, status')
    .eq('id', application_id)
    .single()

  if (appError || !app) {
    return { success: false, error: 'Application not found.' }
  }

  const FEEDBACK_ELIGIBLE = ['interviewed', 'offer_sent', 'hired']
  if (!FEEDBACK_ELIGIBLE.includes(app.status)) {
    return {
      success: false,
      error: `Cannot submit feedback — application status is '${app.status}'. Interview must be completed first.`,
    }
  }

  // Check for existing feedback (one per application)
  const { data: existing } = await supabase
    .from('interview_feedback')
    .select('id')
    .eq('application_id', application_id)
    .maybeSingle()

  if (existing) {
    const { error: updateError } = await supabase
      .from('interview_feedback')
      .update({ rating, comments })
      .eq('application_id', application_id)

    if (updateError) {
      return { success: false, error: updateError.message }
    }
  } else {
    const { error: insertError } = await supabase
      .from('interview_feedback')
      .insert({ application_id, rating, comments })

    if (insertError) {
      return { success: false, error: insertError.message }
    }
  }

  // Rating 1-3 → auto-reject, 4-5 → proceed to offer
  if (rating <= 3) {
    await supabase
      .from('applications')
      .update({
        status: 'rejected',
        admin_override_note: `Rejected after interview — rating ${rating}/5. Feedback: ${comments}`,
      })
      .eq('id', application_id)
  }

  revalidatePath(`/admin/applications/${application_id}`)
  revalidatePath('/admin/applications')

  return { success: true, rejected: rating <= 3 }
}
