/**
 * lib/supabase/server.ts
 * ─────────────────────
 * Single import point for ALL server-side Supabase usage.
 * Client components must NOT import from here.
 */
import { createClient } from '@supabase/supabase-js'

// Re-export all shared types so consumers only need one import
export type {
  AppStatus,
  Job,
  Candidate,
  Application,
  TentativeSlot,
} from '../supabase'

// ── Anon client (subject to RLS — safe for public read operations) ────────────
export function createAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ── Admin client (service-role, bypasses RLS) ─────────────────────────────────
export function createAdminClient() {
  const url            = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey || serviceRoleKey === 'your-service-role-key-here') {
    console.warn(
      '[supabase/server] SUPABASE_SERVICE_ROLE_KEY not set — falling back to anon key. Admin reads may be blocked by RLS.'
    )
    return createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// ── Transcript query ──────────────────────────────────────────────────────────

export interface TranscriptRow {
  id: string
  application_id: string
  fireflies_id: string | null
  summary: string | null
  full_transcript: Array<{ speaker: string; text: string; timestamp: number }> | null
  retrieved_at: string
}

export async function getTranscriptByApplication(
  applicationId: string
): Promise<TranscriptRow | null> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('transcripts')
    .select('id, application_id, fireflies_id, summary, full_transcript, retrieved_at')
    .eq('application_id', applicationId)
    .order('retrieved_at', { ascending: false })
    .limit(1)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // no rows found
    console.error('[getTranscriptByApplication] Query failed:', error.message)
    return null
  }

  return data as TranscriptRow
}
