export const revalidate = 0

/**
 * /sign/[id] — Candidate-facing offer signing page
 * ──────────────────────────────────────────────────
 * Public route — no authentication required.
 * The offer ID in the URL is the authorization token.
 *
 * Server Component: fetches and validates the offer.
 * SigningPanel (Client): handles signature capture and submission.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { SigningPanel } from './SigningPanel'
import { FileText, AlertCircle, CheckCircle2 } from 'lucide-react'

interface PageProps {
  params: { id: string }
}

export default async function SignPage({ params }: PageProps) {
  const supabase = createAdminClient()

  // ── Fetch offer with joined candidate and job ───────────────────────────────
  const { data: offer } = await supabase
    .from('offer_letters')
    .select('id, status, content, created_at, signed_at, applications(candidates(full_name, email), jobs(title))')
    .eq('id', params.id)
    .single()

  // ── Not found ───────────────────────────────────────────────────────────────
  if (!offer || !offer.content) {
    return (
      <StatusShell icon="error" title="Offer Not Found">
        This offer letter doesn&apos;t exist or the link may be invalid.
        Please contact your recruiter for assistance.
      </StatusShell>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const application = offer.applications as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidate = application?.candidates as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const job = application?.jobs as any

  const candidateName: string = candidate?.full_name ?? 'Candidate'
  const jobTitle: string = job?.title ?? 'Role'

  // ── Already signed ──────────────────────────────────────────────────────────
  if (offer.status === 'signed') {
    const signedDate = offer.signed_at
      ? new Date(offer.signed_at).toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        })
      : 'a previous date'

    return (
      <StatusShell icon="success" title="Offer Already Signed">
        {candidateName}, you signed your offer for the <strong>{jobTitle}</strong> role
        on {signedDate}. A confirmation email was sent to your inbox.
        Welcome to Niural — we&apos;re excited to have you!
      </StatusShell>
    )
  }

  // ── Declined or any other non-'sent' terminal state ─────────────────────────
  if (offer.status !== 'sent') {
    return (
      <StatusShell icon="error" title="Offer Unavailable">
        This offer is no longer available for signing (status: <code className="text-xs">{offer.status}</code>).
        Please reach out to your recruiter if you believe this is an error.
      </StatusShell>
    )
  }

  // ── Active offer — show letter + signing UI ─────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="border-b border-slate-200 bg-white px-6 py-4 dark:border-card-border dark:bg-card">
        <p className="text-sm font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
          Niural
        </p>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        {/* Page header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow">
            <FileText size={20} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Your Offer Letter
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {candidateName} · {jobTitle}
          </p>
        </div>

        {/* Offer letter HTML — rendered in a scrollable, visually isolated container */}
        <div className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-card-border">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-3 dark:border-card-border dark:bg-muted">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Offer Letter — please read carefully before signing
            </p>
          </div>
          {/* max-h + overflow-y-auto so long letters scroll within the card */}
          <div className="max-h-[600px] overflow-y-auto">
            {/* dangerouslySetInnerHTML is acceptable here: content is admin-generated
                via Claude through our own API, never from user input. */}
            <div
              className="offer-letter-body"
              dangerouslySetInnerHTML={{ __html: offer.content }}
            />
          </div>
        </div>

        {/* Signing panel */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-card-border dark:bg-card sm:p-8">
          <h2 className="mb-6 flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">
              2
            </span>
            Sign &amp; Accept
          </h2>
          <SigningPanel offerId={params.id} />
        </div>

        <p className="mt-6 text-center text-xs leading-5 text-slate-400 dark:text-slate-500">
          This offer is valid for 5 business days from the date it was issued.
          If you have questions, contact your recruiter before signing.
        </p>
      </div>
    </div>
  )
}

// ── Reusable status shell for non-signing states ────────────────────────────

function StatusShell({
  icon,
  title,
  children,
}: {
  icon: 'success' | 'error'
  title: string
  children: React.ReactNode
}) {
  const isSuccess = icon === 'success'

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-slate-200 bg-white px-6 py-4 dark:border-card-border dark:bg-card">
        <p className="text-sm font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
          Niural
        </p>
      </div>
      <div className="flex min-h-[calc(100vh-56px)] items-center justify-center px-4">
        <div
          className={`max-w-md w-full rounded-2xl border p-10 text-center ${
            isSuccess
              ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-900/20'
              : 'border-rose-200 bg-rose-50 dark:border-rose-800/50 dark:bg-rose-900/20'
          }`}
        >
          {isSuccess ? (
            <CheckCircle2
              className="mx-auto mb-4 text-emerald-500"
              size={44}
            />
          ) : (
            <AlertCircle
              className="mx-auto mb-4 text-rose-400"
              size={44}
            />
          )}
          <h2
            className={`mb-3 text-xl font-bold ${
              isSuccess
                ? 'text-emerald-800 dark:text-emerald-300'
                : 'text-rose-700 dark:text-rose-300'
            }`}
          >
            {title}
          </h2>
          <p
            className={`text-sm leading-6 ${
              isSuccess
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {children}
          </p>
        </div>
      </div>
    </div>
  )
}
