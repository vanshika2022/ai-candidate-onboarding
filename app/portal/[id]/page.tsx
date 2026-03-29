export const revalidate = 0

import { createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { TentativeSlot, AppStatus } from '@/lib/supabase/server'
import { SlotPicker } from './SlotPicker'
import { RescheduleRequest } from './RescheduleRequest'
import {
  Calendar, CheckCircle2, Clock, Briefcase, CheckCheck,
  FileText, UserCheck, Star, Send,
} from 'lucide-react'

interface PageProps {
  params: { id: string }
}

// ── Pipeline stages shown in the candidate-facing timeline ───────────────────
interface PipelineStage {
  key: string
  label: string
  icon: React.ElementType
  statuses: AppStatus[]
}

const PIPELINE: PipelineStage[] = [
  {
    key: 'applied',
    label: 'Application Received',
    icon: CheckCheck,
    statuses: ['applied', 'screening', 'pending_review', 'manual_review_required'],
  },
  {
    key: 'shortlisted',
    label: 'Shortlisted',
    icon: Star,
    statuses: ['shortlisted'],
  },
  {
    key: 'interview',
    label: 'Interview Scheduled',
    icon: Calendar,
    statuses: ['slots_offered', 'slots_held', 'interview_scheduled', 'confirmed', 'reschedule_requested'],
  },
  {
    key: 'interviewed',
    label: 'Interviewed',
    icon: UserCheck,
    statuses: ['interviewed'],
  },
  {
    key: 'offer',
    label: 'Offer Sent',
    icon: Send,
    statuses: ['offer_sent'],
  },
  {
    key: 'hired',
    label: 'Hired',
    icon: FileText,
    statuses: ['hired'],
  },
]

function getStageIndex(status: AppStatus): number {
  if (status === 'rejected') return -1 // terminal rejection — handled separately
  for (let i = 0; i < PIPELINE.length; i++) {
    if (PIPELINE[i].statuses.includes(status)) return i
  }
  return 0
}

export default async function CandidatePortalPage({ params }: PageProps) {
  const supabase = createAdminClient()

  const { data: app } = await supabase
    .from('applications')
    .select('*, candidates(*), jobs(*)')
    .eq('id', params.id)
    .single()

  if (!app) notFound()

  const tentativeSlots = (app.tentative_slots ?? []) as TentativeSlot[]
  const status         = app.status as AppStatus
  const isScheduled    = status === 'confirmed' || status === 'interview_scheduled'
  const hasSlots       = status === 'slots_held' && tentativeSlots.length > 0
  const isRejected     = status === 'rejected'
  const isHired        = status === 'hired'
  const isRescheduleRequested = status === 'reschedule_requested'

  const currentStageIdx = getStageIndex(status)

  // Format confirmed interview time from the first tentative slot
  const confirmedSlot = isScheduled && tentativeSlots[0] ? tentativeSlots[0] : null

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="border-b border-slate-200 bg-white px-6 py-4 dark:border-card-border dark:bg-card">
        <p className="text-sm font-bold tracking-tight text-indigo-600 dark:text-indigo-400">Niural</p>
      </div>

      <div className="mx-auto max-w-lg px-4 py-12">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow">
            <Calendar size={20} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {isHired
              ? 'Welcome to Niural!'
              : isRejected
              ? 'Application Update'
              : isScheduled
              ? 'Interview Confirmed'
              : 'Your Application'}
          </h1>
          <div className="mt-2 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <span>{app.candidates?.full_name}</span>
            <span>·</span>
            <Briefcase size={12} />
            <span>{app.jobs?.title}</span>
          </div>
        </div>

        {/* ── Pipeline Timeline ─────────────────────────────────────────────── */}
        {!isRejected && (
          <div className="mb-8 w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-card-border dark:bg-card">
            <p className="mb-5 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              Your Progress
            </p>
            <ol className="relative space-y-0">
              {PIPELINE.map((stage, idx) => {
                const isDone    = idx < currentStageIdx || isHired
                const isCurrent = idx === currentStageIdx && !isHired
                const isFuture  = idx > currentStageIdx && !isHired

                const lineColor = isDone
                  ? 'bg-indigo-500'
                  : 'bg-slate-200 dark:bg-slate-700'

                const dotColor = isDone
                  ? 'bg-indigo-600 text-white ring-indigo-600'
                  : isCurrent
                  ? 'bg-white text-indigo-600 ring-indigo-500 dark:bg-card'
                  : 'bg-slate-100 text-slate-400 ring-slate-200 dark:bg-muted dark:ring-slate-700'

                const labelColor = isCurrent
                  ? 'font-semibold text-slate-900 dark:text-white'
                  : isDone
                  ? 'text-slate-600 dark:text-slate-400'
                  : 'text-slate-400 dark:text-slate-600'

                return (
                  <li key={stage.key} className="relative flex items-start gap-3 pb-5 last:pb-0">
                    {/* Vertical connector line */}
                    {idx < PIPELINE.length - 1 && (
                      <span
                        className={`absolute left-[15px] top-[28px] h-[calc(100%-8px)] w-0.5 ${lineColor}`}
                      />
                    )}

                    {/* Step dot */}
                    <span
                      className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-2 transition-all ${dotColor}`}
                    >
                      {isDone ? (
                        <CheckCircle2 size={14} />
                      ) : (
                        <stage.icon size={14} />
                      )}
                    </span>

                    {/* Label */}
                    <div className="flex flex-1 items-center pt-1">
                      <span className={`text-sm ${labelColor}`}>
                        {stage.label}
                      </span>
                      {isCurrent && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                          Current
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        )}

        {/* ── Rejected state ────────────────────────────────────────────────── */}
        {isRejected && (
          <div className="w-full rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-card-border dark:bg-card">
            <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
              Thank you for your interest in Niural. After careful consideration, we will not be moving
              forward with your application at this time. We appreciate the time you invested and wish you
              the best in your search.
            </p>
          </div>
        )}

        {/* ── Main content area ─────────────────────────────────────────────── */}
        {!isRejected && (
          <>
            {isScheduled ? (
              <div className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center dark:border-emerald-800/50 dark:bg-emerald-900/20">
                <CheckCircle2 className="mx-auto mb-3 text-emerald-500" size={36} />
                <h2 className="text-lg font-semibold text-emerald-800 dark:text-emerald-300">
                  You&apos;re all set!
                </h2>
                <p className="mt-2 text-sm leading-6 text-emerald-700 dark:text-emerald-400">
                  Your interview slot has been confirmed. Check your email for a calendar
                  invite with the Google Meet link and details.
                </p>

                {confirmedSlot && (
                  <div className="mt-5 rounded-xl bg-white/60 px-4 py-3 dark:bg-white/5">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {new Date(confirmedSlot.start).toLocaleDateString('en-US', {
                        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                      })}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {new Date(confirmedSlot.start).toLocaleTimeString('en-US', {
                        hour: 'numeric', minute: '2-digit',
                      })}
                      {' – '}
                      {new Date(confirmedSlot.end).toLocaleTimeString('en-US', {
                        hour: 'numeric', minute: '2-digit',
                      })}
                      {' · 45 minutes'}
                    </p>
                  </div>
                )}
              </div>
            ) : hasSlots ? (
              <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-card-border dark:bg-card">
                <div className="mb-5 flex items-center gap-2">
                  <Clock size={15} className="text-indigo-500" />
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Choose a 45-minute slot
                  </p>
                </div>
                <SlotPicker applicationId={params.id} slots={tentativeSlots} />
                <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
                  Times shown in your local timezone. Your selection is confirmed instantly —
                  no other candidate can book the same slot.
                </p>
                <RescheduleRequest applicationId={params.id} />
              </div>
            ) : isRescheduleRequested ? (
              <div className="w-full rounded-2xl border border-indigo-200 bg-indigo-50 p-8 text-center dark:border-indigo-800/50 dark:bg-indigo-900/20">
                <Calendar className="mx-auto mb-3 text-indigo-500" size={36} />
                <h2 className="text-lg font-semibold text-indigo-800 dark:text-indigo-300">
                  Reschedule request received
                </h2>
                <p className="mt-2 text-sm leading-6 text-indigo-700 dark:text-indigo-400">
                  Your rescheduling request is being reviewed.
                  We&apos;ll email you with new options shortly.
                </p>
              </div>
            ) : isHired ? (
              <div className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center dark:border-emerald-800/50 dark:bg-emerald-900/20">
                <CheckCircle2 className="mx-auto mb-3 text-emerald-500" size={36} />
                <h2 className="text-lg font-semibold text-emerald-800 dark:text-emerald-300">
                  Welcome aboard!
                </h2>
                <p className="mt-2 text-sm leading-6 text-emerald-700 dark:text-emerald-400">
                  Your offer has been signed and your start date is confirmed. The Niural
                  team will be in touch with onboarding details shortly.
                </p>
              </div>
            ) : (
              <div className="w-full rounded-2xl border border-dashed border-slate-200 p-12 text-center dark:border-card-border">
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  {status === 'shortlisted'
                    ? 'Great news — you\'ve been shortlisted! Your recruiter will send interview slots soon.'
                    : status === 'interviewed'
                    ? 'Interview complete. The team is reviewing and will be in touch shortly.'
                    : status === 'offer_sent'
                    ? 'Your offer letter has been sent. Check your email for a signing link.'
                    : 'Your application is being reviewed. We\'ll be in touch with next steps.'}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
