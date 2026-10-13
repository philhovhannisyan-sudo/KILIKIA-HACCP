import { addDays, businessDate } from '../../shared/time';

/** Период по деловым датам Еревана → границы [from, to) в UTC ISO. */
export const periodToIso = (fromDate: string, toDate: string) => ({
  from: new Date(`${fromDate}T00:00:00+04:00`).toISOString(),
  to: new Date(`${addDays(toDate, 1)}T00:00:00+04:00`).toISOString(),
});
export const defaultPeriod = (days: number) => {
  const today = businessDate(new Date());
  return { fromDate: addDays(today, -days + 1), toDate: today };
};
