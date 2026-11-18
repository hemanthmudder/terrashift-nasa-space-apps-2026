/**
 * MEMBER 5 — Core Two-Stage Deterministic Crop Rotation Recommendation Engine
 * Stage A: Crop Eligibility & Multi-Factor Suitability Evaluation (0-100 normalized)
 * Stage B: Multi-Season Rotation Sequence Generation, Sequence Penalties & Confidence Assessment
 * TerraShift | NASA Space Apps Challenge 2026
 */

import { FarmProfile, GrowingSeason } from "../../types/farm";
import { NASAEnvironmentalData } from "../../types/nasa";
import { CropProfile } from "../../types/crop";
import {
  ScoringWeights,
  CropSuitabilityEvaluation,
  RotationRecommendation,
  RotationSequenceStep,
  SequencePenaltyBreakdown,
  ConfidenceAssessment,
  RotationStrategyType,
} from "../../types/recommendation";
import { KARNATAKA_CROPS, CROP_MAP_BY_ID } from "../../data/crops/karnatakaCrops";
import { roundTo } from "../climate/indicators";

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  climateSuitability: 0.30,
  waterCompatibility: 0.25,
  soilManagement: 0.20,
  farmerPreference: 0.15,
  cropDiversity: 0.10,
};

/**
 * Maximum cumulative active crop duration (in days) across a 3-season annual cycle
 * to allow at least 50 days (3 x ~16-17 days) for harvest, residue incorporation, and seedbed preparation.
 */
export const MAX_FEASIBLE_ANNUAL_CROP_DAYS = 315;

export function normalizeWeights(weights?: Partial<ScoringWeights>): ScoringWeights {
  const merged: ScoringWeights = {
    climateSuitability: weights?.climateSuitability ?? DEFAULT_SCORING_WEIGHTS.climateSuitability,
    waterCompatibility: weights?.waterCompatibility ?? DEFAULT_SCORING_WEIGHTS.waterCompatibility,
    soilManagement: weights?.soilManagement ?? DEFAULT_SCORING_WEIGHTS.soilManagement,
    farmerPreference: weights?.farmerPreference ?? DEFAULT_SCORING_WEIGHTS.farmerPreference,
    cropDiversity: weights?.cropDiversity ?? DEFAULT_SCORING_WEIGHTS.cropDiversity,
  };
  const sum =
    merged.climateSuitability +
    merged.waterCompatibility +
    merged.soilManagement +
    merged.farmerPreference +
    merged.cropDiversity;
  if (sum <= 0) return { ...DEFAULT_SCORING_WEIGHTS };
  return {
    climateSuitability: roundTo(merged.climateSuitability / sum, 4),
    waterCompatibility: roundTo(merged.waterCompatibility / sum, 4),
    soilManagement: roundTo(merged.soilManagement / sum, 4),
    farmerPreference: roundTo(merged.farmerPreference / sum, 4),
    cropDiversity: roundTo(merged.cropDiversity / sum, 4),
  };
}

/**
 * STAGE A: Evaluate a single crop for a target season given farm profile and NASA climate data.
 * Never rejects a crop merely because optional soil test fields (pH, OC, NPK) are null/missing,
 * and never grants a perfect soil score when optional soil parameters are unverified.
 */
export function evaluateCropForSeason(
  crop: CropProfile,
  season: GrowingSeason,
  farm: FarmProfile,
  nasa: NASAEnvironmentalData,
  precedingCropId: string,
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS
): CropSuitabilityEvaluation {
  const hardViolations: string[] = [];
  const reasons: string[] = [];
  const cautions: string[] = [];

  if (!crop.seasons.includes(season)) {
    hardViolations.push(
      `${crop.name} is not agronomically recommended for the ${season.toUpperCase()} season in Karnataka.`
    );
  }

  const seasonalClimate = nasa.seasonalSummaries[season];
  if (
    crop.id === "paddy" &&
    farm.irrigationType === "rainfed" &&
    seasonalClimate.avgTotalRainMm < 800
  ) {
    hardViolations.push(
      `Paddy requires assured irrigation or >800 mm seasonal rainfall; historical ${season} rainfall is ${seasonalClimate.avgTotalRainMm} mm under rainfed conditions.`
    );
  }

  const seasonRain = seasonalClimate.avgTotalRainMm;
  const seasonTemp = seasonalClimate.avgMeanTempC;
  let rainScore = 75;

  const irrigationBoostMm =
    farm.irrigationType === "canal_command_assured"
      ? 450
      : farm.irrigationType === "borewell_drip_sprinkler"
      ? 250
      : farm.irrigationType === "protective_lifesaving"
      ? 120
      : 0;

  const effectiveMoistureMm = seasonRain + irrigationBoostMm;

  if (
    effectiveMoistureMm >= crop.rainfallRequirements.optimalMinMm &&
    effectiveMoistureMm <= crop.rainfallRequirements.optimalMaxMm
  ) {
    rainScore = 94;
    reasons.push(
      `Effective seasonal moisture (${roundTo(effectiveMoistureMm, 0)} mm including ${season} rainfall of ${seasonRain} mm) matches ${crop.name}'s optimal range (${crop.rainfallRequirements.optimalMinMm}–${crop.rainfallRequirements.optimalMaxMm} mm).`
    );
  } else if (effectiveMoistureMm >= crop.rainfallRequirements.minSeasonalMm) {
    rainScore = 76;
    cautions.push(
      `Seasonal moisture (${roundTo(effectiveMoistureMm, 0)} mm) is within tolerable bounds for ${crop.name} but outside peak optimal range (${crop.rainfallRequirements.optimalMinMm}–${crop.rainfallRequirements.optimalMaxMm} mm).`
    );
  } else {
    const deficitRatio = Math.max(
      0,
      effectiveMoistureMm / Math.max(1, crop.rainfallRequirements.minSeasonalMm)
    );
    rainScore = Math.round(30 + 35 * deficitRatio);
    cautions.push(
      `Historical ${season} rainfall (${seasonRain} mm) is below ${crop.name}'s minimum threshold (${crop.rainfallRequirements.minSeasonalMm} mm); life-saving irrigation or moisture conservation is needed.`
    );
  }

  let tempScore = 80;
  if (
    seasonTemp >= crop.temperatureRange.optimalMinC &&
    seasonTemp <= crop.temperatureRange.optimalMaxC
  ) {
    tempScore = 95;
  } else if (
    seasonTemp >= crop.temperatureRange.minC &&
    seasonTemp <= crop.temperatureRange.maxC
  ) {
    tempScore = 74;
  } else {
    tempScore = 45;
    cautions.push(
      `Mean ${season} temperature (${seasonTemp} °C) falls outside ${crop.name}'s preferred range (${crop.temperatureRange.optimalMinC}–${crop.temperatureRange.optimalMaxC} °C).`
    );
  }

  let drySpellAdj = 0;
  if (seasonalClimate.maxConsecutiveDryDays >= 14) {
    if (
      crop.rainfallRequirements.droughtTolerance === "very_high" ||
      crop.rainfallRequirements.droughtTolerance === "high"
    ) {
      drySpellAdj = 6;
      reasons.push(
        `High drought tolerance buffers against ${seasonalClimate.maxConsecutiveDryDays}-day historical dry spells.`
      );
    } else if (crop.rainfallRequirements.droughtTolerance === "low") {
      drySpellAdj = -14;
      cautions.push(
        `Low drought tolerance increases vulnerability to ${seasonalClimate.maxConsecutiveDryDays}-day dry spells.`
      );
    }
  }

  const climateScore = Math.max(
    15,
    Math.min(100, Math.round(rainScore * 0.6 + tempScore * 0.4 + drySpellAdj))
  );

  // Water Compatibility Score (0-100)
  let waterScore = 75;
  if (farm.irrigationType === "rainfed") {
    if (crop.waterRequirement === "very_low") waterScore = 95;
    else if (crop.waterRequirement === "low") waterScore = 88;
    else if (crop.waterRequirement === "moderate") waterScore = 64;
    else waterScore = 25;
  } else if (farm.irrigationType === "protective_lifesaving") {
    if (crop.waterRequirement === "very_low" || crop.waterRequirement === "low")
      waterScore = 94;
    else if (crop.waterRequirement === "moderate") waterScore = 80;
    else waterScore = 45;
  } else if (farm.irrigationType === "borewell_drip_sprinkler") {
    if (crop.waterRequirement === "high") waterScore = 62;
    else waterScore = 92;
  } else {
    waterScore = crop.waterRequirement === "high" ? 94 : 88;
  }

  if (seasonalClimate.rainVariabilityCvPercent >= 22 && crop.waterRequirement === "high") {
    waterScore = Math.max(20, waterScore - 15);
    cautions.push(
      `High inter-annual rainfall variability (CV ${seasonalClimate.rainVariabilityCvPercent}%) penalizes water-intensive cropping.`
    );
  }

  // Soil Compatibility & Management Score (0-100)
  // Base score for soil type alone is capped at 82 when pH/OC/NPK are unknown so missing data never becomes 100/100
  let soilScore = crop.soilPreferences.includes(farm.soilType) ? 82 : 52;
  if (crop.soilPreferences.includes(farm.soilType)) {
    reasons.push(
      `Compatible with farm's ${farm.soilType.replace(/_/g, " ")} soil profile.`
    );
  } else {
    cautions.push(
      `${crop.name} prefers ${crop.soilPreferences
        .map((s) => s.replace(/_/g, " "))
        .join(" or ")} rather than ${farm.soilType.replace(/_/g, " ")}.`
    );
  }

  if (farm.soilPH !== null && !Number.isNaN(farm.soilPH)) {
    if (
      farm.soilPH >= crop.pHRange.optimalMin &&
      farm.soilPH <= crop.pHRange.optimalMax
    ) {
      soilScore = Math.min(100, soilScore + 8);
      reasons.push(
        `Measured soil pH (${farm.soilPH}) is within ${crop.name}'s optimal range (${crop.pHRange.optimalMin}–${crop.pHRange.optimalMax}).`
      );
    } else if (farm.soilPH < crop.pHRange.min || farm.soilPH > crop.pHRange.max) {
      soilScore = Math.max(25, soilScore - 22);
      cautions.push(
        `Measured soil pH (${farm.soilPH}) is outside ${crop.name}'s tolerance range (${crop.pHRange.min}–${crop.pHRange.max}).`
      );
    }
  } else {
    cautions.push(
      `Soil pH is unverified; confirm that field pH falls within ${crop.pHRange.optimalMin}–${crop.pHRange.optimalMax} for ${crop.name}.`
    );
  }

  const lowOC =
    farm.organicCarbonPercent !== null && farm.organicCarbonPercent < 0.5;
  const lowN = farm.nitrogenKgHa !== null && farm.nitrogenKgHa < 280;
  if (
    (lowOC || lowN) &&
    (crop.nutrientRole === "nitrogen_fixing_legume" ||
      crop.nutrientRole === "green_manure_biomass_builder")
  ) {
    soilScore = Math.min(98, soilScore + 8);
    reasons.push(
      `Includes biological nitrogen fixation / biomass enrichment to address low measured soil organic carbon or nitrogen.`
    );
  }

  if (
    farm.drainage === "poor" &&
    ["pigeonpea", "sesame", "groundnut", "maize", "greengram", "sunnhemp"].includes(crop.id)
  ) {
    soilScore = Math.max(30, soilScore - 16);
    cautions.push(
      `${crop.name} is sensitive to poor soil drainage; raised-bed sowing or field drainage channels are required.`
    );
  }

  // Farmer Preference Alignment (0-100)
  let preferenceScore = 75;
  if (farm.farmerPriority === "water_conservation") {
    preferenceScore =
      crop.waterRequirement === "very_low"
        ? 96
        : crop.waterRequirement === "low"
        ? 90
        : crop.waterRequirement === "moderate"
        ? 65
        : 35;
  } else if (farm.farmerPriority === "soil_health_restoration") {
    preferenceScore =
      crop.nutrientRole === "green_manure_biomass_builder"
        ? 98
        : crop.nutrientRole === "nitrogen_fixing_legume"
        ? 92
        : 68;
  } else if (farm.farmerPriority === "drought_risk_reduction") {
    preferenceScore =
      crop.rainfallRequirements.droughtTolerance === "very_high"
        ? 96
        : crop.rainfallRequirements.droughtTolerance === "high"
        ? 88
        : 58;
  } else if (farm.farmerPriority === "pulse_oilseed_diversification") {
    preferenceScore =
      crop.category === "pulse_legume" || crop.category === "oilseed" ? 95 : 64;
  } else {
    preferenceScore = 84;
  }

  // Rotation Fit with Preceding Crop (0-100)
  const prevCrop = CROP_MAP_BY_ID[precedingCropId];
  let rotationFitScore = 75;
  if (prevCrop) {
    if (prevCrop.id === crop.id) {
      rotationFitScore = 25;
      cautions.push(
        `Repeating ${crop.name} consecutively increases pest, disease, and nutrient mining risk.`
      );
    } else if (prevCrop.family === crop.family) {
      rotationFitScore = 48;
      cautions.push(
        `Shares botanical family (${crop.family}) with preceding crop (${prevCrop.name}).`
      );
    } else {
      rotationFitScore = 92;
      if (
        prevCrop.nutrientRole === "heavy_nitrogen_feeder" &&
        (crop.nutrientRole === "nitrogen_fixing_legume" ||
          crop.nutrientRole === "green_manure_biomass_builder")
      ) {
        rotationFitScore = 98;
        reasons.push(
          `Follows heavy feeder (${prevCrop.name}) with a leguminous / soil-building crop (${crop.name}).`
        );
      } else if (prevCrop.rootingDepth !== crop.rootingDepth) {
        rotationFitScore = Math.min(98, rotationFitScore + 4);
        reasons.push(
          `Alternates rooting depth (${prevCrop.rootingDepth.replace(/_/g, " ")} -> ${crop.rootingDepth.replace(/_/g, " ")}) to utilize different soil strata.`
        );
      }
    }
  }

  const weightedScore = roundTo(
    climateScore * weights.climateSuitability +
      waterScore * weights.waterCompatibility +
      soilScore * weights.soilManagement +
      preferenceScore * weights.farmerPreference +
      rotationFitScore * weights.cropDiversity,
    1
  );

  return {
    cropId: crop.id,
    cropName: crop.name,
    kannadaName: crop.kannadaName,
    family: crop.family,
    season,
    eligible: hardViolations.length === 0,
    hardConstraintViolations: hardViolations,
    climateScore,
    waterScore,
    soilScore,
    preferenceScore,
    rotationFitScore,
    weightedScore: hardViolations.length === 0 ? weightedScore : Math.min(35, weightedScore),
    reasons,
    cautions,
  };
}

/**
 * Computes sequence-level penalties across a 3-season crop sequence, including:
 * - Monoculture penalty
 * - Repeated botanical family penalty
 * - Cumulative water overload penalty on rainfed farms
 * - Seasonal calendar overlap & cumulative turnaround duration (>315 days/yr) penalty
 */
export function evaluateSequencePenalties(
  cropIds: string[],
  seasons: GrowingSeason[],
  farm: FarmProfile
): SequencePenaltyBreakdown {
  let repeatedFamilyPenalty = 0;
  let waterOverloadPenalty = 0;
  let incompatibleTransitionPenalty = 0;
  let monoculturePenalty = 0;
  const notes: string[] = [];

  const fullChain = [farm.previousCrop, ...cropIds];
  for (let i = 1; i < fullChain.length; i++) {
    const prev = CROP_MAP_BY_ID[fullChain[i - 1]];
    const curr = CROP_MAP_BY_ID[fullChain[i]];
    if (!prev || !curr) continue;

    if (prev.id === curr.id) {
      monoculturePenalty += 15;
      notes.push(
        `Back-to-back monoculture penalty (-15 pts): ${curr.name} follows ${prev.name}.`
      );
    } else if (
      prev.family === curr.family &&
      !(prev.category === "green_manure" || curr.category === "green_manure")
    ) {
      repeatedFamilyPenalty += 8;
      notes.push(
        `Repeated ${curr.family} family transition (-8 pts): ${prev.name} -> ${curr.name}.`
      );
    }

    if (curr.rotationCompatibility.incompatiblePredecessors.includes(prev.id)) {
      incompatibleTransitionPenalty += 10;
      notes.push(
        `Agronomically discouraged transition (-10 pts): ${curr.name} immediately after ${prev.name}.`
      );
    }
  }

  // Check Kharif-to-Rabi sowing window overlap (e.g. 155-day Kharif Pigeon Pea harvesting Nov-Dec overlaps Oct-Nov Rabi sowing)
  const kharifCrop = CROP_MAP_BY_ID[cropIds[0]];
  const rabiCrop = CROP_MAP_BY_ID[cropIds[1]];
  if (kharifCrop && rabiCrop && kharifCrop.duration.typicalDays >= 140) {
    incompatibleTransitionPenalty += 10;
    notes.push(
      `Seasonal calendar overlap penalty (-10 pts): ${kharifCrop.name} (${kharifCrop.duration.typicalDays} days, harvesting Nov–Dec) overlaps the October–November Rabi sowing window for ${rabiCrop.name}.`
    );
  }

  // Check total annual active crop duration vs. required turnaround intervals (max 315 crop days per 365-day year)
  const totalDurationDays = cropIds.reduce(
    (acc, id) => acc + (CROP_MAP_BY_ID[id]?.duration.typicalDays ?? 100),
    0
  );
  if (totalDurationDays > MAX_FEASIBLE_ANNUAL_CROP_DAYS) {
    incompatibleTransitionPenalty += 12;
    notes.push(
      `Annual turnaround duration penalty (-12 pts): Cumulative crop duration (${totalDurationDays} days) exceeds ${MAX_FEASIBLE_ANNUAL_CROP_DAYS} days, leaving only ${365 - totalDurationDays} days across the year for 3 harvest and land-preparation turnarounds.`
    );
  }

  // Check cumulative water demand across the 3-season sequence
  const highModCount = cropIds.filter((id) => {
    const c = CROP_MAP_BY_ID[id];
    return c && (c.waterRequirement === "high" || c.waterRequirement === "moderate");
  }).length;

  if (farm.irrigationType === "rainfed" && highModCount >= 2) {
    waterOverloadPenalty += 12;
    notes.push(
      `Cumulative water demand penalty (-12 pts): ${highModCount} moderate/high-water crops scheduled on a rainfed farm.`
    );
  }

  cropIds.forEach((id, idx) => {
    const c = CROP_MAP_BY_ID[id];
    const s = seasons[idx];
    if (c && s && !c.seasons.includes(s)) {
      incompatibleTransitionPenalty += 14;
      notes.push(
        `Season mismatch penalty (-14 pts): ${c.name} is not suited for ${s.toUpperCase()}.`
      );
    }
  });

  const totalPenalty =
    repeatedFamilyPenalty +
    waterOverloadPenalty +
    incompatibleTransitionPenalty +
    monoculturePenalty;

  return {
    repeatedFamilyPenalty,
    waterOverloadPenalty,
    incompatibleTransitionPenalty,
    monoculturePenalty,
    totalPenalty,
    notes,
  };
}

/**
 * MISSING DATA & CONFIDENCE ASSESSMENT (Section 7.2 & 7.3)
 * High confidence strictly requires live NASA observations AND complete laboratory soil test parameters.
 * When live NASA retrieval is unavailable (illustrative demo dataset), confidence is capped at Moderate.
 */
export function computeConfidenceAssessment(
  farm: FarmProfile,
  nasa: NASAEnvironmentalData
): ConfidenceAssessment {
  const available: string[] = [];
  const missing: string[] = [];
  const reasons: string[] = [];
  const recommendations: string[] = [];

  let points = 36; // Base points for farm coordinates, soil type, irrigation, and previous crop

  available.push(
    `Farm coordinates (${farm.latitude.toFixed(3)}°N, ${farm.longitude.toFixed(3)}°E), soil type (${farm.soilType.replace(/_/g, " ")}), and irrigation regime (${farm.irrigationType.replace(/_/g, " ")}).`
  );

  if (nasa.isLiveRetrieval) {
    points += 24;
    available.push(
      `Live NASA POWER Daily Agroclimatology observations (${nasa.startDate}–${nasa.endDate}, ${nasa.qualityInformation.completenessPercent}% completeness).`
    );
  } else {
    points += 0;
    missing.push("Live NASA POWER API observation stream (currently using illustrative regional demonstration dataset).");
    reasons.push(
      "Live NASA POWER retrieval was unavailable; confidence is capped at Moderate because the climate indicators come from the illustrative demonstration baseline."
    );
  }

  const hasPH = farm.soilPH !== null && !Number.isNaN(farm.soilPH);
  if (hasPH) {
    points += 12;
    available.push(`Measured soil pH (${farm.soilPH}).`);
  } else {
    missing.push("Laboratory soil pH measurement.");
    recommendations.push(
      "Test soil pH at your local Krishi Vigyan Kendra (KVK) or Soil Health Card lab to verify acidity/alkalinity tolerance before sowing pulses or oilseeds."
    );
  }

  const hasOC =
    farm.organicCarbonPercent !== null && !Number.isNaN(farm.organicCarbonPercent);
  if (hasOC) {
    points += 10;
    available.push(`Soil Organic Carbon (${farm.organicCarbonPercent}%).`);
  } else {
    missing.push("Soil Organic Carbon (OC %) test value.");
    recommendations.push(
      "Measure Soil Organic Carbon (OC %) to calibrate farmyard manure (FYM) or green-manure biomass incorporation rates."
    );
  }

  const hasNPK =
    farm.nitrogenKgHa !== null &&
    farm.phosphorusKgHa !== null &&
    farm.potassiumKgHa !== null;
  if (hasNPK) {
    points += 13;
    available.push(
      `Available NPK test values (N: ${farm.nitrogenKgHa}, P: ${farm.phosphorusKgHa}, K: ${farm.potassiumKgHa} kg/ha).`
    );
  } else {
    missing.push("Available Nitrogen (N), Phosphorus (P), and Potassium (K) in kg/ha.");
    recommendations.push(
      "Obtain NPK values from a Government of India Soil Health Card (soilhealth.dac.gov.in) to adjust basal fertilizer dosages."
    );
  }

  reasons.push(
    "NASA POWER meteorological grids cover 0.5° × 0.625° (~55 km × 69 km); micro-topography and field-level drainage must be confirmed on-farm."
  );

  // Enforce strict confidence gating: High confidence requires BOTH live NASA data AND complete soil test (pH, OC, NPK)
  let level: "High confidence" | "Moderate confidence" | "Limited confidence";
  if (nasa.isLiveRetrieval && hasPH && hasOC && hasNPK && points >= 78) {
    level = "High confidence";
  } else if (points >= 55) {
    level = "Moderate confidence";
  } else {
    level = "Limited confidence";
  }

  if (missing.length > 0) {
    reasons.unshift(
      `${missing.length} soil or live-observation input(s) were unavailable or marked unknown.`
    );
  } else {
    reasons.unshift(
      "Complete laboratory soil profile (pH, Organic Carbon, NPK) and live multi-year NASA agroclimatology observations are present."
    );
  }

  return {
    level,
    scorePercent: Math.min(95, points),
    availableEvidenceItems: available,
    missingEvidenceItems: missing,
    reasons,
    verificationRecommendations: recommendations,
  };
}

export function buildRotationRecommendationForSequence(
  strategy: RotationStrategyType,
  cropIds: [string, string, string],
  seasons: [GrowingSeason, GrowingSeason, GrowingSeason],
  farm: FarmProfile,
  nasa: NASAEnvironmentalData,
  weightsInput?: Partial<ScoringWeights>
): RotationRecommendation {
  const weights = normalizeWeights(weightsInput);

  const strategyMeta: Record<
    RotationStrategyType,
    { title: string; kannadaTitle: string; subtitle: string; strategyWeights: ScoringWeights }
  > = {
    balanced: {
      title: "Strategy A — Balanced Climate & Soil Rotation",
      kannadaTitle: "ತಂತ್ರ A — ಸಮತೋಲಿತ ಹವಾಮಾನ ಮತ್ತು ಮಣ್ಣಿನ ಬೆಳೆ ಪರಿವರ್ತನೆ",
      subtitle:
        "Balances NASA seasonal climate suitability, water constraints, legume nitrogen management, and farmer objectives.",
      strategyWeights: weights,
    },
    water_conscious: {
      title: "Strategy B — Water-Conscious Drought-Resilient Rotation",
      kannadaTitle: "ತಂತ್ರ B — ನೀರು-ಉಳಿತಾಯ ಮತ್ತು ಬರ-ನಿರೋಧಕ ಬೆಳೆ ಪರಿವರ್ತನೆ",
      subtitle:
        "Prioritizes low-water-demand millets, pulses, and oilseeds resilient to mid-season dry spells and rainfall variability.",
      strategyWeights: normalizeWeights({
        climateSuitability: 0.28,
        waterCompatibility: 0.40,
        soilManagement: 0.14,
        farmerPreference: 0.10,
        cropDiversity: 0.08,
      }),
    },
    soil_improvement: {
      title: "Strategy C — Soil-Health & Legume Restoration Rotation",
      kannadaTitle: "ತಂತ್ರ C — ಮಣ್ಣಿನ ಆರೋಗ್ಯ ಮತ್ತು ದ್ವಿದಳ ಧಾನ್ಯ ಪುನಶ್ಚೇತನ ಪರಿವರ್ತನೆ",
      subtitle:
        "Prioritizes symbiotic nitrogen-fixing pulses, species-matched green manuring, root-depth alternation, and botanical family diversity.",
      strategyWeights: normalizeWeights({
        climateSuitability: 0.22,
        waterCompatibility: 0.18,
        soilManagement: 0.35,
        farmerPreference: 0.10,
        cropDiversity: 0.15,
      }),
    },
  };

  const meta = strategyMeta[strategy];
  const activeWeights =
    weightsInput && Object.keys(weightsInput).length > 0
      ? weights
      : meta.strategyWeights;

  const evaluations: CropSuitabilityEvaluation[] = [];
  const sequenceSteps: RotationSequenceStep[] = [];
  const evidenceMap = new Map<string, { institution: string; title: string; url: string }>();

  evidenceMap.set("https://power.larc.nasa.gov/docs/services/api/temporal/daily/", {
    institution: "NASA Langley Research Center",
    title: "NASA POWER Agroclimatology Daily API v2 (MERRA-2 / CERES)",
    url: "https://power.larc.nasa.gov/docs/services/api/temporal/daily/",
  });

  const seasonLabels: Record<GrowingSeason, string> = {
    kharif: "Season 1: Kharif (Jun–Sep)",
    rabi: "Season 2: Rabi (Oct–Jan)",
    summer: "Season 3: Summer / Pre-Kharif (Feb–May)",
  };

  const harvestLabels: Record<GrowingSeason, string> = {
    kharif: "September – October (15–20 day turnaround before Rabi sowing)",
    rabi: "January – February (15–20 day turnaround before Summer/Pre-Kharif)",
    summer: "April – May (Incorporate at 45–60 DAS if green manure, allowing 15 days decomposition)",
  };

  for (let i = 0; i < 3; i++) {
    const crop = CROP_MAP_BY_ID[cropIds[i]] || KARNATAKA_CROPS[0];
    const season = seasons[i];
    const prevId = i === 0 ? farm.previousCrop : cropIds[i - 1];
    const prevCrop = CROP_MAP_BY_ID[prevId];

    const evalResult = evaluateCropForSeason(
      crop,
      season,
      farm,
      nasa,
      prevId,
      activeWeights
    );
    evaluations.push(evalResult);

    for (const src of crop.sources) {
      evidenceMap.set(src.url, src);
    }

    const transitionNote = prevCrop
      ? prevCrop.family !== crop.family
        ? `Switches botanical family from ${prevCrop.family} (${prevCrop.name}) to ${crop.family} (${crop.name}), breaking pest/disease carryover and alternating ${prevCrop.rootingDepth.replace(/_/g, " ")} with ${crop.rootingDepth.replace(/_/g, " ")} roots.`
        : `Follows ${prevCrop.name} (${prevCrop.family}); monitor shared pests and apply soil-test-based organic amendments.`
      : `Initiates rotation sequence for ${season.toUpperCase()}.`;

    sequenceSteps.push({
      stepNumber: i + 1,
      yearOffset: 1,
      season,
      seasonLabel: seasonLabels[season],
      sowingWindow:
        crop.sowingWindows[season] || `${season.toUpperCase()} standard window`,
      harvestWindow: harvestLabels[season],
      cropId: crop.id,
      cropName: crop.name,
      kannadaName: crop.kannadaName,
      scientificName: crop.scientificName,
      family: crop.family,
      category: crop.category,
      durationDays: crop.duration.typicalDays,
      waterRequirement: crop.waterRequirement.replace(/_/g, " "),
      rootingDepth: crop.rootingDepth.replace(/_/g, " "),
      nutrientRole: crop.nutrientRole.replace(/_/g, " "),
      stepSuitabilityScore: evalResult.weightedScore,
      transitionNote,
      managementConsiderations: [
        ...crop.managementBenefits.slice(0, 1),
        ...crop.constraints.slice(0, 1),
      ],
      sourceUrl: crop.sources[0]?.url || "https://agritech.tnau.ac.in/",
    });
  }

  const uniqueFamilies = new Set(
    cropIds.map((id) => CROP_MAP_BY_ID[id]?.family).filter(Boolean)
  ).size;
  const hasLegume = cropIds.some(
    (id) => CROP_MAP_BY_ID[id]?.family === "Fabaceae"
  );
  const uniqueRootDepths = new Set(
    cropIds.map((id) => CROP_MAP_BY_ID[id]?.rootingDepth).filter(Boolean)
  ).size;

  const diversityScore = Math.min(
    100,
    Math.round(
      (uniqueFamilies / 3) * 45 +
        (hasLegume ? 35 : 0) +
        (uniqueRootDepths / 3) * 20
    )
  );

  const avgClimate = roundTo(
    evaluations.reduce((a, b) => a + b.climateScore, 0) / 3,
    1
  );
  const avgWater = roundTo(
    evaluations.reduce((a, b) => a + b.waterScore, 0) / 3,
    1
  );
  const avgSoil = roundTo(
    evaluations.reduce((a, b) => a + b.soilScore, 0) / 3,
    1
  );
  const avgPref = roundTo(
    evaluations.reduce((a, b) => a + b.preferenceScore, 0) / 3,
    1
  );

  const penalties = evaluateSequencePenalties(cropIds, seasons, farm);

  const rawWeighted =
    avgClimate * activeWeights.climateSuitability +
    avgWater * activeWeights.waterCompatibility +
    avgSoil * activeWeights.soilManagement +
    avgPref * activeWeights.farmerPreference +
    diversityScore * activeWeights.cropDiversity;

  const totalScore = Math.max(
    10,
    Math.min(100, roundTo(rawWeighted - penalties.totalPenalty, 1))
  );

  const confidence = computeConfidenceAssessment(farm, nasa);
  const prevCropName = CROP_MAP_BY_ID[farm.previousCrop]?.name || farm.previousCrop;
  const totalDurationDays = sequenceSteps.reduce((acc, s) => acc + s.durationDays, 0);

  const advantages: string[] = [
    `Breaks continuous ${prevCropName} cropping by rotating across ${uniqueFamilies} botanical families (${Array.from(
      new Set(sequenceSteps.map((s) => s.family))
    ).join(" → ")}) with ${totalDurationDays} active crop days (${365 - totalDurationDays} turnaround days/yr).`,
    hasLegume
      ? `Incorporates Fabaceae legume/green-manure crop(s) (${sequenceSteps
          .filter((s) => s.family === "Fabaceae")
          .map((s) => s.cropName)
          .join(", ")}) to support symbiotic Rhizobium nitrogen fixation and organic residue return.`
      : `Matches seasonal rainfall distribution (${nasa.seasonalSummaries.kharif.avgTotalRainMm} mm Kharif, ${nasa.seasonalSummaries.rabi.avgTotalRainMm} mm Rabi).`,
    `Alternates rooting depths (${sequenceSteps.map((s) => s.rootingDepth).join(" → ")}) to extract moisture and nutrients across multiple soil layers.`,
  ];

  const risks: string[] = [
    `Historical Kharif longest dry spell averages ${nasa.indicators.avgLongestKharifDrySpellDays} consecutive days (<2.5 mm/day); ${
      farm.irrigationType === "rainfed"
        ? "in-situ moisture conservation (compartment bunding / mulching) is critical during flowering, and the 3rd summer crop requires pre-monsoon showers (May) or protective irrigation."
        : "schedule protective irrigation during critical flowering and grain/pod-filling stages."
    }`,
    `Biological nitrogen fixation by legumes does NOT guarantee that all fixed nitrogen remains available to the succeeding crop; mineralization depends on soil moisture, temperature, and harvest residue management.`,
    ...penalties.notes,
  ];

  const missingSoilImprovements =
    confidence.missingEvidenceItems.length > 0
      ? confidence.verificationRecommendations
      : [
          "All primary soil test parameters (pH, Organic Carbon, Available N, P, K) were provided. Re-test soil once every 2–3 years under the Soil Health Card scheme.",
        ];

  const step3Text =
    sequenceSteps[2].cropId === "sunnhemp"
      ? "produces 13–15 t/ha of green biomass (Crotalaria juncea) within 45–60 DAS for in-situ incorporation on well-drained loamy soils before the next monsoon."
      : sequenceSteps[2].cropId === "dhaincha"
      ? "produces up to 25 t/ha of green biomass (Sesbania aculeata) within 45–60 DAS for clay/alkaline soil reclamation before the next monsoon."
      : "provides a short-duration, low-water catch crop before the next Kharif cycle.";

  const whyThisSequence = `Following ${prevCropName}, Step 1 (${sequenceSteps[0].cropName} in Kharif, ${sequenceSteps[0].durationDays}d) aligns with the ${nasa.seasonalSummaries.kharif.avgTotalRainMm} mm monsoon window and harvests by September–October. Step 2 (${sequenceSteps[1].cropName} in Rabi, ${sequenceSteps[1].durationDays}d) utilizes receding post-monsoon moisture (${nasa.seasonalSummaries.rabi.avgTotalRainMm} mm) while shifting botanical family. Step 3 (${sequenceSteps[2].cropName} in Summer/Pre-Kharif, ${sequenceSteps[2].durationDays}d) ${step3Text}`;

  const explanation = `This ${meta.title.toLowerCase()} achieves a multi-factor suitability score of ${totalScore}/100 under ${farm.irrigationType.replace(
    /_/g,
    " "
  )} conditions on ${farm.soilType.replace(
    /_/g,
    " "
  )} soil (${totalDurationDays} total crop days, leaving ${365 - totalDurationDays} days for inter-seasonal turnarounds). NASA POWER historical analysis (${nasa.startDate.slice(0, 4)}–${nasa.endDate.slice(
    0,
    4
  )}) indicates ${nasa.indicators.meanAnnualRainMm} mm mean annual rainfall with ${
    nasa.indicators.annualRainCvPercent
  }% inter-annual variability and ${
    nasa.indicators.avgLongestKharifDrySpellDays
  }-day average Kharif dry spells. Confirm local KVK sowing onset dates and soil test values before field implementation.`;

  const kannadaSummary = `${sequenceSteps
    .map((s) => s.kannadaName)
    .join(" → ")} ಬೆಳೆ ಪರಿವರ್ತನೆಯು ಮಣ್ಣಿನ ಫಲವತ್ತತೆ ಕಾಪಾಡಲು, ಕೀಟ-ರೋಗಗಳ ಚಕ್ರವನ್ನು ಮುರಿಯಲು ಮತ್ತು ${
    nasa.indicators.meanAnnualRainMm
  } ಮಿ.ಮೀ ವಾರ್ಷಿಕ ಮಳೆಯ ಹಂಚಿಕೆಗೆ ಹೊಂದಿಕೊಳ್ಳಲು ಸಹಾಯ ಮಾಡುತ್ತದೆ. ಬಿತ್ತನೆಗೆ ಮುನ್ನ ಸ್ಥಳೀಯ ರೈತ ಸಂಪರ್ಕ ಕೇಂದ್ರ ಅಥವಾ ಕೃಷಿ ವಿಜ್ಞಾನ ಕೇಂದ್ರದ (KVK) ಮಣ್ಣು ಪರೀಕ್ಷಾ ಶಿಫಾರಸುಗಳನ್ನು ದೃಢೀಕರಿಸಿ.`;

  return {
    id: `rot_${strategy}_${cropIds.join("_")}`,
    strategy,
    strategyTitle: meta.title,
    kannadaTitle: meta.kannadaTitle,
    strategySubtitle: meta.subtitle,
    crops: cropIds,
    seasons,
    sequenceSteps,
    totalDurationDays,
    climateScore: avgClimate,
    waterScore: avgWater,
    soilScore: avgSoil,
    preferenceScore: avgPref,
    diversityScore,
    penalties,
    totalScore,
    weightsUsed: activeWeights,
    confidence,
    waterCompatibilitySummary: `Water Score ${avgWater}/100 — tailored for ${farm.irrigationType.replace(
      /_/g,
      " "
    )} (${farm.waterSource.replace(/_/g, " ")}) with ${
      nasa.indicators.meanAnnualRainMm
    } mm annual rainfall.`,
    climateCompatibilitySummary: `Climate Score ${avgClimate}/100 — accounts for ${nasa.seasonalSummaries.kharif.avgMeanTempC}°C Kharif / ${nasa.seasonalSummaries.rabi.avgMeanTempC}°C Rabi temperatures and ${nasa.indicators.avgLongestKharifDrySpellDays}-day dry spells.`,
    soilCompatibilitySummary: `Soil Score ${avgSoil}/100 — matched to ${farm.soilType.replace(
      /_/g,
      " "
    )} soil${farm.soilPH !== null ? ` (pH ${farm.soilPH})` : " (pH unverified)"}.`,
    advantages,
    risks,
    whyThisSequence,
    explanation,
    kannadaSummary,
    missingSoilImprovements,
    evidenceSources: Array.from(evidenceMap.values()),
  };
}

/**
 * STAGE B: Generate three genuinely distinct, calendar-feasible crop-rotation strategies
 * (Balanced, Water-Conscious, Soil-Improvement-Focused) with <= 315 total crop days/yr.
 */
export function generateCropRotationRecommendations(
  farm: FarmProfile,
  nasa: NASAEnvironmentalData,
  customWeights?: Partial<ScoringWeights>
): {
  cropEvaluationsBySeason: Record<GrowingSeason, CropSuitabilityEvaluation[]>;
  recommendations: RotationRecommendation[];
} {
  const weights = normalizeWeights(customWeights);
  const seasons: [GrowingSeason, GrowingSeason, GrowingSeason] = [
    "kharif",
    "rabi",
    "summer",
  ];

  const cropEvaluationsBySeason: Record<GrowingSeason, CropSuitabilityEvaluation[]> = {
    kharif: KARNATAKA_CROPS.map((c) =>
      evaluateCropForSeason(c, "kharif", farm, nasa, farm.previousCrop, weights)
    ).sort((a, b) => b.weightedScore - a.weightedScore),
    rabi: KARNATAKA_CROPS.map((c) =>
      evaluateCropForSeason(c, "rabi", farm, nasa, farm.previousCrop, weights)
    ).sort((a, b) => b.weightedScore - a.weightedScore),
    summer: KARNATAKA_CROPS.map((c) =>
      evaluateCropForSeason(c, "summer", farm, nasa, farm.previousCrop, weights)
    ).sort((a, b) => b.weightedScore - a.weightedScore),
  };

  const prevCrop = CROP_MAP_BY_ID[farm.previousCrop] || CROP_MAP_BY_ID["maize"];
  const isPrevPoaceae = prevCrop.family === "Poaceae";
  const isBlackSoil = farm.soilType === "black_cotton_clay";
  const isWetOrAlkaline =
    isBlackSoil ||
    farm.soilType === "alluvial_loam" ||
    (farm.soilPH !== null && farm.soilPH >= 7.6);
  const greenManureId = isWetOrAlkaline ? "dhaincha" : "sunnhemp";
  const isAssuredWater =
    farm.irrigationType === "canal_command_assured" ||
    farm.irrigationType === "borewell_drip_sprinkler";

  // 1. BALANCED ROTATION (<= 295 days): Diversifies away from previous crop family while balancing yield stability, water, and soil health
  let balancedSeq: [string, string, string];
  if (isPrevPoaceae) {
    if (isBlackSoil) {
      balancedSeq = ["greengram", "sorghum", "sunflower"]; // 65 + 110 + 90 = 265d
    } else if (farm.previousCrop === "maize") {
      balancedSeq = ["groundnut", "ragi", "greengram"]; // 110 + 110 + 65 = 285d
    } else if (farm.previousCrop === "paddy" && isAssuredWater) {
      balancedSeq = ["blackgram", "ragi", "sesame"]; // 72 + 110 + 82 = 264d
    } else {
      balancedSeq = ["groundnut", "sunflower", "greengram"]; // 110 + 90 + 65 = 265d
    }
  } else {
    balancedSeq = isBlackSoil
      ? ["maize", "chickpea", "sunflower"] // 105 + 100 + 90 = 295d
      : ["ragi", "chickpea", "sesame"]; // 110 + 100 + 82 = 292d
  }

  // 2. WATER-CONSCIOUS ROTATION (<= 292 days): Strictly prioritizes low/very-low water requirement & drought-tolerant crops across 3 distinct families with zero calendar overlap
  let waterSeq: [string, string, string];
  if (isBlackSoil) {
    waterSeq = isPrevPoaceae
      ? ["sunflower", "chickpea", "sesame"] // 90 + 100 + 82 = 272d (Asteraceae -> Fabaceae -> Pedaliaceae)
      : ["sorghum", "chickpea", "sesame"]; // 110 + 100 + 82 = 292d (Poaceae -> Fabaceae -> Pedaliaceae)
  } else {
    waterSeq = isPrevPoaceae
      ? ["sunflower", "chickpea", "sesame"] // 90 + 100 + 82 = 272d (Asteraceae -> Fabaceae -> Pedaliaceae; all low/very_low water)
      : ["ragi", "chickpea", "sesame"]; // 110 + 100 + 82 = 292d
  }

  // 3. SOIL-IMPROVEMENT-FOCUSED ROTATION (<= 270 days): Prioritizes Fabaceae nitrogen fixation, root-depth alternation, and species-matched Sunnhemp (13-15 t/ha) or Dhaincha (25 t/ha) green manuring
  let soilSeq: [string, string, string];
  if (isPrevPoaceae) {
    soilSeq = isBlackSoil
      ? ["blackgram", "sorghum", greenManureId] // 72 + 110 + 50 = 232d
      : ["groundnut", "ragi", greenManureId]; // 110 + 110 + 50 = 270d
  } else {
    soilSeq = isBlackSoil
      ? ["sorghum", "chickpea", greenManureId] // 110 + 100 + 50 = 260d
      : ["ragi", "blackgram", greenManureId]; // 110 + 72 + 50 = 232d
  }

  const recommendations: RotationRecommendation[] = [
    buildRotationRecommendationForSequence(
      "balanced",
      balancedSeq,
      seasons,
      farm,
      nasa,
      customWeights
    ),
    buildRotationRecommendationForSequence(
      "water_conscious",
      waterSeq,
      seasons,
      farm,
      nasa,
      customWeights
    ),
    buildRotationRecommendationForSequence(
      "soil_improvement",
      soilSeq,
      seasons,
      farm,
      nasa,
      customWeights
    ),
  ];

  return { cropEvaluationsBySeason, recommendations };
}
