/**
 * Summaries computed in the browser from climate_daily.csv.
 * Indicator definitions follow docs/METHODOLOGY.md §3. Missing values are
 * skipped (never treated as zero) and every result reports how many days
 * were missing so incomplete periods are visible.
 */

import type { ClimateRow, NumericColumn } from "./climate";

export interface Stat {
  value: number | null;
  validDays: number;
  totalDays: number;
}

export function mean(rows: ClimateRow[], col: NumericColumn): Stat {
  let sum = 0;
  let n = 0;
  for (const r of rows) {
    const v = r[col];
    if (v !== null) {
      sum += v;
      n += 1;
    }
  }
  return { value: n ? sum / n : null, validDays: n, totalDays: rows.length };
}

export function isInSeason(date: string, startMmdd: string, endMmdd: string): boolean {
  const md = date.slice(5);
  return startMmdd <= endMmdd ? md >= startMmdd && md <= endMmdd : md >= startMmdd || md <= endMmdd;
}

export interface SeasonSummary {
  year: number;
  days: number;
  missingDays: number; // days with any qc_flag other than "ok"
  gddC: number | null;
  precipMm: number | null;
  daysTmaxGe32: number | null;
  longestDrySpellDays: number | null;
  soilWetRootMean: number | null;
}

/** Sum that is null when any value is missing, so partial totals are never shown as complete. */
function completeSum(values: Array<number | null>): number | null {
  let s = 0;
  for (const v of values) {
    if (v === null) return null;
    s += v;
  }
  return s;
}

export function growingSeasonSummaries(rows: ClimateRow[], startMmdd: string, endMmdd: string): SeasonSummary[] {
  const byYear = new Map<number, ClimateRow[]>();
  for (const r of rows) {
    if (!isInSeason(r.date, startMmdd, endMmdd)) continue;
    const y = Number(r.date.slice(0, 4));
    const list = byYear.get(y) ?? [];
    list.push(r);
    byYear.set(y, list);
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, list]) => {
      const precip = list.map((r) => r.precip_mm);
      const tmax = list.map((r) => r.tmax_c);
      let longest = 0;
      let run = 0;
      let drySpellValid = true;
      for (const p of precip) {
        if (p === null) {
          drySpellValid = false;
          break;
        }
        run = p < 1 ? run + 1 : 0;
        longest = Math.max(longest, run);
      }
      return {
        year,
        days: list.length,
        missingDays: list.filter((r) => r.qcFlag !== "ok").length,
        gddC: completeSum(list.map((r) => r.gdd_c)),
        precipMm: completeSum(precip),
        daysTmaxGe32: tmax.some((t) => t === null) ? null : tmax.filter((t) => (t as number) >= 32).length,
        longestDrySpellDays: drySpellValid ? longest : null,
        soilWetRootMean: mean(list, "soil_wet_root").value,
      };
    });
}

/** Mean of a season metric over a year range, using only years where it is available. */
export function baselineMean(
  seasons: SeasonSummary[],
  key: "gddC" | "precipMm",
  fromYear: number,
  toYear: number
): { value: number | null; years: number } {
  const vals = seasons
    .filter((s) => s.year >= fromYear && s.year <= toYear)
    .map((s) => s[key])
    .filter((v): v is number => v !== null);
  return { value: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, years: vals.length };
}

export interface MonthlyPoint {
  month: number;
  precipMm: number | null; // mean monthly total
  tmaxC: number | null;
  tminC: number | null;
}

/** Monthly climatology: mean monthly precipitation total and mean daily max/min temperature. */
export function monthlyClimatology(rows: ClimateRow[]): MonthlyPoint[] {
  const totals = new Map<string, Array<number | null>>(); // "YYYY-MM" -> precip values
  const tmax = Array.from({ length: 12 }, () => ({ s: 0, n: 0 }));
  const tmin = Array.from({ length: 12 }, () => ({ s: 0, n: 0 }));
  for (const r of rows) {
    const ym = r.date.slice(0, 7);
    const m = Number(r.date.slice(5, 7)) - 1;
    const list = totals.get(ym) ?? [];
    list.push(r.precip_mm);
    totals.set(ym, list);
    if (r.tmax_c !== null) { tmax[m].s += r.tmax_c; tmax[m].n += 1; }
    if (r.tmin_c !== null) { tmin[m].s += r.tmin_c; tmin[m].n += 1; }
  }
  const monthTotals = Array.from({ length: 12 }, () => [] as number[]);
  for (const [ym, vals] of totals) {
    const t = completeSum(vals); // incomplete months are excluded, not zero-filled
    if (t !== null) monthTotals[Number(ym.slice(5, 7)) - 1].push(t);
  }
  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    precipMm: monthTotals[i].length ? monthTotals[i].reduce((a, b) => a + b, 0) / monthTotals[i].length : null,
    tmaxC: tmax[i].n ? tmax[i].s / tmax[i].n : null,
    tminC: tmin[i].n ? tmin[i].s / tmin[i].n : null,
  }));
}

export function qcCounts(rows: ClimateRow[]): Record<"ok" | "missing" | "out_of_range", number> {
  const c = { ok: 0, missing: 0, out_of_range: 0 };
  for (const r of rows) c[r.qcFlag] += 1;
  return c;
}
