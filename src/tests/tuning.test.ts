/**
 * Tests for the restored scoring-weight sliders and custom crop-sequence
 * evaluation. The request built by the frontend is passed through the real
 * backend validator and engine exactly as /api/recommendations does, using
 * the backend's own illustrative climate data (no network).
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_WEIGHTS,
  WEIGHT_MAX_PERCENT,
  WEIGHT_MIN_PERCENT,
  buildRecommendationsRequest,
  effectiveShares,
  isValidCustomSequence,
  setSliderPercent,
  sliderPercent,
  weightsEqual,
  type CustomSequence,
} from "../lib/rotation/tuning";
import { EMPTY_DRAFT, toBackendProfile } from "../lib/farm/draft";
import { validateFarmProfile } from "../lib/validation/farmValidator";
import {
  buildEnvironmentalDataFromObservations,
  buildIllustrativeFallbackObservations,
} from "../lib/nasa/powerClient";
import {
  buildRotationRecommendationForSequence,
  generateCropRotationRecommendations,
  normalizeWeights,
} from "../lib/rotation/engine";
import { getRecommendations } from "../lib/api/client";
import type { GrowingSeason } from "../types/farm";
import type { RecommendationsRequestBody } from "../types/api";

const LAT = 14.4644;
const LON = 75.9218;
const nasa = buildEnvironmentalDataFromObservations(
  LAT, LON, "20210101", "20251231",
  buildIllustrativeFallbackObservations(LAT, LON, 2021, 2025),
  false, "illustrative"
);
const { profile } = toBackendProfile({
  ...EMPTY_DRAFT,
  country: "India",
  region: "Karnataka",
  locality: "Davanagere",
  latitude: String(LAT),
  longitude: String(LON),
  area: "2",
  soilType: "red_sandy_loam",
  previousCrop: "maize",
  irrigationType: "protective_lifesaving",
});

/** Mirrors the handling in src/app/api/recommendations/route.ts. */
function runRouteLogic(body: RecommendationsRequestBody) {
  const v = validateFarmProfile(body.farmProfile);
  if (!v.valid || !v.sanitized) throw new Error(v.errors.join("; "));
  const { recommendations } = generateCropRotationRecommendations(v.sanitized, body.nasaData!, body.weights);
  let custom = null;
  if (Array.isArray(body.customSequence) && body.customSequence.length === 3) {
    const seasons: [GrowingSeason, GrowingSeason, GrowingSeason] = ["kharif", "rabi", "summer"];
    custom = buildRotationRecommendationForSequence(
      "balanced", [...body.customSequence] as [string, string, string], seasons, v.sanitized, body.nasaData!, body.weights
    );
  }
  return { recommendations, custom };
}

describe("scoring-weight sliders", () => {
  it("default sliders match the engine defaults (30/25/20/15/10)", () => {
    expect(effectiveShares(DEFAULT_WEIGHTS)).toEqual({
      climateSuitability: 30, waterCompatibility: 25, soilManagement: 20, farmerPreference: 15, cropDiversity: 10,
    });
    expect(sliderPercent(DEFAULT_WEIGHTS, "climateSuitability")).toBe(30);
  });

  it("clamps slider values to the original 5–60% range", () => {
    expect(setSliderPercent(DEFAULT_WEIGHTS, "cropDiversity", 99).cropDiversity).toBe(WEIGHT_MAX_PERCENT / 100);
    expect(setSliderPercent(DEFAULT_WEIGHTS, "cropDiversity", 0).cropDiversity).toBe(WEIGHT_MIN_PERCENT / 100);
    expect(setSliderPercent(DEFAULT_WEIGHTS, "cropDiversity", 22.6).cropDiversity).toBe(0.23);
  });

  it("shows the same shares the backend will normalise to", () => {
    const w = setSliderPercent(DEFAULT_WEIGHTS, "waterCompatibility", 60);
    const backend = normalizeWeights(w);
    const shares = effectiveShares(w);
    expect(shares.waterCompatibility).toBe(Math.round(backend.waterCompatibility * 100));
    expect(shares.climateSuitability).toBe(Math.round(backend.climateSuitability * 100));
  });

  it("detects unchanged weights", () => {
    expect(weightsEqual(DEFAULT_WEIGHTS, { ...DEFAULT_WEIGHTS })).toBe(true);
    expect(weightsEqual(DEFAULT_WEIGHTS, setSliderPercent(DEFAULT_WEIGHTS, "soilManagement", 50))).toBe(false);
  });

  it("changing weights changes the backend's scores", () => {
    expect(profile).not.toBeNull();
    const base = runRouteLogic(buildRecommendationsRequest(profile!, nasa, DEFAULT_WEIGHTS, null));
    const soilHeavy = runRouteLogic(
      buildRecommendationsRequest(profile!, nasa, setSliderPercent(setSliderPercent(DEFAULT_WEIGHTS, "soilManagement", 60), "climateSuitability", 5), null)
    );
    expect(base.recommendations).toHaveLength(3);
    expect(soilHeavy.recommendations[0].weightsUsed.soilManagement).toBeGreaterThan(base.recommendations[0].weightsUsed.soilManagement);
    const baseScores = base.recommendations.map((r) => r.totalScore).join(",");
    const newScores = soilHeavy.recommendations.map((r) => r.totalScore).join(",");
    expect(newScores).not.toBe(baseScores);
  });
});

describe("custom crop-sequence evaluation", () => {
  it("accepts only three known crop ids", () => {
    expect(isValidCustomSequence(["groundnut", "ragi", "greengram"])).toBe(true);
    expect(isValidCustomSequence(["groundnut", "ragi"])).toBe(false);
    expect(isValidCustomSequence(["groundnut", "ragi", "wheat"])).toBe(false);
    expect(isValidCustomSequence(null)).toBe(false);
  });

  it("only sends customSequence when it is valid", () => {
    const withSeq = buildRecommendationsRequest(profile!, nasa, DEFAULT_WEIGHTS, ["groundnut", "ragi", "greengram"]);
    expect(withSeq.customSequence).toEqual(["groundnut", "ragi", "greengram"]);
    expect(withSeq.weights).toEqual(DEFAULT_WEIGHTS);
    const without = buildRecommendationsRequest(profile!, nasa, DEFAULT_WEIGHTS, null);
    expect("customSequence" in without).toBe(false);
  });

  it("the backend evaluates exactly the chosen sequence", () => {
    const seq: CustomSequence = ["groundnut", "ragi", "greengram"];
    const { custom } = runRouteLogic(buildRecommendationsRequest(profile!, nasa, DEFAULT_WEIGHTS, seq));
    expect(custom).not.toBeNull();
    expect(custom!.crops.slice(0, 3)).toEqual(seq);
    expect(custom!.sequenceSteps.map((s) => s.cropId)).toEqual(seq);
    expect(custom!.totalScore).toBeGreaterThanOrEqual(0);
    expect(custom!.totalScore).toBeLessThanOrEqual(100);
  });

  it("a repeated-family sequence receives a penalty", () => {
    const repeated: CustomSequence = ["maize", "sorghum", "ragi"]; // all Poaceae
    const { custom } = runRouteLogic(buildRecommendationsRequest(profile!, nasa, DEFAULT_WEIGHTS, repeated));
    expect(custom!.penalties.repeatedFamilyPenalty).toBeGreaterThan(0);
    expect(custom!.penalties.notes.length).toBeGreaterThan(0);
  });

  it("the API client posts weights and customSequence unchanged", async () => {
    let sent: unknown = null;
    const body = buildRecommendationsRequest(profile!, nasa, setSliderPercent(DEFAULT_WEIGHTS, "cropDiversity", 40), ["groundnut", "ragi", "greengram"]);
    await getRecommendations(body, {
      fetchImpl: async (_url, init) => {
        sent = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ status: "ok", recommendations: [], customSequenceEvaluation: null }), { status: 200 });
      },
    });
    const s = sent as RecommendationsRequestBody;
    expect(s.weights?.cropDiversity).toBe(0.4);
    expect(s.customSequence).toEqual(["groundnut", "ragi", "greengram"]);
  });
});
