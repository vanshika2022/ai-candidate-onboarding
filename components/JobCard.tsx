import Link from 'next/link'
import { MapPin, Briefcase, ArrowRight, BarChart2 } from 'lucide-react'
import { Job } from '@/lib/supabase'

const levelColors: Record<string, string> = {
  Senior: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:ring-violet-800',
  'Mid-Level': 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:ring-sky-800',
  Junior: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800',
}

export function JobCard({ job }: { job: Job }) {
  const levelStyle = levelColors[job.level] ?? 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'

  return (
    <Link href={`/jobs/${job.id}`} className="group block">
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-200 hover:border-indigo-300 hover:shadow-md dark:border-card-border dark:bg-card dark:hover:border-indigo-700">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors dark:text-white dark:group-hover:text-indigo-400">
              {job.title}
            </h3>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{job.team}</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${levelStyle}`}
          >
            {job.level}
          </span>
        </div>

        <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed dark:text-slate-400">
          {job.description}
        </p>

        <div className="flex items-center justify-between pt-1">
          <div className="flex flex-wrap gap-3">
            <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <MapPin size={12} className="text-slate-400 dark:text-slate-500" />
              {job.location}
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <Briefcase size={12} className="text-slate-400 dark:text-slate-500" />
              {job.team}
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <BarChart2 size={12} className="text-slate-400 dark:text-slate-500" />
              {job.level}
            </span>
          </div>
          <ArrowRight
            size={16}
            className="text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-indigo-500 dark:text-slate-600 dark:group-hover:text-indigo-400"
          />
        </div>
      </div>
    </Link>
  )
}

export function JobCardSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm animate-pulse dark:border-card-border dark:bg-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-4 w-48 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-3 w-24 rounded bg-slate-100 dark:bg-slate-800" />
        </div>
        <div className="h-5 w-16 rounded-full bg-slate-200 dark:bg-slate-700" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-3 w-4/5 rounded bg-slate-100 dark:bg-slate-800" />
      </div>
      <div className="flex gap-4 pt-1">
        <div className="h-3 w-20 rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-3 w-20 rounded bg-slate-100 dark:bg-slate-800" />
      </div>
    </div>
  )
}
