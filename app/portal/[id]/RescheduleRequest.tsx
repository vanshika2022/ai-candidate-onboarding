'use client'

import { useState, useTransition } from 'react'
import { Loader2, CalendarX2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'

interface Props {
  applicationId: string
}

export function RescheduleRequest({ applicationId }: Props) {
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()
  const [submitted, setSubmitted] = useState(false)
  const router = useRouter()

  function handleSubmit() {
    if (isPending) return
    startTransition(async () => {
      try {
        const res = await fetch('/api/schedule/reschedule-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ application_id: applicationId, reason: reason.trim() }),
        })

        const data = await res.json()

        if (res.ok && data.success) {
          setSubmitted(true)
          toast.success('Reschedule request sent!')
          router.refresh()
        } else if (data.error === 'Already requested') {
          toast.error("You've already submitted a request. We'll be in touch soon.")
        } else {
          toast.error('Something went wrong. Please try again.')
        }
      } catch {
        toast.error('Something went wrong. Please try again.')
      }
    })
  }

  if (submitted) {
    return (
      <div className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-center dark:border-indigo-800/50 dark:bg-indigo-900/20">
        <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
          Your request has been sent. We&apos;ll find new options and be in touch shortly.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-5 border-t border-slate-100 pt-5 dark:border-card-border">
      <div className="flex items-center gap-2 mb-3">
        <CalendarX2 size={14} className="text-slate-400" />
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          None of these times work?
        </p>
      </div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={200}
        placeholder="Briefly describe your availability (optional)"
        rows={2}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-card-border dark:bg-muted dark:text-slate-200 dark:placeholder:text-slate-500"
      />
      <p className="mt-1 text-right text-[11px] text-slate-400 dark:text-slate-500">
        {reason.length}/200
      </p>
      <button
        onClick={handleSubmit}
        disabled={isPending}
        className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors dark:border-card-border dark:bg-muted dark:text-slate-300 dark:hover:bg-white/5"
      >
        {isPending ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Sending request...
          </>
        ) : (
          'Request different times'
        )}
      </button>
    </div>
  )
}
