/**
 * app/api/queue/worker/route.ts
 * ─────────────────────────────
 * Cron-triggered queue worker that processes pending jobs from Supabase.
 * Secured by x-cron-secret header matching CRON_SECRET env var.
 * Runs every minute via Vercel Cron (see vercel.json).
 *
 * ── SQL Migration (run in Supabase SQL editor) ─────────────────────────────────
 *
 * CREATE TABLE IF NOT EXISTS processing_queue (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   application_id UUID REFERENCES applications(id),
 *   job_type TEXT NOT NULL,
 *   status TEXT DEFAULT 'pending',
 *   attempts INTEGER DEFAULT 0,
 *   max_attempts INTEGER DEFAULT 3,
 *   error_message TEXT,
 *   payload JSONB,
 *   created_at TIMESTAMPTZ DEFAULT now(),
 *   processed_at TIMESTAMPTZ
 * );
 *
 * ────────────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  // ── Auth: verify cron secret ──────────────────────────────────────────────
  const cronSecret = request.headers.get('x-cron-secret')
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  let processed = 0
  let failed = 0
  let skipped = 0

  // ── Step 1: Fetch up to 5 pending jobs ────────────────────────────────────
  const { data: jobs, error: fetchError } = await supabase
    .from('processing_queue')
    .select('*')
    .eq('status', 'pending')
    .lt('attempts', 3)
    .order('created_at', { ascending: true })
    .limit(5)

  if (fetchError) {
    console.error('[Queue Worker] Failed to fetch jobs:', fetchError.message)
    return NextResponse.json(
      { error: 'Failed to fetch jobs', detail: fetchError.message },
      { status: 500 }
    )
  }

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ processed: 0, failed: 0, skipped: 0, message: 'No pending jobs' })
  }

  // ── Step 2–5: Process each job ────────────────────────────────────────────
  for (const job of jobs) {
    // Mark as processing and increment attempts
    const { error: updateError } = await supabase
      .from('processing_queue')
      .update({ status: 'processing', attempts: job.attempts + 1 })
      .eq('id', job.id)

    if (updateError) {
      console.error(`[Queue Worker] Failed to mark job ${job.id} as processing:`, updateError.message)
      skipped++
      continue
    }

    try {
      // ── Step 3: Process based on job_type ─────────────────────────────────
      switch (job.job_type) {
        case 'screening':
          console.log(`[Queue] Screening job ${job.id} — would call runScreening()`)
          break
        case 'enrichment':
          console.log(`[Queue] Enrichment job ${job.id} — would call runEnrichment()`)
          break
        case 'scheduling':
          console.log(`[Queue] Scheduling job ${job.id} — would call scheduleInterview()`)
          break
        default:
          console.warn(`[Queue] Unknown job_type "${job.job_type}" for job ${job.id}`)
          break
      }

      // ── Step 4: Success — mark done ───────────────────────────────────────
      await supabase
        .from('processing_queue')
        .update({ status: 'done', processed_at: new Date().toISOString() })
        .eq('id', job.id)

      processed++
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      const currentAttempts = job.attempts + 1

      // ── Step 5: Failure — retry or mark failed ────────────────────────────
      if (currentAttempts < job.max_attempts) {
        // Retry: reset to pending so next cron tick picks it up
        await supabase
          .from('processing_queue')
          .update({ status: 'pending', error_message: errorMessage })
          .eq('id', job.id)

        console.warn(`[Queue] Job ${job.id} failed (attempt ${currentAttempts}/${job.max_attempts}), will retry:`, errorMessage)
      } else {
        // Permanently failed
        await supabase
          .from('processing_queue')
          .update({ status: 'failed', error_message: errorMessage, processed_at: new Date().toISOString() })
          .eq('id', job.id)

        console.error(`[Queue] Job ${job.id} permanently failed after ${currentAttempts} attempts:`, errorMessage)
      }

      failed++
    }
  }

  return NextResponse.json({ processed, failed, skipped })
}
