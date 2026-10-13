import { useId } from 'react';
import { parseDecimal } from '../../shared/number';
import { useI18n } from '../i18n/I18nProvider';

// Поле ввода числа: принимает запятую и точку во всех локалях, хранит исходный текст,
// наружу отдаёт нормализованное число (brief §8).
interface Props {
  label: string;
  value: string;
  onChange: (raw: string, parsed: number | null) => void;
  name?: string;
}

export function NumberInput({ label, value, onChange, name }: Props) {
  const { t } = useI18n();
  const id = useId();
  const invalid = value.trim() !== '' && parseDecimal(value) === null;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-err` : undefined}
        onChange={(e) => onChange(e.target.value, parseDecimal(e.target.value))}
      />
      {invalid && (
        <p className="field__error" id={`${id}-err`}>
          {t('form.invalidNumber')}
        </p>
      )}
    </div>
  );
}
