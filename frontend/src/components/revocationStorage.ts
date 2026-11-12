export interface RevocationState {
  commitmentId: string
  completedIndices: number[]
  status: 'not_started' | 'in_progress' | 'marked_revoked'
  lastUpdatedIso: string
  totalSteps?: number
  attested?: true
}

const STORAGE_KEY = 'finsight_mandate_revocations_v1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStepCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function readLedger(): Record<string, unknown> {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return {}

  try {
    const ledger: unknown = JSON.parse(raw)
    return isRecord(ledger) ? ledger : {}
  } catch {
    return {}
  }
}

function normalizeState(
  commitmentId: string,
  value: unknown,
  totalSteps?: number,
): RevocationState {
  const record = isRecord(value) && value.commitmentId === commitmentId ? value : {}
  const savedCount = isStepCount(record.totalSteps) ? record.totalSteps : undefined
  const stepCount = isStepCount(totalSteps) ? totalSteps : savedCount
  const indices: unknown[] = Array.isArray(record.completedIndices) ? record.completedIndices : []
  const completedIndices = Array.from(new Set(indices.filter(
    (index): index is number => isStepCount(index) && (stepCount === undefined || index < stepCount),
  ))).sort((a, b) => a - b)

  // Earlier versions set marked_revoked on checklist completion alone.
  const attested = record.attested === true && record.status === 'marked_revoked'
    && stepCount !== undefined && stepCount > 0 && stepCount === savedCount
    && completedIndices.length === stepCount

  return {
    commitmentId,
    completedIndices,
    status: attested ? 'marked_revoked' : completedIndices.length ? 'in_progress' : 'not_started',
    lastUpdatedIso: typeof record.lastUpdatedIso === 'string' ? record.lastUpdatedIso : '',
    totalSteps: stepCount,
    ...(attested ? { attested: true } : {}),
  }
}

export function getStoredRevocationState(commitmentId: string, totalSteps?: number): RevocationState {
  try {
    return normalizeState(commitmentId, readLedger()[commitmentId], totalSteps)
  } catch {
    return normalizeState(commitmentId, undefined, totalSteps)
  }
}

export function emptyRevocationState(commitmentId: string, totalSteps: number): RevocationState {
  return normalizeState(commitmentId, undefined, totalSteps)
}

export function saveStoredRevocationState(state: RevocationState): boolean {
  try {
    const ledger = readLedger()
    const saved = normalizeState(state.commitmentId, state, state.totalSteps)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...ledger, [state.commitmentId]: saved }))
    return true
  } catch {
    return false
  }
}
