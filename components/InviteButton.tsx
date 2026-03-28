'use client'

import { useState, useTransition } from 'react'
import { scheduleInterview } from '@/app/actions/schedule'
import { Mail, Loader2, CheckCircle2, CalendarClock } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  applicationId: string
  /** 'pending' = not yet invited | 'slots_offered' = slots sent | 'scheduled' = confirmed */
  stage: 'pending' | 'slots_offered' | 'scheduled'
}

export function InviteButton({ applicationId, stage }: Props) {
  const [currentStage, setCurrentStage] = useState(stage)
  const [isPending, startTransition] = useTransition()

  function handleInvite() {
    startTransition(async () => {
      const result = await scheduleInterview(applicationId)
      if (result.success) {
        setCurrentStage('slots_offered')
        toast.success(`${result.slots.length} slots sent to candidate!`)
      } else {
        toast.error(result.error)
      }
    })
  }

  if (currentStage === 'scheduled') {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-emerald-600 ring-1 ring-inset ring-emerald-200 dark:text-emerald-400 dark:ring-emerald-800">
        <CheckCircle2 size={11} /> Scheduled
      </span>
    )
  }

  if (currentStage === 'slots_offered') {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-indigo-600 ring-1 ring-inset ring-indigo-200 dark:text-indigo-400 dark:ring-indigo-800">
        <CalendarClock size={11} /> Slots Sent
      </span>
    )
  }

  return (
    <button
      onClick={handleInvite}
      disabled={isPending}
      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed dark:text-slate-300 dark:ring-slate-600 dark:hover:bg-white/5"
    >
      {isPending ? <Loader2 size={11} className="animate-spin" /> : <Mail size={11} />}
      Invite
    </button>
  )
}
