/**
 * Frontend farm model (global) and its mapping to the backend FarmProfile.
 *
 * The form accepts farms anywhere. Only fields the backend understands are
 * sent; everything else (country, elevation, farming method, crop history
 * dates) stays in the browser and is shown on the report as "not used by the
 * recommendation engine".
 */

import type { FarmProfile, IrrigationType, SoilType, WaterSourceType } from "../../types/farm";
import { CROP_MAP_BY_ID } from "../../data/crops/karnatakaCrops";
import { isValidLatitude, isValidLongitude } from "../geo/coverage";

export const OTHER = "other" as const;

export type FarmingMethod = "conventional" | "conservation" | "organic" | "mixed" | "unspecified";

export interface CropHistoryEntry {
  id: string;
  /** Free text, so farmers anywhere can record their crops. */
  cropName: string;
  plantingDate: string; // YYYY-MM-DD or ""
  harvestDate: string; // YYYY-MM-DD or ""
  irrigated: boolean | null;
}

export interface FarmDraft {
  farmName: string;
  country: string;
  region: string; // state / province / region
  locality: string; // district / locality
  latitude: string; // kept as strings while editing
  longitude: string;
  area: string;
  areaUnit: "hectares" | "acres";
  elevationM: string;
  irrigationType: IrrigationType;
  farmingMethod: FarmingMethod;
  /** One of the backend's soil classes, or "other" (not supported by the engine). */
  soilType: SoilType | typeof OTHER;
  soilPH: string;
  organicCarbonPercent: string;
  nitrogenKgHa: string;
  phosphorusKgHa: string;
  potassiumKgHa: string;
  /** Backend crop id, or "other". */
  previousCrop: string;
  cropHistory: CropHistoryEntry[];
}

export const EMPTY_DRAFT: FarmDraft = {
  farmName: "",
  country: "",
  region: "",
  locality: "",
  latitude: "",
  longitude: "",
  area: "",
  areaUnit: "hectares",
  elevationM: "",
  irrigationType: "rainfed",
  farmingMethod: "unspecified",
  soilType: OTHER,
  soilPH: "",
  organicCarbonPercent: "",
  nitrogenKgHa: "",
  phosphorusKgHa: "",
  potassiumKgHa: "",
  previousCrop: OTHER,
  cropHistory: [],
};

/** Soil classes the backend validator accepts (Karnataka soil groups). */
export const BACKEND_SOIL_TYPES: SoilType[] = [
  "red_sandy_loam",
  "red_loam",
  "black_cotton_clay",
  "lateritic",
  "alluvial_loam",
];

export const IRRIGATION_TYPES: IrrigationType[] = [
  "rainfed",
  "protective_lifesaving",
  "borewell_drip_sprinkler",
  "canal_command_assured",
];

/**
 * Water source sent with each irrigation type. The backend validator defaults
 * waterSource to borewell groundwater when omitted, which would be wrong for
 * rainfed farms, so it is set explicitly from the irrigation choice.
 */
const WATER_SOURCE_FOR: Record<IrrigationType, WaterSourceType> = {
  rainfed: "monsoon_only",
  protective_lifesaving: "farm_pond_harvested",
  borewell_drip_sprinkler: "borewell_groundwater",
  canal_command_assured: "canal_bhadra_tungabhadra",
};

/** Validation bounds copied from src/lib/validation/farmValidator.ts. */
export const SOIL_BOUNDS = {
  soilPH: { min: 3.5, max: 10 },
  organicCarbonPercent: { min: 0.05, max: 5 },
  nitrogenKgHa: { min: 10, max: 1200 },
  phosphorusKgHa: { min: 1, max: 300 },
  potassiumKgHa: { min: 10, max: 1500 },
} as const;

export type DraftErrors = Partial<Record<keyof FarmDraft | "cropHistory", string>>;

function parseOptional(value: string): number | null | "invalid" {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : "invalid";
}

/** Client-side validation with messages a farmer can act on. */
export function validateDraft(d: FarmDraft): DraftErrors {
  const e: DraftErrors = {};
  if (!d.country.trim()) e.country = "Enter the country where the farm is.";
  const lat = Number(d.latitude);
  const lon = Number(d.longitude);
  if (d.latitude.trim() === "" || !isValidLatitude(lat)) e.latitude = "Latitude must be a number from -90 to 90 (south is negative).";
  if (d.longitude.trim() === "" || !isValidLongitude(lon)) e.longitude = "Longitude must be a number from -180 to 180 (west is negative).";
  const area = Number(d.area);
  if (d.area.trim() === "" || !Number.isFinite(area) || area <= 0 || area > 50000) {
    e.area = "Farm area must be a positive number up to 50,000.";
  }
  const elev = parseOptional(d.elevationM);
  if (elev === "invalid" || (typeof elev === "number" && (elev < -450 || elev > 9000))) {
    e.elevationM = "Elevation must be a number of metres between -450 and 9,000, or left blank.";
  }
  for (const key of Object.keys(SOIL_BOUNDS) as Array<keyof typeof SOIL_BOUNDS>) {
    const v = parseOptional(d[key]);
    const { min, max } = SOIL_BOUNDS[key];
    if (v === "invalid" || (typeof v === "number" && (v < min || v > max))) {
      e[key] = `Enter a value from ${min} to ${max}, or leave blank if unknown.`;
    }
  }
  for (const h of d.cropHistory) {
    if (!h.cropName.trim()) {
      e.cropHistory = "Each crop history entry needs a crop name.";
      break;
    }
    if (h.plantingDate && h.harvestDate && h.harvestDate < h.plantingDate) {
      e.cropHistory = `Harvest date for ${h.cropName} is before its planting date.`;
      break;
    }
  }
  return e;
}

export interface BackendMapping {
  /** Present only if every backend-required field has a supported value. */
  profile: FarmProfile | null;
  /** Why the farm cannot be sent to the recommendation engine. */
  blockers: string[];
}

/** Builds the backend FarmProfile from a validated draft. */
export function toBackendProfile(d: FarmDraft, id?: string): BackendMapping {
  const blockers: string[] = [];
  if (d.soilType === OTHER) {
    blockers.push("Soil type is not one of the soil classes the recommendation engine supports.");
  }
  if (d.previousCrop === OTHER || !CROP_MAP_BY_ID[d.previousCrop]) {
    blockers.push("Previous crop is not in the recommendation engine's crop database.");
  }
  if (blockers.length) return { profile: null, blockers };

  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  return {
    blockers,
    profile: {
      id,
      farmName: d.farmName.trim() || undefined,
      district: d.locality.trim() || d.region.trim() || d.country.trim(),
      talukOrVillage: d.locality.trim() || undefined,
      state: d.region.trim() || d.country.trim(),
      latitude: Number(d.latitude),
      longitude: Number(d.longitude),
      area: Number(d.area),
      areaUnit: d.areaUnit,
      soilType: d.soilType as SoilType,
      soilPH: num(d.soilPH),
      organicCarbonPercent: num(d.organicCarbonPercent),
      nitrogenKgHa: num(d.nitrogenKgHa),
      phosphorusKgHa: num(d.phosphorusKgHa),
      potassiumKgHa: num(d.potassiumKgHa),
      drainage: "unknown",
      salinity: "unknown",
      previousCrop: d.previousCrop,
      previousCrops: [],
      irrigationType: d.irrigationType,
      waterSource: WATER_SOURCE_FOR[d.irrigationType],
      farmerPriority: "balanced_adaptation",
      preferredSeasons: ["kharif", "rabi", "summer"],
    },
  };
}

export function newHistoryEntry(): CropHistoryEntry {
  return {
    id: `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    cropName: "",
    plantingDate: "",
    harvestDate: "",
    irrigated: null,
  };
}
