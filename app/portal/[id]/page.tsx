export const revalidate = 0

import { createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { TentativeSlot } from '@/lib/supabase/server'
import { SlotPicker } from './SlotPicker'
import { Calendar, CheckCircle2, Clock, Briefcase } from 'lucide-react'

interface PageProps {
  params: { id: string }
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
  const isScheduled    = app.status === 'confirmed' || app.status === 'interview_scheduled'
  const hasSlots       = app.status === 'slots_held' && tentativeSlots.length > 0

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="border-b border-slate-200 bg-white px-6 py-4 dark:border-card-border dark:bg-card">
        <p className="text-sm font-bold tracking-tight text-indigo-600 dark:text-indigo-400">Niural</p>
      </div>

      <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-16">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow">
            <Calendar size={20} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {isScheduled ? 'Interview Confirmed' : 'Schedule Your Interview'}
          </h1>
          <div className="mt-2 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <span>{app.candidates?.full_name}</span>
            <span>·</span>
            <Briefcase size={12} />
            <span>{app.jobs?.title}</span>
          </div>
        </div>

        {/* Content */}
        {isScheduled ? (
          <div className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center dark:border-emerald-800/50 dark:bg-emerald-900/20">
            <CheckCircle2 className="mx-auto mb-3 text-emerald-500" size={36} />
            <h2 className="text-lg font-semibold text-emerald-800 dark:text-emerald-300">
              You&apos;re all set!
            </h2>
            <p className="mt-2 text-sm leading-6 text-emerald-700 dark:text-emerald-400">
              Your interview slot has been confirmed. The Niural team will follow up
              with a calendar invite and any additional details.
            </p>
            {tentativeSlots[0] && (
              <div className="mt-5 rounded-xl bg-white/60 px-4 py-3 dark:bg-white/5">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {new Date(tentativeSlots[0].start).toLocaleDateString('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                  })}
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {new Date(tentativeSlots[0].start).toLocaleTimeString('en-US', {
                    hour: 'numeric', minute: '2-digit',
                  })}
                  {' – '}
                  {new Date(tentativeSlots[0].end).toLocaleTimeString('en-US', {
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
            <SlotPicker
              applicationId={params.id}
              slots={tentativeSlots}
            />
            <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
              Times shown in your local timezone. Your selection is confirmed instantly —
              no other candidate can book the same slot.
            </p>
          </div>
        ) : (
          <div className="w-full rounded-2xl border border-dashed border-slate-200 p-12 text-center dark:border-card-border">
            <p className="text-sm text-slate-400 dark:text-slate-500">
              No slots have been offered yet. Your recruiter will send you a link when slots are ready.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
