# TerraShift Frontend

Next.js App Router, React, TypeScript and Tailwind frontend for the TerraShift pilot region: Story County, Iowa (`ia-story-19169`).

The frontend reads generated datasets from `public/data/ia-story-19169/`. It has no separate application backend and does not call NASA APIs directly from the browser.

## Run locally

First, generate and publish the datasets from the repository root:

```bash
python3 -m pip install -r requirements.txt

python3 -m src.pipeline.fetch_nasa_power

python3 -m src.pipeline.clean_nasa_power data/raw/nasa_power/ia-story-19169_daily_19910101_20251231.json

python3 -m src.pipeline.build_environment_summary

python3 -m src.engine.rotation_engine

bash scripts/copy_data_to_frontend.sh
```

Then install and start the frontend:

```bash
cd frontend

npm install

npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For a fresh clone, run the data-generation steps before starting the frontend. Generated datasets are intentionally Git-ignored and are not included automatically.

## Published data files

The publishing script copies available processed datasets from:

```text
data/processed/ia-story-19169/
```

to:

```text
frontend/public/data/ia-story-19169/
```

| Published file | Producer | Used by |
|---|---|---|
| `climate_daily.csv` | `fetch_nasa_power` → `clean_nasa_power` | Climate Insights, Crop Calendar and Reports |
| `environment_summary.json` | `build_environment_summary` | Pilot Region and Reports |
| `rotation_comparison.json` | `src.engine.rotation_engine` | Crop Rotations, Crop Calendar and Reports |

`copy_data_to_frontend.sh` validates the climate CSV header before publishing it. Missing files are reported. Invalid or missing source files are not replaced with fabricated sample data.

## Application sections

- **Home:** Overview of the TerraShift pilot.
- **Pilot Region:** Region metadata and environmental summary.
- **Climate Insights:** Daily climate indicators, monthly climate patterns and growing-season summaries.
- **Crop Rotations:** Rotation cycles and the status of comparison evidence.
- **Crop Calendar:** Seasonal calendar and rotation timeline.
- **Reports:** Printable pilot report, which can be saved as PDF using the browser's print dialog.

## Data handling

The data-access layer is in `src/lib/data/`:

- `climate.ts` — parses the documented daily CSV contract.
- `summary.ts` — computes climate and growing-season indicators.
- `loaders.ts` — loads datasets and reports availability, missing files, invalid files or errors.
- `rotations.ts` — handles rotation comparison data.

Missing measurements are not silently converted to zero. Partial climate periods are not filled with invented values.

The region configuration is mirrored in `src/lib/region.ts`; tests check that these definitions remain aligned.

## Tests and production build

```bash
npm test
npm run typecheck
npm run build
```

Start the production server after building:

```bash
npm start
```

**Important:** Restart the production server after publishing new files into `public/`. The development server can pick up local data changes directly.

## Limitations

- Climate values represent a NASA POWER grid cell at the county internal point, not individual farms.
- Soil wetness is a model estimate, not a direct measurement.
- The current pilot does not establish completion of field-level soil or land-cover integration.
- Rotation metrics without approved evidence are shown as pending.
- Rotation comparisons are decision-support context, not yield forecasts or validated farm-specific recommendations.

See the repository root `README.md` and `docs/METHODOLOGY.md` for the complete pipeline and methodology.
