'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createAnonClient } from '@/lib/supabase/server'
import type { Job } from '@/lib/supabase/server'

const supabase = createAnonClient()
import { ApplyModal } from '@/components/ApplyModal'
import {
  MapPin,
  Briefcase,
  BarChart2,
  ArrowLeft,
  CalendarDays,
  CheckCircle,
} from 'lucide-react'

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [applyOpen, setApplyOpen] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase
          .from('jobs')
          .select('*')
          .eq('id', id)
          .single()
        if (error) console.error('[job detail] supabase error:', error.message)
        setJob(data)
      } catch (err) {
        console.error('[job detail] fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  if (loading) return <JobDetailSkeleton />
  if (!job) return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center text-slate-400 dark:text-slate-500">
      Role not found.
    </div>
  )

  const requirements = job.requirements
    .split('\n')
    .map((r) => r.replace(/^•\s*/, '').trim())
    .filter(Boolean)

  return (
    <>
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        {/* Back */}
        <button
          onClick={() => router.back()}
          className="mb-6 flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors dark:text-slate-400 dark:hover:text-slate-100"
        >
          <ArrowLeft size={15} />
          All Roles
        </button>

        {/* Header card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-card-border dark:bg-card">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">
                {job.team}
              </span>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
                {job.title}
              </h1>
              <div className="mt-3 flex flex-wrap gap-4">
                <Meta icon={MapPin} label={job.location} />
                <Meta icon={Briefcase} label={job.team} />
                <Meta icon={BarChart2} label={job.level} />
                <Meta icon={CalendarDays} label="Full-time" />
              </div>
            </div>

            <button
              onClick={() => setApplyOpen(true)}
              className="shrink-0 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 active:scale-95 transition-all"
            >
              Apply for this Position
            </button>
          </div>
        </div>

        {/* Description */}
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-card-border dark:bg-card">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">About the Role</h2>
          <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-400">{job.description}</p>
        </section>

        {/* Requirements */}
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-card-border dark:bg-card">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">What We&apos;re Looking For</h2>
          <ul className="mt-4 space-y-3">
            {requirements.map((req, i) => (
              <li key={i} className="flex items-start gap-3">
                <CheckCircle
                  size={16}
                  className="mt-0.5 shrink-0 text-indigo-500 dark:text-indigo-400"
                />
                <span className="text-sm leading-6 text-slate-600 dark:text-slate-400">{req}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* CTA */}
        <div className="mt-8 text-center">
          <p className="text-sm text-slate-400 mb-3 dark:text-slate-500">
            Sound like a fit? We&apos;d love to hear from you.
          </p>
          <button
            onClick={() => setApplyOpen(true)}
            className="inline-flex rounded-xl bg-indigo-600 px-8 py-3 text-sm font-semibold text-white shadow hover:bg-indigo-700 active:scale-95 transition-all"
          >
            Apply for this Position
          </button>
        </div>
      </div>

      {applyOpen && (
        <ApplyModal
          jobId={job.id}
          jobTitle={job.title}
          onClose={() => setApplyOpen(false)}
        />
      )}
    </>
  )
}

function Meta({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
      <Icon size={14} className="text-slate-400 dark:text-slate-500" />
      {label}
    </span>
  )
}

function JobDetailSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 animate-pulse">
      <div className="mb-6 h-4 w-20 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm space-y-4 dark:border-card-border dark:bg-card">
        <div className="h-3 w-24 rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-8 w-64 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="flex gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-4 w-20 rounded bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      </div>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 space-y-3 dark:border-card-border dark:bg-card">
        <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-3 w-full rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-3 w-5/6 rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-3 w-4/5 rounded bg-slate-100 dark:bg-slate-800" />
      </div>
    </div>
  )
}
