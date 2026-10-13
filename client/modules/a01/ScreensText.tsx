import { useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { api } from '../../api';
import { useI18n } from '../../i18n/I18nProvider';
import { ActionButton } from '../../components/Can';
import { editText, type ScreenProps } from './common';

// Экран 1 — группа ХАССП
export function ScreenTeam({ data, editable, save }: ScreenProps) {
  const { t } = useI18n();
  const [rows, setRows] = useState(data.team.map((m) => ({ name: m.name, role: m.role, competence: m.competence ?? '' })));
  useEffect(() => setRows(data.team.map((m) => ({ name: m.name, role: m.role, competence: m.competence ?? '' }))), [data.team]);
  const set = (i: number, k: 'name' | 'role' | 'competence', v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="form form--wide">
      <p className="muted">{t('wizard.hint.1')}</p>
      {rows.map((r, i) => (
        <fieldset key={i} className="row-fields" data-testid={`team-row-${i}`}>
          <legend className="visually-hidden">{t('plan.screen.1')} {i + 1}</legend>
          <div className="field"><label htmlFor={`tm-name-${i}`}>{t('plan.col.name')}</label>
            <input id={`tm-name-${i}`} value={r.name} disabled={!editable} onChange={(e) => set(i, 'name', e.target.value)} /></div>
          <div className="field"><label htmlFor={`tm-role-${i}`}>{t('plan.col.role')}</label>
            <input id={`tm-role-${i}`} value={r.role} disabled={!editable} onChange={(e) => set(i, 'role', e.target.value)} /></div>
          <div className="field"><label htmlFor={`tm-comp-${i}`}>{t('plan.col.competence')}</label>
            <input id={`tm-comp-${i}`} value={r.competence} disabled={!editable} onChange={(e) => set(i, 'competence', e.target.value)} /></div>
          {editable && <ActionButton permission="haccp.plan.edit" className="icon-btn" aria-label={t('wizard.remove')} title={t('wizard.remove')} onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={16} aria-hidden /></ActionButton>}
        </fieldset>
      ))}
      {editable && (
        <div className="actions">
          <ActionButton permission="haccp.plan.edit" onClick={() => setRows([...rows, { name: '', role: '', competence: '' }])} data-testid="team-add"><Plus size={16} aria-hidden /> {t('wizard.addMember')}</ActionButton>
          <ActionButton permission="haccp.plan.edit" className="btn btn--primary" onClick={() => void save(`/api/plans/${data.plan.id}/team`, 'PUT', { members: rows }, t('wizard.saved'))} data-testid="team-save"><Save size={16} aria-hidden /> {t('wizard.save')}</ActionButton>
        </div>
      )}
    </div>
  );
}

// Экран 2 — продукт и предполагаемое использование
export function ScreenProduct({ data, editable, save }: ScreenProps) {
  const { t, l, lang } = useI18n();
  const [products, setProducts] = useState<{ id: string; code: string; name_i18n: string; spec_i18n: string | null; shelf_life_days: number; packaging_i18n: string | null }[]>([]);
  const [scope, setScope] = useState<string[]>(data.plan.scope);
  const [use, setUse] = useState(editText(data.plan.wizard_state.intendedUse, lang));
  const [desc, setDesc] = useState(editText(data.plan.wizard_state.productDescription, lang));
  useEffect(() => { api<typeof products>('/api/products').then(setProducts).catch(() => setProducts([])); }, []);
  useEffect(() => { setScope(data.plan.scope); setUse(editText(data.plan.wizard_state.intendedUse, lang)); setDesc(editText(data.plan.wizard_state.productDescription, lang)); }, [data, lang]);
  return (
    <div className="form form--wide">
      <fieldset className="field">
        <legend>{t('plan.products')}</legend>
        {products.map((p) => (
          <label key={p.id} className="check">
            <input type="checkbox" disabled={!editable} checked={scope.includes(p.id)}
              onChange={(e) => setScope(e.target.checked ? [...scope, p.id] : scope.filter((x) => x !== p.id))} data-testid={`product-${p.code}`} />
            <span><span className="code">{p.code}</span> {l(p.name_i18n)}<span className="muted"> · {l(p.spec_i18n)} · {l(p.packaging_i18n)}</span></span>
          </label>
        ))}
      </fieldset>
      <div className="field"><label htmlFor="intended-use">{t('plan.intendedUse')}</label>
        <textarea id="intended-use" rows={3} disabled={!editable} value={use} onChange={(e) => setUse(e.target.value)} /></div>
      <div className="field"><label htmlFor="product-desc">{t('plan.description')}</label>
        <textarea id="product-desc" rows={3} disabled={!editable} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
      {editable && <ActionButton permission="haccp.plan.edit" className="btn btn--primary" data-testid="product-save"
        onClick={() => void save(`/api/plans/${data.plan.id}/product`, 'PUT', { scope, intendedUse: use, description: desc }, t('wizard.saved'))}>
        <Save size={16} aria-hidden /> {t('wizard.save')}</ActionButton>}
    </div>
  );
}

// Экран 7 — верификация, документирование, утверждение
export function ScreenVerification({ data, editable, save }: ScreenProps) {
  const { t, lang } = useI18n();
  const ws = data.plan.wizard_state;
  const [v, setV] = useState({ verification: editText(ws.verification, lang), validation: editText(ws.validation, lang), records: editText(ws.records, lang) });
  useEffect(() => setV({ verification: editText(ws.verification, lang), validation: editText(ws.validation, lang), records: editText(ws.records, lang) }), [ws, lang]);
  const missing = [1, 2, 3, 4, 5, 6].filter((s) => !data.completeness[s]);
  return (
    <div className="form form--wide">
      {(['verification', 'validation', 'records'] as const).map((k) => (
        <div className="field" key={k}><label htmlFor={`ver-${k}`}>{t(`plan.${k}`)}</label>
          <textarea id={`ver-${k}`} rows={3} disabled={!editable} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>
      ))}
      {editable && <ActionButton permission="haccp.plan.edit" className="btn btn--primary" data-testid="verification-save"
        onClick={() => void save(`/api/plans/${data.plan.id}/verification`, 'PUT', v, t('wizard.saved'))}><Save size={16} aria-hidden /> {t('wizard.save')}</ActionButton>}
      <h3>{t('wizard.readiness')}</h3>
      {missing.length === 0
        ? <p className="tag tag--ok" data-testid="ready-for-approval">{t('wizard.readyForApproval')}</p>
        : <p className="tag tag--danger" data-testid="not-ready">{t('wizard.missingScreens', { screens: missing.join(', ') })}</p>}
    </div>
  );
}
