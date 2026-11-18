# TerraShift — Smarter Crop Rotations. Healthier Soil. Climate-Ready Farms.
**NASA Space Apps Challenge 2026 | Field Shift: Adapting Farms with NASA Data**

TerraShift is an evidence-based, full-stack agricultural decision-support platform designed for small and medium-scale farmers, Krishi Vigyan Kendra (KVK) extension workers, and agricultural researchers in **Karnataka, India** (featuring Davanagere, Tumakuru, Dharwad, Raichur, and Mandya agro-climatic zones).

## 1. Architecture Overview

- `src/types/`: Shared TypeScript contracts (`farm.ts`, `nasa.ts`, `crop.ts`, `recommendation.ts`).
- `src/data/`: 12-crop verified Karnataka database (`karnatakaCrops.ts`) and 5 agro-climatic pilot regions (`karnatakaRegions.ts`).
- `src/lib/`: NASA POWER Daily API v2 client (`nasa/powerClient.ts`), climate indicators (`climate/indicators.ts`), two-stage deterministic Crop Rotation Recommendation Engine (`rotation/engine.ts`), and input validator (`validation/farmValidator.ts`).
- `src/app/`: Next.js App Router pages (`/`, `/farm`, `/nasa-insights`, `/recommendations`, `/planner`, `/reports`) and Route Handlers (`/api/nasa`, `/api/farm`, `/api/recommendations`).
- `server.py` & `terrashift_engine.py`: 100% parity local Python 3.14 + Flask production server and verification engine.
- `tests/test_terrashift.py` & `src/tests/engine.test.ts`: Automated unit, integration, and 12-step end-to-end test suites.

## 2. NASA Earth Observation Sources

1. **NASA POWER Daily API v2 (Community: AG)**: Retrieves `T2M`, `T2M_MAX`, `T2M_MIN`, `PRECTOTCORR`, `RH2M`, `ALLSKY_SFC_SW_DWN`, `GWETTOP`, and `GWETROOT` at `0.5° × 0.625°` spatial resolution (`https://power.larc.nasa.gov/docs/services/api/temporal/daily/`).
2. **NASA GPM IMERG Final Run V07**: `0.1° × 0.1°` (~10 km) research-grade gauge-calibrated precipitation reference (`https://gpm.nasa.gov/data/imerg`).
3. **NASA SMAP & Terra/Aqua MODIS (`MOD13Q1`)**: Surface vs. root-zone soil wetness (`https://smap.jpl.nasa.gov/data/`) and 250m 16-day NDVI vegetation greenness disclosures (`https://lpdaac.usgs.gov/documents/621/MOD13_User_Guide_V61.pdf`).
