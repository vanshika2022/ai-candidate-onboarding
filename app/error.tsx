'use client'

import { useEffect } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-900/20">
        <AlertTriangle size={28} className="text-rose-500" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Something went wrong</h2>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          {error.message || 'An unexpected error occurred.'}
        </p>
      </div>
      <button
        onClick={reset}
        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
      >
        <RotateCcw size={14} />
        Try again
      </button>
    </div>
  )
}
