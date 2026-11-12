import { lazy, Suspense, useId, useRef, useState } from 'react'
import { AlertCircle, Check, ChevronDown, RotateCcw } from 'lucide-react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { shouldCelebrateChecklist } from './checklistMotion'
import {
  getStoredRevocationState,
  emptyRevocationState,
  saveStoredRevocationState,
  type RevocationState,
} from './revocationStorage'

gsap.registerPlugin(useGSAP)

const WebGLShield = lazy(() => import('./WebGLShield').then(({ WebGLShield }) => ({ default: WebGLShield })))

interface RevocationTrackerProps {
  commitmentId: string
  merchantName: string
  paymentMethod: string
  steps: string[]
  canReport: boolean
  importantNotes: string[]
  initialState?: RevocationState
  persist?: boolean
  onStatusChange: (state: RevocationState) => void
}

export function RevocationTracker({
  commitmentId, merchantName, paymentMethod, steps, canReport, importantNotes, initialState, persist = true, onStatusChange,
}: RevocationTrackerProps) {
  const scope = useRef<HTMLDivElement>(null)
  const statusRef = useRef<HTMLSpanElement>(null)
  const id = useId()
  const [state, setState] = useState(() => initialState ?? (persist
    ? getStoredRevocationState(commitmentId, steps.length)
    : emptyRevocationState(commitmentId, steps.length)))
  const [expanded, setExpanded] = useState(() => steps.findIndex((_, index) => !state.completedIndices.includes(index)))
  const [celebrate, setCelebrate] = useState(false)
  const [stampReport, setStampReport] = useState(false)
  const [saved, setSaved] = useState(true)
  const completed = state.completedIndices.length
  const allComplete = completed === steps.length
  const reported = canReport && allComplete && state.status === 'marked_revoked'
  const status = reported ? 'marked_revoked' : completed ? 'in_progress' : 'not_started'
  const progress = Math.round(completed / steps.length * 100)

  useGSAP(() => {
    if (!stampReport || !reported || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.timeline({ defaults: { ease: 'power2.out' } })
      .from('.completion-ceremony-banner', { opacity: 0, y: 12, duration: 0.28 })
      .from('.ceremony-badge', { scale: 1.2, opacity: 0, duration: 0.45, ease: 'back.out(1.8)' }, '-=0.14')
  }, { scope, dependencies: [stampReport, reported], revertOnUpdate: true })

  useGSAP(() => {
    if (!celebrate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.timeline()
      .fromTo('.tracker-progress-track', { boxShadow: '0 0 0 0 rgba(36,86,63,.35)' },
        { boxShadow: '0 0 0 8px rgba(36,86,63,0)', duration: 0.85 })
  }, { scope, dependencies: [celebrate], revertOnUpdate: true })

  function update(indices: number[], attested = false) {
    const next: RevocationState = {
      commitmentId,
      completedIndices: indices,
      totalSteps: steps.length,
      status: attested ? 'marked_revoked' : indices.length ? 'in_progress' : 'not_started',
      attested: attested ? true : undefined,
      lastUpdatedIso: new Date().toISOString(),
    }
    setState(next)
    setSaved(!persist || saveStoredRevocationState(next))
    onStatusChange(next)
    setStampReport(attested)
    if (!attested) setCelebrate(shouldCelebrateChecklist(completed, indices.length, steps.length))
  }

  function toggleStep(index: number) {
    const done = state.completedIndices.includes(index)
    const indices = done
      ? state.completedIndices.filter((step) => step !== index)
      : [...state.completedIndices, index].sort((a, b) => a - b)
    update(indices)
    setExpanded(done ? index : steps.findIndex((_, step) => !indices.includes(step)))
    if (shouldCelebrateChecklist(completed, indices.length, steps.length) &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      scope.current?.querySelector('.tracker-header')?.scrollIntoView({ block: 'start' })
      statusRef.current?.focus({ preventScroll: true })
    }
  }

  function reset() {
    if (!window.confirm('Clear checklist progress and any revocation report for this commitment?')) return
    statusRef.current?.focus()
    update([])
    setExpanded(0)
  }

  return (
    <div ref={scope} className={`revocation-tracker-card ${reported ? 'all-completed' : ''}`}>
      <div className="tracker-header">
        <div className="tracker-shield-col">
          <Suspense fallback={<div className="webgl-shield-container" aria-hidden="true"><span className="shield-fallback-icon">F</span></div>}>
            <WebGLShield status={status} completed={completed} total={steps.length} celebrate={celebrate} />
          </Suspense>
        </div>
        <div className="tracker-title-col">
          <p className="tracker-badge">{paymentMethod}</p>
          <h3 className="tracker-heading">{canReport ? 'Mandate revocation checklist' : 'Payment investigation checklist'}</h3>
          <p className="tracker-summary">{merchantName}</p>
        </div>
      </div>

      <div className="tracker-progress-wrap">
        <div className="tracker-progress-meta" aria-live="polite">
          <span className="tracker-progress-label">{completed} of {steps.length} steps checked</span>
          <span ref={statusRef} tabIndex={-1} className={`tracker-status-pill status-${status}`}>
            {reported ? 'Marked as revoked (user-reported)' : allComplete ? 'Checklist complete' : completed ? 'In progress' : 'Not started'}
          </span>
        </div>
        <div className="tracker-progress-track" role="progressbar" aria-label="Checklist progress"
          aria-valuenow={completed} aria-valuemin={0} aria-valuemax={steps.length}>
          <div className="tracker-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {reported && (
        <div className="completion-ceremony-banner">
          <div className="ceremony-badge"><Check size={20} aria-hidden="true" /> Revocation report recorded</div>
          <p>You reported revoking the mandate for <strong>{merchantName}</strong>.</p>
        </div>
      )}

      <ol className="tracker-steps-list" role="list">
        {steps.map((step, index) => {
          const done = state.completedIndices.includes(index)
          const open = expanded === index
          const panelId = `${id}-step-${index}`
          return (
            <li key={panelId} className={`tracker-step-item ${done ? 'is-done' : ''} ${open ? 'is-expanded' : ''}`}>
              <div className="step-row">
                <label className="step-checkbox-btn">
                  <input type="checkbox" checked={done} onChange={() => toggleStep(index)}
                    aria-label={`Step ${index + 1}: ${step}`} />
                  <span className={`custom-checkbox ${done ? 'checked' : ''}`} aria-hidden="true">
                    {done && <Check size={16} className="check-svg" />}
                  </span>
                </label>
                <button type="button" className="step-content-clickable" aria-expanded={open}
                  aria-controls={panelId} onClick={() => setExpanded(open ? -1 : index)}>
                  <span className="step-instruction">{step}</span>
                  <ChevronDown size={16} aria-hidden="true" className={`chevron-icon ${open ? 'rotated' : ''}`} />
                </button>
              </div>
              <div id={panelId} aria-hidden={!open} className="step-accordion">
                <div><p className="step-guidance-tip">{step}</p></div>
              </div>
            </li>
          )
        })}
      </ol>

      {importantNotes.length > 0 && (
        <div className="tracker-important-notes">
          <div className="notes-header"><AlertCircle size={15} aria-hidden="true" /><strong>Before you finish</strong></div>
          <ul>{importantNotes.map((note) => <li key={note}>{note}</li>)}</ul>
        </div>
      )}

      <p className="tracker-disclaimer">
        FinSight records your checklist and report in this browser. Check your payment provider for official confirmation.
      </p>
      {!saved && <p role="alert" className="tracker-disclaimer">This browser could not save your changes. They may be lost when you reload.</p>}
      {canReport && !reported && allComplete && (
        <p id={`${id}-attest`} className="tracker-summary">Mark as revoked only after your payment provider shows the mandate is revoked.</p>
      )}
      <div className="tracker-footer-actions">
        <button type="button" className="secondary-button text-button" onClick={reset} disabled={!completed}>
          <RotateCcw size={14} aria-hidden="true" /> Reset checklist
        </button>
        {canReport && !reported && (
          <button type="button" className="secondary-button mark-all-btn"
            disabled={!allComplete} aria-describedby={allComplete ? `${id}-attest` : undefined}
            onClick={() => {
              scope.current?.querySelector('.tracker-header')?.scrollIntoView({ block: 'start' })
              statusRef.current?.focus({ preventScroll: true })
              update(state.completedIndices, true)
            }}>
            Mark as revoked
          </button>
        )}
      </div>
    </div>
  )
}
