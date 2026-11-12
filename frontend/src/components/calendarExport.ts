type Commitment = Record<string, unknown>

export type CalendarForecastEntry = {
  date: string
  commitment: Commitment
  amount: number | null
  uncertainty: string[]
}

type CalendarEvent = {
  id: string
  date: string
  title: string
  description: string
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T00:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function calendarExportEntries(entries: CalendarForecastEntry[], today: string, reportedFor: (item: Commitment) => boolean) {
  if (!validDate(today)) return []
  return entries.filter(entry => validDate(entry.date) && entry.date >= today
    && entry.amount !== null && Number.isFinite(entry.amount) && entry.amount > 0
    && ['monthly', 'quarterly', 'annual'].includes(String(entry.commitment.cadence).toLowerCase())
    && entry.uncertainty.length === 0 && !reportedFor(entry.commitment))
}

function escapeText(value: string) {
  const escaped = value.replaceAll('\\', '\\\\').replace(/\r\n|\r|\n/g, '\\n')
    .replaceAll(',', '\\,').replaceAll(';', '\\;')
  return [...escaped].map(character => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127 ? ' ' : character
  }).join('')
}

function foldLine(value: string) {
  const encoder = new TextEncoder()
  let result = ''
  let bytes = 0
  for (const character of value) {
    const width = encoder.encode(character).length
    if (bytes + width > 75) {
      result += '\r\n '
      bytes = 1
    }
    result += character
    bytes += width
  }
  return result
}

export function serializeCalendar(events: CalendarEvent[], generatedAt = new Date()) {
  const stamp = generatedAt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FinSight//Payment estimates//EN', 'CALSCALE:GREGORIAN']
  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      'UID:' + escapeText(event.id) + '@finsight.local',
      'DTSTAMP:' + stamp,
      'DTSTART;VALUE=DATE:' + event.date.replaceAll('-', ''),
      'SUMMARY:' + escapeText(event.title),
      'DESCRIPTION:' + escapeText(event.description),
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:-P1D',
      'DESCRIPTION:Estimated payment tomorrow',
      'END:VALARM',
      'END:VEVENT',
    )
  }
  return [...lines, 'END:VCALENDAR'].map(foldLine).join('\r\n') + '\r\n'
}
