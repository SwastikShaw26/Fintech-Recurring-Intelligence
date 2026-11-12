export function projectCashBuffer(startingBalance: number, buffer: number, charges: { date: string; amount: number }[]) {
  const daily = new Map<string, number>()
  for (const { date, amount } of charges) {
    daily.set(date, (daily.get(date) ?? 0) + Math.round(amount * 100))
  }
  let cents = Math.round(startingBalance * 100)
  const minimum = Math.round(buffer * 100)
  return [...daily].sort(([a], [b]) => a.localeCompare(b)).map(([date, debits]) => {
    cents -= debits
    return { date, debits: debits / 100, balance: cents / 100, belowBuffer: cents < minimum }
  })
}
