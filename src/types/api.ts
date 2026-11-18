/**
 * Response contracts for the existing Next.js route handlers.
 *
 * These mirror what src/app/api/{nasa,farm,recommendations}/route.ts actually
 * return today. They describe the backend; they do not change it.
 */

import { FarmProfile, GrowingSeason } from "./farm";
import { NASAEnvironmentalData } from "./nasa";
import {
  CropSuitabilityEvaluation,
  RotationRecommendation,
  ScoringWeights,
} from "./recommendation";

/** GET /api/nasa — success body. */
export interface NasaRouteSuccess {
  status: "ok";
  data: NASAEnvironmentalData;
}

/** GET /api/nasa — error body (400 invalid coordinates, 500 failure). */
export interface NasaRouteError {
  error: string;
}

/** Query parameters accepted by GET /api/nasa. Dates are YYYYMMDD or YYYY-MM-DD. */
export interface NasaRequestParams {
  latitude: number;
  longitude: number;
  startDate?: string;
  endDate?: string;
}

/** GET /api/farm — in-memory list of profiles saved since server start. */
export interface FarmListRouteSuccess {
  status: "ok";
  profiles: FarmProfile[];
}

/** POST /api/farm — success body. */
export interface FarmSaveRouteSuccess {
  status: "ok";
  profile: FarmProfile;
}

/** Error body shared by POST /api/farm and POST /api/recommendations. */
export interface StatusErrorBody {
  status: "error";
  errors: string[];
}

/** POST /api/recommendations — request body. */
export interface RecommendationsRequestBody {
  farmProfile: FarmProfile;
  /** Optional: reuse NASA data already fetched (must include seasonalSummaries). */
  nasaData?: NASAEnvironmentalData;
  weights?: Partial<ScoringWeights>;
  /** Exactly three crop ids from the backend crop database, or omitted. */
  customSequence?: [string, string, string];
  startDate?: string;
  endDate?: string;
}

/** POST /api/recommendations — summary block built by the route. */
export interface NasaRouteSummary {
  isLiveRetrieval: boolean;
  fallbackBannerMessage: string | null;
  meanAnnualRainMm: number;
  annualRainCvPercent: number;
  avgLongestKharifDrySpellDays: number;
  droughtRiskClass: "Low" | "Moderate" | "High";
}

/** POST /api/recommendations — success body. */
export interface RecommendationsRouteSuccess {
  status: "ok";
  farmProfile: FarmProfile;
  nasaData: NASAEnvironmentalData;
  nasaSummary: NasaRouteSummary;
  cropEvaluationsBySeason: Record<GrowingSeason, CropSuitabilityEvaluation[]>;
  recommendations: RotationRecommendation[];
  customSequenceEvaluation: RotationRecommendation | null;
}
