export const revalidate = 0

import { createAnonClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowRight, MapPin, BarChart2, Briefcase, Zap } from 'lucide-react'
import type { Job } from '@/lib/supabase/server'

async function getOpenJobs(): Promise<Job[]> {
  const supabase = createAnonClient()
  const { data } = await supabase
    .from('jobs')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
  return (data ?? []) as Job[]
}

const LEVEL_COLORS: Record<string, string> = {
  Senior: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  'Mid-Level': 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  Junior: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
}

export default async function LandingPage() {
  const jobs = await getOpenJobs()

  return (
    <div className="bg-background text-foreground">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden mesh-bg bg-grid-slate dark:bg-grid-dark">
        <div className="mx-auto max-w-5xl px-4 py-28 sm:px-6 sm:py-36 text-center">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3.5 py-1.5 text-xs font-semibold text-indigo-600 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-400">
            <Zap size={11} className="fill-indigo-500" />
            {jobs.length} Open Position{jobs.length !== 1 ? 's' : ''} · Hiring Now
          </div>

          <h1 className="text-balance text-5xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-6xl lg:text-7xl">
            Build the future of{' '}
            <span className="bg-gradient-to-r from-indigo-600 to-violet-500 bg-clip-text text-transparent">
              global payroll
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-500 dark:text-slate-400 leading-relaxed">
            Niural is rewriting how companies pay, hire, and manage distributed teams worldwide.
            Join a small team doing work that matters.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="#open-roles"
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 active:scale-[0.98] transition-all"
            >
              View Open Roles
              <ArrowRight size={15} />
            </a>
          </div>
        </div>
      </section>

      {/* ── Open Roles ────────────────────────────────────────────────────── */}
      <section id="open-roles" className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500 mb-1">Careers</p>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Open Roles
            </h2>
          </div>
          <Link
            href="/jobs"
            className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
          >
            View all <ArrowRight size={14} />
          </Link>
        </div>

        {jobs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-card-border py-20 text-center">
            <p className="text-sm text-muted-foreground">No open roles at the moment. Check back soon.</p>
          </div>
        ) : (
          <div className="divide-y divide-card-border rounded-2xl border border-card-border bg-card overflow-hidden shadow-sm">
            {jobs.map((job, i) => {
              const levelStyle = LEVEL_COLORS[job.level] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              return (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="group flex items-center justify-between gap-4 px-6 py-5 hover:bg-muted dark:hover:bg-muted transition-colors"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {job.title}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${levelStyle}`}>
                        {job.level}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-3">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Briefcase size={11} /> {job.team}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin size={11} /> {job.location}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <BarChart2 size={11} /> {job.level}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <span className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600 group-hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-400 dark:group-hover:bg-indigo-900/50 transition-colors">
                      Apply now <ArrowRight size={11} />
                    </span>
                    <ArrowRight
                      size={16}
                      className="text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all dark:text-slate-600"
                    />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Footer CTA ────────────────────────────────────────────────────── */}
      <footer className="border-t border-card-border">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-600 text-white">
              <Zap size={11} fill="white" />
            </span>
            Niural
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Hiring platform powered by Niural Scout AI · {new Date().getFullYear()}
          </p>
          <Link
            href="/admin/applications"
            className="text-xs text-muted-foreground hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          >
            Admin →
          </Link>
        </div>
      </footer>
    </div>
  )
}
