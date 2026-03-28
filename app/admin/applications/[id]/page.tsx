import { createAdminClient } from '@/lib/supabase/server'
import type { Application, AppStatus } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Briefcase, MapPin, Linkedin, Github,
  AlertTriangle, Star, BookOpen, Building2, Trophy,
  Brain, Globe, CheckCircle, FileText, ExternalLink,
  Zap,
} from 'lucide-react'
import { StatusOverride } from './StatusOverride'

const STATUS_STYLES: Record<AppStatus, string> = {
  applied: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  screening: 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:ring-yellow-800',
  shortlisted: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:ring-blue-800',
  slots_offered: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-300 dark:ring-indigo-800',
  slots_held: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-300 dark:ring-indigo-800',
  interview_scheduled: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:ring-violet-800',
  confirmed: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:ring-violet-800',
  interviewed: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:ring-purple-800',
  offer_sent: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:ring-orange-800',
  hired: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:ring-emerald-800',
  rejected: 'bg-rose-50 text-rose-600 ring-1 ring-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:ring-rose-800',
  pending_review: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:ring-amber-800',
  manual_review_required: 'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-900/20 dark:text-red-300 dark:ring-red-800',
}

const STATUS_LABELS: Record<AppStatus, string> = {
  applied: 'Applied', screening: 'Screening', shortlisted: 'Shortlisted',
  slots_offered: 'Slots Offered', slots_held: 'Slots Held',
  interview_scheduled: 'Scheduled', confirmed: 'Confirmed',
  interviewed: 'Interviewed', offer_sent: 'Offer Sent', hired: 'Hired', rejected: 'Rejected',
  pending_review: 'Pending Review', manual_review_required: 'Manual Review Required',
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#6366f1' : score >= 40 ? '#f59e0b' : '#f43f5e'
  const r = 36
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ

  return (
    <div className="relative flex h-24 w-24 items-center justify-center">
      <svg width="96" height="96" className="-rotate-90">
        <circle cx="48" cy="48" r={r} fill="none" strokeWidth="8" className="stroke-slate-200 dark:stroke-slate-700" />
        <circle
          cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-xl font-bold leading-none text-slate-900 dark:text-white">{score}</p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500">/100</p>
      </div>
    </div>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-card-border dark:bg-card">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
        <Icon size={15} className="text-indigo-500 dark:text-indigo-400" />
        {title}
      </h2>
      {children}
    </div>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
      {children}
    </span>
  )
}

interface PageProps {
  params: { id: string }
}

export default async function ApplicationDetailPage({ params }: PageProps) {
  const supabase = createAdminClient()

  const { data: app } = await supabase
    .from('applications')
    .select('*, candidates(*), jobs(*)')
    .eq('id', params.id)
    .single()

  if (!app) notFound()

  const application = app as Application
  const aiAnalysis = application.ai_analysis as {
    score?: number
    rationale?: string
    sixty_second_brief?: string
  } | null

  const structuredData = application.structured_data as {
    skills?: string[]
    years_exp?: number
    education?: string[]
    employers?: string[]
    achievements?: string[]
  } | null

  // Dedicated columns only — prevents the same JSONB blob text appearing in both sections
  const score = application.ai_score ?? aiAnalysis?.score ?? null
  const rationale = application.ai_rationale ?? null   // dark card: short score explanation
  const brief = application.ai_brief ?? null           // Analysis Detail: 60-second brief

  const discrepancyFlags = application.discrepancy_flags

  const socialResearch = (application.social_research ?? application.research_profile) as {
    linkedin_summary?: string
    x_findings?: string
    github_summary?: string
    discrepancy_flags?: string[]
  } | null

  const flags = discrepancyFlags ?? socialResearch?.discrepancy_flags ?? null

  // Generate a signed URL for the resume (valid 60 min)
  let resumeSignedUrl: string | null = null
  if (application.resume_url && !application.resume_url.startsWith('http')) {
    const { data: signedData } = await supabase.storage
      .from('resumes')
      .createSignedUrl(application.resume_url, 3600)
    resumeSignedUrl = signedData?.signedUrl ?? null
  } else if (application.resume_url?.startsWith('http')) {
    resumeSignedUrl = application.resume_url
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      {/* Back */}
      <Link
        href="/admin/applications"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-700 transition-colors dark:hover:text-slate-200"
      >
        <ArrowLeft size={14} /> Back to Applications
      </Link>

      {/* Hero card */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-card-border dark:bg-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                {application.candidates?.full_name}
              </h1>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[application.status]}`}>
                {STATUS_LABELS[application.status]}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{application.candidates?.email}</p>

            <div className="mt-3 flex flex-wrap gap-3">
              <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Briefcase size={12} className="text-slate-400 dark:text-slate-500" />
                {application.jobs?.title} · {application.jobs?.team}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <MapPin size={12} className="text-slate-400 dark:text-slate-500" />
                {application.jobs?.location}
              </span>
              {application.candidates?.linkedin_url && (
                <a
                  href={application.candidates.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-indigo-500 hover:underline dark:text-indigo-400"
                >
                  <Linkedin size={12} /> LinkedIn
                </a>
              )}
              {application.candidates?.github_url && (
                <a
                  href={application.candidates.github_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:underline dark:text-slate-400"
                >
                  <Github size={12} /> GitHub
                </a>
              )}
              {resumeSignedUrl && (
                <a
                  href={resumeSignedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
                >
                  <FileText size={12} />
                  View Original Resume
                  <ExternalLink size={10} className="opacity-70" />
                </a>
              )}
            </div>
          </div>

          {score != null && (
            <div className="flex flex-col items-center gap-1">
              <ScoreRing score={score} />
              <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">AI Fit Score</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column — AI intel */}
        <div className="space-y-6 lg:col-span-2">

          {/* ── Intelligence Profile (dark card) ─────────────────────────────
               Shows the short ai_rationale + score at a glance.
               Flags surface here so they can't be missed.              */}
          {(rationale || score != null || (flags && flags.length > 0)) && (
            <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-6 shadow-lg ring-1 ring-white/10">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-indigo-400">
                    <Zap size={11} />
                    Intelligence Profile
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">Niural Scout · AI Analysis</p>
                </div>
                {score != null && (
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div className="relative flex h-20 w-20 items-center justify-center">
                      <svg width="80" height="80" className="-rotate-90">
                        <circle cx="40" cy="40" r={30} fill="none" strokeWidth="7" stroke="rgba(255,255,255,0.1)" />
                        <circle
                          cx="40" cy="40" r={30} fill="none"
                          stroke={score >= 80 ? '#10b981' : score >= 60 ? '#818cf8' : score >= 40 ? '#fbbf24' : '#f87171'}
                          strokeWidth="7"
                          strokeDasharray={`${(score / 100) * (2 * Math.PI * 30)} ${2 * Math.PI * 30}`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute text-center">
                        <p className="text-lg font-bold leading-none text-white">{score}</p>
                        <p className="text-[9px] text-slate-400">/100</p>
                      </div>
                    </div>
                    <p className="text-[10px] font-medium text-slate-400">Fit Score</p>
                  </div>
                )}
              </div>

              {/* ai_rationale: the short 2-3 sentence score explanation */}
              {rationale && (
                <p className="mt-4 text-sm leading-6 text-slate-300">{rationale}</p>
              )}

              {flags && flags.length > 0 && (
                <div className="mt-4 rounded-xl bg-amber-500/10 border border-amber-500/25 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                    <AlertTriangle size={12} /> Discrepancy Flags
                  </p>
                  <ul className="space-y-1.5">
                    {flags.map((flag, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs leading-5 text-amber-300/90">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                        {flag}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ── Analysis Detail ────────────────────────────────────────────────
               The full 60-second ai_brief for the hiring manager.       */}
          {brief && (
            <Section title="Analysis Detail" icon={Brain}>
              <blockquote className="border-l-2 border-indigo-300 pl-4 text-sm leading-7 text-slate-600 dark:text-slate-300 italic">
                {brief}
              </blockquote>
            </Section>
          )}

          {/* Structured data */}
          {structuredData && (
            <Section title="Structured Profile" icon={Star}>
              <div className="space-y-4">
                {structuredData.years_exp != null && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Experience</p>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{structuredData.years_exp} years</p>
                  </div>
                )}
                {structuredData.skills && structuredData.skills.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Skills</p>
                    <div className="flex flex-wrap gap-1.5">
                      {structuredData.skills.map((s) => <Tag key={s}>{s}</Tag>)}
                    </div>
                  </div>
                )}
                {structuredData.employers && structuredData.employers.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 flex items-center gap-1">
                      <Building2 size={11} /> Employers
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {structuredData.employers.map((e) => <Tag key={e}>{e}</Tag>)}
                    </div>
                  </div>
                )}
                {structuredData.education && structuredData.education.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 flex items-center gap-1">
                      <BookOpen size={11} /> Education
                    </p>
                    <ul className="space-y-1">
                      {structuredData.education.map((e) => (
                        <li key={e} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                          <CheckCircle size={13} className="mt-0.5 shrink-0 text-indigo-400" />
                          {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {structuredData.achievements && structuredData.achievements.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 flex items-center gap-1">
                      <Trophy size={11} /> Key Achievements
                    </p>
                    <ul className="space-y-1.5">
                      {structuredData.achievements.map((a) => (
                        <li key={a} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Social research */}
          {socialResearch && (socialResearch.linkedin_summary || socialResearch.github_summary || socialResearch.x_findings) && (
            <Section title="Scout Findings" icon={Globe}>
              <div className="space-y-4">
                {socialResearch.linkedin_summary && (
                  <div>
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      <Linkedin size={11} /> LinkedIn
                    </p>
                    <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">{socialResearch.linkedin_summary}</p>
                  </div>
                )}
                {socialResearch.github_summary && (
                  <div>
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      <Github size={11} /> GitHub
                    </p>
                    <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">{socialResearch.github_summary}</p>
                  </div>
                )}
                {socialResearch.x_findings && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">X / Twitter</p>
                    <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">{socialResearch.x_findings}</p>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Resume text */}
          {application.resume_text && (
            <Section title="Resume (Extracted Text)" icon={FileText}>
              <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600 dark:bg-muted dark:text-slate-300">
                {application.resume_text}
              </pre>
            </Section>
          )}

          {!brief && !structuredData && !socialResearch && !application.resume_text && (
            <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400 dark:border-card-border dark:text-slate-500">
              AI analysis not available for this application.
            </div>
          )}
        </div>

        {/* Right column — override */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-card-border dark:bg-card">
            <h2 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Manual Override</h2>
            <StatusOverride
              applicationId={application.id}
              currentStatus={application.status}
              currentNote={application.admin_override_note ?? null}
            />
          </div>

          {/* Application metadata */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-xs text-slate-500 space-y-2 dark:border-card-border dark:bg-card dark:text-slate-400">
            <p className="font-semibold text-slate-600 text-sm mb-3 dark:text-slate-300">Details</p>
            <div className="flex justify-between">
              <span>Applied</span>
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {new Date(application.created_at).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Application ID</span>
              <span className="font-mono text-slate-400 dark:text-slate-500 text-[10px]">{application.id.slice(0, 8)}…</span>
            </div>
            {application.admin_override_note && (
              <div className="pt-2 border-t border-slate-100 dark:border-card-border">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Last Admin Note</p>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-5">{application.admin_override_note}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
