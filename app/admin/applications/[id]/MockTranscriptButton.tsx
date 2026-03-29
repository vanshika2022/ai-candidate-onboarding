'use client'

import { useState, useTransition } from 'react'
import { FileText, Loader2, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'

interface Props {
  applicationId: string
  onInject: (applicationId: string) => Promise<{ success?: boolean; error?: string; duplicate?: boolean }>
}

export function MockTranscriptButton({ applicationId, onInject }: Props) {
  const [isPending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const router = useRouter()

  function handleClick() {
    if (isPending || done) return
    startTransition(async () => {
      try {
        const result = await onInject(applicationId)
        if (result.success) {
          setDone(true)
          toast.success(result.duplicate ? 'Transcript already exists' : 'Interview transcript recorded')
          router.refresh()
        } else {
          toast.error(result.error || 'Failed to inject transcript')
        }
      } catch {
        toast.error('Something went wrong')
      }
    })
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/50 dark:bg-emerald-900/20">
        <CheckCircle2 size={14} className="text-emerald-500" />
        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
          Interview complete — transcript recorded
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Interview confirmed. After the meeting, Fireflies.ai captures the transcript automatically via webhook.
        For demo purposes, simulate a completed interview below.
      </p>
      <button
        onClick={handleClick}
        disabled={isPending}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50 transition-colors"
      >
        {isPending ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <FileText size={13} />
        )}
        Simulate Interview Complete
      </button>
    </div>
  )
}
