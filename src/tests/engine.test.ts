/**
 * MEMBER 6 — Unit, Regression & Integration Tests (Vitest / TypeScript)
 * Synchronized with tests/test_terrashift.py for Stage 2 Audit verification.
 */

import { describe, it, expect } from "vitest";
import {
  parseNASAPowerJsonToObservations,
  buildIllustrativeFallbackObservations,
  buildEnvironmentalDataFromObservations,
  FALLBACK_BANNER_MESSAGE,
} from "../lib/nasa/powerClient";
import {
  computeMonthlyClimatology,
  computeLongestDrySpell,
} from "../lib/climate/indicators";
import {
  evaluateCropForSeason,
  evaluateSequencePenalties,
  computeConfidenceAssessment,
  generateCropRotationRecommendations,
  normalizeWeights,
} from "../lib/rotation/engine";
import { CROP_MAP_BY_ID } from "../data/crops/karnatakaCrops";
import { FarmProfile } from "../types/farm";

const sampleFarm: FarmProfile = {
  id: "test_farm_davanagere",
  farmName: "Davanagere Test Plot",
  district: "Davanagere",
  talukOrVillage: "Harihar",
  state: "Karnataka",
  latitude: 14.4644,
  longitude: 75.9218,
  area: 4.5,
  areaUnit: "acres",
  soilType: "red_sandy_loam",
  soilPH: 6.4,
  organicCarbonPercent: 0.42,
  nitrogenKgHa: 215,
  phosphorusKgHa: 24,
  potassiumKgHa: 185,
  drainage: "moderate",
  salinity: "non_saline",
  previousCrop: "maize",
  previousCrops: [],
  irrigationType: "protective_lifesaving",
  waterSource: "borewell_groundwater",
  farmerPriority: "balanced_adaptation",
  preferredSeasons: ["kharif", "rabi", "summer"],
};

describe("TerraShift Stage 2 Audit & Regression Tests (TypeScript)", () => {
  it("parses NASA POWER JSON, filters -999 to null, and resets dry spells across missing days", () => {
    const raw = {
      properties: {
        parameter: {
          T2M: { "20240601": 26.0, "20240602": -999, "20240603": 27.0 },
          T2M_MAX: { "20240601": 31.0, "20240602": -999, "20240603": 32.0 },
          T2M_MIN: { "20240601": 21.0, "20240602": -999, "20240603": 22.0 },
          PRECTOTCORR: { "20240601": 0.0, "20240602": -999, "20240603": 0.0 },
          RH2M: { "20240601": 75.0, "20240602": -999, "20240603": 70.0 },
          ALLSKY_SFC_SW_DWN: { "20240601": 18.0, "20240602": -999, "20240603": 19.0 },
          GWETTOP: { "20240601": 0.55, "20240602": -999, "20240603": 0.50 },
          GWETROOT: { "20240601": 0.52, "20240602": -999, "20240603": 0.50 },
        },
      },
    };
    const parsed = parseNASAPowerJsonToObservations(raw);
    expect(parsed.length).toBe(3);
    expect(parsed[1].precipMm).toBeNull();
    expect(computeLongestDrySpell(parsed)).toBe(1);
  });

  it("separates Sunnhemp (Crotalaria juncea, 13-15 t/ha) and Dhaincha (Sesbania aculeata, 25 t/ha)", () => {
    expect(CROP_MAP_BY_ID["sunnhemp"].scientificName).toBe("Crotalaria juncea");
    expect(CROP_MAP_BY_ID["dhaincha"].scientificName).toBe("Sesbania aculeata");
    expect(CROP_MAP_BY_ID["sunnhemp"].managementBenefits.join(" ")).toContain("13–15 t/ha");
    expect(CROP_MAP_BY_ID["dhaincha"].managementBenefits.join(" ")).toContain("25 t/ha");
  });

  it("penalizes Kharif-to-Rabi seasonal overlap and >315-day annual turnaround overload", () => {
    const pen = evaluateSequencePenalties(
      ["pigeonpea", "ragi", "sesame"],
      ["kharif", "rabi", "summer"],
      sampleFarm
    );
    expect(pen.incompatibleTransitionPenalty).toBeGreaterThanOrEqual(22);
  });

  it("caps confidence at Moderate when NASA live retrieval is false, and grants High when live + complete soil", () => {
    const obs = buildIllustrativeFallbackObservations(14.4644, 75.9218, 2021, 2025);
    const offlineNasa = buildEnvironmentalDataFromObservations(
      14.4644,
      75.9218,
      "20210101",
      "20251231",
      obs,
      false,
      FALLBACK_BANNER_MESSAGE
    );
    const offlineConf = computeConfidenceAssessment(sampleFarm, offlineNasa);
    expect(offlineConf.level).toBe("Moderate confidence");

    const liveNasa = { ...offlineNasa, isLiveRetrieval: true, fallbackBannerMessage: null };
    const liveConf = computeConfidenceAssessment(sampleFarm, liveNasa);
    expect(liveConf.level).toBe("High confidence");
  });

  it("generates three distinct, calendar-feasible strategies (<=315 days, 0 penalties) for Davanagere", () => {
    const obs = buildIllustrativeFallbackObservations(14.4644, 75.9218, 2021, 2025);
    const nasa = buildEnvironmentalDataFromObservations(
      14.4644,
      75.9218,
      "20210101",
      "20251231",
      obs,
      false,
      FALLBACK_BANNER_MESSAGE
    );
    const { recommendations } = generateCropRotationRecommendations(sampleFarm, nasa);
    expect(recommendations.length).toBe(3);
    for (const r of recommendations) {
      expect(r.totalDurationDays).toBeLessThanOrEqual(315);
      expect(r.penalties.totalPenalty).toBe(0);
    }
  });
});
