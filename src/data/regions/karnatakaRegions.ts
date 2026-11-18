/**
 * MEMBER 3 & MEMBER 4 — Supported Pilot Regions in Karnataka
 * Includes Davanagere (Primary Pilot) + 5 distinct Agro-Climatic Zones across Karnataka.
 * TerraShift | NASA Space Apps Challenge 2026
 */

import { SoilType, IrrigationType, WaterSourceType } from "../../types/farm";

export interface PilotRegionPreset {
  id: string;
  name: string;
  kannadaName: string;
  district: string;
  agroClimaticZone: string;
  latitude: number;
  longitude: number;
  defaultSoilType: SoilType;
  typicalpH: number;
  typicalOC: number;
  typicalIrrigation: IrrigationType;
  typicalWaterSource: WaterSourceType;
  commonPreviousCrop: string;
  description: string;
  /**
   * Multi-year NASA POWER MERRA-2 historical monthly profile (mm rain, °C mean/max/min, % RH, root-zone wetness)
   * Used ONLY when live NASA POWER network retrieval is unreachable, with explicit UI banner disclosure.
   */
  illustrativeMonthlyBaseline: {
    month: number;
    rainMm: number;
    t2m: number;
    t2mMax: number;
    t2mMin: number;
    rh2m: number;
    solarRad: number;
    gwettop: number;
    gwetroot: number;
  }[];
}

export const KARNATAKA_PILOT_REGIONS: PilotRegionPreset[] = [
  {
    id: "davanagere",
    name: "Davanagere (Central Dry Zone / Bhadra Transitional)",
    kannadaName: "ದಾವಣಗೆರೆ (ಮಧ್ಯ ಶುಷ್ಕ ವಲಯ)",
    district: "Davanagere",
    agroClimaticZone: "Zone 4 — Central Dry Zone & Bhadra Command Fringe",
    latitude: 14.4644,
    longitude: 75.9218,
    defaultSoilType: "red_sandy_loam",
    typicalpH: 6.4,
    typicalOC: 0.42,
    typicalIrrigation: "protective_lifesaving",
    typicalWaterSource: "borewell_groundwater",
    commonPreviousCrop: "maize",
    description:
      "Primary pilot region in central Karnataka characterized by bimodal rainfall (May pre-monsoon and September peak), extensive Kharif maize and ragi cultivation, and declining organic carbon on continuous cereal plots.",
    illustrativeMonthlyBaseline: [
      { month: 1, rainMm: 2.1, t2m: 23.4, t2mMax: 30.2, t2mMin: 16.6, rh2m: 52, solarRad: 20.1, gwettop: 0.28, gwetroot: 0.36 },
      { month: 2, rainMm: 3.4, t2m: 25.8, t2mMax: 33.1, t2mMin: 18.5, rh2m: 45, solarRad: 22.3, gwettop: 0.24, gwetroot: 0.33 },
      { month: 3, rainMm: 11.2, t2m: 28.6, t2mMax: 36.0, t2mMin: 21.2, rh2m: 42, solarRad: 24.0, gwettop: 0.22, gwetroot: 0.30 },
      { month: 4, rainMm: 38.5, t2m: 29.9, t2mMax: 37.1, t2mMin: 22.8, rh2m: 51, solarRad: 23.8, gwettop: 0.31, gwetroot: 0.34 },
      { month: 5, rainMm: 86.4, t2m: 28.7, t2mMax: 35.2, t2mMin: 22.4, rh2m: 62, solarRad: 22.1, gwettop: 0.44, gwetroot: 0.42 },
      { month: 6, rainMm: 78.2, t2m: 25.6, t2mMax: 30.4, t2mMin: 21.3, rh2m: 75, solarRad: 17.5, gwettop: 0.56, gwetroot: 0.51 },
      { month: 7, rainMm: 94.6, t2m: 24.4, t2mMax: 28.6, t2mMin: 20.8, rh2m: 79, solarRad: 15.8, gwettop: 0.63, gwetroot: 0.58 },
      { month: 8, rainMm: 98.1, t2m: 24.3, t2mMax: 28.7, t2mMin: 20.5, rh2m: 79, solarRad: 16.4, gwettop: 0.65, gwetroot: 0.61 },
      { month: 9, rainMm: 132.5, t2m: 24.8, t2mMax: 29.8, t2mMin: 20.4, rh2m: 77, solarRad: 18.2, gwettop: 0.68, gwetroot: 0.64 },
      { month: 10, rainMm: 114.3, t2m: 24.7, t2mMax: 30.1, t2mMin: 19.6, rh2m: 73, solarRad: 18.9, gwettop: 0.61, gwetroot: 0.60 },
      { month: 11, rainMm: 31.8, t2m: 23.5, t2mMax: 29.3, t2mMin: 17.8, rh2m: 64, solarRad: 18.7, gwettop: 0.45, gwetroot: 0.50 },
      { month: 12, rainMm: 7.4, t2m: 22.6, t2mMax: 28.9, t2mMin: 16.2, rh2m: 57, solarRad: 18.9, gwettop: 0.34, gwetroot: 0.41 },
    ],
  },
  {
    id: "tumakuru",
    name: "Tumakuru (Central / Eastern Dry Zone)",
    kannadaName: "ತುಮಕೂರು (ಮಧ್ಯ / ಪೂರ್ವ ಶುಷ್ಕ ವಲಯ)",
    district: "Tumakuru",
    agroClimaticZone: "Zone 4 & 5 — Rainfed Ragi & Groundnut Belt",
    latitude: 13.3379,
    longitude: 77.1173,
    defaultSoilType: "red_sandy_loam",
    typicalpH: 6.1,
    typicalOC: 0.38,
    typicalIrrigation: "rainfed",
    typicalWaterSource: "monsoon_only",
    commonPreviousCrop: "ragi",
    description:
      "Rainfed red sandy loam (Alfisol) region dominated by finger millet (ragi), groundnut, and pigeon pea with pronounced September–October rainfall peak.",
    illustrativeMonthlyBaseline: [
      { month: 1, rainMm: 3.2, t2m: 22.1, t2mMax: 28.8, t2mMin: 15.4, rh2m: 55, solarRad: 20.4, gwettop: 0.27, gwetroot: 0.35 },
      { month: 2, rainMm: 5.1, t2m: 24.5, t2mMax: 31.6, t2mMin: 17.3, rh2m: 47, solarRad: 22.6, gwettop: 0.23, gwetroot: 0.32 },
      { month: 3, rainMm: 14.8, t2m: 27.3, t2mMax: 34.5, t2mMin: 20.0, rh2m: 44, solarRad: 24.2, gwettop: 0.22, gwetroot: 0.29 },
      { month: 4, rainMm: 46.2, t2m: 28.8, t2mMax: 35.6, t2mMin: 21.9, rh2m: 54, solarRad: 23.6, gwettop: 0.33, gwetroot: 0.35 },
      { month: 5, rainMm: 108.5, t2m: 27.6, t2mMax: 33.8, t2mMin: 21.5, rh2m: 65, solarRad: 21.8, gwettop: 0.48, gwetroot: 0.45 },
      { month: 6, rainMm: 68.4, t2m: 25.1, t2mMax: 30.1, t2mMin: 20.4, rh2m: 73, solarRad: 18.1, gwettop: 0.52, gwetroot: 0.49 },
      { month: 7, rainMm: 82.0, t2m: 24.2, t2mMax: 28.9, t2mMin: 19.9, rh2m: 76, solarRad: 16.9, gwettop: 0.57, gwetroot: 0.53 },
      { month: 8, rainMm: 112.4, t2m: 24.0, t2mMax: 28.7, t2mMin: 19.8, rh2m: 77, solarRad: 17.2, gwettop: 0.62, gwetroot: 0.58 },
      { month: 9, rainMm: 164.2, t2m: 24.3, t2mMax: 29.2, t2mMin: 19.7, rh2m: 78, solarRad: 18.4, gwettop: 0.69, gwetroot: 0.65 },
      { month: 10, rainMm: 142.6, t2m: 23.8, t2mMax: 28.8, t2mMin: 18.9, rh2m: 76, solarRad: 18.1, gwettop: 0.66, gwetroot: 0.63 },
      { month: 11, rainMm: 48.3, t2m: 22.4, t2mMax: 27.6, t2mMin: 17.2, rh2m: 69, solarRad: 17.9, gwettop: 0.49, gwetroot: 0.53 },
      { month: 12, rainMm: 11.5, t2m: 21.4, t2mMax: 27.2, t2mMin: 15.6, rh2m: 62, solarRad: 18.6, gwettop: 0.36, gwetroot: 0.43 },
    ],
  },
  {
    id: "dharwad",
    name: "Dharwad (Northern Transition Zone — Vertisols)",
    kannadaName: "ಧಾರವಾಡ (ಉತ್ತರ ಪರಿವರ್ತನಾ ವಲಯ)",
    district: "Dharwad",
    agroClimaticZone: "Zone 8 — Northern Transition Zone",
    latitude: 15.4589,
    longitude: 75.0078,
    defaultSoilType: "black_cotton_clay",
    typicalpH: 7.4,
    typicalOC: 0.54,
    typicalIrrigation: "protective_lifesaving",
    typicalWaterSource: "farm_pond_harvested",
    commonPreviousCrop: "sorghum",
    description:
      "Medium-to-deep black cotton soils (Vertisols) supporting Kharif greengram/groundnut/maize followed by Rabi sorghum and chickpea on conserved moisture.",
    illustrativeMonthlyBaseline: [
      { month: 1, rainMm: 1.5, t2m: 23.0, t2mMax: 30.4, t2mMin: 15.8, rh2m: 50, solarRad: 20.5, gwettop: 0.32, gwetroot: 0.42 },
      { month: 2, rainMm: 2.2, t2m: 25.4, t2mMax: 33.2, t2mMin: 17.6, rh2m: 43, solarRad: 22.8, gwettop: 0.27, gwetroot: 0.37 },
      { month: 3, rainMm: 9.8, t2m: 28.1, t2mMax: 36.1, t2mMin: 20.3, rh2m: 41, solarRad: 24.3, gwettop: 0.24, gwetroot: 0.33 },
      { month: 4, rainMm: 42.1, t2m: 29.4, t2mMax: 36.9, t2mMin: 22.0, rh2m: 52, solarRad: 23.9, gwettop: 0.34, gwetroot: 0.37 },
      { month: 5, rainMm: 78.6, t2m: 28.2, t2mMax: 34.8, t2mMin: 21.9, rh2m: 64, solarRad: 22.2, gwettop: 0.46, gwetroot: 0.45 },
      { month: 6, rainMm: 118.4, t2m: 24.9, t2mMax: 29.1, t2mMin: 21.1, rh2m: 80, solarRad: 16.5, gwettop: 0.64, gwetroot: 0.58 },
      { month: 7, rainMm: 154.2, t2m: 23.6, t2mMax: 27.2, t2mMin: 20.6, rh2m: 85, solarRad: 14.6, gwettop: 0.74, gwetroot: 0.69 },
      { month: 8, rainMm: 116.8, t2m: 23.5, t2mMax: 27.4, t2mMin: 20.3, rh2m: 84, solarRad: 15.5, gwettop: 0.72, gwetroot: 0.68 },
      { month: 9, rainMm: 124.0, t2m: 24.2, t2mMax: 28.9, t2mMin: 20.1, rh2m: 80, solarRad: 17.8, gwettop: 0.70, gwetroot: 0.67 },
      { month: 10, rainMm: 106.5, t2m: 24.6, t2mMax: 30.1, t2mMin: 19.3, rh2m: 72, solarRad: 19.1, gwettop: 0.63, gwetroot: 0.63 },
      { month: 11, rainMm: 26.4, t2m: 23.4, t2mMax: 29.6, t2mMin: 17.2, rh2m: 60, solarRad: 19.2, gwettop: 0.47, gwetroot: 0.54 },
      { month: 12, rainMm: 5.2, t2m: 22.5, t2mMax: 29.4, t2mMin: 15.6, rh2m: 54, solarRad: 19.4, gwettop: 0.37, gwetroot: 0.46 },
    ],
  },
  {
    id: "raichur",
    name: "Raichur (North Eastern Dry Zone — High Heat Stress)",
    kannadaName: "ರಾಯಚೂರು (ಈಶಾನ್ಯ ಶುಷ್ಕ ವಲಯ)",
    district: "Raichur",
    agroClimaticZone: "Zone 2 — North Eastern Dry Zone",
    latitude: 16.2076,
    longitude: 77.3463,
    defaultSoilType: "black_cotton_clay",
    typicalpH: 7.8,
    typicalOC: 0.39,
    typicalIrrigation: "rainfed",
    typicalWaterSource: "monsoon_only",
    commonPreviousCrop: "pigeonpea",
    description:
      "Semi-arid northern plain experiencing lower total rainfall (~620 mm), high summer/pre-monsoon temperatures (>38°C), and strong reliance on drought-hardy pigeon pea, sorghum, chickpea, and sunflower.",
    illustrativeMonthlyBaseline: [
      { month: 1, rainMm: 1.8, t2m: 24.6, t2mMax: 31.8, t2mMin: 17.5, rh2m: 46, solarRad: 20.8, gwettop: 0.25, gwetroot: 0.34 },
      { month: 2, rainMm: 2.5, t2m: 27.3, t2mMax: 34.9, t2mMin: 19.8, rh2m: 39, solarRad: 23.0, gwettop: 0.21, gwetroot: 0.30 },
      { month: 3, rainMm: 7.4, t2m: 30.6, t2mMax: 38.4, t2mMin: 22.9, rh2m: 35, solarRad: 24.6, gwettop: 0.18, gwetroot: 0.26 },
      { month: 4, rainMm: 21.6, t2m: 32.8, t2mMax: 40.3, t2mMin: 25.4, rh2m: 38, solarRad: 24.5, gwettop: 0.22, gwetroot: 0.27 },
      { month: 5, rainMm: 42.3, t2m: 32.4, t2mMax: 39.6, t2mMin: 25.6, rh2m: 45, solarRad: 23.4, gwettop: 0.29, gwetroot: 0.31 },
      { month: 6, rainMm: 84.5, t2m: 28.6, t2mMax: 34.1, t2mMin: 23.6, rh2m: 64, solarRad: 19.2, gwettop: 0.46, gwetroot: 0.43 },
      { month: 7, rainMm: 112.0, t2m: 26.9, t2mMax: 31.8, t2mMin: 22.6, rh2m: 71, solarRad: 17.4, gwettop: 0.55, gwetroot: 0.51 },
      { month: 8, rainMm: 118.4, t2m: 26.5, t2mMax: 31.4, t2mMin: 22.2, rh2m: 73, solarRad: 17.8, gwettop: 0.58, gwetroot: 0.55 },
      { month: 9, rainMm: 136.2, t2m: 26.6, t2mMax: 31.7, t2mMin: 22.0, rh2m: 73, solarRad: 18.8, gwettop: 0.62, gwetroot: 0.59 },
      { month: 10, rainMm: 78.4, t2m: 26.2, t2mMax: 31.8, t2mMin: 20.8, rh2m: 65, solarRad: 19.6, gwettop: 0.51, gwetroot: 0.53 },
      { month: 11, rainMm: 16.2, t2m: 24.6, t2mMax: 30.8, t2mMin: 18.4, rh2m: 55, solarRad: 19.5, gwettop: 0.37, gwetroot: 0.44 },
      { month: 12, rainMm: 3.4, t2m: 23.6, t2mMax: 30.4, t2mMin: 16.8, rh2m: 50, solarRad: 19.7, gwettop: 0.29, gwetroot: 0.38 },
    ],
  },
  {
    id: "mandya",
    name: "Mandya (Southern Dry Zone / Cauvery Command)",
    kannadaName: "ಮಂಡ್ಯ (ದಕ್ಷಿಣ ಶುಷ್ಕ ವಲಯ)",
    district: "Mandya",
    agroClimaticZone: "Zone 6 — Southern Dry Zone",
    latitude: 12.5218,
    longitude: 76.8951,
    defaultSoilType: "red_loam",
    typicalpH: 6.7,
    typicalOC: 0.48,
    typicalIrrigation: "canal_command_assured",
    typicalWaterSource: "canal_bhadra_tungabhadra",
    commonPreviousCrop: "paddy",
    description:
      "Southern Karnataka belt featuring canal-irrigated paddy and sugarcane alongside rainfed ragi, horsegram/pulses, sesame, and green manure rotations (VC Farm Mandya benchmark region).",
    illustrativeMonthlyBaseline: [
      { month: 1, rainMm: 3.8, t2m: 22.6, t2mMax: 29.4, t2mMin: 15.9, rh2m: 58, solarRad: 20.6, gwettop: 0.34, gwetroot: 0.42 },
      { month: 2, rainMm: 6.2, t2m: 24.8, t2mMax: 32.0, t2mMin: 17.6, rh2m: 51, solarRad: 22.7, gwettop: 0.30, gwetroot: 0.38 },
      { month: 3, rainMm: 18.4, t2m: 27.2, t2mMax: 34.6, t2mMin: 20.1, rh2m: 49, solarRad: 24.1, gwettop: 0.29, gwetroot: 0.35 },
      { month: 4, rainMm: 64.5, t2m: 28.1, t2mMax: 34.8, t2mMin: 21.6, rh2m: 60, solarRad: 23.2, gwettop: 0.42, gwetroot: 0.42 },
      { month: 5, rainMm: 128.0, t2m: 26.9, t2mMax: 32.8, t2mMin: 21.2, rh2m: 69, solarRad: 21.1, gwettop: 0.56, gwetroot: 0.52 },
      { month: 6, rainMm: 62.4, t2m: 24.8, t2mMax: 29.6, t2mMin: 20.3, rh2m: 75, solarRad: 18.0, gwettop: 0.54, gwetroot: 0.52 },
      { month: 7, rainMm: 71.2, t2m: 24.1, t2mMax: 28.6, t2mMin: 19.9, rh2m: 77, solarRad: 17.1, gwettop: 0.56, gwetroot: 0.54 },
      { month: 8, rainMm: 96.5, t2m: 24.1, t2mMax: 28.8, t2mMin: 19.8, rh2m: 77, solarRad: 17.6, gwettop: 0.61, gwetroot: 0.58 },
      { month: 9, rainMm: 148.6, t2m: 24.3, t2mMax: 29.3, t2mMin: 19.7, rh2m: 78, solarRad: 18.6, gwettop: 0.68, gwetroot: 0.64 },
      { month: 10, rainMm: 156.4, t2m: 23.9, t2mMax: 28.7, t2mMin: 19.2, rh2m: 79, solarRad: 17.9, gwettop: 0.70, gwetroot: 0.66 },
      { month: 11, rainMm: 54.2, t2m: 22.7, t2mMax: 27.8, t2mMin: 17.7, rh2m: 72, solarRad: 17.8, gwettop: 0.53, gwetroot: 0.57 },
      { month: 12, rainMm: 14.1, t2m: 21.8, t2mMax: 27.6, t2mMin: 16.1, rh2m: 65, solarRad: 18.8, gwettop: 0.40, gwetroot: 0.47 },
    ],
  },
];
