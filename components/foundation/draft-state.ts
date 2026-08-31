export function isDraftChanged<T>(initialDraft: T | null, draft: T | null): boolean {
  return initialDraft !== null && draft !== null && JSON.stringify(draft) !== JSON.stringify(initialDraft);
}
