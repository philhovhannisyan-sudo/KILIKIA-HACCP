import { useEffect, useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useI18n } from '../../i18n/I18nProvider';
import { ActionButton } from '../../components/Can';
import { evaluateTree, type TreeAnswer } from '../../../shared/regulatory/decisionTree';
import { CRITERIA, categorize, type Criteria } from '../../../shared/regulatory/oprp';
import type { ScreenProps } from './common';
import type { Hazard } from './types';

// Экран 5 — дерево решений ККТ (regulatory-refs.md §1) и категоризация OPRP (§2); результат считает сервер
export function ScreenDecisions({ data, editable, save }: ScreenProps) {
  const { t } = useI18n();
  const significant = data.hazards.filter((h) => h.significant);
  return (
    <div className="form form--wide">
      <p className="badge badge--stub">{t('home.verifyBadge')}</p>
      <p className="muted">{t('wizard.hint.5')}</p>
      {significant.length === 0 && <p className="muted">{t('wizard.noSignificant')}</p>}
      {significant.map((h) => <HazardTree key={h.id} hazard={h} data={data} editable={editable} save={save} />)}
    </div>
  );
}

const nodeLabel = (node: string, lang: string) =>
  node.replace('Q', ({ ru: 'В', en: 'Q', hy: 'Հ' } as Record<string, string>)[lang]).replace('a', ({ ru: 'а', en: 'a', hy: 'ա' } as Record<string, string>)[lang]);

function HazardTree({ hazard, data, editable, save }: ScreenProps & { hazard: Hazard }) {
  const { t, l, lang } = useI18n();
  const { can } = useAuth();
  const [answers, setAnswers] = useState<TreeAnswer[]>(hazard.decisions);
  const [pending, setPending] = useState<{ answer: 'yes' | 'no' | ''; justification: string }>({ answer: '', justification: '' });
  const [criteria, setCriteria] = useState<Partial<Criteria>>(hazard.oprp?.criteria ?? {});
  const [override, setOverride] = useState(hazard.oprp?.override_candidate ?? false);
  const [overrideWhy, setOverrideWhy] = useState(hazard.oprp?.justification ?? '');
  useEffect(() => {
    setAnswers(hazard.decisions); setCriteria(hazard.oprp?.criteria ?? {});
    setOverride(hazard.oprp?.override_candidate ?? false); setOverrideWhy(hazard.oprp?.justification ?? '');
  }, [hazard]);

  const ev = evaluateTree(answers);
  const step = data.steps.find((s) => s.id === hazard.step_id);
  const needsOprp = ev.status === 'complete' && ev.outcome === 'NOT_CCP';
  const cat = needsOprp ? categorize(criteria, override) : null;
  const id = `hz-${hazard.id}`;

  const answer = () => {
    if (ev.status !== 'incomplete' || !pending.answer || !pending.justification.trim()) return;
    setAnswers([...answers, { node: ev.next, answer: pending.answer, justification: pending.justification.trim() }]);
    setPending({ answer: '', justification: '' });
  };
  const submit = () => void save(`/api/plans/${data.plan.id}/hazards/${hazard.id}/decisions`, 'PUT', {
    answers, oprp: needsOprp ? { criteria, overrideCandidate: override, justification: override ? overrideWhy : undefined } : null,
  }, t('wizard.saved'));

  return (
    <article className="tree-card" data-testid={`tree-${hazard.id}`}>
      <header>
        <h3>{step ? `${step.ord + 1}. ${l(step.name_i18n)}` : ''} · {t(`hazard.type.${hazard.type}`)}: {l(hazard.description_i18n)}</h3>
        <span className={`tag result--${hazard.result}`} data-testid="hazard-result">{t(`hazard.result.${hazard.result}`)}</span>
      </header>
      <ol className="tree-path">
        {answers.map((a, i) => (
          <li key={a.node}>
            <strong>{t(`tree.${a.node}`)}</strong>
            <div>{t(a.answer === 'yes' ? 'plan.yes' : 'plan.no')} — <span className="muted">{a.justification}</span>
              {editable && <ActionButton permission="haccp.plan.edit" className="btn btn--link" onClick={() => setAnswers(answers.slice(0, i))}>
                <RotateCcw size={14} aria-hidden /> {t('wizard.reanswer', { node: nodeLabel(a.node, lang) })}</ActionButton>}
            </div>
          </li>
        ))}
      </ol>
      {ev.status === 'incomplete' && editable && (
        <fieldset className="subform" data-testid="tree-question">
          <legend>{t(`tree.${ev.next}`)}</legend>
          <div className="radio-row">
            {(['yes', 'no'] as const).map((v) => (
              <label key={v} className="check"><input type="radio" name={`${id}-ans`} checked={pending.answer === v} onChange={() => setPending({ ...pending, answer: v })} data-testid={`tree-${v}`} /> {t(v === 'yes' ? 'plan.yes' : 'plan.no')}</label>
            ))}
          </div>
          <div className="field"><label htmlFor={`${id}-why`}>{t('wizard.justification')}</label>
            <textarea id={`${id}-why`} rows={2} value={pending.justification} onChange={(e) => setPending({ ...pending, justification: e.target.value })} data-testid="tree-justification" /></div>
          <ActionButton permission="haccp.plan.edit" disabled={!pending.answer || !pending.justification.trim()} onClick={answer} data-testid="tree-answer">{t('wizard.answer')}</ActionButton>
        </fieldset>
      )}
      {ev.status === 'complete' && <p className="tree-outcome" data-testid="tree-outcome"><strong>{t(`tree.outcome.${ev.outcome}`)}</strong></p>}
      {needsOprp && (
        <fieldset className="subform" data-testid="oprp-form">
          <legend>{t('oprp.legend')}</legend>
          {CRITERIA.map((c) => (
            <div key={c} className="criterion">
              <p>{t(`oprp.c${c}`)}</p>
              <div className="radio-row">
                {(['yes', 'no'] as const).map((v) => (
                  <label key={v} className="check"><input type="radio" name={`${id}-c${c}`} disabled={!editable} checked={criteria[c]?.answer === v}
                    onChange={() => setCriteria({ ...criteria, [c]: { answer: v, justification: criteria[c]?.justification ?? '' } })} data-testid={`crit-${c}-${v}`} /> {t(v === 'yes' ? 'plan.yes' : 'plan.no')}</label>
                ))}
              </div>
              <div className="field"><label htmlFor={`${id}-c${c}-why`}>{t('wizard.justification')}</label>
                <input id={`${id}-c${c}-why`} disabled={!editable} value={criteria[c]?.justification ?? ''} data-testid={`crit-${c}-why`}
                  onChange={(e) => setCriteria({ ...criteria, [c]: { answer: criteria[c]?.answer ?? 'no', justification: e.target.value } })} /></div>
            </div>
          ))}
          {cat?.status === 'complete' && <p data-testid="oprp-outcome"><strong>{cat.outcome === 'CCP_CANDIDATE' ? t('oprp.outcome.CCP_CANDIDATE') : t(`hazard.result.${cat.outcome}`)}</strong></p>}
          {(cat?.status === 'complete' && cat.outcome === 'CCP_CANDIDATE' || override) && can('haccp.plan.approve') && editable && (
            <div className="field">
              <label className="check"><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> {t('oprp.override')}</label>
              {override && <><label htmlFor={`${id}-ovr`}>{t('wizard.justification')}</label>
                <input id={`${id}-ovr`} value={overrideWhy} onChange={(e) => setOverrideWhy(e.target.value)} /></>}
            </div>
          )}
        </fieldset>
      )}
      {editable && <ActionButton permission="haccp.plan.edit" className="btn btn--primary" onClick={submit} data-testid="tree-save"><Save size={16} aria-hidden /> {t('wizard.save')}</ActionButton>}
    </article>
  );
}
