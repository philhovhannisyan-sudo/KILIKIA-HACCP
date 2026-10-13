import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Construction } from 'lucide-react';
import { findModule } from '../../shared/modules';
import { useI18n } from '../i18n/I18nProvider';
import { NumberInput } from '../components/NumberInput';
import { phaseOf } from './phases';

// Заглушка фазы 1: маршрут, описание будущего наполнения и черновик формы.
export function ModulePage() {
  const { code = '' } = useParams();
  const m = findModule(code);
  if (!m) return <NotFound />;
  return <ModuleStub key={m.code} code={m.code} group={m.group} scope={m.scope} />;
}

function ModuleStub({ code, group, scope }: { code: string; group: string; scope: 'full' | 'scaffold' }) {
  const { t, fmtNumber } = useI18n();
  // Состояние формы живёт в компоненте и не зависит от языка — смена языка его не сбрасывает (К2).
  const [comment, setComment] = useState('');
  const [raw, setRaw] = useState('');
  const [parsed, setParsed] = useState<number | null>(null);
  return (
    <div className="page" data-testid={`page-${code}`}>
      <h1>
        <span className="code">{code}</span> {t(`module.${code}.title`)}
      </h1>
      <p className="badge badge--stub" data-testid="stub-badge">
        <Construction size={16} aria-hidden /> {t('page.stubBadge')} · {t('term.in_development')}
      </p>
      <dl className="facts">
        <div><dt>{t('page.code')}</dt><dd className="code">{code}</dd></div>
        <div><dt>{t('page.group')}</dt><dd>{t(`group.${group}`)}</dd></div>
        <div><dt>{t('page.scope')}</dt><dd>{t(scope === 'full' ? 'scope.full' : 'scope.scaffold')}</dd></div>
      </dl>
      <section className="card">
        <h2>{t('page.future')}</h2>
        <p>{t(`module.${code}.summary`)}</p>
        <p className="muted">{t('page.stubText', { phase: phaseOf(code) })}</p>
      </section>
      <section className="card">
        <h2>{t('page.formTitle')}</h2>
        <p className="muted">{t('page.formHint')}</p>
        <form className="form" onSubmit={(e) => e.preventDefault()} data-testid="stub-form">
          <div className="field">
            <label htmlFor="stub-comment">{t('form.comment')}</label>
            <input id="stub-comment" name="comment" value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
          <NumberInput name="value" label={t('form.value')} value={raw} onChange={(r, p) => { setRaw(r); setParsed(p); }} />
          <p>
            {t('form.parsed')}: <output data-testid="parsed" data-value={parsed ?? ''}>{parsed === null ? '—' : fmtNumber(parsed)}</output>
          </p>
        </form>
      </section>
    </div>
  );
}

export function NotFound() {
  const { t } = useI18n();
  return (
    <div className="page" data-testid="page-not-found">
      <h1>{t('notFound.title')}</h1>
      <Link to="/">{t('notFound.back')}</Link>
    </div>
  );
}
