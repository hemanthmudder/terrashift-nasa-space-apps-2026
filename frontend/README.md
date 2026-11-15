# TerraShift frontend

Next.js (App Router) + React + TypeScript + Tailwind frontend for the TerraShift
pilot region **Story County, Iowa** (`ia-story-19169`). It reads datasets
produced by the Python pipeline in `src/pipeline/`; it has no backend of its
own and never substitutes sample data.

## Run

```bash
# from the repository root: generate and publish data
python3 -m src.pipeline.fetch_nasa_power
python3 -m src.pipeline.clean_nasa_power data/raw/nasa_power/ia-story-19169_daily_19910101_20251231.json
bash scripts/copy_data_to_frontend.sh

# then the frontend
cd frontend
npm install
npm run dev        # http://localhost:3000
```

Other scripts: `npm test`, `npm run typecheck`, `npm run build`, `npm start`.

## Data flow

| Published file (`public/data/ia-story-19169/`) | Produced by | Used by |
|---|---|---|
| `climate_daily.csv` | `fetch_nasa_power` → `clean_nasa_power` → `copy_data_to_frontend.sh` | Climate, Calendar, Reports |
| `environment_summary.json` | Nothing yet (contract: `docs/METHODOLOGY.md` §4.3) | Pilot Region, Reports |
| `rotation_comparison.json` | Nothing yet — needs the rotation engine (§4.4) | Crop Rotations, Calendar, Reports |

Published datasets are generated files and are git-ignored (`frontend/.gitignore`).

**Restart after publishing.** A production server (`npm start`) indexes `public/`
when it starts: files added later return 404 and files removed later return 400
until it restarts. The development server (`npm run dev`) picks changes up directly.

The data-access layer lives in `src/lib/data/`:

- `climate.ts` — strict parser for the §4.2 CSV contract. Empty cells become
  `null` (shown as "—"), never zero; rows keep their `qc_flag`.
- `summary.ts` — averages and growing-season indicators (§3). Missing values
  are skipped and partial seasons/months are left blank, not zero-filled.
- `loaders.ts` — loads each file and returns `available`, `missing`,
  `placeholder`, `invalid` or `error`. Contract examples with zeros or empty
  strings are reported as placeholders and never displayed.

`src/lib/region.ts` mirrors `config/pilot_region.json`; a test fails if they drift.

## Honesty rules

- Soil wetness values are labelled as NASA POWER (MERRA-2) model estimates, not soil measurements.
- Crop rotation content appears only when a valid `rotation_comparison.json` for this region exists,
  with the disclaimer "Decision support only; not a yield forecast."
- Scoring weights and custom sequence evaluation are shown as waiting for the rotation engine.
- The earlier Karnataka engine, crops and seasons are not included.
