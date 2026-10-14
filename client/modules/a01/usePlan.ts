import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { useToast } from '../../components/Toast';
import { useErrorText } from '../../i18n/useErrorText';
import { useDataVersion } from '../../dataEvents';
import type { PlanData } from './types';

/** Загрузка плана и сохранение экранов: ответ сервера — новое состояние плана. */
export function usePlan(id: string | null) {
  const [data, setData] = useState<PlanData | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const errorText = useErrorText();
  const version = useDataVersion();

  const reload = useCallback(async () => {
    if (!id) return;
    try { setData(await api<PlanData>(`/api/plans/${id}`)); } catch (e) { toast(errorText(e), 'error'); }
  }, [id, toast, errorText]);

  useEffect(() => { void reload(); }, [reload, version]);

  const save = useCallback(async (url: string, method: 'PUT' | 'POST' | 'DELETE', json?: unknown, okText?: string) => {
    setBusy(true);
    try {
      const r = await api<PlanData>(url, { method, json });
      setData((prev) => ({ ...r, settings: r.settings ?? prev?.settings ?? { significanceThreshold: 4 } }));
      if (okText) toast(okText, 'success');
      return r;
    } catch (e) {
      toast(errorText(e), 'error');
      return null;
    } finally {
      setBusy(false);
    }
  }, [toast, errorText]);

  return { data, busy, reload, save };
}
