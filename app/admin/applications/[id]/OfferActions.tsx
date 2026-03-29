'use client'

/**
 * OfferActions.tsx
 * ─────────────────
 * Handles the offer-letter workflow from the admin candidate detail page.
 *
 * States:
 *  'none'     — no offer exists (application status = 'interviewed')
 *               → shows Generate Offer form
 *  'draft'    — offer exists with status='draft'
 *               → shows preview + Send Offer button
 *  'sent'     — offer sent, awaiting candidate signature
 *               → shows status badge with signing link
 *  'signed'   — candidate signed
 *               → shows confirmation (application should already be 'hired')
 */

import { useState, useTransition } from 'react'
import { generateOffer, sendOffer } from '@/app/actions/offer'
import {
  FileText, Send, Loader2, CheckCircle2, ExternalLink, Sparkles,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import toast from 'react-hot-toast'

interface DraftOffer {
  id: string
  status: 'draft' | 'sent' | 'signed'
  content: string | null
}

interface Props {
  applicationId: string
  jobTitle: string
  draftOffer: DraftOffer | null
}

export function OfferActions({ applicationId, jobTitle, draftOffer: initialOffer }: Props) {
  const [offer, setOffer]             = useState<DraftOffer | null>(initialOffer)
  const [showPreview, setShowPreview] = useState(false)
  const [isPending, startTransition]  = useTransition()

  // ── Generate offer ────────────────────────────────────────────────────────

  function handleGenerate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('application_id', applicationId)

    startTransition(async () => {
      const result = await generateOffer(fd)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setOffer({ id: result.offerId, status: 'draft', content: result.content })
      toast.success('Offer letter drafted successfully.')
    })
  }

  // ── Send offer ────────────────────────────────────────────────────────────

  function handleSend() {
    if (!offer) return
    startTransition(async () => {
      const result = await sendOffer(offer.id, applicationId)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setOffer((prev) => prev ? { ...prev, status: 'sent' } : prev)
      toast.success('Offer sent to candidate.')
    })
  }

  // ── Sent / Signed states ──────────────────────────────────────────────────

  if (offer?.status === 'signed') {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/50 dark:bg-emerald-900/20">
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 size={14} /> Offer Signed
        </p>
        <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
          The candidate has signed their offer. Application is now Hired.
        </p>
      </div>
    )
  }

  if (offer?.status === 'sent') {
    const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? ''
    const signingUrl = `${appUrl}/sign/${offer.id}`

    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 dark:border-orange-800/50 dark:bg-orange-900/20">
          <p className="flex items-center gap-2 text-sm font-semibold text-orange-700 dark:text-orange-300">
            <Send size={13} /> Offer Sent
          </p>
          <p className="mt-1 text-xs text-orange-600 dark:text-orange-400">
            Awaiting candidate signature.
          </p>
        </div>
        <a
          href={`/sign/${offer.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
        >
          <ExternalLink size={11} /> Preview signing page
        </a>
      </div>
    )
  }

  // ── Draft state — show preview + send button ──────────────────────────────

  if (offer?.status === 'draft') {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 dark:border-indigo-800/50 dark:bg-indigo-900/20">
          <p className="flex items-center gap-2 text-sm font-semibold text-indigo-700 dark:text-indigo-300">
            <FileText size={13} /> Offer Draft Ready
          </p>
          <p className="mt-1 text-xs text-indigo-600 dark:text-indigo-400">
            Review below then click Send to email the candidate.
          </p>
        </div>

        {/* Collapsible preview */}
        {offer.content && (
          <div>
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            >
              {showPreview ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showPreview ? 'Hide' : 'Preview'} offer letter
            </button>
            {showPreview && (
              <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white dark:border-card-border">
                <div
                  className="offer-letter-body scale-[0.7] origin-top-left"
                  style={{ width: '143%' }}
                  dangerouslySetInnerHTML={{ __html: offer.content }}
                />
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={isPending}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? (
            <><Loader2 size={14} className="animate-spin" /> Sending…</>
          ) : (
            <><Send size={14} /> Send Offer to Candidate</>
          )}
        </button>
      </div>
    )
  }

  // ── No offer yet — show generate form ────────────────────────────────────

  return (
    <form onSubmit={handleGenerate} className="space-y-3">
      {/* AI generating overlay */}
      {isPending && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-6 text-center dark:border-indigo-800/50 dark:bg-indigo-900/20">
          <div className="relative flex h-10 w-10 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-indigo-200 opacity-60 dark:bg-indigo-800" />
            <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white">
              <Sparkles size={15} />
            </span>
          </div>
          <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
            Claude is drafting the offer letter…
          </p>
        </div>
      )}

      {!isPending && (
        <>
          <input type="hidden" name="application_id" value={applicationId} />

          <FormField label="Job Title" name="job_title" defaultValue={jobTitle} required />
          <FormField label="Start Date" name="start_date" type="date" required />

          <div className="grid grid-cols-2 gap-2">
            <FormField label="Base Salary" name="base_salary" placeholder="120000" required />
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Currency</label>
              <select
                name="currency"
                defaultValue="USD"
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-2 text-sm text-slate-800 shadow-sm focus:border-indigo-400 focus:outline-none dark:border-card-border dark:bg-muted dark:text-slate-200 appearance-none"
              >
                {['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <FormField label="Reporting Manager" name="reporting_manager" placeholder="e.g. Sarah Chen, VP Engineering" required />
          <FormField label="Equity (optional)" name="equity" placeholder="e.g. 0.25% over 4 years" />
          <FormField label="Bonus (optional)" name="bonus" placeholder="e.g. Up to 15% of base salary" />

          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
              Custom Terms (optional)
            </label>
            <textarea
              name="custom_terms"
              rows={2}
              placeholder="Any additional terms or clauses…"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none resize-none dark:border-card-border dark:bg-muted dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-card"
            />
          </div>

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 transition-colors dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            <Sparkles size={14} /> Generate Offer Letter
          </button>
        </>
      )}
    </form>
  )
}

// ── Reusable form field ───────────────────────────────────────────────────────

function FormField({
  label,
  name,
  type = 'text',
  placeholder,
  defaultValue,
  required,
}: {
  label: string
  name: string
  type?: string
  placeholder?: string
  defaultValue?: string
  required?: boolean
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
        {label} {required && <span className="text-rose-400">*</span>}
      </label>
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-card-border dark:bg-muted dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-card dark:focus:ring-indigo-900/30"
      />
    </div>
  )
}
