'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, XCircle, Loader2, CalendarX2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'

interface Props {
  applicationId: string
  rescheduleStatus: string | null
  rescheduleReason: string | null
  rescheduleRequestedAt: string | null
  onAction: (applicationId: string, action: 'approve' | 'decline') => Promise<{ success?: boolean; error?: string }>
}

export function ReschedulePanel({
  applicationId,
  rescheduleStatus,
  rescheduleReason,
  rescheduleRequestedAt,
  onAction,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [actionTaken, setActionTaken] = useState<string | null>(null)
  const router = useRouter()

  async function handleAction(action: 'approve' | 'decline') {
    if (isPending) return
    startTransition(async () => {
      try {
        const data = await onAction(applicationId, action)

        if (data.success) {
          setActionTaken(action)
          toast.success(action === 'approve' ? 'New slots sent to candidate' : 'Request declined')
          router.refresh()
        } else {
          toast.error(data.error || 'Action failed')
        }
      } catch {
        toast.error('Something went wrong')
      }
    })
  }

  // Already resolved — show badge
  if (rescheduleStatus === 'new_slots_sent' || actionTaken === 'approve') {
    return (
      <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800/50 dark:bg-emerald-900/20">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={14} className="text-emerald-500" />
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            New slots sent to candidate
          </p>
        </div>
      </div>
    )
  }

  if (rescheduleStatus === 'declined' || actionTaken === 'decline') {
    return (
      <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-card-border dark:bg-muted">
        <div className="flex items-center gap-2">
          <XCircle size={14} className="text-slate-400" />
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Reschedule declined
          </p>
        </div>
      </div>
    )
  }

  // Pending admin action — amber alert box
  if (rescheduleStatus === 'pending_admin') {
    const requestedDate = rescheduleRequestedAt
      ? new Date(rescheduleRequestedAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
      : 'Unknown'

    return (
      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-800/50 dark:bg-amber-900/20">
        <div className="flex items-center gap-2 mb-2">
          <CalendarX2 size={15} className="text-amber-600 dark:text-amber-400" />
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            Reschedule Request
          </p>
        </div>
        <p className="text-xs text-amber-700 dark:text-amber-400 mb-1">
          Candidate requested different interview times on {requestedDate}
        </p>
        {rescheduleReason && (
          <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">
            <strong>Reason:</strong> {rescheduleReason}
          </p>
        )}
        {!rescheduleReason && <div className="mb-3" />}
        <div className="flex gap-2">
          <button
            onClick={() => handleAction('approve')}
            disabled={isPending}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
          >
            {isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            Approve &amp; Send New Slots
          </button>
          <button
            onClick={() => handleAction('decline')}
            disabled={isPending}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-50 transition-colors dark:border-card-border dark:bg-muted dark:text-slate-300 dark:hover:bg-white/5"
          >
            {isPending ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
            Decline Request
          </button>
        </div>
      </div>
    )
  }

  // No reschedule activity
  return null
}
