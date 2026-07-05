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

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Population standard deviation. */
export function stddev(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
}

/**
 * Ordinary-least-squares slope of y over x — the direction and rate of a
 * trend, robust to where the series starts (unlike half-split comparisons).
 */
export function olsSlope(points: { x: number; y: number }[]): number {
  const n = points.length;
  if (n < 2) return 0;
  const mx = mean(points.map((p) => p.x));
  const my = mean(points.map((p) => p.y));
  let cov = 0;
  let varX = 0;
  for (const p of points) {
    cov += (p.x - mx) * (p.y - my);
    varX += (p.x - mx) ** 2;
  }
  return varX === 0 ? 0 : cov / varX;
}

/** Standard logistic squash: ℝ → (0, 1). */
export function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Empirical-Bayes shrinkage: pull a small-sample estimate toward the
 * portfolio-wide prior. With n observations and prior strength k, the
 * posterior mean is (n·local + k·prior) / (n + k) — new customers inherit
 * the book's behaviour, established customers speak for themselves.
 */
export function shrink(local: number, n: number, prior: number, k: number): number {
  if (n <= 0) return prior;
  return (n * local + k * prior) / (n + k);
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
