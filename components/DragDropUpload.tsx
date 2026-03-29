'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

type FileState =
  | { status: 'idle' }
  | { status: 'dragging' }
  | { status: 'processing' }
  | { status: 'ready'; file: File }
  | { status: 'error'; message: string }

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const ACCEPTED_EXTS = /\.(pdf|docx)$/i
const MAX_BYTES = 3 * 1024 * 1024 // 3 MB

interface Props {
  onChange: (file: File | null) => void
  disabled?: boolean
}

export function DragDropUpload({ onChange, disabled }: Props) {
  const [state, setState] = useState<FileState>({ status: 'idle' })
  const inputRef = useRef<HTMLInputElement>(null)

  function validate(file: File): string | null {
    if (!ACCEPTED_EXTS.test(file.name) && !ACCEPTED_TYPES.includes(file.type)) {
      return 'Only PDF and DOCX files accepted. Images and other formats are not supported.'
    }
    if (file.size > MAX_BYTES) {
      return `File must be under 3 MB (yours is ${(file.size / 1024 / 1024).toFixed(1)} MB).`
    }
    return null
  }

  function processFile(file: File) {
    setState({ status: 'processing' })

    setTimeout(() => {
      const err = validate(file)
      if (err) {
        setState({ status: 'error', message: err })
        onChange(null)
      } else {
        setState({ status: 'ready', file })
        onChange(file)
      }
    }, 600)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) setState({ status: 'dragging' })
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setState((prev) => (prev.status === 'dragging' ? { status: 'idle' } : prev))
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (disabled) return
      const file = e.dataTransfer.files?.[0]
      if (file) processFile(file)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disabled]
  )

  function clear() {
    setState({ status: 'idle' })
    onChange(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const { status } = state

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
        Resume <span className="text-slate-400 dark:text-slate-500">(PDF or DOCX · max 3 MB)</span>
      </label>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx"
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled}
      />

      {/* Idle / Dragging drop zone */}
      {(status === 'idle' || status === 'dragging') && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 transition-all select-none ${
            status === 'dragging'
              ? 'border-indigo-400 bg-indigo-50 text-indigo-600 dark:border-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400'
              : 'border-slate-200 bg-slate-50 text-slate-400 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-500 dark:border-card-border dark:bg-muted dark:text-slate-500 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-400'
          } ${disabled ? 'pointer-events-none opacity-40' : ''}`}
        >
          <Upload size={20} className={status === 'dragging' ? 'text-indigo-500' : ''} />
          <div className="text-center">
            <p className="text-sm font-medium">
              {status === 'dragging' ? 'Drop to upload' : 'Drag & drop your resume'}
            </p>
            <p className="mt-0.5 text-xs">or click to browse</p>
          </div>
        </div>
      )}

      {/* Processing state */}
      {status === 'processing' && (
        <div className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3.5 dark:border-indigo-800 dark:bg-indigo-950/40">
          <Loader2 size={16} className="shrink-0 animate-spin text-indigo-500" />
          <div>
            <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">Parsing Resume…</p>
            <p className="text-xs text-indigo-400 dark:text-indigo-500">Reading file structure and content</p>
          </div>
        </div>
      )}

      {/* Ready state */}
      {status === 'ready' && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/30">
          <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-semibold text-emerald-800 dark:text-emerald-300">{state.file.name}</p>
            <p className="text-xs text-emerald-500 dark:text-emerald-600">
              {(state.file.size / 1024).toFixed(0)} KB · Ready to submit
            </p>
          </div>
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            className="shrink-0 rounded-full p-0.5 text-emerald-400 hover:bg-emerald-100 hover:text-emerald-600 transition-colors dark:hover:bg-emerald-900/30"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-800 dark:bg-rose-950/30">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-500" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-rose-700 dark:text-rose-300">{state.message}</p>
            <button
              type="button"
              onClick={() => setState({ status: 'idle' })}
              className="mt-1 text-xs font-medium text-rose-500 hover:underline"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* File type helper */}
      {status === 'idle' && (
        <div className="flex items-center gap-3 pt-0.5">
          {['PDF', 'DOCX'].map((ext) => (
            <span key={ext} className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
              <FileText size={10} /> {ext}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
