export function prepareRevocationGuide(mechanism: string, steps: string[], notes: string[]) {
  const isCard = /^card/i.test(mechanism)
  const isBank = /bank.*mandate|nach|ecs/i.test(mechanism)
  const canReport = /autopay/i.test(mechanism) || isCard || isBank
  const cancellationSteps = steps.length === 0 ? [] : isCard ? [
    'Open your card issuer’s app, NetBanking portal, or the mandate management hub your issuer directs you to.',
    'Find the merchant’s standing instruction under recurring payments or e-mandates.',
    'Revoke the standing instruction and follow your issuer’s confirmation prompts.',
    'Check the issuer’s portal or acknowledgment for the updated mandate status.',
  ] : isBank ? [
    'Find NACH Mandates or Standing Instructions in NetBanking. If you need branch assistance, ask your bank how to submit a cancellation request.',
    'Identify the mandate by merchant name or its reference number in your bank’s records.',
    'Request cancellation through your chosen bank channel and follow the bank’s instructions.',
    'Check the updated status or retain the bank’s cancellation acknowledgment for your own records.',
  ] : steps
  return {
    canReport,
    steps: cancellationSteps.map((step) => {
      if (/select .*pause.*revoke/i.test(step)) {
        return 'Open the matching mandate and select Revoke or Cancel Mandate.'
      }
      if (/enter .*upi pin/i.test(step)) {
        return 'Authorize the cancellation in your official UPI app. Keep your UPI PIN private.'
      }
      if (/authorize with otp|netbanking password/i.test(step)) {
        return 'Select Stop or Cancel Mandate and follow the prompts in your official banking app or portal.'
      }
      return step
    }),
    notes: [
      ...notes.filter((note) => !/required|requires|immediately|cannot automatically debit|blocking a card token/i.test(note)),
      ...(isCard ? ['Check the merchant’s billing page separately if you also want to end the subscription.'] : []),
    ],
  }
}
