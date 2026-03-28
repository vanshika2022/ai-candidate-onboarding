'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { Job, AppStatus } from '@/lib/supabase/server'
import { SlidersHorizontal, RotateCcw } from 'lucide-react'

const ALL_STATUSES: { value: AppStatus; label: string }[] = [
  { value: 'applied', label: 'Applied' },
  { value: 'screening', label: 'Screening' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'slots_held', label: 'Slots Held' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'interviewed', label: 'Interviewed' },
  { value: 'offer_sent', label: 'Offer Sent' },
  { value: 'hired', label: 'Hired' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'manual_review_required', label: 'Manual Review Required' },
]

export function AdminFilters({ jobs }: { jobs: Job[] }) {
  const router = useRouter()
  const params = useSearchParams()

  function update(key: string, value: string) {
    const p = new URLSearchParams(params.toString())
    if (value) p.set(key, value)
    else p.delete(key)
    router.push(`/admin/applications?${p.toString()}`)
  }

  const hasFilters = params.has('role') || params.has('status') || params.has('date')

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SlidersHorizontal size={14} className="text-slate-400" />

      {/* Role filter */}
      <select
        value={params.get('role') ?? ''}
        onChange={(e) => update('role', e.target.value)}
        className="rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm text-slate-700 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 appearance-none cursor-pointer dark:border-card-border dark:bg-muted dark:text-slate-300 dark:focus:border-indigo-700"
      >
        <option value="">All Roles</option>
        {jobs.map((j) => (
          <option key={j.id} value={j.id}>{j.title}</option>
        ))}
      </select>

      {/* Status filter */}
      <select
        value={params.get('status') ?? ''}
        onChange={(e) => update('status', e.target.value)}
        className="rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm text-slate-700 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 appearance-none cursor-pointer dark:border-card-border dark:bg-muted dark:text-slate-300 dark:focus:border-indigo-700"
      >
        <option value="">All Statuses</option>
        {ALL_STATUSES.map(({ value, label }) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>

      {/* Date filter */}
      <input
        type="date"
        value={params.get('date') ?? ''}
        onChange={(e) => update('date', e.target.value)}
        className="rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-700 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 cursor-pointer dark:border-card-border dark:bg-muted dark:text-slate-300 dark:focus:border-indigo-700 dark:[color-scheme:dark]"
      />

      {hasFilters && (
        <button
          onClick={() => router.push('/admin/applications')}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors dark:hover:text-slate-200 dark:hover:bg-white/5"
        >
          <RotateCcw size={13} />
          Clear
        </button>
      )}
    </div>
  )
}
