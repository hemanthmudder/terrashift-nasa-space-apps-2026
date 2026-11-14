# Methodology

Status: **MVP baseline, approved 2026-11-14.** Datasets and links: [DATA_SOURCES.md](DATA_SOURCES.md).
Region config: [`config/pilot_region.json`](../config/pilot_region.json).

## 1. Pilot region selection

### Decision
**Story County, Iowa** — FIPS `19169`, SSURGO survey area `IA169`, region ID `ia-story-19169`.

### Candidates compared

| | York, NE | **Story, IA** | Finney, KS |
|---|---|---|---|
| Irrigated land (2022 Census) | 254,793 ac (73% of land in farms) | **340 ac (<0.5%)** | 150,804 ac (18%) |
| Main crops (2022 Census, acres) | Corn 199,819; soybeans 114,236 | Corn 146,968; soybeans 109,455 | Wheat 156,178; sorghum 101,419; corn 94,545; hay 58,218; soybeans 5,048 |
| CDL available from | 2001 | **2000** | 2006 |
| SSURGO survey area | `NE185` | `IA169` | `KS055` |

NASA POWER, GPM IMERG, SMAP and MODIS cover all three counties equally, so they did not decide the choice.

### Why Story County
1. **Rain-fed.** With under 0.5% of farmland irrigated, precipitation and soil-moisture datasets describe the water crops actually receive. In York (73% irrigated) well water is invisible to those datasets, so a climate-only model would mislead.
2. **Published rotation evidence next door.** The Iowa State Marsden Farm trial (Davis et al. 2012, Boone County) compared 2-, 3- and 4-year rotations under local conditions. Its diversified systems also used periodic cattle manure, reduced synthetic inputs and more labor (see §2), so the results describe whole management systems, not rotation alone.
3. **Longest crop-map history** (CDL from 2000) and a current soil survey (refreshed 2026-09-08).
4. **Lowest integration cost.** POWER, CDL and SSURGO need no API keys.

### Known weaknesses
- Corn and soybeans are 92.5% of cropland (computed from 2022 Census). Diversified rotations are shown as **research-backed options**, not current local practice.
- SMAP is least accurate over dense mid-season corn; treat it as supporting evidence only.
- Runner-up: **Finney County, KS** (most crop variety, water-scarcity story) — would need an irrigated-field map and groundwater data.

The `york` and `finney` folders under `data/processed/` are retained as unselected candidates until the team decides otherwise.

## 2. How to read each data type

| Type | Datasets | Rule |
|---|---|---|
| County-level | Census of Agriculture, NASS | One value for the whole county. Never present as field-level. |
| Point-based | NASA POWER | Values are the source grid cell's value at the requested coordinate (the Census internal point), not a county-wide spatial average. Treating them as representative of the county is an **assumption**. Solar radiation switches source in 2001 (SRB → CERES SYN1deg). |
| Satellite grid | CDL (30 m; 10 m for 2025), MODIS (250 m), GPM IMERG V07B (0.1°), SMAP (9 km) | Clip to county boundary (and to cropland where relevant), then aggregate. State the resolution next to every derived number. CDL crop labels and transitions are **remotely sensed estimates**, not farmer-reported or verified field rotations. |
| Literature | Marsden Farm | Plot results from one adjacent site. Always cite; never relabel as Story County data. The 3- and 4-yr systems combined rotation with periodic composted cattle manure, reduced synthetic N and herbicide, and more labor; never present their results as guaranteed local outcomes. |

### What the MVP will and will not claim
- **Will:** describe Story County's climate history and stress indicators, its soils, what has been planted (CDL), and how alternative rotations performed in published local research.
- **Will not:** predict yields. No dataset in the MVP can validate a yield forecast at field or county level.

### Evidence status of rotation metrics

No score may be invented. A metric is shown only when a source supports it; otherwise it is `pending`.

| Metric | Status | Basis |
|---|---|---|
| Corn and soybean yield vs 2-yr baseline | Supported (literature only) | Davis et al. 2012, Marsden Farm plots, 2003–2011 |
| Herbicide use vs 2-yr baseline | Supported (literature only) | Davis et al. 2012 |
| Profitability | Literature reports similar long-term profit; **no local score** | Davis et al. 2012; not transferable without local prices and costs |
| Yield for Story County | **Pending** — not estimated | No validating dataset |
| Water demand | **Pending** | No source identified |
| Nitrogen requirement or losses | **Pending** | No source identified |
| Erosion | **Pending** | No source identified |

## 3. Derived indicators

| Indicator | Definition |
|---|---|
| Growing season | 1 April – 31 October |
| Growing degree days (corn), `gdd_c` | `(clamp(tmax,10,30) + clamp(tmin,10,30)) / 2 − 10` per day, °C·day (modified 86/50 °F method) |
| Heat days | Days with `tmax_c ≥ 32` in the growing season |
| Longest dry spell | Longest run of consecutive days with `precip_mm < 1` in the growing season |
| Precipitation anomaly | Season total vs the 1991–2020 mean for the same season, in % |
| Corn–soy alternation | Share of CDL cropland pixels that switch between corn and soybean in consecutive years. This is a **remotely sensed estimate** of crop transitions and includes CDL classification error; it is not a count of verified field rotations. |

## 4. Data contract (v1.0)

General rules:
- Metric units throughout. Dates are ISO 8601 (`YYYY-MM-DD`); POWER daily values are local solar time.
- Every JSON file carries `schema_version`.
- Paths use the region ID `ia-story-19169`. (The existing folder `data/processed/iowa-story-co/` will be renamed once the team agrees.)
- Every metric shown to users must carry a provenance: `literature`, `computed` or `assumption`. Metrics without evidence use `pending` (see §2).

### 4.1 NASA POWER raw data

Stored exactly as returned; never edited.

- Response: `data/raw/nasa_power/ia-story-19169_daily_{YYYYMMDD}_{YYYYMMDD}.json`
- Companion: same name with `.request.json`

Raw response keys (confirmed live): `type`, `geometry`, `properties.parameter`, `header` (`fill_value: -999.0`, `api.version`, `sources`, `time_standard`), `parameters` (units and long names), `messages`, `times`.

Companion file:
```json
{
  "schema_version": "1.0",
  "region_id": "ia-story-19169",
  "request_url": "https://power.larc.nasa.gov/api/temporal/daily/point?...",
  "community": "AG",
  "parameters": ["T2M", "T2M_MAX", "T2M_MIN", "PRECTOTCORR", "RH2M", "WS2M", "ALLSKY_SFC_SW_DWN", "GWETTOP", "GWETROOT"],
  "latitude": 42.0375,
  "longitude": -93.4661,
  "start": "1991-01-01",
  "end": "2025-12-31",
  "retrieved_at_utc": "",
  "api_version": "",
  "sha256": ""
}
```

### 4.2 Cleaned daily climate

`data/processed/ia-story-19169/climate_daily.csv`

| Column | Unit | Source / rule |
|---|---|---|
| `date` | YYYY-MM-DD | Unique, continuous, no gaps |
| `tmean_c` | °C | `T2M` |
| `tmax_c` | °C | `T2M_MAX` |
| `tmin_c` | °C | `T2M_MIN` |
| `precip_mm` | mm/day | `PRECTOTCORR`, ≥ 0 |
| `rh_pct` | % | `RH2M`, 0–100 |
| `wind_ms` | m/s | `WS2M`, ≥ 0 |
| `srad_mj_m2` | MJ/m²/day | `ALLSKY_SFC_SW_DWN`, ≥ 0 |
| `soil_wet_top` | 0–1 | `GWETTOP` (model wetness, not volumetric) |
| `soil_wet_root` | 0–1 | `GWETROOT` (model wetness, not volumetric) |
| `gdd_c` | °C·day | Computed (section 3) |
| `qc_flag` | text | `ok`, `missing` or `out_of_range` (rules below) |
| `qc_fields` | text | Affected columns, `;`-separated; empty when `ok` |

Missing-data and quality rules (v1.0):

1. **Fill value.** Any POWER value equal to `-999.0` is written as an empty cell.
2. **Physical range.** A value outside its column rule above (for example negative precipitation, `rh_pct` outside 0–100, wetness outside 0–1) is written as empty. The raw value stays in the raw file.
3. **Consistency.** If `tmax_c < tmin_c`, both are written as empty.
4. **No gap filling.** v1.0 does not interpolate, impute or substitute values from other datasets. Empty stays empty.
5. **Derived values.** `gdd_c` is empty if `tmax_c` or `tmin_c` is empty.
6. **Row flag.** `qc_flag` is `ok` if every column is present, `missing` if any value was a fill value, and `out_of_range` if any value failed rule 2 or 3 (`out_of_range` takes precedence).
7. **Which columns.** `qc_fields` lists the affected column names, separated by `;`, and is empty when `qc_flag = ok`.
8. **Dates.** Every calendar day in the period has exactly one row, even if all values are empty.
9. **Seasonal summaries.** Every seasonal indicator in §4.3 must report how many days were missing. The completeness threshold for publishing an indicator is **pending** team decision.

### 4.3 Environmental summary

`data/processed/ia-story-19169/environment_summary.json` (zeros and empty strings are placeholders)

```json
{
  "schema_version": "1.0",
  "region": {
    "id": "ia-story-19169", "name": "Story County, Iowa", "fips": "19169",
    "ssurgo_area": "IA169", "internal_point": [42.0375, -93.4661], "land_area_km2": 1482.88
  },
  "period": {"start": "1991-01-01", "end": "2025-12-31", "baseline": "1991-2020"},
  "climate_by_season": [
    {"year": 2024, "season": "Apr-Oct", "gdd_c": 0, "precip_mm": 0, "precip_anomaly_pct": 0,
     "days_tmax_ge_32c": 0, "longest_dry_spell_days": 0, "soil_wet_root_mean": 0,
     "missing_days": 0, "source": "nasa_power"}
  ],
  "soils": {
    "source": "ssurgo", "dominant_map_units": [{"name": "", "pct_area": 0}],
    "aws_0_100cm_mm_weighted": null, "aws_method_status": "pending", "drainage_class_pct": {}
  },
  "land_cover": {
    "source": "cdl", "years": [2008, 2025], "corn_pct": 0, "soy_pct": 0,
    "corn_soy_alternation_pct": 0, "estimate_type": "remotely_sensed"
  },
  "resolution_notes": ["NASA POWER: source grid-cell value at the internal point, not a county average"],
  "sources": [{"id": "nasa_power", "url": "", "version": "", "retrieved": ""}]
}
```

Soil water storage (`aws_0_100cm_mm_weighted`):
- **Input (defined):** NRCS precomputed map-unit attribute `muaggatt.aws0100wta` (available water storage 0–100 cm, cm), converted to mm by × 10. NRCS derives it from component horizons and component percentages; TerraShift does not recompute it from horizons.
- **Map units without a value** (9 of 86 in `IA169`) are excluded and their area reported.
- **County aggregation: pending.** Whether to weight by map-unit area within the county or within CDL cropland, and how to treat excluded area, has not been decided. Until then the field is `null` with `aws_method_status: "pending"`.

### 4.4 Crop rotation comparison

`data/processed/ia-story-19169/rotation_comparison.json`

```json
{
  "schema_version": "1.0",
  "region_id": "ia-story-19169",
  "disclaimer": "Decision support only; not a yield forecast.",
  "rotations": [
    {"id": "cs2", "name": "Corn-Soybean (2-yr)", "sequence": ["corn", "soybean"], "baseline": true},
    {"id": "cso3", "name": "Corn-Soybean-Small grain + Red clover (3-yr)", "sequence": ["corn", "soybean", "oat_redclover"]},
    {"id": "csoa4", "name": "Corn-Soybean-Small grain + Alfalfa-Alfalfa (4-yr)", "sequence": ["corn", "soybean", "oat_alfalfa", "alfalfa"]}
  ],
  "metrics": [
    {"rotation_id": "cso3", "metric": "corn_yield_vs_baseline_pct", "value": 4,
     "provenance": "literature", "citation": "Davis et al. 2012, Marsden Farm (Boone Co., IA)",
     "applicability": "adjacent county, research plots, 2003-2011; diversified systems also used composted cattle manure, reduced synthetic N and herbicide, and more labor",
     "confidence": "medium", "status": "supported"},
    {"rotation_id": "cso3", "metric": "water_demand", "value": null,
     "provenance": "pending", "citation": null, "applicability": null, "confidence": null, "status": "pending"}
  ],
  "climate_stress_context": [{"indicator": "longest_dry_spell_days", "trend": "", "relevance": ""}]
}
```

A metric without `provenance` and `citation` (or a computation reference) is invalid and must be rejected by the pipeline. The only exception is `status: "pending"`, which must have `value: null` and is shown to users as "evidence pending", never as a score.

### 4.5 Frontend input

`frontend/public/data/ia-story-19169/dashboard.json` — one file per region, built by the pipeline from 4.3 and 4.4. The frontend never calls external APIs.

```json
{
  "schema_version": "1.0",
  "generated_at": "",
  "region": {"id": "ia-story-19169", "name": "Story County, Iowa"},
  "map": {"boundary_geojson": "boundary.geojson", "bbox": [0, 0, 0, 0]},
  "cards": [{"label": "", "value": 0, "unit": "", "source_id": ""}],
  "series": {
    "monthly_climate": [{"month": "2024-06", "precip_mm": 0, "tmean_c": 0, "precip_baseline_mm": 0}]
  },
  "rotations": [],
  "limitations": [],
  "sources": []
}
```

Monthly data only, to keep the file small; daily data stays in the pipeline.
