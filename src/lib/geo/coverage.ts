/**
 * Location helpers: hemisphere, climate zone band, local seasons and whether a
 * farm falls inside the region the recommendation engine is calibrated for.
 *
 * Facts this relies on (from the existing backend, not new rules):
 * - NASA POWER climate data is global, so climate insights work anywhere.
 * - The rotation engine, crop database, soil classes and Kharif/Rabi/Zaid
 *   seasons are built only for Karnataka, India (5 pilot regions).
 * - When NASA POWER is unreachable, the backend's fallback data comes from the
 *   nearest Karnataka pilot region, wherever the farm is.
 */

import { KARNATAKA_PILOT_REGIONS } from "../../data/regions/karnatakaRegions";

export type Hemisphere = "northern" | "southern";
export type LatitudeBand = "tropical" | "subtropical_temperate" | "polar";

/** Tropic of Cancer / Capricorn latitude, degrees. */
export const TROPIC_LATITUDE = 23.44;
/** Arctic / Antarctic circle latitude, degrees. */
export const POLAR_CIRCLE_LATITUDE = 66.56;

/**
 * Approximate bounding box of Karnataka state (about 11.5–18.5° N,
 * 74.0–78.6° E). It is a rectangle, so it also covers small parts of
 * neighbouring states; it is used only to decide which UI messaging to show.
 */
export const KARNATAKA_BOUNDING_BOX = {
  minLat: 11.5,
  maxLat: 18.5,
  minLon: 74.0,
  maxLon: 78.6,
} as const;

export function isValidLatitude(lat: number): boolean {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

export function isValidLongitude(lon: number): boolean {
  return Number.isFinite(lon) && lon >= -180 && lon <= 180;
}

/** Hemisphere from latitude. The equator (0°) is treated as northern. */
export function getHemisphere(lat: number): Hemisphere {
  return lat < 0 ? "southern" : "northern";
}

export function getLatitudeBand(lat: number): LatitudeBand {
  const a = Math.abs(lat);
  if (a <= TROPIC_LATITUDE) return "tropical";
  if (a < POLAR_CIRCLE_LATITUDE) return "subtropical_temperate";
  return "polar";
}

/** Great-circle distance in kilometres (haversine, mean Earth radius 6371 km). */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface NearestPilotRegion {
  id: string;
  name: string;
  district: string;
  distanceKm: number;
}

export function findNearestPilotRegion(lat: number, lon: number): NearestPilotRegion {
  let best = KARNATAKA_PILOT_REGIONS[0];
  let bestKm = Infinity;
  for (const region of KARNATAKA_PILOT_REGIONS) {
    const km = distanceKm(lat, lon, region.latitude, region.longitude);
    if (km < bestKm) {
      bestKm = km;
      best = region;
    }
  }
  return { id: best.id, name: best.name, district: best.district, distanceKm: bestKm };
}

export type RecommendationCoverage = "calibrated_region" | "outside_calibrated_region";

export interface CoverageAssessment {
  hemisphere: Hemisphere;
  latitudeBand: LatitudeBand;
  /** NASA POWER climate data is global. */
  climateDataAvailable: true;
  recommendationCoverage: RecommendationCoverage;
  nearestPilotRegion: NearestPilotRegion;
}

export function isInsideKarnataka(lat: number, lon: number): boolean {
  const b = KARNATAKA_BOUNDING_BOX;
  return lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon;
}

export function assessCoverage(lat: number, lon: number): CoverageAssessment {
  if (!isValidLatitude(lat) || !isValidLongitude(lon)) {
    throw new RangeError("Latitude must be between -90 and 90 and longitude between -180 and 180.");
  }
  return {
    hemisphere: getHemisphere(lat),
    latitudeBand: getLatitudeBand(lat),
    climateDataAvailable: true,
    recommendationCoverage: isInsideKarnataka(lat, lon)
      ? "calibrated_region"
      : "outside_calibrated_region",
    nearestPilotRegion: findNearestPilotRegion(lat, lon),
  };
}

export type TemperateSeason = "spring" | "summer" | "autumn" | "winter";

/**
 * Meteorological season for a month (1–12) at a given latitude.
 * Northern: spring Mar–May, summer Jun–Aug, autumn Sep–Nov, winter Dec–Feb.
 * Southern: shifted by six months.
 * Returns null in the tropics, where seasons follow rainfall rather than
 * temperature and must come from local knowledge, not a fixed rule.
 */
export function getTemperateSeason(month: number, lat: number): TemperateSeason | null {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError("Month must be an integer from 1 to 12.");
  }
  if (getLatitudeBand(lat) === "tropical") return null;
  const northern: TemperateSeason[] = [
    "winter", "winter", "spring", "spring", "spring", "summer",
    "summer", "summer", "autumn", "autumn", "autumn", "winter",
  ];
  const idx = getHemisphere(lat) === "northern" ? month - 1 : (month + 5) % 12;
  return northern[idx];
}
