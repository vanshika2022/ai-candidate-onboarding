import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type AppStatus =
  | 'applied'
  | 'screening'
  | 'shortlisted'
  | 'slots_offered'
  | 'slots_held'
  | 'interview_scheduled'
  | 'confirmed'
  | 'interviewed'
  | 'offer_sent'
  | 'hired'
  | 'rejected'
  | 'pending_review'
  | 'manual_review_required'

export interface TentativeSlot {
  eventId: string
  start: string  // ISO 8601
  end: string    // ISO 8601
}

export interface Job {
  id: string
  title: string
  team: string
  location: string
  level: string
  description: string
  requirements: string
  status: string
  created_at: string
}

export interface Candidate {
  id: string
  full_name: string
  email: string
  linkedin_url: string | null
  github_url: string | null
  created_at: string
}

export interface Application {
  id: string
  candidate_id: string
  job_id: string
  status: AppStatus
  resume_url: string | null
  resume_text: string | null
  ai_score: number | null
  ai_rationale: string | null
  ai_brief: string | null
  ai_analysis: Record<string, unknown> | null
  structured_data: Record<string, unknown> | null
  research_profile: Record<string, unknown> | null
  discrepancy_flags: string[] | null
  social_research: Record<string, unknown> | null
  interview_link: string | null
  tentative_slots: TentativeSlot[] | null
  admin_override_note: string | null
  created_at: string
  candidates?: Candidate
  jobs?: Job
}
