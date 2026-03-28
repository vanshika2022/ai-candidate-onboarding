'use server'

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import type { Job } from '@/lib/supabase/server'

// All DB operations use the service-role admin client so RLS is bypassed.
// This is a server action — the key is never exposed to the browser.

// ─── LinkedIn URL validation ──────────────────────────────────────────────────
const LINKEDIN_PATTERN =
  /^https?:\/\/(www\.)?linkedin\.com\/(in|pub|profile\/view)\/?[a-zA-Z0-9\-_%]+\/?/i

function isValidLinkedIn(url: string): boolean {
  return LINKEDIN_PATTERN.test(url)
}

// ─── Resume storage upload (uses service role to write to private bucket) ────
async function uploadResumeToStorage(
  candidateId: string,
  file: File,
  buffer: Buffer
): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${candidateId}/${Date.now()}_${safeName}`

    const { error } = await admin.storage
      .from('resumes')
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })

    if (error) {
      console.error('[Storage] Upload failed:', error.message)
      return null
    }

    return storagePath
  } catch (err) {
    console.error('[Storage] Unexpected error:', err)
    return null
  }
}

// ─── Zod schemas ─────────────────────────────────────────────────────────────
const ScreeningSchema = z.object({
  score: z.number().min(0).max(100),
  rationale: z.string(),
  sixty_second_brief: z.string(),
  structured_data: z.object({
    skills: z.array(z.string()),
    years_exp: z.number(),
    education: z.array(z.string()),
    employers: z.array(z.string()),
    achievements: z.array(z.string()),
  }),
})

const EnrichmentSchema = z.object({
  linkedin_summary: z.string(),
  x_findings: z.string(),
  github_summary: z.string(),
  discrepancy_flags: z.array(z.string()),
})

// ─── Resume text extraction via unpdf ────────────────────────────────────────
// unpdf is used instead of pdf-parse for reliable cross-runtime PDF parsing.
// Falls back to mammoth for DOCX and UTF-8 decode for plain text.
// Throws on failure — caller must catch and set status = manual_review_required.
async function extractResumeTextFromBuffer(buffer: Buffer, filename: string): Promise<string> {
  const ext = filename.split('.').pop()?.toLowerCase()

  if (ext === 'pdf') {
    const { extractText } = await import('unpdf')
    const uint8 = new Uint8Array(buffer)
    const { text } = await extractText(uint8, { mergePages: true })
    // text is string when mergePages:true, string[] otherwise — handle both
    return Array.isArray(text) ? text.join('\n') : (text as string)
  }

  if (ext === 'docx') {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  // Plain text fallback (txt, rtf, unknown)
  return buffer.toString('utf-8')
}

// ─── AI screening call ────────────────────────────────────────────────────────
async function runScreening(
  client: Anthropic,
  resumeText: string,
  job: Job
): Promise<z.infer<typeof ScreeningSchema>> {
  const stream = client.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    system: `You are Niural Scout, an expert technical recruiter and senior talent evaluator at Niural.
Your task: evaluate a candidate's resume against a job description and produce a structured assessment.

Scoring rubric (0-100):
- 0-40: Poor fit — major missing requirements, experience gaps, or misaligned level
- 41-60: Partial fit — meets some requirements but lacks key skills or experience
- 61-79: Good fit — solid match, minor gaps acceptable
- 80-100: Excellent fit — strong match, exceeds or meets most requirements

The "sixty_second_brief" must be 3-5 sentences written as if a hiring manager is verbally briefing the CEO:
• Lead with the candidate's current/most recent role and years of experience
• Highlight 2-3 standout skills or achievements relevant to this specific role
• Note any gaps or risks concisely
• End with a recommendation signal

Return a JSON object ONLY — absolutely no markdown, no code fences, no text outside the JSON.
{
  "score": <integer 0-100>,
  "rationale": "<2-3 sentences explaining the score, referencing specific requirements met or missed>",
  "sixty_second_brief": "<3-5 sentence verbal briefing for the hiring manager>",
  "structured_data": {
    "skills": ["<skill>", "..."],
    "years_exp": <integer>,
    "education": ["<Degree, Institution>", "..."],
    "employers": ["<Company Name>", "..."],
    "achievements": ["<specific measurable achievement>", "..."]
  }
}`,
    messages: [
      {
        role: 'user',
        content: `JOB TITLE: ${job.title}
TEAM: ${job.team}
LEVEL: ${job.level}

JOB DESCRIPTION:
${job.description}

REQUIREMENTS:
${job.requirements}

---

RESUME TEXT:
${resumeText}

Evaluate this candidate and return the JSON object.`,
      },
    ],
  })

  const message = await stream.finalMessage()

  // Extract text from response (skip thinking blocks)
  const textBlock = message.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from screening AI')
  }

  // Strip any accidental markdown fences
  const raw = textBlock.text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  const parsed = JSON.parse(raw)
  return ScreeningSchema.parse(parsed)
}

// ─── AI enrichment call (only triggered when score > 80) ─────────────────────
async function runEnrichment(
  client: Anthropic,
  candidateName: string,
  linkedinUrl: string,
  githubUrl: string | null,
  resumeText: string
): Promise<z.infer<typeof EnrichmentSchema>> {
  const stream = client.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: 5000,
    thinking: { type: 'adaptive' },
    system: `You are Niural Scout's deep-research analyst. A candidate has been shortlisted (score > 80).
Your job is to simulate an investigative online research pass using their profile URLs and resume.

You do NOT have live internet access. Instead, reason carefully from:
1. The LinkedIn URL structure (e.g. linkedin.com/in/username) to infer their professional brand
2. The GitHub URL (if present) to infer open-source footprint and technical depth
3. The resume text to cross-reference claims against what their online profiles likely show

Be specific, analytical, and candid. Flag any inconsistencies between resume claims and what
their online profile likely shows (e.g., missing companies on LinkedIn, resume title vs. apparent seniority).

Return a JSON object ONLY — no markdown, no code fences, no explanation outside the JSON.
JSON format:
{
  "linkedin_summary": "<3-5 sentences: professional brand, likely endorsements, activity pattern, network signals>",
  "x_findings": "<2-3 sentences: thought leadership presence on X/Twitter — note if profile likely doesn't exist or is inactive>",
  "github_summary": "<3-5 sentences: likely repos, contribution pattern, notable projects, code quality signals — or 'No GitHub URL provided' if absent>",
  "discrepancy_flags": [
    "<specific flag: e.g., 'Resume lists Senior Engineer at Acme Corp 2021-2023 but LinkedIn handle suggests recent grad'>",
    "..."
  ]
}`,
    messages: [
      {
        role: 'user',
        content: `CANDIDATE NAME: ${candidateName}
LINKEDIN URL: ${linkedinUrl}
GITHUB URL: ${githubUrl ?? 'Not provided'}

RESUME TEXT (first 4000 chars):
${resumeText.slice(0, 4000)}

Generate the research profile JSON for this shortlisted candidate.`,
      },
    ],
  })

  const message = await stream.finalMessage()

  const textBlock = message.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from enrichment AI')
  }

  const raw = textBlock.text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  const parsed = JSON.parse(raw)
  return EnrichmentSchema.parse(parsed)
}

// ─── Main server action ───────────────────────────────────────────────────────
export type ApplyResult =
  | { success: true; score: number | null; status: string }
  | { success: false; error: string }

export async function submitApplication(formData: FormData): Promise<ApplyResult> {
  const supabase = createAdminClient()
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // ── 1. Parse form fields ──────────────────────────────────────────────────
  const jobId = formData.get('job_id') as string
  const fullName = (formData.get('full_name') as string)?.trim()
  const email = (formData.get('email') as string)?.trim().toLowerCase()
  const linkedinUrl = (formData.get('linkedin_url') as string)?.trim()
  const githubUrl = (formData.get('github_url') as string | null)?.trim() || null
  const resumeFile = formData.get('resume') as File | null

  // ── 2. Validate required fields ───────────────────────────────────────────
  if (!jobId || !fullName || !email) {
    return { success: false, error: 'Full name and email are required.' }
  }

  if (!linkedinUrl) {
    return {
      success: false,
      error: 'A valid LinkedIn profile is required for AI Research.',
    }
  }

  if (!isValidLinkedIn(linkedinUrl)) {
    return {
      success: false,
      error:
        'A valid LinkedIn profile is required for AI Research (e.g., linkedin.com/in/yourname).',
    }
  }

  // ── 3. Verify job is open ─────────────────────────────────────────────────
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    return { success: false, error: 'Job not found.' }
  }
  if (job.status !== 'open') {
    return { success: false, error: 'This position is no longer accepting applications.' }
  }

  // ── 4. Extract resume text + retain buffer for storage upload ────────────
  let resumeText = ''
  let resumeBuffer: Buffer | null = null
  let extractionError: string | null = null

  if (resumeFile && resumeFile.size > 0) {
    resumeBuffer = Buffer.from(await resumeFile.arrayBuffer())
    try {
      resumeText = await extractResumeTextFromBuffer(resumeBuffer, resumeFile.name)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      extractionError = `PDF extraction failed: ${msg}`
      console.error('[Resume] Extraction error:', msg)
    }
  }

  // ── 5. Upsert candidate ───────────────────────────────────────────────────
  const { data: candidate, error: candidateError } = await supabase
    .from('candidates')
    .upsert(
      { full_name: fullName, email, linkedin_url: linkedinUrl, github_url: githubUrl },
      { onConflict: 'email', ignoreDuplicates: false }
    )
    .select('id')
    .single()

  if (candidateError) {
    return { success: false, error: candidateError.message }
  }

  // ── 5b. Upload resume file to Supabase Storage ────────────────────────────
  let resumeStoragePath: string | null = null

  if (resumeFile && resumeBuffer) {
    resumeStoragePath = await uploadResumeToStorage(candidate.id, resumeFile, resumeBuffer)
  }

  // ── 6. Check for duplicate application ───────────────────────────────────
  const { data: existing } = await supabase
    .from('applications')
    .select('id')
    .eq('candidate_id', candidate.id)
    .eq('job_id', jobId)
    .single()

  if (existing) {
    return { success: false, error: 'You have already applied for this position.' }
  }

  // ── 7. Resilience: extraction failed → manual_review_required ────────────
  // Do NOT score a candidate with no resume text. Flag for human review.
  if (extractionError) {
    const { error: appError } = await supabase.from('applications').insert({
      candidate_id: candidate.id,
      job_id: jobId,
      status: 'manual_review_required',
      resume_url: resumeStoragePath,
      resume_text: null,
      ai_score: null,
      ai_rationale: extractionError,
      ai_brief: null,
      discrepancy_flags: null,
      social_research: null,
      structured_data: null,
      ai_analysis: null,
      research_profile: null,
    })
    if (appError) {
      if (appError.code === '23505') return { success: false, error: 'You have already applied for this position.' }
      return { success: false, error: appError.message }
    }
    return { success: true, score: null, status: 'manual_review_required' }
  }

  // ── 8. Low text-density check (< 200 chars) ──────────────────────────────
  // A very short extract usually means a scanned image or screenshot PDF.
  // Calling Claude with garbage text produces a meaningless score, so we
  // flag the application for manual review instead.
  const LOW_DENSITY_RATIONALE =
    'Low text density detected. The file may be a scanned image or screenshot. Manual review required to verify contents.'

  if (resumeText.trim().length < 200) {
    const { error: appError } = await supabase.from('applications').insert({
      candidate_id: candidate.id,
      job_id: jobId,
      status: 'manual_review_required',
      resume_url: resumeStoragePath,
      resume_text: resumeText || null,
      ai_score: null,
      ai_rationale: LOW_DENSITY_RATIONALE,
      ai_brief: null,
      discrepancy_flags: null,
      social_research: null,
      structured_data: null,
      ai_analysis: null,
      research_profile: null,
    })
    if (appError) {
      if (appError.code === '23505') return { success: false, error: 'You have already applied for this position.' }
      return { success: false, error: appError.message }
    }
    console.warn(`[Resume] Low text density (${resumeText.trim().length} chars) — flagged for manual review.`)
    return { success: true, score: null, status: 'manual_review_required' }
  }

  // ── 9. AI Task 1: Screening ───────────────────────────────────────────────
  let screening: Awaited<ReturnType<typeof runScreening>> | null = null

  try {
    screening = await runScreening(anthropic, resumeText, job as Job)
  } catch (err) {
    console.error('[Niural Scout] Screening failed:', err)
  }

  // ── 10. Determine initial status ──────────────────────────────────────────
  // Score > 80  → shortlisted (triggers enrichment)
  // Score 60–72 → manual_review_required ("borderline" — human must verify)
  // Everything else → applied
  const score = screening?.score ?? null
  const autoStatus =
    score != null && score > 80
      ? 'shortlisted'
      : score != null && score >= 60 && score <= 72
      ? 'manual_review_required'
      : 'applied'

  // ── 11. AI Task 2: Enrichment (only for shortlisted candidates) ────────────
  let enrichment: Awaited<ReturnType<typeof runEnrichment>> | null = null

  if (autoStatus === 'shortlisted') {
    try {
      enrichment = await runEnrichment(
        anthropic,
        fullName,
        linkedinUrl,
        githubUrl,
        resumeText || `Name: ${fullName}`
      )
    } catch (err) {
      console.error('[Niural Scout] Enrichment failed:', err)
    }
  }

  // ── 12. Insert application ────────────────────────────────────────────────
  const { error: appError } = await supabase.from('applications').insert({
    candidate_id: candidate.id,
    job_id: jobId,
    status: autoStatus,
    resume_url: resumeStoragePath,
    resume_text: resumeText || null,
    ai_score: screening?.score ?? null,
    ai_rationale: screening?.rationale ?? null,
    ai_brief: screening?.sixty_second_brief ?? null,
    discrepancy_flags: enrichment?.discrepancy_flags ?? null,
    social_research: enrichment
      ? {
          linkedin_summary: enrichment.linkedin_summary,
          x_findings: enrichment.x_findings,
          github_summary: enrichment.github_summary,
        }
      : null,
    structured_data: screening?.structured_data ?? null,
    ai_analysis: screening
      ? {
          score: screening.score,
          rationale: screening.rationale,
          sixty_second_brief: screening.sixty_second_brief,
        }
      : null,
    research_profile: enrichment ?? null,
  })

  if (appError) {
    if (appError.code === '23505') {
      return { success: false, error: 'You have already applied for this position.' }
    }
    return { success: false, error: appError.message }
  }

  return { success: true, score: score ?? 0, status: autoStatus }
}
