// Значимость опасности и категоризация OPRP.
// Источник: docs/regulatory-refs.md §2 (ISO 22000:2018, 8.5.2.4; статус СВЕРИТЬ) и решение Р-3 (DEMO).
export type CriterionAnswer = { answer: 'yes' | 'no'; justification: string };
export const CRITERIA = [1, 2, 3, 4, 5] as const;
export type Criteria = Record<(typeof CRITERIA)[number], CriterionAnswer>;

/** Значима, если вероятность × тяжесть ≥ порога (настройка, DEMO 4) или тяжесть максимальна (3). */
export function isSignificant(likelihood: number, severity: number, threshold: number): boolean {
  return likelihood * severity >= threshold || severity === 3;
}

export type OprpOutcome = 'OPRP' | 'PRP' | 'CCP_CANDIDATE';

export type OprpEvaluation =
  | { status: 'complete'; outcome: OprpOutcome }
  | { status: 'invalid'; error: 'criterion_missing' | 'justification_required'; criterion: number };

/**
 * Критерий 5 «Да» (измеримый критический предел и своевременное выявление отказа) → «кандидат в ККТ»:
 * результат не ставится, пока руководитель ХАССП не отклонит его с обоснованием (override).
 * Иначе критерий 3 или 2 «Да» → OPRP; иначе → PRP.
 */
export function categorize(criteria: Partial<Criteria>, overrideCandidate = false): OprpEvaluation {
  for (const c of CRITERIA) {
    const v = criteria[c];
    if (!v || (v.answer !== 'yes' && v.answer !== 'no')) return { status: 'invalid', error: 'criterion_missing', criterion: c };
    if (!v.justification?.trim()) return { status: 'invalid', error: 'justification_required', criterion: c };
  }
  const yes = (c: 1 | 2 | 3 | 4 | 5) => criteria[c]!.answer === 'yes';
  if (yes(5) && !overrideCandidate) return { status: 'complete', outcome: 'CCP_CANDIDATE' };
  return { status: 'complete', outcome: yes(3) || yes(2) ? 'OPRP' : 'PRP' };
}

export type HazardResult = 'CCP' | 'OPRP' | 'PRP' | 'needs_change' | 'pending';

/** Итоговый результат опасности: незначимая → PRP; значимая → дерево; «не ККТ» → категоризация. */
export function hazardResult(significant: boolean, tree: 'CCP' | 'NOT_CCP' | 'NEEDS_CHANGE' | null, oprp: OprpOutcome | null): HazardResult {
  if (!significant) return 'PRP';
  if (tree === null) return 'pending';
  if (tree === 'CCP') return 'CCP';
  if (tree === 'NEEDS_CHANGE') return 'needs_change';
  if (oprp === 'OPRP' || oprp === 'PRP') return oprp;
  return 'pending';
}
