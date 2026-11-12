import { useMemo, useRef, useState } from 'react'
import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { buildMilestones } from './milestones'
import './SubscriptionTimeline.css'

gsap.registerPlugin(useGSAP)

type RecordData = Record<string, unknown>
type View = 'upcoming' | 'history'

interface TimelineProps {
  formatAmount: (amount: number) => string
  commitments: RecordData[]
  transactions: RecordData[]
  loading: boolean
  nameFor: (item: RecordData) => string
  cadenceFor: (item: RecordData) => string
  reportedFor: (item: RecordData) => boolean
  onSelect: (item: RecordData) => void
}

const indiaDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata', dateStyle: 'short' })
const monthLabel = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', month: 'long', year: 'numeric' })
const shortDate = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' })
const labels = {
  charge: 'Projected charge',
  renewal: 'Projected renewal',
  observed: 'Observed charge',
  review: 'Amount flagged',
}

export function SubscriptionTimeline({ commitments, transactions, loading, nameFor, cadenceFor, reportedFor, onSelect, formatAmount }: TimelineProps) {
  const section = useRef<HTMLElement>(null)
  const [view, setView] = useState<View>('upcoming')
  const [monthIndex, setMonthIndex] = useState(0)
  const [limit, setLimit] = useState(6)
  const [highlighted, setHighlighted] = useState<RecordData | null>(null)
  const asOf = indiaDate.format(new Date())
  const events = useMemo(() => buildMilestones(commitments, transactions, asOf), [commitments, transactions, asOf])
  const projections = events.filter(event => event.kind === 'charge' || event.kind === 'renewal')
    .sort((a, b) => a.date.localeCompare(b.date))
  const entries = view === 'upcoming' ? projections : events.filter(event => event.kind === 'observed' || event.kind === 'review')
    .sort((a, b) => b.date.localeCompare(a.date))
  const months = [...new Set(entries.map(event => event.date.slice(0, 7)))]
  const position = Math.min(monthIndex, Math.max(0, months.length - 1))
  const month = months[position]
  const visible = entries.filter(event => event.date.startsWith(month ?? '')).slice(0, month ? limit : 0)
  const remaining = entries.filter(event => event.date.startsWith(month ?? '')).length - visible.length
  const next = projections[0]
  const withoutProjection = commitments.length - projections.length

  useGSAP(() => {
    const motion = gsap.matchMedia()
    motion.add('(prefers-reduced-motion: no-preference)', () => {
      if (!section.current?.querySelector('.milestone-entry')) return
      gsap.timeline({ defaults: { ease: 'power2.out' } })
        .from('.milestone-spine', { scaleY: 0, duration: 0.72, transformOrigin: 'top' })
        .from('.milestone-entry', {
          opacity: 0.2, y: 10, rotationX: -9, transformOrigin: 'top center',
          transformPerspective: 700, stagger: { each: 0.055, amount: 0.28 }, duration: 0.38,
        }, 0.13)
    })
    return () => motion.revert()
  }, { scope: section, dependencies: [month, view], revertOnUpdate: true })

  function showView(nextView: View) {
    setView(nextView)
    setMonthIndex(0)
    setLimit(6)
  }

  function moveMonth(offset: number) {
    setMonthIndex(position + offset)
    setLimit(6)
  }

  return (
    <section ref={section} className="subscription-timeline" aria-labelledby="milestone-title">
      <div className="milestone-heading">
        <div>
          <h2 id="milestone-title">Subscription timeline</h2>
          <p>Projected charges and recent billing evidence from your statement.</p>
        </div>
        <div className="milestone-views" role="group" aria-label="Timeline view">
          <button type="button" aria-pressed={view === 'upcoming'} onClick={() => showView('upcoming')}>Upcoming</button>
          <button type="button" aria-pressed={view === 'history'} onClick={() => showView('history')}>Billing history</button>
        </div>
      </div>

      <div className="milestone-layout">
        <div className="milestone-ledger">
          <div className="milestone-period">
            <div aria-live="polite">
              <CalendarDays size={16} aria-hidden="true" />
              <strong>{month ? monthLabel.format(new Date(month + '-01T00:00:00Z')) : view === 'upcoming' ? 'Upcoming' : 'Billing history'}</strong>
            </div>
            <div className="milestone-month-nav">
              <button type="button" aria-label={view === 'upcoming' ? 'Earlier month' : 'More recent month'}
                disabled={position === 0} onClick={() => moveMonth(-1)}><ChevronLeft size={18} /></button>
              <button type="button" aria-label={view === 'upcoming' ? 'Later month' : 'Older month'}
                disabled={position >= months.length - 1} onClick={() => moveMonth(1)}><ChevronRight size={18} /></button>
            </div>
          </div>
          {visible.length > 0 ? (
            <div className="milestone-rail">
              <div className="milestone-spine" aria-hidden="true" />
              <ol aria-label="Billing milestones">
                {visible.map(event => (
                  <li key={event.id} className={'milestone-entry milestone-' + event.kind}>
                    <time dateTime={event.date}>{shortDate.format(new Date(event.date))}</time>
                    <button type="button" className="milestone-event" data-related={highlighted === event.commitment}
                      onMouseEnter={() => setHighlighted(event.commitment)} onMouseLeave={() => setHighlighted(null)}
                      onFocus={() => setHighlighted(event.commitment)} onBlur={() => setHighlighted(null)}
                      onClick={() => onSelect(event.commitment)}>
                      <span className="milestone-event-copy">
                        <span className="milestone-kind">{labels[event.kind]}</span>
                        <strong>{nameFor(event.commitment)}</strong>
                        <span className="milestone-cadence">{cadenceFor(event.commitment)}</span>
                        {view === 'upcoming' && typeof event.commitment.last_observed_date === 'string' && (
                          <span className="milestone-cadence">Last observed {event.commitment.last_observed_date}</span>
                        )}
                        {view === 'upcoming' && reportedFor(event.commitment) && (
                          <span className="milestone-cadence">Marked as revoked (user-reported)</span>
                        )}
                      </span>
                      <span className="milestone-amount">{event.amount === null ? 'Amount unavailable' : formatAmount(event.amount)}</span>
                      <ArrowUpRight size={16} aria-hidden="true" className="milestone-arrow" />
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="milestone-empty">{loading ? 'Loading billing milestones…' : view === 'upcoming'
              ? 'No dates can be projected from the available recurring patterns.' : 'No observed billing milestones are available.'}</p>
          )}
          {remaining > 0 && (
            <button className="milestone-more" type="button" onClick={() => setLimit(limit + 6)}>
              Show {Math.min(remaining, 6)} more
            </button>
          )}
        </div>

        <aside className="milestone-note">
          <span className="milestone-note-label">Next projected charge</span>
          {next ? (
            <>
              <strong>{next.amount === null ? 'Amount unavailable' : formatAmount(next.amount)}</strong>
              <p>{nameFor(next.commitment)} · {shortDate.format(new Date(next.date))}</p>
              {reportedFor(next.commitment) && <p>Marked as revoked (user-reported)</p>}
              <button type="button" className="milestone-note-link" data-related={highlighted === next.commitment}
                onFocus={() => setHighlighted(next.commitment)} onBlur={() => setHighlighted(null)}
                onMouseEnter={() => setHighlighted(next.commitment)} onMouseLeave={() => setHighlighted(null)}
                onClick={() => onSelect(next.commitment)}>View commitment <ArrowUpRight size={15} aria-hidden="true" /></button>
            </>
          ) : <p>No projection available.</p>}
          <p className="milestone-method">Dates follow the fitted billing schedule when available and otherwise extend the last observed debit. Amounts use typical past debits.</p>
          {withoutProjection > 0 && <p className="milestone-unscheduled">{withoutProjection} {withoutProjection === 1 ? 'pattern has' : 'patterns have'} no reliable date projection.</p>}
        </aside>
      </div>
    </section>
  )
}
