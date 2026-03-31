'use client'

/**
 * InterviewFeedback.tsx
 * ─────────────────────
 * Post-interview feedback form: rating (1–5 stars) + comments (required).
 * Gates offer letter generation — admin must submit feedback before generating an offer.
 *
 * States:
 *  - No feedback yet → shows form
 *  - Feedback exists → shows saved feedback with edit option
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { submitInterviewFeedback } from '@/app/actions/feedback'
import { Star, MessageSquare, Loader2, CheckCircle2, Pencil } from 'lucide-react'
import toast from 'react-hot-toast'

interface ExistingFeedback {
  rating: number
  comments: string
}

interface Props {
  applicationId: string
  existingFeedback: ExistingFeedback | null
}

export function InterviewFeedback({ applicationId, existingFeedback }: Props) {
  const router = useRouter()
  const [feedback, setFeedback] = useState<ExistingFeedback | null>(existingFeedback)
  const [isEditing, setIsEditing] = useState(false)
  const [rating, setRating] = useState(existingFeedback?.rating ?? 0)
  const [hoveredStar, setHoveredStar] = useState(0)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('application_id', applicationId)
    fd.set('rating', String(rating))

    if (rating === 0) {
      toast.error('Please select a rating (1–5 stars).')
      return
    }

    startTransition(async () => {
      const result = await submitInterviewFeedback(fd)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      const comments = (fd.get('comments') as string)?.trim() ?? ''
      setFeedback({ rating, comments })
      setIsEditing(false)
      if (result.rejected) {
        toast.error('Candidate rejected based on interview rating.')
      } else {
        toast.success('Interview feedback saved — offer form unlocked.')
      }
      router.refresh()
    })
  }

  // ── Display saved feedback ────────────────────────────────────────────────

  if (feedback && !isEditing) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/50 dark:bg-emerald-900/20">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 size={14} /> Interview Feedback Submitted
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">Rating:</p>
            {[1, 2, 3, 4, 5].map((s) => (
              <Star
                key={s}
                size={16}
                className={s <= feedback.rating
                  ? 'fill-amber-400 text-amber-400'
                  : 'text-slate-300 dark:text-slate-600'
                }
              />
            ))}
            <span className="ml-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
              {feedback.rating}/5
            </span>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Comments:</p>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-muted rounded-lg p-3">
              {feedback.comments}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
        >
          <Pencil size={11} /> Edit feedback
        </button>
      </div>
    )
  }

  // ── Feedback form ─────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Rate the candidate and leave comments. Both fields are required.
        4-5 stars unlocks the offer form. 1-3 stars rejects the candidate.
      </p>

      {/* Star rating */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
          Interview Rating <span className="text-rose-400">*</span>
        </label>
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setRating(s)}
              onMouseEnter={() => setHoveredStar(s)}
              onMouseLeave={() => setHoveredStar(0)}
              className="p-0.5 transition-transform hover:scale-110"
            >
              <Star
                size={22}
                className={
                  s <= (hoveredStar || rating)
                    ? 'fill-amber-400 text-amber-400'
                    : 'text-slate-300 dark:text-slate-600'
                }
              />
            </button>
          ))}
          {rating > 0 && (
            <span className="ml-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              {rating}/5
            </span>
          )}
        </div>
      </div>

      {/* Comments */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
          Interview Comments <span className="text-rose-400">*</span>
        </label>
        <textarea
          name="comments"
          rows={4}
          required
          defaultValue={feedback?.comments ?? ''}
          placeholder="Share your assessment — cultural fit, technical skills, communication, team dynamics. These comments will inform the offer letter."
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none resize-none dark:border-card-border dark:bg-muted dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-card"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-colors dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
      >
        {isPending ? (
          <><Loader2 size={14} className="animate-spin" /> Saving…</>
        ) : (
          <><MessageSquare size={14} /> {feedback ? 'Update Feedback' : 'Submit Feedback'}</>
        )}
      </button>

      {isEditing && (
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          className="w-full text-center text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          Cancel
        </button>
      )}
    </form>
  )
}
