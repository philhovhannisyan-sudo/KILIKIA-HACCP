import { useCallback, useEffect, useState } from 'react';
import { FilePlus2, FileSpreadsheet, FileText, Plus, Save } from 'lucide-react';
import { api } from '../../api';
import { useI18n } from '../../i18n/I18nProvider';
import { useErrorText } from '../../i18n/useErrorText';
import { ActionButton, Can } from '../../components/Can';
import { useModal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { emitDataChanged, useDataVersion } from '../../dataEvents';
import { NcRegistry } from './NcRegistry';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const CODE = 'D04';
const SIX_M = ['man', 'machine', 'method', 'material', 'measurement', 'environment'] as const;

export function NcPage() {
  const { t } = useI18n();
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="page page--wide" data-testid={`page-${CODE}`}>
      <h1><span className="code">{CODE}</span> {t('module.D04.title')}</h1>
      <NcRegistry onOpen={setOpenId} selected={openId} />
      <Can permission="nc.record.create"><NewNc onCreated={setOpenId} /></Can>
      {openId && <NcCard id={openId} />}
    </div>
  );
}

function NewNc({ onCreated }: { onCreated: (id: string) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const [f, setF] = useState({ sourceType: 'manual', severity: 'minor', description: '' });
  const submit = async () => {
    try {
      const r = await api<Row>('/api/nonconformities', { method: 'POST', json: f });
      toast(t('nc.created', { code: r.code }), 'success');
      setF({ ...f, description: '' });
      emitDataChanged();
      onCreated(r.id);
    } catch (e) { toast(errorText(e), 'error'); }
  };
  return (
    <section className="card" data-testid="nc-new">
      <h2>{t('nc.new')}</h2>
      <div className="grid-form">
        <div className="field"><label htmlFor="nc-src">{t('nc.source')}</label>
          <select id="nc-src" value={f.sourceType} onChange={(e) => setF({ ...f, sourceType: e.target.value })}>
            {['incoming', 'audit', 'claim', 'manual'].map((s) => <option key={s} value={s}>{t(`nc.sourceType.${s}`)}</option>)}</select></div>
        <div className="field"><label htmlFor="nc-sev">{t('nc.severity')}</label>
          <select id="nc-sev" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}>
            {['minor', 'major', 'critical'].map((s) => <option key={s} value={s}>{t(`nc.sev.${s}`)}</option>)}</select></div>
      </div>
      <div className="field"><label htmlFor="nc-desc">{t('nc.description')}</label>
        <textarea id="nc-desc" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
      <ActionButton permission="nc.record.create" className="btn btn--primary" disabled={!f.description.trim()} onClick={() => void submit()} data-testid="nc-create"><FilePlus2 size={16} aria-hidden /> {t('nc.new')}</ActionButton>
    </section>
  );
}

function NcCard({ id }: { id: string }) {
  const { t, l, lang, fmtDate, fmtDateTime } = useI18n();
  const toast = useToast();
  const modal = useModal();
  const errorText = useErrorText();
  const version = useDataVersion();
  const [nc, setNc] = useState<Row | null>(null);
  const load = useCallback(async () => setNc(await api<Row>(`/api/nonconformities/${id}`)), [id]);
  useEffect(() => { void load().catch((e) => toast(errorText(e), 'error')); }, [load, version, toast, errorText]);
  const d = (s: string | null) => (s ? fmtDate(new Date(`${s.slice(0, 10)}T12:00:00Z`)) : '—');

  const move = (entity: 'nonconformity' | 'capa', entityId: string, to: string, commentRequired: boolean, label: string) => {
    const run = async (comment?: string) => {
      try {
        await api(`/api/fsm/${entity}/${entityId}/transition`, { method: 'POST', json: { to, comment } });
        modal.close();
        toast(t('nc.transitionDone', { status: t(`status.${entity === 'capa' ? 'capa' : 'nc'}.${to}`) }), 'success');
        emitDataChanged();
        await load();
      } catch (e) { toast(errorText(e), 'error'); }
    };
    if (!commentRequired) return void run();
    modal.open({ title: label, body: <Comment onSubmit={run} /> });
  };
  if (!nc) return null;
  const ncLabel = (to: string) => (nc.status === 'effectiveness_check' && to === 'in_analysis' ? t('nc.to.ineffective') : t(`nc.to.${to}`));
  const capaLabel = (from: string, to: string) => (from === 'done' && to === 'in_progress' ? t('capa.to.reopen') : t(`capa.to.${to}`));
  const src = nc.source;

  return (
    <section className="card" data-testid="nc-card">
      <h2>{t('nc.card')} <span className="code">{nc.code}</span></h2>
      <dl className="facts">
        <div><dt>{t('nc.source')}</dt><dd data-testid="nc-card-source">{t(`nc.sourceType.${nc.source_type}`)}</dd></div>
        {src && <div><dt>{t('nc.sourceRef')}</dt><dd className="code">{src.cp_code ?? src.point_code ?? src.code ?? ''}{src.event_at ? ` · ${fmtDateTime(new Date(src.event_at))}` : ''}{src.parameter ? ` · ${l(src.parameter)}` : ''}</dd></div>}
        <div><dt>{t('mon.col.batch')}</dt><dd className="code">{nc.batch_code ?? nc.lot_code ?? '—'}</dd></div>
        <div><dt>{t('nc.severity')}</dt><dd>{t(`nc.sev.${nc.severity}`)}</dd></div>
        <div><dt>{t('mon.col.status')}</dt><dd><span className="status" data-testid="nc-status">{t(`status.nc.${nc.status}`)}</span></dd></div>
        <div><dt>{t('nc.due')}</dt><dd>{d(nc.due_date)}</dd></div>
      </dl>
      <p>{nc.description}</p>
      <div className="actions">
        {nc.transitions.filter((x: Row) => x.allowed).map((x: Row) => (
          <ActionButton key={x.to} permission={x.permission} className={x.to === 'closed' ? 'btn btn--primary' : 'btn'} onClick={() => move('nonconformity', nc.id, x.to, x.commentRequired, ncLabel(x.to))} data-testid={`nc-to-${x.to}`}>{ncLabel(x.to)}</ActionButton>
        ))}
        <a className="btn" href={`/api/nonconformities/${nc.id}/export.pdf?lang=${lang}`} target="_blank" rel="noreferrer" data-testid="nc-pdf"><FileText size={16} aria-hidden /> {t('export.pdf')}</a>
        <a className="btn" href={`/api/nonconformities/${nc.id}/export.xlsx?lang=${lang}`}><FileSpreadsheet size={16} aria-hidden /> {t('export.xlsx')}</a>
      </div>
      <Analysis nc={nc} onSaved={load} />
      <h3>{t('nc.capaReport')}</h3>
      {nc.capa.length === 0 ? <p className="muted">{t('home.empty')}</p> : nc.capa.map((c: Row) => (
        <article key={c.id} className="subform" data-capa={c.code}>
          <header className="actions"><span className="code">{c.code}</span> · {t(`nc.capaType.${c.type}`)} · <span className="status" data-testid="capa-status">{t(`status.capa.${c.status}`)}</span></header>
          <p>{c.action}</p>
          <p className="muted">{t('home.owner')}: {c.owner_name} · {t('home.due')}: {d(c.due_date)}</p>
          {c.eff_checked_date && <p data-testid="capa-eff">{t('nc.effective')}: {d(c.eff_checked_date)} — {c.eff_result} ({c.eff_checked_by_name})</p>}
          <div className="actions">
            {c.transitions.filter((x: Row) => x.allowed).map((x: Row) => (
              <ActionButton key={x.to} permission={x.permission} onClick={() => move('capa', c.id, x.to, x.commentRequired, capaLabel(c.status, x.to))} data-testid={`capa-to-${x.to}`}>{capaLabel(c.status, x.to)}</ActionButton>
            ))}
          </div>
          {c.status === 'done' && <Effectiveness capaId={c.id} onSaved={load} />}
        </article>
      ))}
      {['root_cause_identified', 'capa_assigned'].includes(nc.status) && <Can permission="capa.action.create"><NewCapa ncId={nc.id} onSaved={load} /></Can>}
    </section>
  );
}

function Analysis({ nc, onSaved }: { nc: Row; onSaved: () => Promise<void> }) {
  const { t } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const init = () => ({
    whys: [0, 1, 2, 3, 4].map((i) => nc.fiveWhys[i] ?? ''),
    root: nc.root_cause ?? '',
    fish: Object.fromEntries(SIX_M.map((m) => [m, nc.ishikawa.filter((c: Row) => c.category === m).map((c: Row) => c.text).join('\n')])) as Record<string, string>,
  });
  const [f, setF] = useState(init);
  useEffect(() => setF(init()), [nc]); // eslint-disable-line react-hooks/exhaustive-deps
  const editable = ['registered', 'in_analysis'].includes(nc.status);
  const save = async () => {
    try {
      await api(`/api/nonconformities/${nc.id}/analysis`, { method: 'PUT', json: {
        fiveWhys: f.whys, rootCause: f.root,
        ishikawa: SIX_M.flatMap((m) => f.fish[m].split('\n').map((text) => ({ category: m, text })).filter((x) => x.text.trim())),
      } });
      toast(t('nc.analysisSaved'), 'success');
      await onSaved();
    } catch (e) { toast(errorText(e), 'error'); }
  };
  return (
    <fieldset className="subform" data-testid="nc-analysis">
      <legend>{t('nc.analysis')}</legend>
      <div className="grid-form">
        {f.whys.map((w, i) => (
          <div className="field" key={i}><label htmlFor={`why-${i}`}>{t('nc.why')} {i + 1}</label>
            <input id={`why-${i}`} value={w} disabled={!editable} onChange={(e) => setF({ ...f, whys: f.whys.map((x, j) => (j === i ? e.target.value : x)) })} /></div>
        ))}
      </div>
      <div className="fishbone">
        {SIX_M.map((m) => (
          <div className="field" key={m}><label htmlFor={`m-${m}`}>{t(`nc.6m.${m}`)}</label>
            <textarea id={`m-${m}`} rows={2} value={f.fish[m]} disabled={!editable} onChange={(e) => setF({ ...f, fish: { ...f.fish, [m]: e.target.value } })} /></div>
        ))}
      </div>
      <div className="field"><label htmlFor="root-cause">{t('term.root_cause')}</label>
        <textarea id="root-cause" rows={2} value={f.root} disabled={!editable} onChange={(e) => setF({ ...f, root: e.target.value })} /></div>
      {editable && <ActionButton permission="nc.record.analyze" className="btn btn--primary" onClick={() => void save()} data-testid="analysis-save"><Save size={16} aria-hidden /> {t('wizard.save')}</ActionButton>}
    </fieldset>
  );
}

function NewCapa({ ncId, onSaved }: { ncId: string; onSaved: () => Promise<void> }) {
  const { t } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const [people, setPeople] = useState<Row[]>([]);
  const [f, setF] = useState({ action: '', type: 'corrective', ownerId: '', dueDate: '' });
  useEffect(() => { api<Row[]>('/api/people').then(setPeople).catch(() => setPeople([])); }, []);
  const submit = async () => {
    try { await api(`/api/nonconformities/${ncId}/capa`, { method: 'POST', json: f }); toast(t('nc.capaAdded'), 'success'); setF({ ...f, action: '' }); await onSaved(); }
    catch (e) { toast(errorText(e), 'error'); }
  };
  return (
    <fieldset className="subform" data-testid="capa-new">
      <legend>{t('nc.capaAdd')}</legend>
      <div className="field"><label htmlFor="capa-action">{t('nc.action')}</label>
        <textarea id="capa-action" rows={2} value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })} /></div>
      <div className="grid-form">
        <div className="field"><label htmlFor="capa-type">{t('nc.capaType')}</label>
          <select id="capa-type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            <option value="corrective">{t('nc.capaType.corrective')}</option><option value="preventive">{t('nc.capaType.preventive')}</option></select></div>
        <div className="field"><label htmlFor="capa-owner">{t('home.owner')}</label>
          <select id="capa-owner" value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })}>
            <option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></div>
        <div className="field"><label htmlFor="capa-due">{t('home.due')}</label>
          <input id="capa-due" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></div>
      </div>
      <ActionButton permission="capa.action.create" disabled={!f.action.trim() || !f.ownerId || !f.dueDate} onClick={() => void submit()} data-testid="capa-add"><Plus size={16} aria-hidden /> {t('nc.capaAdd')}</ActionButton>
    </fieldset>
  );
}

function Effectiveness({ capaId, onSaved }: { capaId: string; onSaved: () => Promise<void> }) {
  const { t } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const [result, setResult] = useState('');
  return (
    <Can permission="capa.effectiveness.verify">
      <div className="row-fields" data-testid="capa-eff-form">
        <div className="field"><label htmlFor={`eff-${capaId}`}>{t('nc.effResult')}</label>
          <input id={`eff-${capaId}`} value={result} onChange={(e) => setResult(e.target.value)} /></div>
        <ActionButton permission="capa.effectiveness.verify" disabled={!result.trim()} data-testid="capa-eff-save"
          onClick={async () => { try { await api(`/api/capa/${capaId}/effectiveness`, { method: 'PUT', json: { result } }); toast(t('nc.effSaved'), 'success'); await onSaved(); } catch (e) { toast(errorText(e), 'error'); } }}>
          {t('nc.effSave')}</ActionButton>
      </div>
    </Can>
  );
}

function Comment({ onSubmit }: { onSubmit: (c: string) => void | Promise<void> }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void onSubmit(text.trim()); }}>
      <div className="field"><label htmlFor="nc-comment">{t('wizard.comment')}</label>
        <textarea id="nc-comment" rows={3} value={text} onChange={(e) => setText(e.target.value)} data-testid="comment-input" /></div>
      <button type="submit" className="btn btn--primary" disabled={!text.trim()} data-testid="comment-submit">{t('wizard.confirm')}</button>
    </form>
  );
}
