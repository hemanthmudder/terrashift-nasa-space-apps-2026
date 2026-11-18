/**
 * MEMBER 1 & MEMBER 5 — Crop Rotation Recommendation & Scoring Contracts
 * TerraShift | NASA Space Apps Challenge 2026
 */

import { GrowingSeason } from "./farm";
import { CropSourceCitation } from "./crop";

export type RotationStrategyType =
  | "balanced"
  | "water_conscious"
  | "soil_improvement";

export type ConfidenceLevel = "High confidence" | "Moderate confidence" | "Limited confidence";

export interface ScoringWeights {
  climateSuitability: number; // default 0.30 (30%)
  waterCompatibility: number; // default 0.25 (25%)
  soilManagement: number;     // default 0.20 (20%)
  farmerPreference: number;   // default 0.15 (15%)
  cropDiversity: number;      // default 0.10 (10%)
}

export interface CropSuitabilityEvaluation {
  cropId: string;
  cropName: string;
  kannadaName: string;
  family: string;
  season: GrowingSeason;
  eligible: boolean;
  hardConstraintViolations: string[];
  climateScore: number;     // 0-100
  waterScore: number;       // 0-100
  soilScore: number;        // 0-100
  preferenceScore: number;  // 0-100
  rotationFitScore: number; // 0-100
  weightedScore: number;    // 0-100
  reasons: string[];
  cautions: string[];
}

export interface RotationSequenceStep {
  stepNumber: number;
  yearOffset: number;
  season: GrowingSeason;
  seasonLabel: string;
  sowingWindow: string;
  harvestWindow: string;
  cropId: string;
  cropName: string;
  kannadaName: string;
  scientificName: string;
  family: string;
  category: string;
  durationDays: number;
  waterRequirement: string;
  rootingDepth: string;
  nutrientRole: string;
  stepSuitabilityScore: number;
  transitionNote: string;
  managementConsiderations: string[];
  sourceUrl: string;
}

export interface SequencePenaltyBreakdown {
  repeatedFamilyPenalty: number;
  waterOverloadPenalty: number;
  incompatibleTransitionPenalty: number;
  monoculturePenalty: number;
  totalPenalty: number;
  notes: string[];
}

export interface ConfidenceAssessment {
  level: ConfidenceLevel;
  scorePercent: number;
  availableEvidenceItems: string[];
  missingEvidenceItems: string[];
  reasons: string[];
  verificationRecommendations: string[];
}

export interface RotationRecommendation {
  id: string;
  strategy: RotationStrategyType;
  strategyTitle: string;
  kannadaTitle: string;
  strategySubtitle: string;
  crops: string[];
  seasons: GrowingSeason[];
  sequenceSteps: RotationSequenceStep[];
  totalDurationDays: number;
  climateScore: number;     // 0-100
  waterScore: number;       // 0-100
  soilScore: number;        // 0-100
  preferenceScore: number;  // 0-100
  diversityScore: number;   // 0-100
  penalties: SequencePenaltyBreakdown;
  totalScore: number;       // 0-100
  weightsUsed: ScoringWeights;
  confidence: ConfidenceAssessment;
  waterCompatibilitySummary: string;
  climateCompatibilitySummary: string;
  soilCompatibilitySummary: string;
  advantages: string[];
  risks: string[];
  whyThisSequence: string;
  explanation: string;
  kannadaSummary: string;
  missingSoilImprovements: string[];
  evidenceSources: CropSourceCitation[];
}
