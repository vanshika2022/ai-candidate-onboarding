export const revalidate = 0

import { createAdminClient } from '@/lib/supabase/server'
import type { Application, AppStatus, Job } from '@/lib/supabase/server'
import Link from 'next/link'
import { LayoutDashboard, Users, ChevronRight, AlertTriangle } from 'lucide-react'
import { InviteButton } from '@/components/InviteButton'
import { AdminFilters } from './AdminFilters'

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
  reschedule_requested: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:ring-amber-800',
}

const STATUS_LABELS: Record<AppStatus, string> = {
  applied: 'Applied',
  screening: 'Screening',
  shortlisted: 'Shortlisted',
  slots_offered: 'Slots Offered',
  slots_held: 'Slots Held',
  interview_scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  interviewed: 'Interviewed',
  offer_sent: 'Offer Sent',
  hired: 'Hired',
  rejected: 'Rejected',
  pending_review: 'Pending Review',
  manual_review_required: 'Manual Review Required',
  reschedule_requested: 'Reschedule Requested',
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-xs text-slate-300 dark:text-slate-600">—</span>

  const color =
    score >= 80
      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:ring-emerald-800'
      : score >= 60
      ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:ring-blue-800'
      : score >= 40
      ? 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:ring-yellow-800'
      : 'bg-rose-50 text-rose-600 ring-1 ring-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:ring-rose-800'

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${color}`}>
      {score}
    </span>
  )
}

interface PageProps {
  searchParams: { role?: string; status?: string; date?: string }
}

export default async function AdminApplicationsPage({ searchParams }: PageProps) {
  const supabase = createAdminClient()

  const { data: jobs } = await supabase.from('jobs').select('id, title').order('title')

  let query = supabase
    .from('applications')
    .select('*, candidates(full_name, email), jobs(title, team)')
    .order('created_at', { ascending: false })

  if (searchParams.role) query = query.eq('job_id', searchParams.role)
  if (searchParams.status) query = query.eq('status', searchParams.status)
  if (searchParams.date) query = query.gte('created_at', searchParams.date)

  const { data: applications } = await query
  const apps = (applications as Application[]) ?? []

  const stats: { label: string; status: AppStatus; color: string }[] = [
    { label: 'Applied', status: 'applied', color: 'text-slate-700 dark:text-slate-300' },
    { label: 'Shortlisted', status: 'shortlisted', color: 'text-blue-700 dark:text-blue-400' },
    { label: 'Interviewed', status: 'interviewed', color: 'text-purple-700 dark:text-purple-400' },
    { label: 'Hired', status: 'hired', color: 'text-emerald-700 dark:text-emerald-400' },
  ]

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      {/* Page header */}
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow">
          <LayoutDashboard size={18} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Applications</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">All submissions, scored and enriched by Niural Scout</p>
        </div>
      </div>

      {/* Stats strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(({ label, status, color }) => (
          <div key={status} className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-card-border dark:bg-card">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
            <p className={`mt-1 text-2xl font-bold ${color}`}>
              {apps.filter((a) => a.status === status).length}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <AdminFilters jobs={(jobs as Job[]) ?? []} />

      {/* Table */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-card-border dark:bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 dark:border-card-border dark:bg-muted">
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Candidate</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Role</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">AI Score</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Status</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Applied</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-card-border">
            {apps.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-slate-400 dark:text-slate-500">
                    <Users size={28} />
                    <span className="text-sm">No applications match your filters</span>
                  </div>
                </td>
              </tr>
            ) : (
              apps.map((app) => {
                const score = app.ai_score ?? (app.ai_analysis as { score?: number } | null)?.score ?? null
                return (
                  <tr key={app.id} className="hover:bg-slate-50 transition-colors dark:hover:bg-muted">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-slate-900 dark:text-white">{app.candidates?.full_name ?? '—'}</p>
                        {(app as Application & { has_discrepancies?: boolean }).has_discrepancies && (
                          <span title="Discrepancy flags detected">
                            <AlertTriangle size={13} className="text-amber-500 shrink-0" />
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{app.candidates?.email}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-700 dark:text-slate-300">{app.jobs?.title ?? '—'}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{app.jobs?.team}</p>
                    </td>
                    <td className="px-5 py-4">
                      <ScoreBadge score={score} />
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[app.status]}`}>
                        {STATUS_LABELS[app.status]}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-400 dark:text-slate-500">
                      {new Date(app.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/applications/${app.id}`}
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-indigo-600 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-50 transition-colors dark:text-indigo-400 dark:ring-indigo-800 dark:hover:bg-indigo-950/30"
                        >
                          View <ChevronRight size={11} />
                        </Link>
                        <InviteButton
                          applicationId={app.id}
                          stage={
                            app.status === 'confirmed' || app.status === 'interview_scheduled' ? 'scheduled' :
                            app.status === 'slots_held' || app.status === 'slots_offered' ? 'slots_offered' :
                            'pending'
                          }
                        />
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
