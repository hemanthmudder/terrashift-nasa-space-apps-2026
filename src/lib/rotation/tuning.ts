/**
 * Helpers for the two engine-tuning features restored from the original app
 * (commit 3cfd6d5): scoring-weight sliders and custom crop-sequence
 * evaluation. Both use existing /api/recommendations request fields
 * (`weights`, `customSequence`); the backend normalises weights itself.
 */

import type { ScoringWeights } from "../../types/recommendation";
import type { FarmProfile } from "../../types/farm";
import type { NASAEnvironmentalData } from "../../types/nasa";
import type { RecommendationsRequestBody } from "../../types/api";
import { CROP_MAP_BY_ID } from "../../data/crops/karnatakaCrops";
import { DEFAULT_SCORING_WEIGHTS } from "./engine";

export const DEFAULT_WEIGHTS: ScoringWeights = { ...DEFAULT_SCORING_WEIGHTS };

/** Slider order and labels, matching the original app. */
export const WEIGHT_FIELDS: ReadonlyArray<{ key: keyof ScoringWeights; label: string }> = [
  { key: "climateSuitability", label: "Climate" },
  { key: "waterCompatibility", label: "Water" },
  { key: "soilManagement", label: "Soil" },
  { key: "farmerPreference", label: "Preference" },
  { key: "cropDiversity", label: "Diversity" },
];

/** Slider range in percent, as in the original app. */
export const WEIGHT_MIN_PERCENT = 5;
export const WEIGHT_MAX_PERCENT = 60;

export type CustomSequence = [string, string, string];

/** Raw slider value (percent) for one weight. */
export function sliderPercent(weights: ScoringWeights, key: keyof ScoringWeights): number {
  return Math.round(weights[key] * 100);
}

/** Returns new weights with one slider changed; the value is clamped to the slider range. */
export function setSliderPercent(
  weights: ScoringWeights,
  key: keyof ScoringWeights,
  percent: number
): ScoringWeights {
  const p = Math.min(WEIGHT_MAX_PERCENT, Math.max(WEIGHT_MIN_PERCENT, Math.round(percent)));
  return { ...weights, [key]: p / 100 };
}

/**
 * Effective share of each weight after the backend's normalisation
 * (each weight divided by the total), as whole percentages for display.
 */
export function effectiveShares(weights: ScoringWeights): Record<keyof ScoringWeights, number> {
  const total = WEIGHT_FIELDS.reduce((s, f) => s + weights[f.key], 0);
  const out = {} as Record<keyof ScoringWeights, number>;
  for (const f of WEIGHT_FIELDS) out[f.key] = total > 0 ? Math.round((weights[f.key] / total) * 100) : 0;
  return out;
}

export function weightsEqual(a: ScoringWeights, b: ScoringWeights): boolean {
  return WEIGHT_FIELDS.every((f) => Math.abs(a[f.key] - b[f.key]) < 1e-9);
}

/** The route only evaluates a custom sequence of exactly three known crop ids. */
export function isValidCustomSequence(seq: unknown): seq is CustomSequence {
  return Array.isArray(seq) && seq.length === 3 && seq.every((id) => typeof id === "string" && Boolean(CROP_MAP_BY_ID[id]));
}

/** Builds the /api/recommendations body, omitting optional fields that are not set. */
export function buildRecommendationsRequest(
  farmProfile: FarmProfile,
  nasaData: NASAEnvironmentalData,
  weights: ScoringWeights,
  customSequence: CustomSequence | null
): RecommendationsRequestBody {
  const body: RecommendationsRequestBody = { farmProfile, nasaData, weights };
  if (isValidCustomSequence(customSequence)) body.customSequence = customSequence;
  return body;
}
