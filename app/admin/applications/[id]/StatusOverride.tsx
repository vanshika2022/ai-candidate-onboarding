'use client'

import { useState, useTransition } from 'react'
import { updateApplicationStatus } from '@/app/actions/updateStatus'
import type { AppStatus } from '@/lib/supabase/server'
import { Save, Loader2, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'

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

export function StatusOverride({
  applicationId,
  currentStatus,
  currentNote,
}: {
  applicationId: string
  currentStatus: AppStatus
  currentNote: string | null
}) {
  const [status, setStatus] = useState<AppStatus>(currentStatus)
  const [note, setNote] = useState(currentNote ?? '')
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    if (!note.trim()) {
      toast.error('An admin note is required.')
      return
    }

    startTransition(async () => {
      const result = await updateApplicationStatus(applicationId, status, note)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setSaved(true)
      toast.success('Status updated.')
      setTimeout(() => setSaved(false), 2500)
    })
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">New Status</label>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value as AppStatus); setSaved(false) }}
          disabled={isPending}
          className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-3 pr-8 text-sm text-slate-800 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 appearance-none cursor-pointer disabled:opacity-50 dark:border-card-border dark:bg-muted dark:text-slate-200 dark:focus:border-indigo-700 dark:focus:ring-indigo-900/30"
        >
          {ALL_STATUSES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
          Admin Note <span className="text-rose-400">*</span>
        </label>
        <textarea
          value={note}
          onChange={(e) => { setNote(e.target.value); setSaved(false) }}
          disabled={isPending}
          rows={3}
          placeholder="Reason for status change…"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-50 resize-none dark:border-card-border dark:bg-muted dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-700 dark:focus:bg-card dark:focus:ring-indigo-900/30"
        />
      </div>

      <button
        onClick={handleSave}
        disabled={isPending || saved}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-all dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
      >
        {isPending ? (
          <><Loader2 size={14} className="animate-spin" /> Saving…</>
        ) : saved ? (
          <><CheckCircle size={14} className="text-emerald-400" /> Saved</>
        ) : (
          <><Save size={14} /> Save Override</>
        )}
      </button>
    </div>
  )
}
