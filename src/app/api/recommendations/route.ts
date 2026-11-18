/**
 * MEMBER 5 — Next.js Server Route Handler: /api/recommendations
 * Evaluates farm profile + NASA environmental data and returns 3 explainable rotation strategies
 * plus custom sequence re-evaluation for the interactive Rotation Planner.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateFarmProfile } from "@/lib/validation/farmValidator";
import { fetchNASAPowerEnvironmentalData } from "@/lib/nasa/powerClient";
import {
  generateCropRotationRecommendations,
  buildRotationRecommendationForSequence,
} from "@/lib/rotation/engine";
import { GrowingSeason } from "@/types/farm";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const farmValidation = validateFarmProfile(body.farmProfile || body);
    if (!farmValidation.valid || !farmValidation.sanitized) {
      return NextResponse.json(
        { status: "error", errors: farmValidation.errors },
        { status: 400 }
      );
    }

    const farm = farmValidation.sanitized;
    const nasa =
      body.nasaData && body.nasaData.seasonalSummaries
        ? body.nasaData
        : await fetchNASAPowerEnvironmentalData(
            farm.latitude,
            farm.longitude,
            body.startDate || "20210101",
            body.endDate || "20251231"
          );

    const { cropEvaluationsBySeason, recommendations } =
      generateCropRotationRecommendations(farm, nasa, body.weights);

    let customSequenceEvaluation = null;
    if (Array.isArray(body.customSequence) && body.customSequence.length === 3) {
      const seasons: [GrowingSeason, GrowingSeason, GrowingSeason] = [
        "kharif",
        "rabi",
        "summer",
      ];
      customSequenceEvaluation = buildRotationRecommendationForSequence(
        "balanced",
        [body.customSequence[0], body.customSequence[1], body.customSequence[2]],
        seasons,
        farm,
        nasa,
        body.weights
      );
    }

    return NextResponse.json({
      status: "ok",
      farmProfile: farm,
      nasaData: nasa,
      nasaSummary: {
        isLiveRetrieval: nasa.isLiveRetrieval,
        fallbackBannerMessage: nasa.fallbackBannerMessage,
        meanAnnualRainMm: nasa.indicators.meanAnnualRainMm,
        annualRainCvPercent: nasa.indicators.annualRainCvPercent,
        avgLongestKharifDrySpellDays: nasa.indicators.avgLongestKharifDrySpellDays,
        droughtRiskClass: nasa.indicators.droughtRiskClass,
      },
      cropEvaluationsBySeason,
      recommendations,
      customSequenceEvaluation,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        status: "error",
        errors: [err?.message || "Failed to generate crop rotation recommendations."],
      },
      { status: 500 }
    );
  }
}
