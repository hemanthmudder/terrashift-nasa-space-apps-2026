/**
 * MEMBER 1 & MEMBER 3 — Farm Profile & Soil Input Validation
 * TerraShift | NASA Space Apps Challenge 2026
 */

import { FarmProfile } from "../../types/farm";
import { CROP_MAP_BY_ID } from "../../data/crops/karnatakaCrops";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitized?: FarmProfile;
}

const VALID_SOIL_TYPES = [
  "red_sandy_loam",
  "red_loam",
  "black_cotton_clay",
  "lateritic",
  "alluvial_loam",
];

const VALID_IRRIGATIONS = [
  "rainfed",
  "protective_lifesaving",
  "borewell_drip_sprinkler",
  "canal_command_assured",
];

export function validateFarmProfile(input: any): ValidationResult {
  const errors: string[] = [];

  if (!input || typeof input !== "object") {
    return { valid: false, errors: ["Request payload must be a valid JSON object."] };
  }

  const lat = Number(input.latitude);
  const lon = Number(input.longitude);
  if (Number.isNaN(lat) || lat < -90 || lat > 90) {
    errors.push("Latitude must be a valid coordinate between -90 and 90.");
  }
  if (Number.isNaN(lon) || lon < -180 || lon > 180) {
    errors.push("Longitude must be a valid coordinate between -180 and 180.");
  }

  const area = Number(input.area);
  if (Number.isNaN(area) || area <= 0 || area > 50000) {
    errors.push("Farm area must be a positive number between 0.1 and 50,000.");
  }

  if (!VALID_SOIL_TYPES.includes(input.soilType)) {
    errors.push(`Invalid soilType. Supported values: ${VALID_SOIL_TYPES.join(", ")}.`);
  }

  if (!VALID_IRRIGATIONS.includes(input.irrigationType)) {
    errors.push(`Invalid irrigationType. Supported values: ${VALID_IRRIGATIONS.join(", ")}.`);
  }

  if (!input.previousCrop || !CROP_MAP_BY_ID[input.previousCrop]) {
    errors.push("Please select a valid previous crop from the supported Karnataka crop database.");
  }

  const parseOptionalNumber = (
    val: unknown,
    fieldName: string,
    min: number,
    max: number
  ): number | null => {
    if (val === null || val === undefined || val === "" || val === "unknown") {
      return null;
    }
    const num = Number(val);
    if (Number.isNaN(num) || num < min || num > max) {
      errors.push(`${fieldName} must be between ${min} and ${max} (or left unknown).`);
      return null;
    }
    return num;
  };

  const soilPH = parseOptionalNumber(input.soilPH, "Soil pH", 3.5, 10.0);
  const organicCarbonPercent = parseOptionalNumber(
    input.organicCarbonPercent,
    "Organic Carbon (%)",
    0.05,
    5.0
  );
  const nitrogenKgHa = parseOptionalNumber(
    input.nitrogenKgHa,
    "Available Nitrogen (kg/ha)",
    10,
    1200
  );
  const phosphorusKgHa = parseOptionalNumber(
    input.phosphorusKgHa,
    "Available Phosphorus (kg/ha)",
    1,
    300
  );
  const potassiumKgHa = parseOptionalNumber(
    input.potassiumKgHa,
    "Available Potassium (kg/ha)",
    10,
    1500
  );

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const sanitized: FarmProfile = {
    id: input.id || `farm_${Date.now()}`,
    farmName: String(input.farmName || "Karnataka Pilot Farm").trim(),
    district: String(input.district || "Davanagere").trim(),
    talukOrVillage: String(input.talukOrVillage || "Harihar / Davanagere").trim(),
    state: String(input.state || "Karnataka").trim(),
    latitude: lat,
    longitude: lon,
    area,
    areaUnit: input.areaUnit === "hectares" ? "hectares" : "acres",
    soilType: input.soilType,
    soilPH,
    organicCarbonPercent,
    nitrogenKgHa,
    phosphorusKgHa,
    potassiumKgHa,
    soilMoisturePercent: parseOptionalNumber(
      input.soilMoisturePercent,
      "Soil Moisture (%)",
      1,
      100
    ),
    drainage: ["poor", "moderate", "well_drained", "unknown"].includes(input.drainage)
      ? input.drainage
      : "moderate",
    salinity: ["non_saline", "slightly_saline", "saline", "unknown"].includes(input.salinity)
      ? input.salinity
      : "non_saline",
    previousCrop: input.previousCrop,
    previousCrops: Array.isArray(input.previousCrops) ? input.previousCrops : [],
    irrigationType: input.irrigationType,
    waterSource: input.waterSource || "borewell_groundwater",
    farmerPriority: input.farmerPriority || "balanced_adaptation",
    preferredSeasons: Array.isArray(input.preferredSeasons) && input.preferredSeasons.length
      ? input.preferredSeasons
      : ["kharif", "rabi", "summer"],
    soilHealthCardUploaded: Boolean(input.soilHealthCardUploaded),
    updatedAt: new Date().toISOString(),
  };

  return { valid: true, errors: [], sanitized };
}
