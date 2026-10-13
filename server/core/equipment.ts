import type { DB } from '../db/connection';
import { clock } from './clock';
import { notFound, unprocessable } from './errors';

/** Оборудование пригодно, если поверка действительна по next_cal_date включительно (Р-19). Иначе — 422 с датой (К12). */
export function assertEquipmentUsable(db: DB, equipmentId: string) {
  const e = db.prepare('SELECT code, next_cal_date FROM equipment WHERE id = ?').get(equipmentId) as { code: string; next_cal_date: string | null } | undefined;
  if (!e) throw notFound('equipment', equipmentId);
  if (!e.next_cal_date || e.next_cal_date < clock.today()) {
    throw unprocessable('equipment_calibration_expired', { equipment: e.code, nextCalDate: e.next_cal_date },
      `Equipment ${e.code}: calibration expired on ${e.next_cal_date}`);
  }
}

const setting = (db: DB, key: string) => JSON.parse(db.prepare('SELECT value FROM setting WHERE key = ?').pluck().get(key) as string);

/** Время события: не раньше чем за N часов (DEMO 24) и не в будущем (допуск 5 мин) — brief §3.4, Р-17. */
export function assertEventTime(db: DB, eventAt: string): string {
  const t = Date.parse(eventAt);
  if (Number.isNaN(t)) throw unprocessable('event_time_invalid', {});
  const now = clock.now().getTime();
  const hours = setting(db, 'event_backdate_hours') as number;
  const tol = setting(db, 'event_future_tolerance_minutes') as number;
  if (t < now - hours * 3600_000 || t > now + tol * 60_000) {
    throw unprocessable('event_time_out_of_window', { hours, from: new Date(now - hours * 3600_000).toISOString(), to: new Date(now + tol * 60_000).toISOString() });
  }
  return new Date(t).toISOString();
}
