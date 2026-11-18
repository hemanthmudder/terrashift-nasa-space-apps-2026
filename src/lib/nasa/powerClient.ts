/**
 * MEMBER 4 — NASA POWER Daily API Integration & Fallback Resilience Service
 * Official endpoint: https://power.larc.nasa.gov/api/temporal/daily/point
 * TerraShift | NASA Space Apps Challenge 2026
 */

import {
  NASAEnvironmentalData,
  NASADailyObservation,
  OptionalDatasetMetadata,
} from "../../types/nasa";
import { KARNATAKA_PILOT_REGIONS, PilotRegionPreset } from "../../data/regions/karnatakaRegions";
import {
  computeMonthlyClimatology,
  computeAnnualAndSeasonalSummaries,
  calculateCoefficientOfVariation,
  roundTo,
} from "../climate/indicators";

const NASA_POWER_DAILY_ENDPOINT = "https://power.larc.nasa.gov/api/temporal/daily/point";
const MISSING_CODE = -999;

export const FALLBACK_BANNER_MESSAGE =
  "NASA data temporarily unavailable. The displayed demonstration dataset is illustrative and is not a live NASA observation.";

// In-memory server-side cache and in-flight deduplication map
const responseCache = new Map<string, { expiresAt: number; data: NASAEnvironmentalData }>();
const inFlightRequests = new Map<string, Promise<NASAEnvironmentalData>>();
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes

export const SECONDARY_NASA_DATASETS: OptionalDatasetMetadata[] = [
  {
    datasetId: "GPM_IMERG",
    name: "NASA GPM IMERG (Integrated Multi-satellitE Retrievals for GPM)",
    productCode: "GPM_3IMERGDF / GPM_3IMERGM (Final Run V07)",
    spatialResolution: "0.1° x 0.1° (~10 km x 10 km grid cell)",
    temporalResolution: "Half-hourly / Daily / Monthly Final Run (~3.5-month research latency)",
    status: "climatology_reference",
    documentationUrl: "https://gpm.nasa.gov/data/imerg",
    scientificNote:
      "For historical agricultural comparisons, GPM IMERG Final Run (gauge-calibrated with GPCC monthly surface rain gauges) is recommended over Early/Late low-latency runs.",
    limitations: [
      "Requires NASA Earthdata Login (URS) / PPS registration for direct HDF5/GeoTIFF granule downloads.",
      "A 10 km x 10 km satellite grid box averages convective rainfall over ~10,000 hectares and may differ from point rain-gauge totals on an individual 2-acre farm.",
    ],
  },
  {
    datasetId: "SMAP_L3_L4",
    name: "NASA SMAP / Goddard GEOS Land Data Assimilation Soil Moisture",
    productCode: "SPL3SMP_E (9 km Surface) / SPL4SMAU & MERRA-2 GWETTOP/GWETROOT",
    spatialResolution: "9 km EASE-Grid 2.0 (SMAP L3/L4) / 0.5° x 0.625° (MERRA-2 Assimilation)",
    temporalResolution: "Daily / 2-3 Day Revisit",
    status: "integrated_via_merra2",
    documentationUrl: "https://smap.jpl.nasa.gov/data/",
    scientificNote:
      "Surface wetness (GWETTOP, top 0–5 cm) responds rapidly to rainfall and evaporation, whereas Root-Zone Soil Wetness (GWETROOT, 0–100 cm profile) governs crop water availability during dry spells.",
    limitations: [
      "Assimilated soil wetness represents regional degree of saturation (0–1 fraction), NOT field-scale soil fertility, NPK status, or irrigation canal flow.",
      "Direct NSIDC DAAC SMAP granules require NASA Earthdata authentication; TerraShift integrates MERRA-2 assimilated GWETTOP & GWETROOT via NASA POWER AG.",
    ],
  },
  {
    datasetId: "MODIS_MOD13Q1",
    name: "NASA Terra/Aqua MODIS Vegetation Indices",
    productCode: "MOD13Q1 / MYD13Q1 Collection 6.1 (NDVI & EVI)",
    spatialResolution: "250 m x 250 m SIN Grid (~6.25 hectares per pixel)",
    temporalResolution: "16-Day Composite (phased 8-day Terra/Aqua)",
    status: "optional_earthdata_credentials_required",
    documentationUrl: "https://lpdaac.usgs.gov/documents/621/MOD13_User_Guide_V61.pdf",
    scientificNote:
      "NDVI/EVI measures canopy greenness and chlorophyll light absorption across seasons.",
    limitations: [
      "NDVI is NOT a direct measurement of soil fertility, crop yield, or specific crop identity.",
      "A 250 m pixel (6.25 ha) often spans multiple smallholder plots with mixed crops, field bund trees, and fallow patches.",
    ],
  },
];

function findNearestPilotPreset(latitude: number, longitude: number): PilotRegionPreset {
  let best = KARNATAKA_PILOT_REGIONS[0];
  let bestDist = Infinity;
  for (const region of KARNATAKA_PILOT_REGIONS) {
    const d = Math.hypot(region.latitude - latitude, region.longitude - longitude);
    if (d < bestDist) {
      bestDist = d;
      best = region;
    }
  }
  return best;
}

/**
 * Generates deterministic multi-year daily observations from the nearest regional agroclimatology
 * baseline ONLY when NASA POWER live API is unreachable, explicitly marked as non-live demo data.
 */
export function buildIllustrativeFallbackObservations(
  latitude: number,
  longitude: number,
  startYear = 2021,
  endYear = 2025
): NASADailyObservation[] {
  const preset = findNearestPilotPreset(latitude, longitude);
  const observations: NASADailyObservation[] = [];
  const daysInMonths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  const yearFactors: Record<number, { rainMult: number; tempOffset: number }> = {
    2021: { rainMult: 1.12, tempOffset: -0.2 },
    2022: { rainMult: 1.18, tempOffset: -0.1 },
    2023: { rainMult: 0.78, tempOffset: 0.45 },
    2024: { rainMult: 1.06, tempOffset: 0.35 },
    2025: { rainMult: 0.96, tempOffset: 0.40 },
  };

  for (let yr = startYear; yr <= endYear; yr++) {
    const yf = yearFactors[yr] ?? { rainMult: 1.0, tempOffset: 0.1 };
    const isLeap = (yr % 4 === 0 && yr % 100 !== 0) || yr % 400 === 0;

    for (let m = 1; m <= 12; m++) {
      const mBase = preset.illustrativeMonthlyBaseline[m - 1];
      const dim = m === 2 && isLeap ? 29 : daysInMonths[m - 1];
      const targetRain = mBase.rainMm * yf.rainMult;

      const rainyDayIndices = new Set<number>();
      const numRainEvents =
        targetRain < 10 ? 1 : targetRain < 45 ? 4 : targetRain < 95 ? 8 : 11;
      for (let e = 0; e < numRainEvents; e++) {
        const dayCandidate = ((e * 3 + (yr + m) % 5) % dim) + 1;
        rainyDayIndices.add(dayCandidate);
      }
      const actualEvents = Math.max(1, rainyDayIndices.size);

      for (let d = 1; d <= dim; d++) {
        const dateStr = `${yr}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const wave = Math.sin((d / dim) * Math.PI * 2 + m);
        const isRainDay = rainyDayIndices.has(d) && targetRain >= 2.0;
        const weight = 0.7 + 0.6 * Math.abs(Math.cos(d + m));
        const precipMm = isRainDay
          ? roundTo((targetRain / actualEvents) * weight, 1)
          : 0.0;

        const t2m = roundTo(mBase.t2m + yf.tempOffset + wave * 1.1, 1);
        const t2mMax = roundTo(
          mBase.t2mMax + yf.tempOffset + wave * 1.4 + (isRainDay ? -1.5 : 0.8),
          1
        );
        const t2mMin = roundTo(mBase.t2mMin + yf.tempOffset + wave * 0.8, 1);
        const rh2m = roundTo(
          Math.min(98, Math.max(22, mBase.rh2m + (isRainDay ? 12 : -4) * yf.rainMult)),
          1
        );
        const solarRad = roundTo(
          Math.max(8, mBase.solarRad + (isRainDay ? -4.2 : 1.1)),
          1
        );
        const gwettop = roundTo(
          Math.min(0.95, Math.max(0.12, mBase.gwettop * yf.rainMult + (isRainDay ? 0.08 : -0.02))),
          2
        );
        const gwetroot = roundTo(
          Math.min(0.92, Math.max(0.18, mBase.gwetroot * (0.85 + 0.15 * yf.rainMult))),
          2
        );

        observations.push({
          date: dateStr,
          t2m,
          t2mMax,
          t2mMin,
          precipMm,
          rh2m,
          solarRadMjM2: solarRad,
          surfaceSoilWetness: gwettop,
          rootZoneSoilWetness: gwetroot,
        });
      }
    }
  }
  return observations;
}

export function parseNASAPowerJsonToObservations(rawJson: any): NASADailyObservation[] {
  const paramBlock = rawJson?.properties?.parameter;
  if (!paramBlock || typeof paramBlock !== "object") {
    throw new Error("Malformed NASA POWER response: missing properties.parameter object");
  }

  const t2mMap = paramBlock.T2M || {};
  const t2mMaxMap = paramBlock.T2M_MAX || {};
  const t2mMinMap = paramBlock.T2M_MIN || {};
  const precipMap = paramBlock.PRECTOTCORR || {};
  const rhMap = paramBlock.RH2M || {};
  const solarMap = paramBlock.ALLSKY_SFC_SW_DWN || {};
  const gwetTopMap = paramBlock.GWETTOP || {};
  const gwetRootMap = paramBlock.GWETROOT || {};

  const allDates = Array.from(
    new Set([
      ...Object.keys(t2mMap),
      ...Object.keys(precipMap),
      ...Object.keys(t2mMaxMap),
    ])
  ).sort();

  const cleanVal = (val: unknown): number | null => {
    if (typeof val !== "number" || Number.isNaN(val) || val <= -990) return null;
    return roundTo(val, 2);
  };

  return allDates.map((yyyymmdd) => {
    const formattedDate =
      yyyymmdd.length === 8
        ? `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
        : yyyymmdd;
    return {
      date: formattedDate,
      t2m: cleanVal(t2mMap[yyyymmdd]),
      t2mMax: cleanVal(t2mMaxMap[yyyymmdd]),
      t2mMin: cleanVal(t2mMinMap[yyyymmdd]),
      precipMm: cleanVal(precipMap[yyyymmdd]),
      rh2m: cleanVal(rhMap[yyyymmdd]),
      solarRadMjM2: cleanVal(solarMap[yyyymmdd]),
      surfaceSoilWetness: cleanVal(gwetTopMap[yyyymmdd]),
      rootZoneSoilWetness: cleanVal(gwetRootMap[yyyymmdd]),
    };
  });
}

export function buildEnvironmentalDataFromObservations(
  latitude: number,
  longitude: number,
  startDate: string,
  endDate: string,
  observations: NASADailyObservation[],
  isLiveRetrieval: boolean,
  fallbackBannerMessage: string | null
): NASAEnvironmentalData {
  const monthlyClimatology = computeMonthlyClimatology(observations);
  const { annualRecords, seasonalSummaries } =
    computeAnnualAndSeasonalSummaries(observations);

  const annualRainTotals = annualRecords.map((r) => r.totalRainMm);
  const meanAnnualRainMm = annualRainTotals.length
    ? roundTo(annualRainTotals.reduce((a, b) => a + b, 0) / annualRainTotals.length, 1)
    : 0;
  const annualRainCvPercent = calculateCoefficientOfVariation(annualRainTotals);

  const validTemps = observations
    .map((o) => o.t2m)
    .filter((v): v is number => v !== null);
  const meanAnnualTempC = validTemps.length
    ? roundTo(validTemps.reduce((a, b) => a + b, 0) / validTemps.length, 1)
    : 0;

  // Compute linear regression slope (°C/year) over annual mean maximum temperatures (T2M_MAX)
  const byYearMax = new Map<number, number[]>();
  for (const o of observations) {
    if (o.t2mMax !== null) {
      const y = parseInt(o.date.slice(0, 4), 10);
      if (!byYearMax.has(y)) byYearMax.set(y, []);
      byYearMax.get(y)!.push(o.t2mMax);
    }
  }
  const annualMaxSeries = Array.from(byYearMax.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, vals]) => vals.reduce((a, b) => a + b, 0) / vals.length);

  let maxTempTrendCPerYear = 0.0;
  if (annualMaxSeries.length >= 2) {
    const n = annualMaxSeries.length;
    const xMean = (n - 1) / 2;
    const yMean = annualMaxSeries.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    annualMaxSeries.forEach((yVal, idx) => {
      num += (idx - xMean) * (yVal - yMean);
      den += Math.pow(idx - xMean, 2);
    });
    if (den > 0) maxTempTrendCPerYear = roundTo(num / den, 2);
  }

  const avgLongestKharifDrySpellDays = seasonalSummaries.kharif.maxConsecutiveDryDays;
  const avgHeatStressDaysPerYear = roundTo(
    seasonalSummaries.kharif.heatStressDaysAbove35C +
      seasonalSummaries.rabi.heatStressDaysAbove35C +
      seasonalSummaries.summer.heatStressDaysAbove35C,
    1
  );

  const surfWet = observations
    .map((o) => o.surfaceSoilWetness)
    .filter((v): v is number => v !== null);
  const rootWet = observations
    .map((o) => o.rootZoneSoilWetness)
    .filter((v): v is number => v !== null);

  const meanSurfaceSoilWetness = surfWet.length
    ? roundTo(surfWet.reduce((a, b) => a + b, 0) / surfWet.length, 2)
    : null;
  const meanRootZoneSoilWetness = rootWet.length
    ? roundTo(rootWet.reduce((a, b) => a + b, 0) / rootWet.length, 2)
    : null;

  const droughtRiskClass: "Low" | "Moderate" | "High" =
    meanAnnualRainMm < 650 || avgLongestKharifDrySpellDays >= 16 || annualRainCvPercent >= 22
      ? "High"
      : meanAnnualRainMm < 850 || avgLongestKharifDrySpellDays >= 11
      ? "Moderate"
      : "Low";

  const validDays = observations.filter(
    (o) => o.t2m !== null && o.precipMm !== null
  ).length;

  return {
    source: "NASA POWER Agroclimatology Archive (MERRA-2 / GEOS / CERES)",
    product: "NASA POWER Daily API v2 (Community: AG)",
    isLiveRetrieval,
    fallbackBannerMessage,
    latitude: roundTo(latitude, 4),
    longitude: roundTo(longitude, 4),
    startDate,
    endDate,
    retrievedAt: new Date().toISOString(),
    spatialResolution:
      "0.5° x 0.625° latitude/longitude (~55 km x 69 km MERRA-2 meteorological assimilation grid) & 1.0° x 1.0° CERES solar grid",
    units: {
      T2M: "°C",
      T2M_MAX: "°C",
      T2M_MIN: "°C",
      PRECTOTCORR: "mm/day",
      RH2M: "%",
      ALLSKY_SFC_SW_DWN: "MJ/m²/day",
      GWETTOP: "dimensionless (0-1 saturation fraction)",
      GWETROOT: "dimensionless (0-1 saturation fraction)",
    },
    observations,
    monthlyClimatology,
    seasonalSummaries,
    annualRecords,
    indicators: {
      meanAnnualRainMm,
      annualRainCvPercent,
      meanAnnualTempC,
      maxTempTrendCPerYear,
      avgLongestKharifDrySpellDays,
      avgHeatStressDaysPerYear,
      meanSurfaceSoilWetness,
      meanRootZoneSoilWetness,
      droughtRiskClass,
    },
    qualityInformation: {
      totalDaysRequested: observations.length,
      validObservationDays: validDays,
      completenessPercent: observations.length
        ? roundTo((validDays / observations.length) * 100, 1)
        : 0,
      missingValueCode: MISSING_CODE,
      spatialFootprintDisclaimer:
        "NASA POWER meteorological values (T2M, PRECTOTCORR, RH2M, GWETTOP, GWETROOT) are derived from the NASA GMAO MERRA-2 / GEOS assimilation model (0.5° x 0.625° grid, ~55 km x 69 km), and solar values (ALLSKY_SFC_SW_DWN) from CERES SYN1deg (1.0° x 1.0°). They represent regional reanalysis and satellite-assimilated averages rather than point measurements on an individual farm parcel. Always combine regional agroclimatology with local rain-gauge records and a laboratory Soil Health Card.",
      sourceUrl: "https://power.larc.nasa.gov/docs/services/api/temporal/daily/",
    },
    secondaryDatasets: SECONDARY_NASA_DATASETS,
  };
}

export async function fetchNASAPowerEnvironmentalData(
  latitude: number,
  longitude: number,
  startDate = "20210101",
  endDate = "20251231"
): Promise<NASAEnvironmentalData> {
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    Number.isNaN(latitude) ||
    Number.isNaN(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error("Invalid coordinates: latitude must be [-90, 90] and longitude [-180, 180].");
  }

  const cacheKey = `${latitude.toFixed(3)}_${longitude.toFixed(3)}_${startDate}_${endDate}`;
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey)!;
  }

  const promise = (async (): Promise<NASAEnvironmentalData> => {
    const params = [
      "T2M",
      "T2M_MAX",
      "T2M_MIN",
      "PRECTOTCORR",
      "RH2M",
      "ALLSKY_SFC_SW_DWN",
      "GWETTOP",
      "GWETROOT",
    ].join(",");

    const url = `${NASA_POWER_DAILY_ENDPOINT}?parameters=${params}&community=AG&longitude=${longitude}&latitude=${latitude}&start=${startDate}&end=${endDate}&time-standard=LST&format=JSON`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`NASA POWER HTTP status ${response.status}`);
      }

      const rawJson = await response.json();
      const observations = parseNASAPowerJsonToObservations(rawJson);
      if (!observations.length) {
        throw new Error("NASA POWER returned zero daily observations");
      }

      const envData = buildEnvironmentalDataFromObservations(
        latitude,
        longitude,
        startDate,
        endDate,
        observations,
        true,
        null
      );
      responseCache.set(cacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        data: envData,
      });
      return envData;
    } catch (err) {
      const startYr = parseInt(startDate.slice(0, 4), 10) || 2021;
      const endYr = parseInt(endDate.slice(0, 4), 10) || 2025;
      const fallbackObs = buildIllustrativeFallbackObservations(
        latitude,
        longitude,
        startYr,
        endYr
      );
      const envData = buildEnvironmentalDataFromObservations(
        latitude,
        longitude,
        startDate,
        endDate,
        fallbackObs,
        false,
        FALLBACK_BANNER_MESSAGE
      );
      return envData;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, promise);
  return promise;
}
