/**
 * MEMBER 1 & MEMBER 3 — Shared Farm & Soil Contracts
 * TerraShift | NASA Space Apps Challenge 2026
 */

export type AreaUnit = "acres" | "hectares";

export type SoilType =
  | "red_sandy_loam"      // Alfisols - Southern & Eastern Dry Zones, Davanagere
  | "red_loam"            // Mixed red loamy soils
  | "black_cotton_clay"   // Vertisols - Northern Dry Zone, parts of Davanagere/Dharwad
  | "lateritic"           // Coastal / Malnad & transitional zones
  | "alluvial_loam";      // River/command area alluvial soils (Bhadra command, Cauvery)

export type IrrigationType =
  | "rainfed"
  | "protective_lifesaving"
  | "borewell_drip_sprinkler"
  | "canal_command_assured";

export type WaterSourceType =
  | "monsoon_only"
  | "farm_pond_harvested"
  | "borewell_groundwater"
  | "canal_bhadra_tungabhadra"
  | "river_lift";

export type GrowingSeason = "kharif" | "rabi" | "summer";

export type FarmerPriority =
  | "balanced_adaptation"
  | "water_conservation"
  | "soil_health_restoration"
  | "drought_risk_reduction"
  | "pulse_oilseed_diversification";

export type DrainageCondition = "poor" | "moderate" | "well_drained" | "unknown";
export type SalinityStatus = "non_saline" | "slightly_saline" | "saline" | "unknown";

export interface PreviousCropEntry {
  season: GrowingSeason;
  year: number;
  cropId: string;
}

export interface FarmProfile {
  id?: string;
  farmName?: string;
  district: string;
  talukOrVillage?: string;
  state: string;
  latitude: number;
  longitude: number;
  area: number;
  areaUnit: AreaUnit;
  soilType: SoilType;
  /** Optional soil test values — null indicates unknown / not tested */
  soilPH: number | null;
  organicCarbonPercent: number | null;
  nitrogenKgHa: number | null;
  phosphorusKgHa: number | null;
  potassiumKgHa: number | null;
  soilMoisturePercent?: number | null;
  drainage: DrainageCondition;
  salinity: SalinityStatus;
  previousCrop: string;
  previousCrops: PreviousCropEntry[];
  irrigationType: IrrigationType;
  waterSource: WaterSourceType;
  farmerPriority: FarmerPriority;
  preferredSeasons: GrowingSeason[];
  soilHealthCardUploaded?: boolean;
  updatedAt?: string;
}
