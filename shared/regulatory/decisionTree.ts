// Дерево решений ККТ — конфигурация в данных. Источник: docs/regulatory-refs.md §1 (статус СВЕРИТЬ).
// Тексты вопросов — в словаре (tree.Q1 …), ветвления — здесь. Исход В1а «Да» — Р-2.
export const TREE_VERIFY_STATUS = 'СВЕРИТЬ';

export type TreeOutcome = 'CCP' | 'NOT_CCP' | 'NEEDS_CHANGE';
export type TreeNode = 'Q1' | 'Q1a' | 'Q2' | 'Q3' | 'Q4';
type Next = TreeNode | { outcome: TreeOutcome };

export const TREE: { start: TreeNode; nodes: Record<TreeNode, { yes: Next; no: Next }> } = {
  start: 'Q1',
  nodes: {
    Q1: { yes: 'Q2', no: 'Q1a' },
    // «Да» → изменить стадию, процесс или продукт и вернуться к В1 (результат «Требуется изменение», Р-2)
    Q1a: { yes: { outcome: 'NEEDS_CHANGE' }, no: { outcome: 'NOT_CCP' } },
    Q2: { yes: { outcome: 'CCP' }, no: 'Q3' },
    Q3: { yes: 'Q4', no: { outcome: 'NOT_CCP' } },
    Q4: { yes: { outcome: 'NOT_CCP' }, no: { outcome: 'CCP' } },
  },
};

export interface TreeAnswer { node: string; answer: 'yes' | 'no'; justification: string }

export type TreeEvaluation =
  | { status: 'complete'; outcome: TreeOutcome; path: TreeNode[] }
  | { status: 'incomplete'; next: TreeNode; path: TreeNode[] }
  | { status: 'invalid'; error: 'unexpected_node' | 'justification_required' | 'extra_answers'; at: number };

/** Детерминированный проход по дереву: одинаковые ответы → одинаковый результат (К14). */
export function evaluateTree(answers: TreeAnswer[]): TreeEvaluation {
  let node: TreeNode = TREE.start;
  const path: TreeNode[] = [];
  for (let i = 0; i < answers.length; i++) {
    const a = answers[i];
    if (a.node !== node) return { status: 'invalid', error: 'unexpected_node', at: i };
    if (!a.justification?.trim()) return { status: 'invalid', error: 'justification_required', at: i };
    path.push(node);
    const next: Next = TREE.nodes[node][a.answer];
    if (typeof next === 'object') {
      return i === answers.length - 1 ? { status: 'complete', outcome: next.outcome, path } : { status: 'invalid', error: 'extra_answers', at: i + 1 };
    }
    node = next;
  }
  return { status: 'incomplete', next: node, path };
}
