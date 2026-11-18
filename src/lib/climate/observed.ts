/**
 * Frontend summaries computed directly from NASA POWER daily observations.
 * Missing values (null) are skipped, never treated as zero; a metric with no
 * valid observations is returned as null.
 */

import type { MonthlyClimateAggregate, NASADailyObservation } from "../../types/nasa";

type NumericKey = Exclude<keyof NASADailyObservation, "date">;

export interface ObservedMean {
  mean: number | null;
  validDays: number;
}

export function meanOf(observations: NASADailyObservation[], key: NumericKey): ObservedMean {
  let sum = 0;
  let n = 0;
  for (const o of observations) {
    const v = o[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      sum += v;
      n += 1;
    }
  }
  return { mean: n ? sum / n : null, validDays: n };
}

/** Mean of yearly precipitation totals, counting only years with ≥ 90% valid days. */
export function meanAnnualPrecipitation(observations: NASADailyObservation[]): number | null {
  const byYear = new Map<string, { sum: number; valid: number; days: number }>();
  for (const o of observations) {
    const y = o.date.slice(0, 4);
    const rec = byYear.get(y) ?? { sum: 0, valid: 0, days: 0 };
    rec.days += 1;
    if (typeof o.precipMm === "number" && Number.isFinite(o.precipMm)) {
      rec.sum += o.precipMm;
      rec.valid += 1;
    }
    byYear.set(y, rec);
  }
  const totals = [...byYear.values()].filter((r) => r.days >= 365 && r.valid / r.days >= 0.9).map((r) => r.sum);
  return totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null;
}

export interface MonthlyPoint {
  month: number;
  label: string;
  rainMm: number | null;
  meanTempC: number | null;
  maxTempC: number | null;
  minTempC: number | null;
}

/**
 * Monthly climatology for charts. The backend's monthly aggregates are typed
 * as plain numbers, so a month without valid observations could arrive as 0;
 * such months are blanked here using the daily observation counts.
 */
export function monthlyChartData(
  monthly: MonthlyClimateAggregate[],
  observations: NASADailyObservation[]
): MonthlyPoint[] {
  const valid = Array.from({ length: 12 }, () => ({ rain: 0, t: 0, tmax: 0, tmin: 0 }));
  for (const o of observations) {
    const m = Number(o.date.slice(5, 7)) - 1;
    if (m < 0 || m > 11) continue;
    if (o.precipMm !== null) valid[m].rain += 1;
    if (o.t2m !== null) valid[m].t += 1;
    if (o.t2mMax !== null) valid[m].tmax += 1;
    if (o.t2mMin !== null) valid[m].tmin += 1;
  }
  return monthly.map((m) => {
    const v = valid[m.month - 1] ?? { rain: 0, t: 0, tmax: 0, tmin: 0 };
    return {
      month: m.month,
      label: m.monthName.slice(0, 3),
      rainMm: v.rain ? m.avgRainMm : null,
      meanTempC: v.t ? m.avgTempC : null,
      maxTempC: v.tmax ? m.avgMaxTempC : null,
      minTempC: v.tmin ? m.avgMinTempC : null,
    };
  });
}

/** Months from `start` to `end` inclusive (1–12), wrapping over the new year. */
export function monthSpan(start: number, end: number): number[] {
  const out: number[] = [];
  let cur = start;
  for (let i = 0; i < 12; i++) {
    out.push(cur);
    if (cur === end) break;
    cur = (cur % 12) + 1;
  }
  return out;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Months named in a backend window string such as "June–July (monsoon onset)"
 * or "October–January". A range covers every month between its ends,
 * wrapping over the new year. Returns [] when no month names are found.
 */
export function monthsInWindow(window: string): number[] {
  const found: number[] = [];
  const re = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(window)) !== null) found.push(MONTHS.indexOf(m[1].toLowerCase()) + 1);
  if (found.length === 0) return [];
  if (found.length === 1) return found;
  const start = found[0];
  const end = found[found.length - 1];
  const out: number[] = [];
  let cur = start;
  for (let i = 0; i < 12; i++) {
    out.push(cur);
    if (cur === end) break;
    cur = (cur % 12) + 1;
  }
  return out;
}
