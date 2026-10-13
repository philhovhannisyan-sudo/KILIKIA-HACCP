// Серверные часы. В тестовом режиме (HACCP_TEST_MODE=1) время можно сдвинуть — для проверок просрочек и таймеров.
import { businessDate } from '../../shared/time';

let offsetMs = 0;

export const clock = {
  now: () => new Date(Date.now() + offsetMs),
  nowIso: () => new Date(Date.now() + offsetMs).toISOString(),
  today: () => businessDate(new Date(Date.now() + offsetMs)),
  /** Только для тестов: установить текущее время или вернуть реальное (null). */
  set(iso: string | null) {
    offsetMs = iso === null ? 0 : Date.parse(iso) - Date.now();
  },
};
