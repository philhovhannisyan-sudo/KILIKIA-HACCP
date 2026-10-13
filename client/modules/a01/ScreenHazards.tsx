import { useState } from 'react';
import { Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import { ActionButton } from '../../components/Can';
import { editText, type ScreenProps } from './common';
import type { Hazard } from './types';

const TYPES = ['bio', 'chem', 'phys', 'allergen'] as const;
const empty = { id: undefined as string | undefined, stepId: '', type: 'bio', description: '', likelihood: 1, severity: 1, controlMeasure: '' };

// Экран 4 — анализ опасностей: стадия × тип × вероятность × тяжесть × мера контроля (шаг 6 / принцип 1)
export function ScreenHazards({ data, editable, save }: ScreenProps) {
  const { t, l, lang } = useI18n();
  const [form, setForm] = useState(empty);
  const threshold = data.settings.significanceThreshold;
  const significant = form.likelihood * form.severity >= threshold || form.severity === 3;
  const stepName = (id: string) => { const s = data.steps.find((x) => x.id === id); return s ? `${s.ord + 1}. ${l(s.name_i18n)}` : ''; };
  const edit = (h: Hazard) => setForm({ id: h.id, stepId: h.step_id, type: h.type, description: editText(h.description_i18n, lang), likelihood: h.likelihood, severity: h.severity, controlMeasure: editText(h.control_measure_i18n, lang) });
  const submit = async () => {
    const r = await save(`/api/plans/${data.plan.id}/hazards`, 'PUT', form, t('wizard.saved'));
    if (r) setForm(empty);
  };

  return (
    <div className="form form--wide">
      <p className="muted">{t('wizard.hint.4', { threshold })}</p>
      <div className="table-wrap">
        <table className="table table--stack" data-testid="hazard-table">
          <thead><tr>
            <th>{t('plan.col.step')}</th><th>{t('plan.col.type')}</th><th>{t('plan.col.hazard')}</th><th>{t('plan.col.likelihood')}</th>
            <th>{t('plan.col.severity')}</th><th>{t('plan.col.significant')}</th><th>{t('plan.col.measure')}</th><th>{t('plan.col.result')}</th>{editable && <th />}
          </tr></thead>
          <tbody>
            {data.hazards.map((h) => (
              <tr key={h.id}>
                <td data-label={t('plan.col.step')}>{stepName(h.step_id)}</td>
                <td data-label={t('plan.col.type')}>{t(`hazard.type.${h.type}`)}</td>
                <td data-label={t('plan.col.hazard')}>{l(h.description_i18n)}</td>
                <td data-label={t('plan.col.likelihood')} className="code">{h.likelihood}</td>
                <td data-label={t('plan.col.severity')} className="code">{h.severity}</td>
                <td data-label={t('plan.col.significant')}>{t(h.significant ? 'plan.yes' : 'plan.no')}</td>
                <td data-label={t('plan.col.measure')}>{l(h.control_measure_i18n)}</td>
                <td data-label={t('plan.col.result')}><span className={`tag result--${h.result}`}>{t(`hazard.result.${h.result}`)}</span></td>
                {editable && <td className="row-actions">
                  <ActionButton permission="haccp.plan.edit" className="icon-btn" onClick={() => edit(h)} aria-label={t('wizard.edit')} title={t('wizard.edit')}><Pencil size={16} aria-hidden /></ActionButton>
                  <ActionButton permission="haccp.plan.edit" className="icon-btn" onClick={() => void save(`/api/plans/${data.plan.id}/hazards/${h.id}`, 'DELETE')} aria-label={t('wizard.remove')} title={t('wizard.remove')}><Trash2 size={16} aria-hidden /></ActionButton>
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && (
        <fieldset className="subform" data-testid="hazard-form">
          <legend>{form.id ? t('wizard.editHazard') : t('wizard.addHazard')}</legend>
          <div className="grid-form">
            <div className="field"><label htmlFor="hz-step">{t('plan.col.step')}</label>
              <select id="hz-step" value={form.stepId} onChange={(e) => setForm({ ...form, stepId: e.target.value })}>
                <option value="">—</option>
                {data.steps.map((s) => <option key={s.id} value={s.id}>{stepName(s.id)}</option>)}
              </select></div>
            <div className="field"><label htmlFor="hz-type">{t('plan.col.type')}</label>
              <select id="hz-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map((x) => <option key={x} value={x}>{t(`hazard.type.${x}`)}</option>)}
              </select></div>
            <div className="field"><label htmlFor="hz-lik">{t('term.likelihood')} (1–3)</label>
              <select id="hz-lik" value={form.likelihood} onChange={(e) => setForm({ ...form, likelihood: Number(e.target.value) })}>
                {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
            <div className="field"><label htmlFor="hz-sev">{t('term.severity')} (1–3)</label>
              <select id="hz-sev" value={form.severity} onChange={(e) => setForm({ ...form, severity: Number(e.target.value) })}>
                {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
          </div>
          <div className="field"><label htmlFor="hz-desc">{t('plan.col.hazard')}</label>
            <input id="hz-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="field"><label htmlFor="hz-measure">{t('plan.col.measure')}</label>
            <input id="hz-measure" value={form.controlMeasure} onChange={(e) => setForm({ ...form, controlMeasure: e.target.value })} /></div>
          <p data-testid="hz-significance">{t('plan.col.significant')}: <strong>{t(significant ? 'plan.yes' : 'plan.no')}</strong>
            <span className="muted"> ({form.likelihood} × {form.severity} = {form.likelihood * form.severity})</span></p>
          <div className="actions">
            <ActionButton permission="haccp.plan.edit" className="btn btn--primary" disabled={!form.stepId || !form.description.trim()} onClick={() => void submit()} data-testid="hazard-save">
              {form.id ? <Save size={16} aria-hidden /> : <Plus size={16} aria-hidden />} {form.id ? t('wizard.save') : t('wizard.addHazard')}</ActionButton>
            {form.id && <button type="button" className="btn" onClick={() => setForm(empty)}>{t('modal.cancel')}</button>}
          </div>
        </fieldset>
      )}
    </div>
  );
}
