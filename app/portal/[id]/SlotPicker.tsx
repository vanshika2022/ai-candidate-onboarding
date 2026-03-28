'use client'

import { useState, useTransition } from 'react'
import { confirmInterviewSlot } from '@/app/actions/schedule'
import type { TentativeSlot } from '@/lib/supabase/server'
import { Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'

interface Props {
  applicationId: string
  slots: TentativeSlot[]
}

export function SlotPicker({ applicationId, slots }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSelect(eventId: string) {
    if (isPending) return
    setSelected(eventId)
    startTransition(async () => {
      const result = await confirmInterviewSlot(applicationId, eventId)
      if (result.success) {
        toast.success('Interview slot confirmed!')
        router.refresh()
      } else {
        toast.error(result.error)
        setSelected(null)
      }
    })
  }

  return (
    <div className="space-y-2.5">
      {slots.map((slot) => {
        const start      = new Date(slot.start)
        const end        = new Date(slot.end)
        const isConfirming = selected === slot.eventId && isPending

        return (
          <button
            key={slot.eventId}
            onClick={() => handleSelect(slot.eventId)}
            disabled={isPending}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-left transition-all
              hover:border-indigo-400 hover:bg-indigo-50 hover:shadow-sm
              disabled:cursor-not-allowed disabled:opacity-60
              dark:border-card-border dark:bg-muted
              dark:hover:border-indigo-500 dark:hover:bg-indigo-950/30"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {start.toLocaleDateString('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric',
                  })}
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  {' – '}
                  {end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  {' · 45 min'}
                </p>
              </div>
              {isConfirming && (
                <Loader2 size={16} className="animate-spin text-indigo-500 shrink-0" />
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
