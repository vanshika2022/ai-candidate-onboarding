'use client'

import { useState, useTransition } from 'react'
import { submitApplication } from '@/app/actions/apply'
import { DragDropUpload } from './DragDropUpload'
import {
  X, CheckCircle2, User, Mail, Linkedin, Github, Sparkles, TrendingUp,
} from 'lucide-react'
import toast from 'react-hot-toast'

const LINKEDIN_PATTERN =
  /^https?:\/\/(www\.)?linkedin\.com\/(in|pub|profile\/view)\/?[a-zA-Z0-9\-_%]+\/?/i

interface Props {
  jobId: string
  jobTitle: string
  onClose: () => void
}

type Step = 'form' | 'success'
interface SuccessData { score: number | null; status: string }

export function ApplyModal({ jobId, jobTitle, onClose }: Props) {
  const [step, setStep] = useState<Step>('form')
  const [isPending, startTransition] = useTransition()
  const [successData, setSuccessData] = useState<SuccessData | null>(null)
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [linkedinError, setLinkedinError] = useState('')

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    linkedin_url: '',
    github_url: '',
  })

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }))
    if (field === 'linkedin_url') setLinkedinError('')
  }

  function handleLinkedinBlur() {
    const val = form.linkedin_url.trim()
    if (val && !LINKEDIN_PATTERN.test(val)) {
      setLinkedinError(
        'A valid LinkedIn profile is required for AI Research (e.g., linkedin.com/in/yourname).'
      )
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!form.linkedin_url.trim()) {
      setLinkedinError('A valid LinkedIn profile is required for AI Research.')
      return
    }
    if (!LINKEDIN_PATTERN.test(form.linkedin_url.trim())) {
      setLinkedinError(
        'A valid LinkedIn profile is required for AI Research (e.g., linkedin.com/in/yourname).'
      )
      return
    }

    startTransition(async () => {
      const fd = new FormData()
      fd.append('job_id', jobId)
      fd.append('full_name', form.full_name)
      fd.append('email', form.email)
      fd.append('linkedin_url', form.linkedin_url.trim())
      if (form.github_url.trim()) fd.append('github_url', form.github_url.trim())
      if (resumeFile) fd.append('resume', resumeFile)

      const result = await submitApplication(fd)

      if (!result.success) {
        if (result.error.toLowerCase().includes('linkedin')) {
          setLinkedinError(result.error)
        } else {
          toast.error(result.error)
        }
        return
      }

      setSuccessData({ score: result.score, status: result.status })
      setStep('success')
    })
  }

  const isShortlisted = successData?.status === 'shortlisted'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm dark:bg-black/60"
        onClick={isPending ? undefined : onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 overflow-hidden dark:bg-card dark:ring-card-border">

        {step === 'success' ? (
          <div className="flex flex-col items-center gap-5 px-8 py-12 text-center">
            <div className={`flex h-16 w-16 items-center justify-center rounded-full ${isShortlisted ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-indigo-50 dark:bg-indigo-900/30'}`}>
              {isShortlisted
                ? <TrendingUp size={28} className="text-emerald-500" />
                : <CheckCircle2 size={28} className="text-indigo-600 dark:text-indigo-400" />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {isShortlisted ? 'Shortlisted!' : 'Application Received'}
              </h3>
              <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                {isShortlisted
                  ? `Your profile scored ${successData?.score}/100 and has been automatically shortlisted for ${jobTitle}. Expect to hear from us soon.`
                  : `Thanks for applying for ${jobTitle}. Our team will review your profile and be in touch.`}
              </p>
            </div>
            {successData?.score != null && successData.score > 0 && (
              <div className="w-full rounded-xl bg-slate-50 px-4 py-3 text-center dark:bg-muted">
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-1 dark:text-slate-500">AI Fit Score</p>
                <p className={`text-3xl font-bold ${isShortlisted ? 'text-emerald-600 dark:text-emerald-400' : 'text-indigo-600 dark:text-indigo-400'}`}>
                  {successData.score}<span className="text-base font-normal text-slate-400 dark:text-slate-500">/100</span>
                </p>
              </div>
            )}
            <button
              onClick={onClose}
              className="mt-1 w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              Back to Roles
            </button>
          </div>

        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-card-border">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500 dark:text-indigo-400">Apply Now</p>
                <h2 className="text-base font-semibold text-slate-900 leading-tight dark:text-white">{jobTitle}</h2>
              </div>
              <button
                onClick={isPending ? undefined : onClose}
                disabled={isPending}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-30 dark:hover:bg-white/5 dark:hover:text-slate-300"
              >
                <X size={18} />
              </button>
            </div>

            {/* AI Analyzing overlay */}
            {isPending && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-white/96 backdrop-blur-sm dark:bg-card/95">
                <div className="relative flex h-16 w-16 items-center justify-center">
                  <span className="absolute inset-0 animate-ping rounded-full bg-indigo-200 opacity-60 dark:bg-indigo-800" />
                  <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg">
                    <Sparkles size={20} />
                  </span>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Niural AI is researching candidate signals...</p>
                  <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">Scout is cross-referencing your profile</p>
                </div>
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <Field
                icon={User}
                label="Full Name"
                placeholder="Jane Smith"
                value={form.full_name}
                onChange={set('full_name')}
                required
                disabled={isPending}
              />
              <Field
                icon={Mail}
                label="Email Address"
                type="email"
                placeholder="jane@example.com"
                value={form.email}
                onChange={set('email')}
                required
                disabled={isPending}
              />

              {/* LinkedIn — with inline validation */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                  LinkedIn URL <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Linkedin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="url"
                    placeholder="https://linkedin.com/in/yourname"
                    value={form.linkedin_url}
                    onChange={set('linkedin_url')}
                    onBlur={handleLinkedinBlur}
                    required
                    disabled={isPending}
                    className={`w-full rounded-lg border py-2.5 pl-9 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:opacity-50 transition-colors bg-slate-50 focus:bg-white dark:bg-muted dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-card ${
                      linkedinError
                        ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100 dark:border-rose-700 dark:focus:ring-rose-900/30'
                        : 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-100 dark:border-card-border dark:focus:border-indigo-700 dark:focus:ring-indigo-900/30'
                    }`}
                  />
                </div>
                {linkedinError && (
                  <p className="text-xs text-rose-500 leading-4">{linkedinError}</p>
                )}
              </div>

              <Field
                icon={Github}
                label="GitHub / Portfolio URL"
                placeholder="https://github.com/yourname (optional)"
                value={form.github_url}
                onChange={set('github_url')}
                disabled={isPending}
              />

              <DragDropUpload onChange={setResumeFile} disabled={isPending} />

              <button
                type="submit"
                disabled={isPending}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                Submit Application
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

function Field({
  icon: Icon,
  label,
  ...props
}: {
  icon: React.ElementType
  label: React.ReactNode
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">{label}</label>
      <div className="relative">
        <Icon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          {...props}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-50 transition-colors dark:border-card-border dark:bg-muted dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-700 dark:focus:bg-card dark:focus:ring-indigo-900/30"
        />
      </div>
    </div>
  )
}
