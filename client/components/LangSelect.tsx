import { LANGS, type Lang } from '../../shared/time';
import { useI18n } from '../i18n/I18nProvider';
import { useToast } from './Toast';

export function LangSelect({ notify = true }: { notify?: boolean }) {
  const { t, lang, setLang } = useI18n();
  const toast = useToast();
  const onChange = (l: Lang) => {
    setLang(l);
    if (notify) toast(t('toast.langChanged', { lang: t(`lang.${l}`) }));
  };
  return (
    <label className="lang-select">
      <span className="visually-hidden">{t('top.language')}</span>
      <select value={lang} onChange={(e) => onChange(e.target.value as Lang)} data-testid="lang-select" aria-label={t('top.language')}>
        {LANGS.map((l) => (
          <option key={l} value={l}>{t(`lang.${l}`)}</option>
        ))}
      </select>
    </label>
  );
}
