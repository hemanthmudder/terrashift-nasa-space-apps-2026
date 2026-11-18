/**
 * MEMBER 1 & MEMBER 4 — NASA Earth Observation Data Contracts
 * TerraShift | NASA Space Apps Challenge 2026
 */

export interface NASADailyObservation {
  date: string; // YYYY-MM-DD
  t2m: number | null; // Mean Temperature at 2 Meters (°C)
  t2mMax: number | null; // Max Temperature at 2 Meters (°C)
  t2mMin: number | null; // Min Temperature at 2 Meters (°C)
  precipMm: number | null; // PRECTOTCORR Corrected Precipitation (mm/day)
  rh2m: number | null; // Relative Humidity at 2 Meters (%)
  solarRadMjM2: number | null; // ALLSKY_SFC_SW_DWN (MJ/m²/day)
  surfaceSoilWetness: number | null; // GWETTOP (0-1 fraction)
  rootZoneSoilWetness: number | null; // GWETROOT (0-1 fraction)
}

export interface MonthlyClimateAggregate {
  month: number; // 1..12
  monthName: string;
  avgRainMm: number;
  avgTempC: number;
  avgMaxTempC: number;
  avgMinTempC: number;
  avgRhPercent: number;
  rainyDays: number;
  avgRootZoneWetness: number | null;
}

export interface SeasonalClimateSummary {
  season: "kharif" | "rabi" | "summer";
  label: string;
  monthsLabel: string;
  avgTotalRainMm: number;
  rainVariabilityCvPercent: number;
  avgMeanTempC: number;
  avgMaxTempC: number;
  avgMinTempC: number;
  maxConsecutiveDryDays: number;
  heatStressDaysAbove35C: number;
  avgRootZoneWetness: number | null;
}

export interface AnnualRainfallRecord {
  year: number;
  totalRainMm: number;
  kharifRainMm: number;
  rabiRainMm: number;
  summerRainMm: number;
  meanTempC: number;
  maxDrySpellDays: number;
}

export interface OptionalDatasetMetadata {
  datasetId: "GPM_IMERG" | "SMAP_L3_L4" | "MODIS_MOD13Q1";
  name: string;
  productCode: string;
  spatialResolution: string;
  temporalResolution: string;
  status: "integrated_via_merra2" | "optional_earthdata_credentials_required" | "climatology_reference";
  documentationUrl: string;
  scientificNote: string;
  limitations: string[];
}

export interface NASAEnvironmentalData {
  source: "NASA POWER Agroclimatology Archive (MERRA-2 / GEOS / CERES)";
  product: "NASA POWER Daily API v2 (Community: AG)";
  isLiveRetrieval: boolean;
  fallbackBannerMessage: string | null;
  latitude: number;
  longitude: number;
  startDate: string;
  endDate: string;
  retrievedAt: string;
  spatialResolution: string;
  units: {
    T2M: "°C";
    T2M_MAX: "°C";
    T2M_MIN: "°C";
    PRECTOTCORR: "mm/day";
    RH2M: "%";
    ALLSKY_SFC_SW_DWN: "MJ/m²/day";
    GWETTOP: "dimensionless (0-1 saturation fraction)";
    GWETROOT: "dimensionless (0-1 saturation fraction)";
  };
  observations: NASADailyObservation[];
  monthlyClimatology: MonthlyClimateAggregate[];
  seasonalSummaries: Record<"kharif" | "rabi" | "summer", SeasonalClimateSummary>;
  annualRecords: AnnualRainfallRecord[];
  indicators: {
    meanAnnualRainMm: number;
    annualRainCvPercent: number;
    meanAnnualTempC: number;
    maxTempTrendCPerYear: number;
    avgLongestKharifDrySpellDays: number;
    avgHeatStressDaysPerYear: number;
    meanSurfaceSoilWetness: number | null;
    meanRootZoneSoilWetness: number | null;
    droughtRiskClass: "Low" | "Moderate" | "High";
  };
  qualityInformation: {
    totalDaysRequested: number;
    validObservationDays: number;
    completenessPercent: number;
    missingValueCode: -999;
    spatialFootprintDisclaimer: string;
    sourceUrl: string;
  };
  secondaryDatasets: OptionalDatasetMetadata[];
}
