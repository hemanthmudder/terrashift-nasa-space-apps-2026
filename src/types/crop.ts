/**
 * MEMBER 1 & MEMBER 5 — Structured Crop Database Contracts
 * TerraShift | NASA Space Apps Challenge 2026
 */

import { GrowingSeason, SoilType } from "./farm";

export type CropFamily =
  | "Poaceae"       // Cereals & Millets: Maize, Paddy, Ragi, Sorghum
  | "Fabaceae"      // Legumes / Pulses / Green Manure: Chickpea, Pigeon pea, Green gram, Black gram, Sunnhemp
  | "Asteraceae"    // Sunflower
  | "Pedaliaceae";  // Sesame

export type CropCategory =
  | "cereal"
  | "millet"
  | "pulse_legume"
  | "oilseed"
  | "green_manure";

export type WaterRequirementCategory = "very_low" | "low" | "moderate" | "high";

export type RootingDepthClass = "shallow_30_45cm" | "medium_45_90cm" | "deep_90_150cm";

export type NutrientRole =
  | "heavy_nitrogen_feeder"
  | "moderate_feeder"
  | "nitrogen_fixing_legume"
  | "green_manure_biomass_builder";

export interface CropSourceCitation {
  institution: string;
  title: string;
  url: string;
}

export interface CropProfile {
  id: string;
  name: string;
  kannadaName: string;
  scientificName: string;
  family: CropFamily;
  category: CropCategory;
  seasons: GrowingSeason[];
  duration: {
    minDays: number;
    maxDays: number;
    typicalDays: number;
  };
  waterRequirement: WaterRequirementCategory;
  rainfallRequirements: {
    minSeasonalMm: number;
    optimalMinMm: number;
    optimalMaxMm: number;
    maxTolerableMm: number;
    droughtTolerance: "low" | "moderate" | "high" | "very_high";
  };
  temperatureRange: {
    minC: number;
    optimalMinC: number;
    optimalMaxC: number;
    maxC: number;
  };
  soilPreferences: SoilType[];
  pHRange: {
    min: number;
    optimalMin: number;
    optimalMax: number;
    max: number;
    verified: boolean;
  };
  rootingDepth: RootingDepthClass;
  nutrientRole: NutrientRole;
  sowingWindows: Partial<Record<GrowingSeason, string>>;
  rotationCompatibility: {
    goodPredecessors: string[];
    goodSuccessors: string[];
    incompatiblePredecessors: string[];
    minGapSeasonsSameCrop: number;
  };
  managementBenefits: string[];
  constraints: string[];
  karnatakaZonesSuitability: string[];
  sources: CropSourceCitation[];
}
