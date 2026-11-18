/** Tests for the farm draft mapping and frontend climate helpers. */

import { describe, it, expect } from "vitest";
import { EMPTY_DRAFT, toBackendProfile, validateDraft, type FarmDraft } from "../lib/farm/draft";
import { validateFarmProfile } from "../lib/validation/farmValidator";
import { meanAnnualPrecipitation, meanOf, monthSpan, monthlyChartData, monthsInWindow } from "../lib/climate/observed";
import type { MonthlyClimateAggregate, NASADailyObservation } from "../types/nasa";

const karnataka: FarmDraft = {
  ...EMPTY_DRAFT,
  country: "India",
  region: "Karnataka",
  locality: "Davanagere",
  latitude: "14.4644",
  longitude: "75.9218",
  area: "2",
  soilType: "red_sandy_loam",
  previousCrop: "maize",
  soilPH: "6.4",
};

describe("draft validation", () => {
  it("accepts a complete farm and leaves unknown soil values blank", () => {
    expect(validateDraft(karnataka)).toEqual({});
  });

  it("explains invalid input", () => {
    const e = validateDraft({ ...EMPTY_DRAFT, latitude: "95", longitude: "abc", area: "0", soilPH: "14" });
    expect(e.country).toBeTruthy();
    expect(e.latitude).toMatch(/-90 to 90/);
    expect(e.longitude).toMatch(/-180 to 180/);
    expect(e.area).toBeTruthy();
    expect(e.soilPH).toMatch(/3.5 to 10/);
  });

  it("checks crop history dates", () => {
    const e = validateDraft({
      ...karnataka,
      cropHistory: [{ id: "1", cropName: "Maize", plantingDate: "2025-06-10", harvestDate: "2025-05-01", irrigated: null }],
    });
    expect(e.cropHistory).toMatch(/before its planting date/);
  });
});

describe("mapping to the backend FarmProfile", () => {
  it("produces a profile the real backend validator accepts", () => {
    const { profile, blockers } = toBackendProfile(karnataka);
    expect(blockers).toEqual([]);
    const result = validateFarmProfile(profile);
    expect(result.valid).toBe(true);
    expect(result.sanitized?.soilPH).toBe(6.4);
    expect(result.sanitized?.organicCarbonPercent).toBeNull(); // unknown stays null, not 0
    expect(result.sanitized?.waterSource).toBe("monsoon_only"); // rainfed, not the borewell default
  });

  it("blocks unsupported soil types and crops instead of guessing", () => {
    const { profile, blockers } = toBackendProfile({ ...karnataka, soilType: "other", previousCrop: "other" });
    expect(profile).toBeNull();
    expect(blockers).toHaveLength(2);
  });
});

const obs = (date: string, precipMm: number | null, t2m: number | null = 20): NASADailyObservation => ({
  date, t2m, t2mMax: t2m === null ? null : t2m + 5, t2mMin: t2m === null ? null : t2m - 5, precipMm,
  rh2m: 70, solarRadMjM2: 18, surfaceSoilWetness: null, rootZoneSoilWetness: 0.5,
});

describe("climate helpers", () => {
  it("skips missing values and returns null when nothing is valid", () => {
    const list = [obs("2024-01-01", 2), obs("2024-01-02", null), obs("2024-01-03", 4)];
    expect(meanOf(list, "precipMm")).toEqual({ mean: 3, validDays: 2 });
    expect(meanOf(list, "surfaceSoilWetness")).toEqual({ mean: null, validDays: 0 });
  });

  it("averages only complete years for annual rainfall", () => {
    const days: NASADailyObservation[] = [];
    for (let i = 0; i < 365; i++) days.push(obs(`2023-${String(Math.floor(i / 31) + 1).padStart(2, "0")}-01`, 1));
    days.push(obs("2024-01-01", 50)); // partial year ignored
    expect(meanAnnualPrecipitation(days)).toBe(365);
    expect(meanAnnualPrecipitation([obs("2024-01-01", 1)])).toBeNull();
  });

  it("blanks months with no valid observations instead of showing 0", () => {
    const monthly: MonthlyClimateAggregate[] = [
      { month: 1, monthName: "January", avgRainMm: 30, avgTempC: 20, avgMaxTempC: 25, avgMinTempC: 15, avgRhPercent: 70, rainyDays: 3, avgRootZoneWetness: 0.5 },
      { month: 2, monthName: "February", avgRainMm: 0, avgTempC: 0, avgMaxTempC: 0, avgMinTempC: 0, avgRhPercent: 0, rainyDays: 0, avgRootZoneWetness: null },
    ];
    const points = monthlyChartData(monthly, [obs("2024-01-05", 1), obs("2024-02-05", null, null)]);
    expect(points[0].rainMm).toBe(30);
    expect(points[1].rainMm).toBeNull();
    expect(points[1].maxTempC).toBeNull();
  });

  it("parses month windows from backend strings", () => {
    expect(monthsInWindow("June–July (Agro-climatic monsoon onset)")).toEqual([6, 7]);
    expect(monthsInWindow("October–January")).toEqual([10, 11, 12, 1]);
    expect(monthsInWindow("May end–June (with onset of monsoon)")).toEqual([5, 6]);
    expect(monthsInWindow("90–110 days after sowing")).toEqual([]);
    expect(monthSpan(11, 2)).toEqual([11, 12, 1, 2]);
  });
});
