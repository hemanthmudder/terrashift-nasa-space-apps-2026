# TerraShift — NASA Space Apps Challenge 2026

**Smarter Crop Rotations. Healthier Soil. Climate-Ready Farms.**

TerraShift is a climate-informed crop rotation decision-support MVP. It combines NASA POWER daily climate data with seasonal indicators and crop rotation information for a pilot region in Story County, Iowa.

The current MVP focuses on transparent climate data processing and evidence-aware rotation comparison. It does not claim to predict crop yields or provide validated farm-specific recommendations.

## Pilot region

| Field | Value |
|---|---|
| Region | Story County, Iowa, United States |
| Region ID | `ia-story-19169` |
| County FIPS | `19169` |
| SSURGO survey area identifier | `IA169` |
| Internal point | `42.0375, -93.4661` |
| Climate period | 1991-01-01 to 2025-12-31 |
| Growing season | April 1 to October 31 |

The climate dataset represents a NASA POWER grid cell at the county's internal point, approximately 55 km in scale. It is not a collection of farm-level measurements.

## What the MVP currently does

- Fetches daily climate data from the NASA POWER API for the configured pilot region.
- Saves the original API response and request metadata.
- Cleans climate observations using documented quality-control rules.
- Calculates seasonal climate indicators, including precipitation, growing degree days and dry spells.
- Generates a comparison file describing the supported crop rotation cycles.
- Publishes processed datasets for the Next.js frontend.
- Displays climate insights, a crop calendar, rotation information and a printable pilot report.

## Application pages

- **Home:** Project overview and pilot entry point.
- **Pilot Region:** Pilot region details and available environmental summary.
- **Climate Insights:** Daily climate indicators, monthly patterns and seasonal summaries.
- **Crop Rotations:** Rotation cycles and evidence status.
- **Crop Calendar:** Growing-season calendar and rotation timeline.
- **Reports:** Printable pilot report, including an option to save as PDF through the browser.

## Architecture and data flow

```text
                 NASA POWER Daily API
                          |
                          v
             src/pipeline/fetch_nasa_power
                          |
                          v
                 data/raw/nasa_power
                          |
                          v
             src/pipeline/clean_nasa_power
                          |
                          v
              climate_daily.csv
                          |
              +-----------+-----------+
              |                       |
              v                       v
  build_environment_summary    rotation_engine
              |                       |
              v                       v
  environment_summary.json   rotation_comparison.json
              |                       |
              +-----------+-----------+
                          |
                          v
             scripts/copy_data_to_frontend.sh
                          |
                          v
             frontend/public/data/<region_id>
                          |
                          v
                 Next.js frontend
```

The frontend reads published local datasets. It does not fetch NASA data directly from the browser.

## Setup and run

### Prerequisites

- Python 3
- Node.js and npm
- Internet access when fetching NASA POWER data

Run the following commands from the repository root.

### 1. Install Python dependencies

```bash
python3 -m pip install -r requirements.txt
```

### 2. Fetch NASA POWER data

```bash
python3 -m src.pipeline.fetch_nasa_power
```

The fetch script reads the region, coordinates, parameters and analysis period from `config/pilot_region.json`.

For the current pilot configuration, the raw response is saved as:

```text
data/raw/nasa_power/ia-story-19169_daily_19910101_20251231.json
```

A companion `.request.json` file records request metadata, retrieval time, API version and SHA-256 checksum.

### 3. Clean the raw climate response

```bash
python3 -m src.pipeline.clean_nasa_power data/raw/nasa_power/ia-story-19169_daily_19910101_20251231.json
```

This creates:

```text
data/processed/ia-story-19169/climate_daily.csv
```

The cleaning process applies the documented data contract, preserves missing values as empty fields, and records quality flags. It does not interpolate or invent missing observations.

### 4. Generate the environmental summary

```bash
python3 -m src.pipeline.build_environment_summary
```

This creates:

```text
data/processed/ia-story-19169/environment_summary.json
```

The current summary is derived from the processed climate dataset.

### 5. Generate the rotation comparison

```bash
python3 -m src.engine.rotation_engine
```

This creates:

```text
data/processed/ia-story-19169/rotation_comparison.json
```

### 6. Publish data to the frontend

```bash
bash scripts/copy_data_to_frontend.sh
```

The script copies available processed files into:

```text
frontend/public/data/ia-story-19169/
```

It checks the climate CSV header against the expected data contract. Missing or invalid files are reported rather than silently replaced with sample data.

### 7. Install frontend dependencies and start the app

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Validation

Backend tests:

```bash
python3 -m pytest -q
```

Frontend tests, type checking and production build:

```bash
cd frontend
npm test
npm run typecheck
npm run build
```

To run the production server after a successful build:

```bash
npm start
```

## Generated data and Git

The following directories contain generated data and are intentionally excluded by `.gitignore`:

- `data/raw/`
- `data/processed/`
- `frontend/public/data/*/`

A fresh clone therefore needs to run the data-generation and publishing steps before the frontend can display the pilot datasets.

Do not expect the generated datasets to appear automatically after cloning the repository. Fetching NASA POWER data requires internet access.

## Current limitations and scientific safeguards

- **Spatial resolution:** NASA POWER data is taken from a grid cell at the county internal point. Treating it as representative of the whole county is an assumption.
- **Soil wetness:** `GWETTOP` and `GWETROOT` are model estimates, not direct soil measurements.
- **Soil survey:** `IA169` identifies the SSURGO survey area. The current output does not establish that actual field-level SSURGO soil properties have been integrated.
- **Land cover:** The current MVP does not claim a completed land-cover analysis.
- **Rotation evidence:** Rotation-specific comparison metrics remain pending until approved evidence is available. Pending values must not be interpreted as evidence of better or worse performance.
- **Yield and profitability:** The application is not a crop yield forecast or a profitability prediction system.
- **Farm-level advice:** The current pilot uses county-level climate context, not individual farm inputs or field-specific measurements.
- **Solar radiation:** The source product changes across the historical period, so long-term trends around that transition require caution.

The application deliberately avoids presenting unsupported rotation rankings or recommendations.

## Data and methodology

See `docs/METHODOLOGY.md` for the data contract, indicator definitions, quality-control rules and methodology.

NASA POWER: https://power.larc.nasa.gov/

---

**TerraShift · NASA Space Apps Challenge 2026**
