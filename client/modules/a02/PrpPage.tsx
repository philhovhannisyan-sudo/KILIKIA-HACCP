import { useCallback, useEffect, useState } from 'react';
import { FileText, Paperclip, Plus, Save, Trash2 } from 'lucide-react';
import { api } from '../../api';
import { useI18n } from '../../i18n/I18nProvider';
import { useErrorText } from '../../i18n/useErrorText';
import { cpLabel } from '../../i18n/labels';
import { ActionButton, Can } from '../../components/Can';
import { useToast } from '../../components/Toast';
import { emitDataChanged, useDataVersion } from '../../dataEvents';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
interface Item { question: string; result: 'ok' | 'nok' | 'na'; note: string; file: File | null }
const CODE = 'A02';
const blank = (): Item => ({ question: '', result: 'ok', note: '', file: null });

const toBase64 = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] ?? '');
  r.onerror = () => rej(r.error);
  r.readAsDataURL(f);
});

export function PrpPage() {
  const { t, l, lang, fmtDate } = useI18n();
  const version = useDataVersion();
  const [prp, setPrp] = useState<Row[]>([]);
  const [oprp, setOprp] = useState<Row[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [history, setHistory] = useState<Row[]>([]);
  const load = useCallback(async () => {
    const list = await api<Row[]>('/api/prp');
    setPrp(list);
    setSelected((cur) => cur || list[0]?.id || '');
    setOprp((await api<Row[]>('/api/control-points')).filter((c) => c.type === 'OPRP'));
  }, []);
  useEffect(() => { void load().catch(() => setPrp([])); }, [load, version]);
  const loadHistory = useCallback(async () => {
    if (selected) setHistory(await api<Row[]>(`/api/prp/checklists?prpId=${selected}`));
  }, [selected]);
  useEffect(() => { void loadHistory().catch(() => setHistory([])); }, [loadHistory, version]);
  const d = (s: string | null) => (s ? fmtDate(new Date(`${s}T12:00:00Z`)) : '—');
  const current = prp.find((p) => p.id === selected);

  return (
    <div className="page page--wide" data-testid={`page-${CODE}`}>
      <h1><span className="code">{CODE}</span> {t('module.A02.title')}</h1>
      <section className="card" data-testid="prp-registry">
        <h2>{t('prp.registry')}</h2>
        <p className="badge badge--stub">{t('home.verifyBadge')}</p>
        <div className="table-wrap">
          <table className="table table--stack">
            <thead><tr><th>{t('plan.col.code')}</th><th>{t('prp.section')}</th><th>{t('nc.description')}</th><th>{t('prp.frequency')}</th><th>{t('prp.lastCheck')}</th><th>{t('prp.nextDue')}</th><th /></tr></thead>
            <tbody>
              {prp.map((p) => (
                <tr key={p.id} className={`${p.overdue ? 'row--bad' : ''}${p.id === selected ? ' row--selected' : ''}`} data-prp={p.code}>
                  <td data-label={t('plan.col.code')} className="code">{p.code}</td>
                  <td data-label={t('prp.section')}><span className="code">{p.section_number}</span> {l(p.section_name)}</td>
                  <td data-label={t('nc.description')}>{l(p.description_i18n)}</td>
                  <td data-label={t('prp.frequency')}>{t('prp.everyDays', { n: p.frequency_days })}</td>
                  <td data-label={t('prp.lastCheck')}>{d(p.last_checked_date)}</td>
                  <td data-label={t('prp.nextDue')}><span className={`tag ${p.overdue ? 'tag--danger' : 'tag--ok'}`}>{d(p.next_due)} · {t(p.overdue ? 'prp.overdue' : 'prp.onTime')}</span></td>
                  <td className="row-actions"><button type="button" className="btn btn--link" onClick={() => setSelected(p.id)} data-testid={`prp-open-${p.code}`}>{t('nc.open')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card" data-testid="oprp-list">
        <h2>{t('prp.oprpList')}</h2>
        <ul className="items">
          {oprp.map((c) => <li key={c.id}><span className="code">{cpLabel(t, c.code, c.type)}</span> · {l(c.name_i18n)} · {c.parameters.map((p: Row) => l(p.name_i18n)).join(', ')}</li>)}
        </ul>
      </section>
      {current && (
        <>
          <Can permission="prp.checklist.create"><ChecklistForm prp={current} onSaved={async () => { await load(); await loadHistory(); }} /></Can>
          <section className="card" data-testid="checklist-history">
            <h2>{t('prp.history')} · <span className="code">{current.code}</span></h2>
            {history.length === 0 ? <p className="muted">{t('home.empty')}</p> : history.map((c) => (
              <article key={c.id} className="subform" data-checklist={c.id}>
                <header className="actions">
                  <strong>{d(c.performed_date)}</strong> · {c.performed_by_name} · <span className={`tag ${c.status === 'completed' ? 'tag--ok' : 'tag--danger'}`}>{t(`prp.status.${c.status}`)}</span>
                  <a className="btn" href={`/api/prp/checklists/${c.id}/export.pdf?lang=${lang}`} target="_blank" rel="noreferrer" data-testid="checklist-pdf"><FileText size={16} aria-hidden /> {t('export.pdf')}</a>
                </header>
                <ul className="items items--inline">
                  {c.items.map((i: Row) => (
                    <li key={i.id}>{l(i.question_i18n)} — <strong>{t(`prp.res.${i.result}`)}</strong>{i.note ? ` · ${i.note}` : ''}
                      {i.file_id && <> · <a href={`/api/files/${i.file_id}`} target="_blank" rel="noreferrer" data-testid="evidence-link"><Paperclip size={14} aria-hidden /> {i.file_name}</a></>}</li>
                  ))}
                </ul>
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function ChecklistForm({ prp, onSaved }: { prp: Row; onSaved: () => Promise<void> }) {
  const { t, l } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const [items, setItems] = useState<Item[]>([blank()]);
  const [busy, setBusy] = useState(false);
  const set = (i: number, patch: Partial<Item>) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const submit = async () => {
    setBusy(true);
    try {
      const payload = await Promise.all(items.map(async (i) => ({
        question: i.question, result: i.result, note: i.note,
        file: i.file ? { name: i.file.name, mime: i.file.type || 'application/octet-stream', base64: await toBase64(i.file) } : null,
      })));
      await api(`/api/prp/${prp.id}/checklists`, { method: 'POST', json: { items: payload } });
      toast(t('prp.saved'), 'success');
      setItems([blank()]);
      emitDataChanged();
      await onSaved();
    } catch (e) { toast(errorText(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <section className="card" data-testid="checklist-form">
      <h2>{t('prp.newChecklist')} · <span className="code">{prp.code}</span> {l(prp.description_i18n)}</h2>
      {items.map((it, i) => (
        <fieldset key={i} className="subform" data-testid={`item-${i}`}>
          <legend>{t('plan.col.no')} {i + 1}</legend>
          <div className="grid-form">
            <div className="field"><label htmlFor={`q-${i}`}>{t('prp.question')}</label>
              <input id={`q-${i}`} value={it.question} onChange={(e) => set(i, { question: e.target.value })} /></div>
            <div className="field"><label htmlFor={`r-${i}`}>{t('prp.result')}</label>
              <select id={`r-${i}`} value={it.result} onChange={(e) => set(i, { result: e.target.value as Item['result'] })}>
                {(['ok', 'nok', 'na'] as const).map((r) => <option key={r} value={r}>{t(`prp.res.${r}`)}</option>)}</select></div>
            <div className="field"><label htmlFor={`n-${i}`}>{t('prp.note')}</label>
              <input id={`n-${i}`} value={it.note} onChange={(e) => set(i, { note: e.target.value })} /></div>
            <div className="field"><label htmlFor={`f-${i}`}>{t('prp.evidenceFile')}</label>
              <input id={`f-${i}`} type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain" onChange={(e) => set(i, { file: e.target.files?.[0] ?? null })} /></div>
          </div>
          {items.length > 1 && <ActionButton permission="prp.checklist.create" className="btn btn--link" onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 size={14} aria-hidden /> {t('wizard.remove')}</ActionButton>}
        </fieldset>
      ))}
      <div className="actions">
        <ActionButton permission="prp.checklist.create" onClick={() => setItems([...items, blank()])} data-testid="item-add"><Plus size={16} aria-hidden /> {t('prp.addItem')}</ActionButton>
        <ActionButton permission="prp.checklist.create" className="btn btn--primary" disabled={busy || items.some((i) => !i.question.trim())} onClick={() => void submit()} data-testid="checklist-save"><Save size={16} aria-hidden /> {t('wizard.save')}</ActionButton>
      </div>
    </section>
  );
}
