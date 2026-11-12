export function shouldCelebrateChecklist(previous: number, next: number, total: number) {
  return previous < total && next === total
}
