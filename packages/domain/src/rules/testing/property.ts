export function propertySamples<T>(
  cases: readonly T[],
  assertion: (input: T) => void,
): void {
  for (const input of cases) {
    assertion(input);
  }
}
