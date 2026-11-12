import { useRef, useState } from 'react'
import { calendarExportEntries, serializeCalendar, type CalendarForecastEntry } from './calendarExport'

type RecordData = Record<string, unknown>
type Preferences = { enabled: boolean; days: number; annualOnly: boolean }
const key = 'finsight_reminder_preferences_v1'
const defaults: Preferences = { enabled: false, days: 7, annualOnly: false }
const leadTimes = [1, 3, 7, 14, 30]

function readPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (value && typeof value.enabled === 'boolean' && leadTimes.includes(value.days) && typeof value.annualOnly === 'boolean') {
      return { enabled: value.enabled, days: value.days, annualOnly: value.annualOnly }
    }
  } catch {
    // A blocked or malformed store leaves reminders off.
  }
  return defaults
}

export function ReminderPanel({ entries, today, nameFor, formatAmount, reportedFor }: {
  entries: CalendarForecastEntry[]
  today: string
  nameFor: (item: RecordData) => string
  formatAmount: (amount: number) => string
  reportedFor: (item: RecordData) => boolean
}) {
  const [preferences, setPreferences] = useState(readPreferences)
  const [saveError, setSaveError] = useState(false)
  const [calendarSelection, setCalendarSelection] = useState<string[]>([])
  const [showMerchant, setShowMerchant] = useState(false)
  const [showAmount, setShowAmount] = useState(false)
  const calendarIds = useRef(new Map<string, string>())
  const end = new Date(Date.parse(today) + preferences.days * 86_400_000).toISOString().slice(0, 10)
  const due = preferences.enabled ? entries.filter(entry => entry.date >= today && entry.date < end
    && (!preferences.annualOnly || entry.commitment.cadence === 'annual')
    && !reportedFor(entry.commitment)) : []
  const eligible = calendarExportEntries(entries, today, reportedFor)
  const eventKey = (entry: CalendarForecastEntry) => String(entry.commitment.commitment_id) + '|' + entry.date
  const preview = eligible.filter(entry => calendarSelection.includes(eventKey(entry))).map(entry => ({
    key: eventKey(entry),
    date: entry.date,
    title: showMerchant ? 'Estimated payment · ' + nameFor(entry.commitment) : 'Estimated payment',
    description: 'Date may change.' + (showAmount && entry.amount !== null ? ' Estimated amount ' + formatAmount(entry.amount) + '.' : ''),
  }))

  function change(next: Preferences) {
    setPreferences(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
      setSaveError(false)
    } catch {
      setSaveError(true)
    }
  }

  function downloadCalendar() {
    const events = preview.map(event => {
      const id = calendarIds.current.get(event.key) ?? crypto.randomUUID()
      calendarIds.current.set(event.key, id)
      return { ...event, id }
    })
    const file = new Blob([serializeCalendar(events)], { type: 'text/calendar;charset=utf-8' })
    const href = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = href
    link.download = 'finsight-estimated-payments.ics'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(href), 1000)
  }

  return (
    <section aria-labelledby="reminder-heading">
      <h3 id="reminder-heading">In-app reminders</h3>
      <p>See upcoming estimates when you open Forecast. Reminders exclude commitments you marked as revoked. Only your preferences are saved in this browser.</p>
      <fieldset className="forecast-options">
        <legend>Reminder preferences</legend>
        <label><input type="checkbox" checked={preferences.enabled}
          onChange={event => change({ ...preferences, enabled: event.target.checked })} /> Show in-app reminders</label>
        {preferences.enabled && (
          <>
            <label>Reminder window
              <select aria-label="Reminder window" value={preferences.days}
                onChange={event => change({ ...preferences, days: Number(event.target.value) })}>
                {leadTimes.map(days => <option key={days} value={days}>{days === 1 ? 'Today' : `${days} days including today`}</option>)}
              </select>
            </label>
            <label><input type="checkbox" checked={preferences.annualOnly}
              onChange={event => change({ ...preferences, annualOnly: event.target.checked })} /> Annual renewals only</label>
          </>
        )}
      </fieldset>
      {saveError && <p role="status">Your browser could not save these reminder preferences.</p>}
      {preferences.enabled && (
        due.length > 0 ? <ul aria-label="Upcoming reminders">
          {due.map(entry => <li key={String(entry.commitment.commitment_id) + entry.date}>{entry.date} · {nameFor(entry.commitment)}</li>)}
        </ul> : <p>No projected charges match these preferences.</p>
      )}
      <details>
        <summary>Export calendar reminders</summary>
        <p>Select estimates from the next 30 days. The download is created in this tab. Your calendar service may sync the details after you import it.</p>
        {eligible.length === 0 ? <p>No supported estimates are available to export.</p> : <>
          <fieldset className="forecast-options">
            <legend>Payments to export</legend>
            {eligible.map(entry => {
              const key = eventKey(entry)
              return <label key={key}><input type="checkbox" checked={calendarSelection.includes(key)}
                onChange={event => setCalendarSelection(previous => event.target.checked
                  ? [...previous, key] : previous.filter(item => item !== key))} />
                {entry.date} · {nameFor(entry.commitment)}
              </label>
            })}
          </fieldset>
          <fieldset className="forecast-options">
            <legend>Optional details in the calendar file</legend>
            <label><input type="checkbox" checked={showMerchant}
              onChange={event => setShowMerchant(event.target.checked)} /> Include merchant names</label>
            <label><input type="checkbox" checked={showAmount}
              onChange={event => setShowAmount(event.target.checked)} /> Include estimated amounts</label>
          </fieldset>
          {preview.length > 0 && <ul aria-label="Calendar file preview">
            {preview.map(event => <li key={event.key}>
              <time dateTime={event.date}>{event.date}</time> · {event.title} · {event.description}
            </li>)}
          </ul>}
          <button type="button" className="secondary-button" disabled={!preview.length} onClick={downloadCalendar}>Download calendar file</button>
        </>}
      </details>
    </section>
  )
}
