
export type SarvamLanguage = 'en' | 'hi'

export type SarvamEvidence =
  | { evidence_type: 'forecast'; count: number; days: number }
  | { evidence_type: 'review'; count: number }

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
  const response = await fetch('/api/assistant/explain', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      evidence_type: evidence.evidence_type,
      count: evidence.count,
      days: evidence.evidence_type === 'forecast' ? evidence.days : undefined,
      language,
      consent: true,
    }),
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
