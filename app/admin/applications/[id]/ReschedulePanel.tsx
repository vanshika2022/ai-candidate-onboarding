'use client'

import { useState, useTransition, useEffect, useCallback } from 'react'
import { CheckCircle2, XCircle, Loader2, CalendarX2, Clock, Brain, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'

interface SlotPreview {
  start: string
  end: string
  label: string
}

interface Props {
  applicationId: string
  rescheduleStatus: string | null
  rescheduleReason: string | null
  rescheduleRequestedAt: string | null
  onAction: (applicationId: string, action: 'approve' | 'decline') => Promise<{ success?: boolean; error?: string }>
  onFetchSlots: (applicationId: string, excludeSlots: string[]) => Promise<{
    slots?: SlotPreview[]
    ai_reasoning?: string
    no_calendar?: boolean
    error?: string
  }>
}

export function ReschedulePanel({
  applicationId,
  rescheduleStatus,
  rescheduleReason,
  rescheduleRequestedAt,
  onAction,
  onFetchSlots,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [actionTaken, setActionTaken] = useState<string | null>(null)
  const router = useRouter()

  // Slot preview state
  const [slots, setSlots] = useState<SlotPreview[]>([])
  const [aiReasoning, setAiReasoning] = useState<string>('')
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [noCalendar, setNoCalendar] = useState(false)

  // Decline → auto-retry state
  const [retryAttempt, setRetryAttempt] = useState(0)
  const [declinedStarts, setDeclinedStarts] = useState<string[]>([])

  const fetchSlotPreview = useCallback(async (excludeSlots: string[]) => {
    setSlotsLoading(true)
    setSlotsError(null)
    setNoCalendar(false)

    try {
      const data = await onFetchSlots(applicationId, excludeSlots)

      if (data.error) {
        setSlotsError(data.error)
        return
      }

      setSlots(data.slots ?? [])
      setAiReasoning(data.ai_reasoning ?? '')
      setNoCalendar(data.no_calendar ?? false)
    } catch {
      setSlotsError('Failed to connect to scheduling service')
    } finally {
      setSlotsLoading(false)
    }
  }, [applicationId, onFetchSlots])

  // Fetch AI-filtered slot previews when pending_admin
  useEffect(() => {
    if (rescheduleStatus !== 'pending_admin') return
    fetchSlotPreview([])
  }, [rescheduleStatus, fetchSlotPreview])

  async function handleAction(action: 'approve' | 'decline') {
    if (isPending) return
    startTransition(async () => {
      try {
        if (action === 'decline') {
          // Track declined slots for auto-retry
          const currentStarts = [...declinedStarts, ...slots.map(s => s.start)]
          setDeclinedStarts(currentStarts)

          // Auto-retry: find next best alternatives before giving up
          if (retryAttempt < 2) {
            setRetryAttempt(prev => prev + 1)
            toast('Finding alternative slots...', { icon: '🔄' })
            await fetchSlotPreview(currentStarts)
            // Show new alternatives for admin to review — don't send decline yet
            return
          }

          // No more retries — actually decline
          const data = await onAction(applicationId, 'decline')
          if (data.success) {
            setActionTaken('decline')
            toast.success('No alternatives available — candidate notified to pick from original slots')
            router.refresh()
          } else {
            toast.error(data.error || 'Action failed')
          }
          return
        }

        // Approve path
        const data = await onAction(applicationId, action)
        if (data.success) {
          setActionTaken(action)
          toast.success('New slots sent to candidate')
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
            Reschedule declined — candidate notified to pick from original slots
          </p>
        </div>
      </div>
    )
  }

  // Pending admin action — amber alert box with slot preview
  if (rescheduleStatus === 'pending_admin') {
    const requestedDate = rescheduleRequestedAt
      ? new Date(rescheduleRequestedAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
      : 'Unknown'

    return (
      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-800/50 dark:bg-amber-900/20">
        {/* Header */}
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

        {/* AI-suggested slots preview */}
        <div className="mb-3 rounded-lg border border-amber-200/60 bg-white/60 p-3 dark:border-amber-800/30 dark:bg-black/10">
          <div className="flex items-center gap-1.5 mb-2">
            <Brain size={12} className="text-indigo-500" />
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {retryAttempt > 0 ? `Alternative Slots (attempt ${retryAttempt + 1})` : 'AI-Suggested Slots'}
            </p>
          </div>

          {slotsLoading && (
            <div className="flex items-center gap-2 py-2">
              <Loader2 size={12} className="animate-spin text-indigo-500" />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Checking calendar availability{rescheduleReason ? ' and filtering by preferences' : ''}...
              </p>
            </div>
          )}

          {slotsError && (
            <p className="text-xs text-red-600 dark:text-red-400 py-1">{slotsError}</p>
          )}

          {noCalendar && (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-1">
              Google Calendar not configured — slots will be fetched from live calendar on approve.
            </p>
          )}

          {!slotsLoading && !slotsError && !noCalendar && slots.length === 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-1">
              No available slots found in the next 14 days.
            </p>
          )}

          {!slotsLoading && slots.length > 0 && (
            <>
              <div className="space-y-1">
                {slots.map((slot, i) => (
                  <div key={slot.start} className="flex items-center gap-2 py-1">
                    <Clock size={11} className="text-slate-400 shrink-0" />
                    <span className="text-xs text-slate-700 dark:text-slate-300 font-mono">
                      {i + 1}. {slot.label}
                    </span>
                  </div>
                ))}
              </div>
              {aiReasoning && (
                <p className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 italic">
                  {aiReasoning}
                </p>
              )}
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => handleAction('approve')}
            disabled={isPending || slotsLoading || (slots.length === 0 && !noCalendar)}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
          >
            {isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            Approve &amp; Send {slots.length > 0 ? `${slots.length} Slots` : 'New Slots'}
          </button>
          <button
            onClick={() => handleAction('decline')}
            disabled={isPending || slotsLoading}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-50 transition-colors dark:border-card-border dark:bg-muted dark:text-slate-300 dark:hover:bg-white/5"
          >
            {isPending ? <Loader2 size={12} className="animate-spin" /> : (
              retryAttempt < 2 ? <RefreshCw size={12} /> : <XCircle size={12} />
            )}
            {retryAttempt < 2 ? 'Decline — Find Alternatives' : 'Decline Request'}
          </button>
        </div>
      </div>
    )
  }

  // No reschedule activity
  return null
}
