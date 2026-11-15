/**
 * Official pilot region, mirrored from the repository's config/pilot_region.json.
 * src/tests/region.test.ts fails if this copy drifts from the official file.
 */

export const PILOT_REGION = {
  id: "ia-story-19169",
  name: "Story County, Iowa",
  country: "United States",
  state: "IA",
  fips: "19169",
  ssurgoAreaSymbol: "IA169",
  internalPoint: {
    latitude: 42.0375,
    longitude: -93.4661,
    source: "US Census TIGERweb internal point (INTPTLAT/INTPTLON)",
  },
  landAreaKm2: 1482.88,
  climateStart: "1991-01-01",
  climateEnd: "2025-12-31",
  climateBaseline: "1991-2020",
  growingSeason: { startMmdd: "04-01", endMmdd: "10-31" },
} as const;

/** Where scripts/copy_data_to_frontend.sh publishes this region's datasets. */
export const DATA_BASE_PATH = `/data/${PILOT_REGION.id}`;

/** Expected published files and the pipeline step that produces each one. */
export const DATASETS = {
  climateDaily: {
    file: "climate_daily.csv",
    producedBy:
      "python3 -m src.pipeline.fetch_nasa_power, then python3 -m src.pipeline.clean_nasa_power <raw json>, then scripts/copy_data_to_frontend.sh",
  },
  environmentSummary: {
    file: "environment_summary.json",
    producedBy: "No pipeline step generates this file yet (contract: docs/METHODOLOGY.md §4.3).",
  },
  rotationComparison: {
    file: "rotation_comparison.json",
    producedBy:
      "No pipeline step generates this file yet; it needs the rotation engine (src/engine/rotation_engine.py, currently empty). Contract: docs/METHODOLOGY.md §4.4.",
  },
} as const;

export type DatasetKey = keyof typeof DATASETS;
