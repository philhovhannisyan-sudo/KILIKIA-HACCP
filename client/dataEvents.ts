// Сигнал «данные на сервере изменились» (сброс, импорт) — экраны перезагружают свои данные без перезагрузки страницы.
import { useEffect, useState } from 'react';

const EVENT = 'haccp:data-changed';
export const emitDataChanged = () => window.dispatchEvent(new Event(EVENT));

export function useDataVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const on = () => setV((x) => x + 1);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return v;
}
