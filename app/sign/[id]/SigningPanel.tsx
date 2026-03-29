'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import SignaturePad from 'signature_pad'
import { PenLine, RotateCcw, CheckCircle2, Loader2 } from 'lucide-react'

interface SigningPanelProps {
  offerId: string
}

type PanelState = 'idle' | 'submitting' | 'success' | 'error'

export function SigningPanel({ offerId }: SigningPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const padRef = useRef<SignaturePad | null>(null)
  const [hasSignature, setHasSignature] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [panelState, setPanelState] = useState<PanelState>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  // ── Initialize signature pad after mount ───────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Resize canvas to its CSS size × device pixel ratio for crisp rendering on retina
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio ?? 1, 1)
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * ratio
      canvas.height = rect.height * ratio
      const ctx = canvas.getContext('2d')
      ctx?.scale(ratio, ratio)
      // Re-initialize pad after resize (existing strokes are lost — acceptable UX)
      padRef.current?.clear()
      setHasSignature(false)
    }

    padRef.current = new SignaturePad(canvas, {
      backgroundColor: 'rgb(255, 255, 255)',
      penColor: '#1e293b',
      minWidth: 1.5,
      maxWidth: 3,
    })

    padRef.current.addEventListener('endStroke', () => {
      setHasSignature(!(padRef.current?.isEmpty() ?? true))
    })

    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  const handleClear = useCallback(() => {
    padRef.current?.clear()
    setHasSignature(false)
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!padRef.current || padRef.current.isEmpty()) return
    if (!agreed) return

    const signatureData = padRef.current.toDataURL('image/png')

    setPanelState('submitting')
    setErrorMessage('')

    try {
      const res = await fetch(`/api/offers/${offerId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature_data: signatureData }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? `Server error: ${res.status}`)
      }

      setPanelState('success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      setErrorMessage(msg)
      setPanelState('error')
    }
  }, [offerId, agreed])

  // ── Success state ──────────────────────────────────────────────────────────
  if (panelState === 'success') {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-10 text-center dark:border-emerald-800/50 dark:bg-emerald-900/20">
        <CheckCircle2 className="mx-auto mb-4 text-emerald-500" size={48} />
        <h2 className="text-xl font-bold text-emerald-800 dark:text-emerald-300">
          Offer Signed Successfully
        </h2>
        <p className="mt-3 text-sm leading-6 text-emerald-700 dark:text-emerald-400">
          Thank you! Your offer has been signed and recorded. You'll receive a
          confirmation email shortly. Welcome to Niural!
        </p>
      </div>
    )
  }

  const canSign = hasSignature && agreed && panelState !== 'submitting'

  return (
    <div className="space-y-6">
      {/* Signature canvas */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <PenLine size={14} className="text-indigo-500" />
            Your Signature
          </label>
          <button
            onClick={handleClear}
            type="button"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-muted dark:hover:text-slate-300"
          >
            <RotateCcw size={11} />
            Clear
          </button>
        </div>

        <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-white transition-colors dark:border-slate-600 dark:bg-white"
          style={{ height: 140 }}>
          <canvas
            ref={canvasRef}
            className="block h-full w-full cursor-crosshair touch-none"
            style={{ touchAction: 'none' }}
          />
          {!hasSignature && (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-slate-400 select-none">
              Draw your signature here
            </p>
          )}
        </div>

        {!hasSignature && (
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            Use your mouse, trackpad, or finger to draw your signature.
          </p>
        )}
      </div>

      {/* Agreement checkbox */}
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:bg-slate-100 dark:border-card-border dark:bg-muted dark:hover:bg-card">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-indigo-600"
        />
        <span className="text-sm leading-6 text-slate-600 dark:text-slate-300">
          I have read and agree to the terms of this offer letter. I understand this constitutes
          a legally binding acceptance of employment.
        </span>
      </label>

      {/* Error message */}
      {panelState === 'error' && errorMessage && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600 dark:border-rose-800/50 dark:bg-rose-900/20 dark:text-rose-400">
          {errorMessage}
        </div>
      )}

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={!canSign}
        type="button"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {panelState === 'submitting' ? (
          <>
            <Loader2 size={15} className="animate-spin" />
            Submitting…
          </>
        ) : (
          <>
            <CheckCircle2 size={15} />
            Sign &amp; Accept Offer
          </>
        )}
      </button>

      <p className="text-center text-xs text-slate-400 dark:text-slate-500">
        By signing, your IP address and timestamp are recorded for verification purposes.
      </p>
    </div>
  )
}
