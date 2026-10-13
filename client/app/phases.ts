// Фаза плана (docs/01-plan.md §4), на которой реализуется содержимое модуля.
const PHASE: Record<string, number> = { A01: 3, A03: 4, A10: 4, A04: 5, A02: 6, D04: 6, E01: 7 };
export const phaseOf = (code: string) => PHASE[code] ?? 8;
