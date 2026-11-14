# Data Sources

Pilot region: **Story County, Iowa** (FIPS `19169`, SSURGO survey area `IA169`).
Decision recorded 2026-11-14. Rationale and data contract: see [METHODOLOGY.md](METHODOLOGY.md).

All facts below were checked against official documentation on 2026-11-14.
Anything not yet verified is marked **(to confirm)**.

## Data types — read before using any dataset

| Type | What one value means | Examples |
|---|---|---|
| **County-level** | One total for the whole county per year. Says nothing about individual fields. | Census of Agriculture, NASS QuickStats |
| **Point-based (model grid)** | We send a lat/lon; the value returned is the source grid cell's value at that coordinate. It is **not** a spatial average over the county. | NASA POWER |
| **Satellite / raster grid** | One value per pixel or cell; must be clipped to the county and aggregated. | CDL, GPM IMERG, SMAP, MODIS, Landsat |

## MVP datasets

### Tier 1 — Must have (no API key required)

| Dataset | Type | Resolution | Coverage used | Access |
|---|---|---|---|---|
| NASA POWER Daily API | Point (model grid) | ½° × ⅝° (≈55 × 52 km) meteorology; 1° × 1° solar | 1991-01-01 → last complete year (solar: two sources, see below) | REST API, no key |
| USDA NASS Cropland Data Layer (CDL) | Raster | 30 m, annual (2025 national release: 10 m) | 2008 → 2025 | CropScape / CroplandCROS / NASS download, no key |
| USDA NRCS SSURGO | Soil survey polygons | Detailed soil-survey map units with component-level attributes (not direct field measurements) | Survey area `IA169` | Soil Data Access (SQL over REST), no key |
| 2022 Census of Agriculture, county profile | County-level | County, every 5 years | 2022 (2017 for change) | PDF / QuickStats |
| Davis et al. 2012 (Marsden Farm rotation study) | Field trial (literature) | Research plots, Boone County IA | 2003–2011 | Open-access paper |
| Census TIGER county boundary | Vector | County polygon | GEOID `19169` | TIGERweb REST, no key |

### Tier 2 — Should have (free NASA Earthdata login)

| Dataset | Type | Resolution | Coverage used | Access |
|---|---|---|---|---|
| GPM IMERG Final Run V07B, daily (`GPM_3IMERGDF` v07) | Satellite grid | 0.1° (≈11 × 8 km at 42° N) | 2001 → present | GES DISC / AWS Open Data, Earthdata login |
| MODIS MOD13Q1 NDVI | Satellite grid | 250 m, 16-day composite | 2001 → present | AppEEARS, Earthdata login |

### Tier 3 — Stretch

| Dataset | Type | Resolution | Coverage used | Access |
|---|---|---|---|---|
| SMAP SPL3SMP_E (Enhanced L3 radiometer) | Satellite grid | 9 km, daily; top ≈5 cm of soil only | 2015 → present | NSIDC, Earthdata login |
| Landsat Collection 2 | Satellite grid | 30 m, ≈16-day revisit | As needed | USGS / Earthdata |

## Dataset details and limitations

### NASA POWER
- Meteorology from GMAO MERRA-2 on a ½° × ⅝° grid; solar from a 1° × 1° grid.
- **A point request returns the value of the source grid cell at the requested coordinate.** It is not a spatial average over Story County, and POWER does not report which cell boundaries were used.
- Story County land area is 1,483 km² (≈38 × 38 km). Climate values from one coordinate are treated as representative of the county, which is an **assumption**, not a measured county average. POWER cannot show climate variation inside the county.
- **Solar radiation (`ALLSKY_SFC_SW_DWN`) comes from two different sources over our 1991–2025 period** (POWER SRB-correction page):

  | Period | Source |
  |---|---|
  | 1984-01-01 → 2000-12-31 | GEWEX SRB R4-IP (bias-corrected by POWER toward CERES) |
  | 2001-01-01 → near real time minus ~3–4 months | CERES SYN1deg Ed. 4.2 |

  CERES SYN1deg therefore covers only 2001 onward. Solar values for 1991–2000 are SRB-derived, and any solar trend crossing 2001 mixes two products.
- Values are in local solar time. Missing values are returned as `-999.0`.
- Parameters confirmed live (API v2.10.3, community `AG`): `T2M`, `T2M_MAX`, `T2M_MIN`, `PRECTOTCORR`, `RH2M`, `WS2M`, `ALLSKY_SFC_SW_DWN`, `GWETTOP`, `GWETROOT`.
- `GWETTOP` / `GWETROOT` are unitless model soil *wetness* (0–1), **not** volumetric soil moisture.
- Docs: https://power.larc.nasa.gov/docs/methodology/ ·
  https://power.larc.nasa.gov/docs/methodology/data/derived/srb-correction/ ·
  https://power.larc.nasa.gov/docs/services/api/temporal/daily/

### USDA Cropland Data Layer
- Crop-specific land cover, one map per year, produced by NASS from satellite imagery.
- **CDL is a remotely sensed classification.** Crop labels, and any year-to-year crop transitions derived from them, are estimates with classification error. They are not farmer-reported or verified field rotations.
- Iowa coverage starts in 2000. The MVP uses 2008 onward, when coverage became national, to keep methods consistent.
- **2025 status (checked 2026-11-14):**
  - The NASS national metadata page lists 2025 layers (cultivated, crop frequency, confidence).
  - The NASS release page offers a **2025 national CDL at 10 m** (9.8 GB). Earlier years used in the MVP are 30 m, so resolutions must be harmonised before multi-year comparison (method pending).
  - Iowa 2025 is downloadable: the CropScape CDL service returns `CDL_2025_19.tif` (Iowa) and `CDL_2025_19169.tif` (Story County), and both files respond HTTP 200 as `image/tiff`. The pixel size of these served files has **not** been checked yet; confirm on ingest.
- Metadata: https://www.nass.usda.gov/Research_and_Science/Cropland/metadata/meta.php
- Releases: https://www.nass.usda.gov/research-and-science/cropland/release
- Download: https://croplandcros.scinet.usda.gov/
- CropScape file service (returns a download URL; checked working 2026-11-14): https://nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLFile?year=2025&fips=19169 . The CropScape web viewer now redirects to a sign-in page.

### SSURGO
- Survey area `IA169` (Story County, Iowa): 86 map units; last refreshed 2026-09-08 (Soil Data Access query, 2026-11-14).
- SSURGO is a **detailed soil survey**: polygons (map units) each made of one or more named soil components with horizon-level properties. Values are survey estimates for those components, **not direct measurements of any particular field**. A map unit can contain several soils in proportions that are not mapped individually.
- NRCS publishes a precomputed map-unit attribute `muaggatt.aws0100wta` (available water storage, 0–100 cm, weighted average, in cm). For `IA169`, 77 of 86 map units have a value and 9 are null (Soil Data Access query, 2026-11-14).
- Use for available water storage, drainage class and dominant soils. How these are summarised for the county is defined in METHODOLOGY.md §4.3.
- Soil Data Access: https://sdmdataaccess.sc.egov.usda.gov/ · Web Soil Survey: https://websoilsurvey.sc.egov.usda.gov/

### 2022 Census of Agriculture — Story County
Official figures (county-level, 2022):

| Item | Value |
|---|---|
| Cropland | 277,178 acres |
| Corn for grain | 146,968 acres |
| Soybeans for beans | 109,455 acres |
| Irrigated land | 340 acres (less than 0.5% of land in farms) |
| Share of sales from crops | 74% |

Computed from the figures above: corn + soybeans = 92.5% of cropland.
Source: https://www.nass.usda.gov/sites/default/files/publications/agcensus/2022/Online_Resources/County_Profiles/Iowa/cp19169.pdf

### Rotation evidence — Marsden Farm (Davis et al. 2012)
- Iowa State University Marsden Farm, Boone County IA (adjacent to Story County), 42°01′ N, 93°47′ W.
- Compared a 2-yr corn–soybean rotation with a 3-yr (corn–soybean–small grain + red clover) and a 4-yr (corn–soybean–small grain + alfalfa–alfalfa) rotation, 2003–2011.
- Reported: corn yield ≈4% higher and soybean yield ≈9% higher in the 3- and 4-yr rotations; herbicide use reduced by 88%; similar long-term profit.
- The 3- and 4-yr systems were managed differently from the 2-yr system, not just rotated differently: they received **periodic composted cattle manure, reduced synthetic N fertilizer and herbicide (banded, with inter-row cultivation)**, and required **more labor**. Results reflect the whole management system.
- These are **plot results from one site**, not Story County observations, and not guaranteed outcomes for any farm.
- Paper: https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0047149
- Study page: https://inrc.cals.iastate.edu/project-location/marsden-long-term-rotation-study

### GPM IMERG Final Run V07B
- Product: GPM IMERG Final Precipitation L3, 1 day, 0.1° (`GPM_3IMERGDF`, version 07, DOI 10.5067/GPM/IMERGDF/DAY/07).
- **Coverage depends on the V07 sub-release:**
  - Original V07 Final: 2000-06-01 onward (GES DISC version history).
  - **V07B** Final: extended back to **1998-01-01** using TRMM-era data. GES DISC currently lists temporal coverage 1998-01-01 to 2025-09-30 for this dataset.
- TerraShift uses **V07B Final** and, for the MVP, only **2001 onward**, matching the MODIS period. If the record is ever extended before June 2000, it must be labelled V07B.
- Final Run latency is about 3.5 months (GES DISC).
- Use as an independent cross-check of POWER precipitation.
- https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGDF_07/summary ·
  https://gpm.nasa.gov/taxonomy/term/1417 ·
  https://gpm.nasa.gov/taxonomy/term/1415 ·
  https://registry.opendata.aws/nasa-gpm3imergdf/

### SMAP SPL3SMP_E
- 9 km daily composite; represents roughly the **top 5 cm** of soil, not the root zone.
- Retrieval errors increase during rapid mid-season corn growth (Judge et al. 2021, SMAPVEX16-Iowa). Treat as supporting evidence only.
- https://nsidc.org/data/spl3smp_e/versions/5 ·
  https://nsidc.org/sites/default/files/spl3smp_e-v004-userguide.pdf ·
  https://www.sciencedirect.com/science/article/abs/pii/S0034425721003436

### MODIS MOD13Q1
- 250 m NDVI, 16-day composites. Use for seasonal greenness curves over CDL corn and soybean pixels.
- **(To confirm)** Terra MODIS data continuity for recent years before relying on it.

## Credentials

| Variable | Needed for MVP? |
|---|---|
| `EARTHDATA_USERNAME`, `EARTHDATA_TOKEN` | Tier 2–3 only (GPM, MODIS, SMAP) |
| `NASS_API_KEY` | Optional (QuickStats annual county series) |
| `USDA_AMS_API_KEY`, `OPENET_API_KEY`, `USGS_API_KEY` | Not used by the MVP |

Real values go only in `.env`, which is git-ignored. Never commit keys.
