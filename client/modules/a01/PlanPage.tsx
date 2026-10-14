import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, FilePlus2, FileText, FileSpreadsheet, GitBranch } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthProvider';
import { useI18n } from '../../i18n/I18nProvider';
import { useErrorText } from '../../i18n/useErrorText';
import { useModal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { ActionButton } from '../../components/Can';
import { useDataVersion } from '../../dataEvents';
import { usePlan } from './usePlan';
import type { PlanListItem } from './types';
import { ScreenTeam, ScreenProduct, ScreenVerification } from './ScreensText';
import { ScreenFlow } from './ScreenFlow';
import { ScreenHazards } from './ScreenHazards';
import { ScreenDecisions } from './ScreenDecisions';
import { ScreenControlPoints } from './ScreenControlPoints';

const SCREENS = [1, 2, 3, 4, 5, 6, 7] as const;
const CODE = 'A01';

export function PlanPage() {
  const { t, l, lang, fmtDate } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const modal = useModal();
  const errorText = useErrorText();
  const version = useDataVersion();
  const [list, setList] = useState<PlanListItem[]>([]);
  const [planId, setPlanId] = useState<string | null>(null);
  const [screen, setScreen] = useState<number>(1);
  const { data, busy, save, reload } = usePlan(planId);
  const [transitions, setTransitions] = useState<{ to: string; allowed: boolean; commentRequired: boolean; permission: string }[]>([]);

  const loadList = async (select?: string) => {
    const items = await api<PlanListItem[]>('/api/plans');
    setList(items);
    // по умолчанию — последняя неархивная версия первой линии
    const pick = select ?? planId ?? [...items].reverse().find((p) => p.status !== 'archived')?.id ?? items[0]?.id ?? null;
    setPlanId(pick);
  };
  useEffect(() => { loadList().catch((e) => toast(errorText(e), 'error')); }, [version]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!data) return;
    api<{ transitions: typeof transitions }>(`/api/fsm/haccp_plan/${data.plan.id}`).then((r) => setTransitions(r.transitions)).catch(() => setTransitions([]));
  }, [data]);

  const editable = !!data && data.plan.status === 'draft' && can('haccp.plan.edit');
  const done = useMemo(() => (data ? SCREENS.filter((s) => data.completeness[s]).length : 0), [data]);

  const doTransition = (to: string, commentRequired: boolean) => {
    const run = async (comment?: string) => {
      try {
        await api(`/api/fsm/haccp_plan/${data!.plan.id}/transition`, { method: 'POST', json: { to, comment } });
        modal.close();
        toast(t('wizard.transitionDone', { status: t(`status.haccp_plan.${to}`) }), 'success');
        await reload();
        await loadList(data!.plan.id);
      } catch (e) { toast(errorText(e), 'error'); }
    };
    if (!commentRequired) return void run();
    modal.open({ title: t(`status.haccp_plan.${to}`), body: <CommentForm onSubmit={run} /> });
  };

  const revise = () => modal.open({
    title: t('wizard.revise'),
    body: <CommentForm onSubmit={async (comment) => {
      try {
        const r = await api<{ plan: { id: string } }>(`/api/plans/${data!.plan.id}/revise`, { method: 'POST', json: { comment } });
        modal.close();
        toast(t('wizard.revised'), 'success');
        await loadList(r.plan.id);
        setScreen(1);
      } catch (e) { toast(errorText(e), 'error'); }
    }} />,
  });

  const create = () => modal.open({
    title: t('wizard.newPlan'),
    body: <CommentForm label={t('wizard.planTitle')} onSubmit={async (title) => {
      try {
        const r = await api<{ plan: { id: string } }>('/api/plans', { method: 'POST', json: { title } });
        modal.close();
        await loadList(r.plan.id);
        setScreen(1);
      } catch (e) { toast(errorText(e), 'error'); }
    }} />,
  });

  const exportUrl = (fmt: string) => `/api/plans/${data?.plan.id}/export.${fmt}?lang=${lang}`;

  return (
    <div className="page page--wide" data-testid="page-A01">
      <h1><span className="code">{CODE}</span> {t('module.A01.title')}</h1>
      <div className="toolbar">
        <label className="field field--inline">
          <span>{t('wizard.plan')}</span>
          <select value={planId ?? ''} onChange={(e) => { setPlanId(e.target.value); setScreen(1); }} data-testid="plan-select">
            {list.map((p) => (
              <option key={p.id} value={p.id}>{l(p.title_i18n)} · {t('wizard.versionShort', { v: p.version })} · {t(`status.haccp_plan.${p.status}`)}</option>
            ))}
          </select>
        </label>
        <ActionButton permission="haccp.plan.edit" onClick={create} data-testid="plan-new"><FilePlus2 size={16} aria-hidden /> {t('wizard.newPlan')}</ActionButton>
      </div>

      {data && (
        <>
          <section className="card plan-head">
            <div className="plan-head__info">
              <span className={`status status--${data.plan.status}`} data-testid="plan-status">{t(`status.haccp_plan.${data.plan.status}`)}</span>
              <span>{t('plan.version')} <span className="code">{data.plan.version}</span></span>
              {data.plan.approved_by_name && <span className="muted">{t('plan.approvedBy')}: {data.plan.approved_by_name} · {fmtDate(new Date(data.plan.approved_at!))}</span>}
            </div>
            <div className="plan-head__actions">
              {transitions.filter((x) => x.allowed && !(x.to === 'under_revision')).map((x) => (
                <ActionButton key={x.to} permission={x.permission} className={x.to === 'approved' ? 'btn btn--primary' : 'btn'} disabled={busy}
                  onClick={() => doTransition(x.to, x.commentRequired)} data-testid={`transition-${x.to}`}>
                  {t(`wizard.to.${x.to}`)}
                </ActionButton>
              ))}
              {data.plan.status === 'approved' && (
                <ActionButton permission="haccp.plan.revise" onClick={revise} data-testid="plan-revise"><GitBranch size={16} aria-hidden /> {t('wizard.revise')}</ActionButton>
              )}
              <a className="btn" href={exportUrl('pdf')} target="_blank" rel="noreferrer" data-testid="plan-pdf"><FileText size={16} aria-hidden /> {t('export.pdf')}</a>
              <a className="btn" href={exportUrl('xlsx')} data-testid="plan-xlsx"><FileSpreadsheet size={16} aria-hidden /> {t('export.xlsx')}</a>
              <a className="btn" href={exportUrl('csv')} data-testid="plan-csv"><FileSpreadsheet size={16} aria-hidden /> {t('export.csv')}</a>
            </div>
            {data.plan.status !== 'draft' && <p className="muted" data-testid="plan-readonly">{t('wizard.readOnly')}</p>}
          </section>

          <div className="progress" aria-label={t('wizard.progress')}>
            <span className="progress__count" data-testid="wizard-progress">{t('wizard.progressCount', { done, total: 7 })}</span>
            <div className="progress__bar"><span style={{ width: `${(done / 7) * 100}%` }} /></div>
          </div>
          <ol className="stepper" role="tablist">
            {SCREENS.map((s) => (
              <li key={s}>
                <button type="button" role="tab" aria-selected={screen === s} className={`stepper__item${screen === s ? ' active' : ''}`}
                  onClick={() => setScreen(s)} data-testid={`screen-tab-${s}`}>
                  {data.completeness[s] ? <CheckCircle2 size={16} aria-hidden className="ok" /> : <Circle size={16} aria-hidden />}
                  <span className="stepper__n">{s}</span>
                  <span>{t(`plan.screen.${s}`)}<span className="muted stepper__codex"> · {t(`plan.codex.${s}`)}</span></span>
                </button>
              </li>
            ))}
          </ol>

          <section className="card" data-testid={`screen-${screen}`}>
            <h2>{screen}/7 · {t(`plan.screen.${screen}`)}</h2>
            {screen === 1 && <ScreenTeam data={data} editable={editable} save={save} />}
            {screen === 2 && <ScreenProduct data={data} editable={editable} save={save} />}
            {screen === 3 && <ScreenFlow data={data} editable={editable} save={save} />}
            {screen === 4 && <ScreenHazards data={data} editable={editable} save={save} />}
            {screen === 5 && <ScreenDecisions data={data} editable={editable} save={save} />}
            {screen === 6 && <ScreenControlPoints data={data} editable={editable} save={save} />}
            {screen === 7 && <ScreenVerification data={data} editable={editable} save={save} />}
            <div className="wizard-nav">
              <button type="button" className="btn" disabled={screen === 1} onClick={() => setScreen(screen - 1)} data-testid="screen-prev">{t('wizard.prev')}</button>
              <button type="button" className="btn" disabled={screen === 7} onClick={() => setScreen(screen + 1)} data-testid="screen-next">{t('wizard.next')}</button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function CommentForm({ onSubmit, label }: { onSubmit: (text: string) => void | Promise<void>; label?: string }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void onSubmit(text.trim()); }}>
      <div className="field">
        <label htmlFor="comment-input">{label ?? t('wizard.comment')}</label>
        <textarea id="comment-input" rows={3} value={text} onChange={(e) => setText(e.target.value)} data-testid="comment-input" />
      </div>
      <button type="submit" className="btn btn--primary" disabled={!text.trim()} data-testid="comment-submit">{t('wizard.confirm')}</button>
    </form>
  );
}
