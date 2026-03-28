import Link from 'next/link'
import { ArrowLeft, Search } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-muted">
        <Search size={28} className="text-slate-400 dark:text-slate-500" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Page not found</h2>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors dark:border-card-border dark:bg-card dark:text-slate-300 dark:hover:bg-muted"
      >
        <ArrowLeft size={14} />
        Back to home
      </Link>
    </div>
  )
}
