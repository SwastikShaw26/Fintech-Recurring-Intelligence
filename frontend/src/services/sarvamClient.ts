
export type SarvamLanguage = 'en' | 'hi'

export type SarvamEvidence =
  | { evidence_type: 'forecast'; count: number; days: number; question?: string }
  | { evidence_type: 'review'; count: number; question?: string }
  | { evidence_type: 'custom'; count: number; question: string; context_summary?: string }

type SarvamResponse = {
  explanation: string
  language: SarvamLanguage
  source: string
}

export async function explainWithSarvam(
  evidence: SarvamEvidence,
  language: SarvamLanguage,
  signal?: AbortSignal,
): Promise<string> {
  const payload: Record<string, unknown> = {
    evidence_type: evidence.evidence_type,
    count: evidence.count,
    language,
    consent: true,
  }
  if (evidence.evidence_type === 'forecast') {
    payload.days = evidence.days
  }
  if ('question' in evidence && evidence.question) {
    payload.question = evidence.question
  }
  if ('context_summary' in evidence && evidence.context_summary) {
    payload.context_summary = evidence.context_summary
  }

  const response = await fetch('/api/assistant/explain', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
    credentials: 'same-origin',
  })

  if (!response.ok) {
    throw new Error(
      response.status === 503
        ? 'Sarvam AI is unavailable. Your local evidence remains accessible.'
        : 'Unable to generate an AI explanation.',
    )
  }

  const result: SarvamResponse = await response.json()

  if (!result.explanation?.trim()) {
    throw new Error('The AI returned an empty explanation.')
  }

  return result.explanation
}
