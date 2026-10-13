import { describe, expect, it } from 'vitest';
import { TREE, evaluateTree, type TreeAnswer } from '../../shared/regulatory/decisionTree';
import { categorize, hazardResult, isSignificant, type Criteria } from '../../shared/regulatory/oprp';

const a = (...steps: [string, 'yes' | 'no'][]): TreeAnswer[] => steps.map(([node, answer]) => ({ node, answer, justification: `обоснование ${node}` }));

describe('K14 дерево решений ККТ (regulatory-refs.md §1)', () => {
  // Каждая ветка таблицы §1 — отдельный тест
  const branches: [string, TreeAnswer[], string][] = [
    ['В1 Да → В2 Да → ККТ', a(['Q1', 'yes'], ['Q2', 'yes']), 'CCP'],
    ['В1 Да → В2 Нет → В3 Нет → Не ККТ', a(['Q1', 'yes'], ['Q2', 'no'], ['Q3', 'no']), 'NOT_CCP'],
    ['В1 Да → В2 Нет → В3 Да → В4 Да → Не ККТ', a(['Q1', 'yes'], ['Q2', 'no'], ['Q3', 'yes'], ['Q4', 'yes']), 'NOT_CCP'],
    ['В1 Да → В2 Нет → В3 Да → В4 Нет → ККТ', a(['Q1', 'yes'], ['Q2', 'no'], ['Q3', 'yes'], ['Q4', 'no']), 'CCP'],
    ['В1 Нет → В1а Нет → Не ККТ', a(['Q1', 'no'], ['Q1a', 'no']), 'NOT_CCP'],
    ['В1 Нет → В1а Да → Требуется изменение (Р-2)', a(['Q1', 'no'], ['Q1a', 'yes']), 'NEEDS_CHANGE'],
  ];
  for (const [name, answers, outcome] of branches) {
    it(`K14 ветка: ${name}`, () => {
      const r = evaluateTree(answers);
      expect(r).toMatchObject({ status: 'complete', outcome, path: answers.map((x) => x.node) });
      // детерминизм: одинаковые ответы → одинаковый результат
      for (let i = 0; i < 5; i++) expect(evaluateTree(structuredClone(answers))).toEqual(r);
    });
  }

  it('K14 все ветки конфигурации покрыты тестами', () => {
    const outcomes = new Set<string>();
    for (const n of Object.values(TREE.nodes)) for (const nx of [n.yes, n.no]) if (typeof nx === 'object') outcomes.add(nx.outcome);
    expect([...outcomes].sort()).toEqual(['CCP', 'NEEDS_CHANGE', 'NOT_CCP']);
    const leaves = Object.values(TREE.nodes).flatMap((n) => [n.yes, n.no]).filter((x) => typeof x === 'object').length;
    expect(leaves).toBe(branches.length);
  });

  it('K14 обоснование обязательно; ответ не на тот вопрос и лишние ответы отклоняются; неполный проход — следующий вопрос', () => {
    expect(evaluateTree([{ node: 'Q1', answer: 'yes', justification: ' ' }])).toMatchObject({ status: 'invalid', error: 'justification_required' });
    expect(evaluateTree(a(['Q2', 'yes']))).toMatchObject({ status: 'invalid', error: 'unexpected_node', at: 0 });
    expect(evaluateTree(a(['Q1', 'yes'], ['Q2', 'yes'], ['Q3', 'no']))).toMatchObject({ status: 'invalid', error: 'extra_answers' });
    expect(evaluateTree(a(['Q1', 'yes'], ['Q2', 'no']))).toEqual({ status: 'incomplete', next: 'Q3', path: ['Q1', 'Q2'] });
  });
});

describe('K14 значимость и категоризация OPRP (regulatory-refs.md §2, Р-3)', () => {
  const crit = (yes: number[]): Criteria => Object.fromEntries([1, 2, 3, 4, 5].map((c) => [c, { answer: yes.includes(c) ? 'yes' : 'no', justification: 'x' }])) as Criteria;
  it('K14 значимость: L×S ≥ порога или тяжесть 3', () => {
    expect(isSignificant(1, 2, 4)).toBe(false);
    expect(isSignificant(2, 2, 4)).toBe(true);
    expect(isSignificant(1, 3, 4)).toBe(true);
  });
  it('K14 ветки категоризации: кандидат в ККТ / OPRP по кр. 3 / OPRP по кр. 2 / PRP / отклонение кандидата', () => {
    expect(categorize(crit([5, 3]))).toEqual({ status: 'complete', outcome: 'CCP_CANDIDATE' });
    expect(categorize(crit([3]))).toEqual({ status: 'complete', outcome: 'OPRP' });
    expect(categorize(crit([2]))).toEqual({ status: 'complete', outcome: 'OPRP' });
    expect(categorize(crit([1, 4]))).toEqual({ status: 'complete', outcome: 'PRP' });
    expect(categorize(crit([5, 3]), true)).toEqual({ status: 'complete', outcome: 'OPRP' });
    expect(categorize({ 1: { answer: 'yes', justification: 'x' } })).toMatchObject({ status: 'invalid', error: 'criterion_missing', criterion: 2 });
  });
  it('K14 итог опасности', () => {
    expect(hazardResult(false, null, null)).toBe('PRP');
    expect(hazardResult(true, 'CCP', null)).toBe('CCP');
    expect(hazardResult(true, 'NEEDS_CHANGE', null)).toBe('needs_change');
    expect(hazardResult(true, 'NOT_CCP', 'OPRP')).toBe('OPRP');
    expect(hazardResult(true, 'NOT_CCP', 'CCP_CANDIDATE')).toBe('pending');
    expect(hazardResult(true, null, null)).toBe('pending');
  });
});
