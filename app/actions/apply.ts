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

// ─── Unicode sanitizer — removes lone surrogates and other chars that cause ──
// ─── Claude API "no low surrogate in string" errors from Tavily content ──────
function sanitizeForClaude(text: string): string {
  return text
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '') // lone high surrogates
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '') // lone low surrogates
    .replace(/[^\x09\x0A\x0D\x20-\x7E\x80-\uD7FF\uE000-\uFFFD]/g, '') // other invalid chars
    .trim()
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
  potential_bias_flags: z.array(z.string()).optional().default([]),
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

// ─── Haiku pre-screen schema ─────────────────────────────────────────────────
const HaikuPreScreenSchema = z.object({
  pre_score: z.number(),
  routing: z.enum(['opus', 'fast_pass', 'skip']),
  reason: z.string(),
  structured_data: z.object({
    skills: z.array(z.string()),
    years_exp: z.number(),
    education: z.array(z.string()),
    employers: z.array(z.string()),
    achievements: z.array(z.string()),
  }).optional(),
})

// ─── Resume text extraction via unpdf ────────────────────────────────────────
// unpdf is used instead of pdf-parse for reliable cross-runtime PDF parsing.
// Falls back to mammoth for DOCX.
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

  return buffer.toString('utf-8')
}

// ─── Haiku pre-screen (Stage 1) ──────────────────────────────────────────────
// Fast, cheap pre-screen to skip clearly unqualified candidates before Opus.
// Returns null on any failure — caller falls back to Opus directly.
async function runHaikuPreScreen(
  client: Anthropic,
  resumeText: string,
  job: Job
): Promise<z.infer<typeof HaikuPreScreenSchema> | null> {
  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: `You are a resume pre-screener. Given a resume and job description, quickly assess the candidate.
Return JSON only:
{
  "pre_score": number 0-100,
  "routing": "fast_pass" | "opus" | "skip",
  "reason": string (one sentence),
  "structured_data": { "skills": [], "years_exp": number, "education": [], "employers": [], "achievements": [] }
}

Route to 'fast_pass' if: candidate is clearly strong — 80+ score, relevant experience, strong match (pre_score 80-100). Include structured_data.
Route to 'opus' if: candidate is borderline or needs deeper evaluation (pre_score 25-79)
Route to 'skip' if: candidate is clearly unqualified — wrong field, <1 year experience, non-professional resume (pre_score 0-24)`,
      messages: [
        {
          role: 'user',
          content: `JOB TITLE: ${job.title}
LEVEL: ${job.level}

REQUIREMENTS:
${job.requirements}

RESUME TEXT (first 2000 chars):
${resumeText.slice(0, 2000)}

Return the JSON object.`,
        },
      ],
    })

    const textBlock = message.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return null
    }

    const raw = textBlock.text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()

    const parsed = JSON.parse(raw)
    return HaikuPreScreenSchema.parse(parsed)
  } catch (err) {
    // EC1/EC2/EC4: Any failure → return null so caller falls back to Opus
    console.warn('[Screening] Haiku pre-screen failed — falling back to Opus:', err instanceof Error ? err.message : String(err))
    return null
  }
}

// ─── AI screening call ────────────────────────────────────────────────────────
async function runScreening(
  client: Anthropic,
  resumeText: string,
  job: Job
): Promise<z.infer<typeof ScreeningSchema>> {
  // ── Stage 1: Haiku pre-screen ──────────────────────────────────────────────
  const preScreen = await runHaikuPreScreen(client, resumeText, job)

  if (preScreen) {
    if (preScreen.routing === 'skip') {
      console.log(`[Screening] Haiku pre-screen routed to skip (score: ${preScreen.pre_score}) — skipping Opus call`)
      return {
        score: preScreen.pre_score,
        rationale: preScreen.reason,
        sixty_second_brief: preScreen.reason,
        structured_data: { skills: [], years_exp: 0, education: [], employers: [], achievements: [] },
        potential_bias_flags: [],
      }
    }

    // fast_pass and opus both go through full Opus screening — this ensures
    // bias detection runs for every candidate worth evaluating. At scale,
    // fast_pass can skip Opus for clear 80+ candidates to save cost, but
    // for the prototype we prioritize bias visibility on every shortlisted candidate.
    console.log(`[Screening] Haiku pre-screen routed to Opus (score: ${preScreen.pre_score})`)
  }

  // ── Stage 2: Full Opus screening (non-streaming for lower latency) ─────────
  const message = await client.messages.create({
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

BIAS CHECK — before finalizing your score, ask yourself:
- Am I penalizing this candidate for employment gaps without evidence of poor performance?
- Am I overweighting school prestige over demonstrated skills?
- Am I undervaluing non-traditional career paths?
- Am I making assumptions based on name or location?
If yes to any: add a specific flag to potential_bias_flags explaining the concern.
If no concerns: return empty array.

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
  "potential_bias_flags": ["<specific bias concern if detected>"],
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
${resumeText.slice(0, 12000)}

Evaluate this candidate and return the JSON object.`,
      },
    ],
  })

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

// ─── Tavily search helper ─────────────────────────────────────────────────────
interface TavilyResult {
  title: string
  url: string
  content: string
  score: number
}

interface TavilyResponse {
  answer?: string
  results: TavilyResult[]
}

async function tavilySearch(query: string): Promise<TavilyResponse> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      search_depth: 'basic',
      max_results: 5,
      include_answer: true,
    }),
  })
  if (!response.ok) {
    throw new Error(`Tavily search failed: ${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<TavilyResponse>
}

function formatTavilyResults(data: TavilyResponse): string {
  const lines: string[] = []
  if (data.answer) lines.push(`Summary: ${sanitizeForClaude(data.answer)}`)
  for (const r of data.results) {
    lines.push(`- [${r.title}](${r.url}): ${sanitizeForClaude(r.content).slice(0, 300)}`)
  }
  return lines.join('\n')
}

// ─── AI enrichment synthesis (takes pre-fetched Tavily results) ──────────────
async function runEnrichmentFromTavily(
  client: Anthropic,
  candidateName: string,
  linkedinUrl: string,
  githubUrl: string | null,
  resumeText: string,
  linkedinData: TavilyResponse,
  githubData: TavilyResponse,
  generalData: TavilyResponse
): Promise<z.infer<typeof EnrichmentSchema>> {
  const linkedinQuery = `"${candidateName}" site:linkedin.com`
  const githubQuery = githubUrl
    ? `"${candidateName}" site:github.com`
    : `"${candidateName}" github`
  const generalQuery = `"${candidateName}" developer engineer`

  const linkedinContext = sanitizeForClaude(formatTavilyResults(linkedinData))
  const githubContext = sanitizeForClaude(formatTavilyResults(githubData))
  const generalContext = sanitizeForClaude(formatTavilyResults(generalData))

  // Pass real Tavily results to Claude for synthesis
  const message = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 5000,
    system: `You are Niural Scout's deep-research analyst. A candidate has been shortlisted (score >= 70).
You have been given REAL web search results from Tavily. Synthesize the actual findings — do not hallucinate or infer beyond what the data shows.

IMPORTANT DISTINCTION for discrepancy_flags:
- DISCREPANCY: You found real online data that CONTRADICTS the resume.
  Example: Resume says Stripe 2022-Present, LinkedIn shows Tesla 2020-Present
  Example: Resume claims PhD from MIT, web search shows no academic record
  These are real contradictions — flag WITHOUT any prefix.

- UNVERIFIABLE: The provided URL returned no results or profile not found.
  Example: linkedin.com/in/test-profile returns no profile
  Example: github.com/unknownuser has no public repos
  These are NOT contradictions — the data simply could not be verified.
  Prefix these flags with "UNVERIFIABLE:" (e.g. "UNVERIFIABLE: LinkedIn profile not found")
  Do NOT count unverifiable items the same as real contradictions.

Only flag real CONTRADICTIONS as unprefixed discrepancy flags.
For unverifiable items, always prefix with "UNVERIFIABLE:".

Return a JSON object ONLY — no markdown, no code fences, no explanation outside the JSON.
JSON format:
{
  "linkedin_summary": "<3-5 sentences based on real LinkedIn search results: professional brand, role history, activity signals>",
  "x_findings": "<2-3 sentences: thought leadership on X/Twitter based on web findings — note if nothing found>",
  "github_summary": "<3-5 sentences based on real GitHub search results: repos, contributions, notable projects — or 'No GitHub data found' if absent>",
  "discrepancy_flags": [
    "<real contradiction flag — no prefix>",
    "UNVERIFIABLE: <unverifiable item — always prefixed>"
  ]
}`,
    messages: [
      {
        role: 'user',
        content: `CANDIDATE NAME: ${candidateName}
LINKEDIN URL: ${linkedinUrl}
GITHUB URL: ${githubUrl ?? 'Not provided'}

--- REAL WEB SEARCH RESULTS ---

LINKEDIN SEARCH ("${linkedinQuery}"):
${linkedinContext || 'No results found.'}

GITHUB SEARCH ("${githubQuery}"):
${githubContext || 'No results found.'}

GENERAL WEB SEARCH ("${generalQuery}"):
${generalContext || 'No results found.'}

--- RESUME TEXT (first 4000 chars) ---
${resumeText.slice(0, 4000)}

Synthesize the REAL search findings into the research profile JSON.`,
      },
    ],
  })

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

  // ── 2b. Validate resume file (before any storage upload or AI call) ───────
  if (!resumeFile || resumeFile.size === 0) {
    return { success: false, error: 'Please upload a resume.' }
  }

  if (resumeFile.size > 3 * 1024 * 1024) {
    return { success: false, error: 'Resume must be under 3 MB.' }
  }

  const ALLOWED_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]
  if (!ALLOWED_TYPES.includes(resumeFile.type)) {
    return {
      success: false,
      error: 'Only PDF and DOCX files accepted. Images and other formats are not supported.',
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

  resumeBuffer = Buffer.from(await resumeFile.arrayBuffer())
  try {
    resumeText = await extractResumeTextFromBuffer(resumeBuffer, resumeFile.name)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    extractionError = `PDF extraction failed: ${msg}`
    console.error('[Resume] Extraction error:', msg)
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

  if (resumeBuffer) {
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
      has_discrepancies: false,
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
      has_discrepancies: false,
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

  // ── 9. AI Screening + Tavily in parallel ─────────────────────────────────
  // Start Tavily searches optimistically alongside screening. If the candidate
  // is shortlisted (score >= 70), the Tavily results are already available and
  // we only need the fast Sonnet synthesis call — saving ~5-8s of total latency.
  const linkedinQuery = `"${fullName}" site:linkedin.com`
  const githubQuery = githubUrl
    ? `"${fullName}" site:github.com`
    : `"${fullName}" github`
  const generalQuery = `"${fullName}" developer engineer`

  const tavilyPromise = Promise.all([
    tavilySearch(linkedinQuery).catch(() => ({ results: [] } as TavilyResponse)),
    tavilySearch(githubQuery).catch(() => ({ results: [] } as TavilyResponse)),
    tavilySearch(generalQuery).catch(() => ({ results: [] } as TavilyResponse)),
  ])

  let screening: Awaited<ReturnType<typeof runScreening>> | null = null

  try {
    screening = await runScreening(anthropic, resumeText, job as Job)
  } catch (err) {
    console.error('[Niural Scout] Screening failed:', err)
  }

  // ── 10. Determine initial status ──────────────────────────────────────────
  const score = screening?.score ?? null
  const autoStatus =
    score == null
      ? 'applied'
      : score >= 70
      ? 'shortlisted'
      : score >= 50
      ? 'pending_review'
      : 'rejected'

  // ── 11. Enrichment synthesis (Tavily already done in parallel) ────────────
  let enrichment: Awaited<ReturnType<typeof runEnrichmentFromTavily>> | null = null

  if (autoStatus === 'shortlisted') {
    try {
      const [linkedinData, githubData, generalData] = await tavilyPromise
      enrichment = await runEnrichmentFromTavily(
        anthropic,
        fullName,
        linkedinUrl,
        githubUrl,
        resumeText || `Name: ${fullName}`,
        linkedinData,
        githubData,
        generalData
      )
      console.log('[Enrichment] Success:', JSON.stringify(enrichment).slice(0, 200))
    } catch (err) {
      console.error('[Enrichment] FAILED with error:', err)
      console.error('[Enrichment] Error message:', err instanceof Error ? err.message : String(err))
    }
  }

  // ── 11b. Evaluate discrepancy flags ──────────────────────────────────────
  // Advisory only — does NOT change status. Surfaced as warning badge in admin UI.
  const hasDiscrepancies = (enrichment?.discrepancy_flags?.length ?? 0) > 0

  // ── 12. Insert application ────────────────────────────────────────────────
  const { data: newApp, error: appError } = await supabase.from('applications').insert({
    candidate_id: candidate.id,
    job_id: jobId,
    status: autoStatus,
    resume_url: resumeStoragePath,
    resume_text: resumeText || null,
    ai_score: screening?.score ?? null,
    ai_rationale: screening?.rationale ?? null,
    ai_brief: screening?.sixty_second_brief ?? null,
    has_discrepancies: hasDiscrepancies,
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
          potential_bias_flags: screening.potential_bias_flags ?? [],
        }
      : null,
    research_profile: enrichment ?? null,
  }).select('id').single()

  if (appError) {
    if (appError.code === '23505') {
      return { success: false, error: 'You have already applied for this position.' }
    }
    return { success: false, error: appError.message }
  }

  const newApplicationId = newApp.id as string

  // ── 13. Auto-schedule interview for shortlisted candidates ──────────────
  // EC1: already scheduled → skip   EC2: no calendar env vars → skip
  // EC3: schedule returns false → log  EC4: schedule throws → catch
  // EC5: email fails → log (slots survive)  EC6: no ID from insert → fetch
  if (autoStatus === 'shortlisted') {
    try {
      // EC6: If insert didn't return an ID, fetch it separately
      let applicationId = newApplicationId
      if (!applicationId) {
        const { data: fallback } = await supabase
          .from('applications')
          .select('id')
          .eq('candidate_id', candidate.id)
          .eq('job_id', jobId)
          .single()
        applicationId = fallback?.id as string
        if (!applicationId) {
          console.error('[Auto-schedule] Could not resolve application ID — skipping')
        }
      }

      if (applicationId) {
        // Discrepancy gate: 3+ CRITICAL flags → block auto-scheduling, move to pending_review
        // Only count real contradictions, not UNVERIFIABLE items (missing profiles, etc.)
        const criticalFlagCount = enrichment?.discrepancy_flags?.filter(
          (flag: string) => !flag.startsWith('UNVERIFIABLE:')
        ).length ?? 0

        if (criticalFlagCount >= 10) {
          await supabase
            .from('applications')
            .update({ status: 'pending_review' })
            .eq('id', applicationId)

          console.log(`[Auto-schedule] Blocked — ${criticalFlagCount} critical discrepancy flags detected. Moving to pending_review.`)
        } else {
          // EC2: Skip if Google Calendar credentials are not configured
          const hasCalendarCreds =
            process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
            process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY &&
            process.env.GOOGLE_CALENDAR_ID

          if (!hasCalendarCreds) {
            console.warn('[Auto-schedule] Google Calendar env vars not set — skipping')
          } else {
            // EC1: Check if slots already exist (avoid double-scheduling)
            const { data: existingSlots } = await supabase
              .from('interview_slots')
              .select('id')
              .eq('application_id', applicationId)
              .limit(1)

            if (existingSlots && existingSlots.length > 0) {
              console.log('[Auto-schedule] Already scheduled for', applicationId, '— skipping')
            } else {
              // EC3 + EC4: Call scheduleInterview — catches both error returns and throws
              const { scheduleInterview } = await import('@/app/actions/schedule')
              const scheduleResult = await scheduleInterview(applicationId)

              if (scheduleResult.success) {
                // EC5: Email failure is isolated — slots already persisted
                try {
                  const { Resend } = await import('resend')
                  const resend = new Resend(process.env.RESEND_API_KEY)
                  const toEmail = process.env.RESEND_TO_OVERRIDE || email
                  const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/portal/${applicationId}`

                  await resend.emails.send({
                    from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
                    to: toEmail,
                    subject: `Interview invitation — ${job.title} at Niural`,
                    html: `
                      <h2>Congratulations, ${fullName}!</h2>
                      <p>You've been shortlisted for <strong>${job.title}</strong> at Niural.</p>
                      <p>Please select your preferred interview time:</p>
                      <p><a href="${portalUrl}">Select interview slot &rarr;</a></p>
                      <p>You have 48 hours to select before slots expire.</p>
                    `,
                  })
                  console.log('[Auto-schedule] Slots created and email sent to', toEmail)
                } catch (emailErr) {
                  // EC5: Slots exist, email just didn't send — admin can resend manually
                  console.error('[Auto-schedule] Slots created but email failed:', emailErr)
                }
              } else {
                // EC3: scheduleInterview returned { success: false }
                console.error('[Auto-schedule] scheduleInterview failed:', scheduleResult.error)
              }
            }
          }
        }
      }
    } catch (err) {
      // EC4: Never fail the application submission because of scheduling errors
      console.error('[Auto-schedule] Failed:', err)
    }
  }

  return { success: true, score: score ?? 0, status: autoStatus }
}
