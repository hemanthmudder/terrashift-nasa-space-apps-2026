/**
 * Calendar helpers for the pilot region. Story County is at 42° N, so the
 * Northern Hemisphere meteorological seasons apply. The growing season comes
 * from config/pilot_region.json (04-01 to 10-31).
 */

export type TemperateSeason = "spring" | "summer" | "autumn" | "winter";

export function hemisphereOf(lat: number): "northern" | "southern" {
  return lat < 0 ? "southern" : "northern";
}

/** Meteorological season (Northern: spring Mar–May … winter Dec–Feb; Southern shifted six months). */
export function temperateSeason(month: number, lat: number): TemperateSeason {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new RangeError("Month must be 1–12.");
  const north: TemperateSeason[] = ["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "autumn", "autumn", "autumn", "winter"];
  return north[hemisphereOf(lat) === "northern" ? month - 1 : (month + 5) % 12];
}

/** Months (1–12) that intersect a MM-DD to MM-DD window. */
export function monthsInGrowingSeason(startMmdd: string, endMmdd: string): number[] {
  const s = Number(startMmdd.slice(0, 2));
  const e = Number(endMmdd.slice(0, 2));
  const out: number[] = [];
  let m = s;
  for (let i = 0; i < 12; i++) {
    out.push(m);
    if (m === e) break;
    m = (m % 12) + 1;
  }
  return out;
}
