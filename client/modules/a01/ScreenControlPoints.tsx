import { useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { api } from '../../api';
import { useI18n } from '../../i18n/I18nProvider';
import { ActionButton } from '../../components/Can';
import { NumberInput } from '../../components/NumberInput';
import { cpLabel } from '../../i18n/labels';
import { ROLES } from '../../../shared/permissions';
import { editText, type ScreenProps } from './common';
import type { ControlPoint, Hazard } from './types';

interface ParamForm { id?: string; code: string; name: string; kind: 'numeric' | 'pass_fail'; limitMin: string; limitMax: string; unit: string; method: string; frequency: string; equipmentId: string }
interface Equipment { id: string; code: string; name_i18n: string; next_cal_date: string | null }

// Экран 6 — пределы, мониторинг, корректирующие действия (шаги 8–10 / принципы 3–5).
// Сохранённая ККТ/OPRP — та же запись, что в реестре A03.
export function ScreenControlPoints({ data, editable, save }: ScreenProps) {
  const { t } = useI18n();
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  useEffect(() => { api<Equipment[]>('/api/equipment').then(setEquipment).catch(() => setEquipment([])); }, []);
  const controlled = data.hazards.filter((h) => h.result === 'CCP' || h.result === 'OPRP');
  return (
    <div className="form form--wide">
      <p className="muted">{t('wizard.hint.6')}</p>
      {controlled.length === 0 && <p className="muted">{t('wizard.noControlled')}</p>}
      {controlled.map((h) => (
        <ControlPointForm key={h.id} hazard={h} cp={data.controlPoints.find((c) => c.hazard_id === h.id)} data={data} editable={editable} save={save} equipment={equipment} />
      ))}
    </div>
  );
}

const toParam = (p: ControlPoint['parameters'][number], lang: string, fmt: (n: number) => string): ParamForm => ({
  id: p.id, code: p.code, name: editText(p.name_i18n, lang), kind: p.kind, limitMin: p.limit_min === null ? '' : fmt(p.limit_min),
  limitMax: p.limit_max === null ? '' : fmt(p.limit_max), unit: p.unit ?? '', method: editText(p.method_i18n, lang),
  frequency: editText(p.frequency_i18n, lang), equipmentId: p.equipment_id ?? '',
});
const blank = (): ParamForm => ({ code: '', name: '', kind: 'numeric', limitMin: '', limitMax: '', unit: '', method: '', frequency: '', equipmentId: '' });

function ControlPointForm({ hazard, cp, data, editable, save, equipment }: ScreenProps & { hazard: Hazard; cp?: ControlPoint; equipment: Equipment[] }) {
  const { t, l, lang, fmtNumber } = useI18n();
  const init = () => ({
    code: cp?.code ?? `${hazard.result === 'CCP' ? 'CCP' : 'OPRP'}-${data.controlPoints.filter((c) => c.type === hazard.result).length + 1}`,
    name: cp ? editText(cp.name_i18n, lang) : '', responsibleRole: cp?.responsible_role ?? 'operator',
    correctiveAction: cp ? editText(cp.corrective_action_i18n, lang) : '',
    params: cp ? cp.parameters.map((p) => toParam(p, lang, (n) => fmtNumber(n))) : [blank()],
  });
  const [f, setF] = useState(init);
  useEffect(() => setF(init()), [cp, hazard, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const setP = (i: number, patch: Partial<ParamForm>) => setF({ ...f, params: f.params.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const id = `cp-${hazard.id}`;
  const submit = () => void save(`/api/plans/${data.plan.id}/control-points`, 'PUT', {
    id: cp?.id, code: f.code, hazardId: hazard.id, name: f.name, responsibleRole: f.responsibleRole, correctiveAction: f.correctiveAction,
    parameters: f.params.map((p) => ({ ...p, equipmentId: p.equipmentId || null })),
  }, t('wizard.saved'));

  return (
    <fieldset className="subform" data-testid={`cp-form-${hazard.id}`}>
      <legend>{cp ? cpLabel(t, cp.code, cp.type) : t(`hazard.result.${hazard.result}`)} · {l(hazard.description_i18n)}</legend>
      <div className="grid-form">
        <div className="field"><label htmlFor={`${id}-code`}>{t('plan.col.code')}</label>
          <input id={`${id}-code`} value={f.code} disabled={!editable} onChange={(e) => setF({ ...f, code: e.target.value })} /></div>
        <div className="field"><label htmlFor={`${id}-name`}>{t('wizard.cpName')}</label>
          <input id={`${id}-name`} value={f.name} disabled={!editable} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="field"><label htmlFor={`${id}-resp`}>{t('plan.col.responsible')}</label>
          <select id={`${id}-resp`} value={f.responsibleRole} disabled={!editable} onChange={(e) => setF({ ...f, responsibleRole: e.target.value })}>
            {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}</select></div>
      </div>
      <div className="field"><label htmlFor={`${id}-ca`}>{t('plan.col.corrective')}</label>
        <textarea id={`${id}-ca`} rows={2} value={f.correctiveAction} disabled={!editable} onChange={(e) => setF({ ...f, correctiveAction: e.target.value })} /></div>
      {f.params.map((p, i) => (
        <div key={i} className="param" data-testid={`param-${i}`}>
          <div className="grid-form">
            <div className="field"><label htmlFor={`${id}-p${i}-code`}>{t('wizard.paramCode')}</label>
              <input id={`${id}-p${i}-code`} value={p.code} disabled={!editable} onChange={(e) => setP(i, { code: e.target.value })} /></div>
            <div className="field"><label htmlFor={`${id}-p${i}-name`}>{t('plan.col.parameter')}</label>
              <input id={`${id}-p${i}-name`} value={p.name} disabled={!editable} onChange={(e) => setP(i, { name: e.target.value })} /></div>
            <div className="field"><label htmlFor={`${id}-p${i}-kind`}>{t('wizard.paramKind')}</label>
              <select id={`${id}-p${i}-kind`} value={p.kind} disabled={!editable} onChange={(e) => setP(i, { kind: e.target.value as ParamForm['kind'] })}>
                <option value="numeric">{t('wizard.kindNumeric')}</option><option value="pass_fail">{t('plan.passFail')}</option></select></div>
            {p.kind === 'numeric' && <>
              <NumberInput label={t('wizard.limitMin')} value={p.limitMin} onChange={(raw) => setP(i, { limitMin: raw })} name={`${id}-p${i}-min`} disabled={!editable} />
              <NumberInput label={t('wizard.limitMax')} value={p.limitMax} onChange={(raw) => setP(i, { limitMax: raw })} name={`${id}-p${i}-max`} disabled={!editable} />
              <div className="field"><label htmlFor={`${id}-p${i}-unit`}>{t('wizard.unit')}</label>
                <input id={`${id}-p${i}-unit`} value={p.unit} disabled={!editable} onChange={(e) => setP(i, { unit: e.target.value })} /></div>
            </>}
            <div className="field"><label htmlFor={`${id}-p${i}-method`}>{t('plan.col.method')}</label>
              <input id={`${id}-p${i}-method`} value={p.method} disabled={!editable} onChange={(e) => setP(i, { method: e.target.value })} /></div>
            <div className="field"><label htmlFor={`${id}-p${i}-freq`}>{t('plan.col.frequency')}</label>
              <input id={`${id}-p${i}-freq`} value={p.frequency} disabled={!editable} onChange={(e) => setP(i, { frequency: e.target.value })} /></div>
            <div className="field"><label htmlFor={`${id}-p${i}-eq`}>{t('plan.col.equipment')}</label>
              <select id={`${id}-p${i}-eq`} value={p.equipmentId} disabled={!editable} onChange={(e) => setP(i, { equipmentId: e.target.value })}>
                <option value="">—</option>
                {equipment.map((e) => <option key={e.id} value={e.id}>{e.code} · {l(e.name_i18n)}</option>)}</select></div>
          </div>
          {editable && f.params.length > 1 && <ActionButton permission="haccp.plan.edit" className="btn btn--link" onClick={() => setF({ ...f, params: f.params.filter((_, j) => j !== i) })}><Trash2 size={14} aria-hidden /> {t('wizard.remove')}</ActionButton>}
        </div>
      ))}
      {editable && (
        <div className="actions">
          <ActionButton permission="haccp.plan.edit" onClick={() => setF({ ...f, params: [...f.params, blank()] })}><Plus size={16} aria-hidden /> {t('wizard.addParam')}</ActionButton>
          <ActionButton permission="haccp.plan.edit" className="btn btn--primary" onClick={submit} data-testid="cp-save"><Save size={16} aria-hidden /> {t('wizard.save')}</ActionButton>
        </div>
      )}
    </fieldset>
  );
}
