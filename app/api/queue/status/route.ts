/**
 * app/api/queue/status/route.ts
 * ─────────────────────────────
 * Admin-facing queue health dashboard endpoint.
 * Returns queue status counts, performance metrics, and scale guidance.
 * Secured by Authorization: Bearer ADMIN_SECRET.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  // ── Auth: verify admin secret ─────────────────────────────────────────────
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token || token !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // ── Queue health: count by status ─────────────────────────────────────────
  const { data: allJobs, error: fetchError } = await supabase
    .from('processing_queue')
    .select('id, status, created_at, processed_at')

  if (fetchError) {
    console.error('[Queue Status] Failed to fetch queue data:', fetchError.message)
    return NextResponse.json(
      { error: 'Failed to fetch queue data', detail: fetchError.message },
      { status: 500 }
    )
  }

  const jobs = allJobs || []

  const pending = jobs.filter(j => j.status === 'pending').length
  const processing = jobs.filter(j => j.status === 'processing').length
  const done = jobs.filter(j => j.status === 'done').length
  const failed = jobs.filter(j => j.status === 'failed').length
  const total = jobs.length

  // ── Performance metrics ───────────────────────────────────────────────────

  // Average processing time (only for completed jobs with both timestamps)
  const completedJobs = jobs.filter(j => j.status === 'done' && j.processed_at && j.created_at)
  let avgProcessingTimeSeconds = 0

  if (completedJobs.length > 0) {
    const totalSeconds = completedJobs.reduce((sum, j) => {
      const created = new Date(j.created_at).getTime()
      const processed = new Date(j.processed_at).getTime()
      return sum + (processed - created) / 1000
    }, 0)
    avgProcessingTimeSeconds = Math.round((totalSeconds / completedJobs.length) * 100) / 100
  }

  // Oldest pending job
  const pendingJobs = jobs
    .filter(j => j.status === 'pending')
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  const oldestPendingCreatedAt = pendingJobs.length > 0 ? pendingJobs[0].created_at : null

  // Jobs processed in the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const jobsProcessedLastHour = jobs.filter(
    j => j.status === 'done' && j.processed_at && j.processed_at >= oneHourAgo
  ).length

  return NextResponse.json({
    queue_health: {
      pending,
      processing,
      done,
      failed,
      total,
    },
    performance: {
      avg_processing_time_seconds: avgProcessingTimeSeconds,
      oldest_pending_created_at: oldestPendingCreatedAt,
      jobs_processed_last_hour: jobsProcessedLastHour,
    },
    scale_note:
      'Production upgrade: replace with BullMQ + Upstash Redis for sub-second job pickup, priorities, and horizontal scaling.',
  })
}
