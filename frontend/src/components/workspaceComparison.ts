import { nextCommitmentDate } from './milestones.ts'

type RecordData = Record<string, unknown>

export interface SavedAccountSummary {
  account: string
  summary: RecordData
  nextDate?: string | null
}

interface WorkspaceEstimate {
  id: string
  label: string
  annual: number | null
  estimatedCount: number
  omittedCount: number
  nextDate: string | null
  isOpen: boolean
}

export function nextWorkspaceDebit(commitments: RecordData[], asOf: string) {
  let nextDate: string | null = null
  for (const commitment of commitments) {
    const date = nextCommitmentDate(commitment, asOf)
    if (date && (!nextDate || date < nextDate)) nextDate = date
  }
  return nextDate
}

export function summarizeWorkspaces(accounts: SavedAccountSummary[], asOf: string, active?: {
  local_account?: string
  commitments: RecordData[]
} | null) {
  const groups = new Map<string, WorkspaceEstimate[]>()
  for (const { account, summary, nextDate: comparedDate } of accounts) {
    const currency = typeof summary.currency === 'string' && /^[A-Z]{3}$/.test(summary.currency)
      ? summary.currency : 'unspecified'
    const count = typeof summary.annual_estimate_count === 'number' ? summary.annual_estimate_count : 0
    const omittedCount = typeof summary.detected_pattern_count === 'number'
      ? Math.max(0, summary.detected_pattern_count - count) : 0
    const openAccount = active?.local_account === account ? active : null
    const nextDate = openAccount ? nextWorkspaceDebit(openAccount.commitments, asOf) : (comparedDate ?? null)
    const group = groups.get(currency) ?? []
    group.push({
      id: account,
      label: account,
      annual: count > 0 && typeof summary.estimated_annual_cost === 'number' && Number.isFinite(summary.estimated_annual_cost)
        ? summary.estimated_annual_cost : null,
      estimatedCount: count,
      omittedCount,
      nextDate,
      isOpen: Boolean(openAccount) || comparedDate !== undefined,
    })
    groups.set(currency, group)
  }
  return [...groups].map(([currency, workspaces]) => ({ currency, workspaces }))
}
