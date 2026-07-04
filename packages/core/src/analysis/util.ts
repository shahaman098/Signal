import type { ISODate } from "../domain/types.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function toDate(d: ISODate): Date {
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${d}`);
  }
  return parsed;
}

/** Whole days from `a` to `b` (b - a). Negative if b precedes a. */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / MS_PER_DAY);
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

export function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/** Map a value in [0, cap] onto [0, 1], saturating past the cap. */
export function saturate(value: number, cap: number): number {
  if (cap <= 0) return value > 0 ? 1 : 0;
  return clamp01(value / cap);
}

export function round(x: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}

export function groupBy<T, K extends string>(
  items: T[],
  key: (item: T) => K,
): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = out.get(k);
    if (bucket) bucket.push(item);
    else out.set(k, [item]);
  }
  return out;
}

export function sortByDateAsc<T>(items: T[], date: (item: T) => ISODate): T[] {
  return [...items].sort(
    (a, b) => toDate(date(a)).getTime() - toDate(date(b)).getTime(),
  );
}
