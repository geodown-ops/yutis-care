/** Dates are ISO `YYYY-MM-DD` strings, read as local calendar days. */
export type IsoDate = string;

export function parseDate(s: IsoDate): Date {
  const [y = 0, m = 1, d = 1] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toIsoDate(d: Date): IsoDate {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Whole days from b to a (a − b). */
export function diffDays(a: IsoDate, b: IsoDate): number {
  return Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / 86400000);
}

/** Age in completed years on the given day. */
export function ageAt(birth: IsoDate, at: IsoDate): number {
  const b = parseDate(birth);
  const t = parseDate(at);
  let a = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
  return a;
}
