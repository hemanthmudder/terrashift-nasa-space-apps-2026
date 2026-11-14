# Data Sources

Pilot region: **Story County, Iowa** (FIPS `19169`, SSURGO survey area `IA169`).
Decision recorded 2026-11-14. Rationale and data contract: see [METHODOLOGY.md](METHODOLOGY.md).

All facts below were checked against official documentation on 2026-11-14.
Anything not yet verified is marked **(to confirm)**.

## Data types — read before using any dataset

| Type | What one value means | Examples |
|---|---|---|
| **County-level** | One total for the whole county per year. Says nothing about individual fields. | Census of Agriculture, NASS QuickStats |
| **Point-based (model grid)** | We send a lat/lon; the value is for the whole grid cell around it. | NASA POWER |
| **Satellite / raster grid** | One value per pixel or cell; must be clipped to the county and aggregated. | CDL, GPM IMERG, SMAP, MODIS, Landsat |

## MVP datasets

### Tier 1 — Must have (no API key required)

| Dataset | Type | Resolution | Coverage used | Access |
|---|---|---|---|---|
| NASA POWER Daily API | Point (model grid) | ½° × ⅝° (≈55 × 52 km) meteorology; 1° × 1° solar | 1991-01-01 → last complete year | REST API, no key |
| USDA NASS Cropland Data Layer (CDL) | Raster | 30 m, annual | 2008 → latest released year | CroplandCROS / NASS download, no key |
| USDA NRCS SSURGO | Soil survey polygons | Survey scale (field-level map units) | Survey area `IA169` | Soil Data Access (SQL over REST), no key |
| 2022 Census of Agriculture, county profile | County-level | County, every 5 years | 2022 (2017 for change) | PDF / QuickStats |
| Davis et al. 2012 (Marsden Farm rotation study) | Field trial (literature) | Research plots, Boone County IA | 2003–2011 | Open-access paper |
| Census TIGER county boundary | Vector | County polygon | GEOID `19169` | TIGERweb REST, no key |

### Tier 2 — Should have (free NASA Earthdata login)

| Dataset | Type | Resolution | Coverage used | Access |
|---|---|---|---|---|
| GPM IMERG V07 Final Run, daily | Satellite grid | 0.1° (≈11 × 8 km at 42° N) | 2001 → present | GES DISC / AWS Open Data, Earthdata login |
| MODIS MOD13Q1 NDVI | Satellite grid | 250 m, 16-day composite | 2001 → present | AppEEARS, Earthdata login |

### Tier 3 — Stretch

| Dataset | Type | Resolution | Coverage used | Access |
|---|---|---|---|---|
| SMAP SPL3SMP_E (Enhanced L3 radiometer) | Satellite grid | 9 km, daily; top ≈5 cm of soil only | 2015 → present | NSIDC, Earthdata login |
| Landsat Collection 2 | Satellite grid | 30 m, ≈16-day revisit | As needed | USGS / Earthdata |

## Dataset details and limitations

### NASA POWER
- Meteorology from GMAO MERRA-2 on a ½° × ⅝° grid; solar from CERES SYN1deg on a 1° × 1° grid.
- Story County land area is 1,483 km² (≈38 × 38 km), so **the whole county is effectively one climate value**. POWER cannot show climate variation inside the county.
- Values are in local solar time. Missing values are returned as `-999.0`.
- Parameters confirmed live (API v2.10.3, community `AG`): `T2M`, `T2M_MAX`, `T2M_MIN`, `PRECTOTCORR`, `RH2M`, `WS2M`, `ALLSKY_SFC_SW_DWN`, `GWETTOP`, `GWETROOT`.
- `GWETTOP` / `GWETROOT` are unitless model soil *wetness* (0–1), **not** volumetric soil moisture.
- Docs: https://power.larc.nasa.gov/docs/methodology/data/sources/ ·
  https://power.larc.nasa.gov/docs/methodology/meteorology/ ·
  https://power.larc.nasa.gov/docs/services/api/temporal/daily/

### USDA Cropland Data Layer
- 30 m crop-specific land cover, one map per year.
- Iowa coverage starts in 2000. The MVP uses 2008 onward, when coverage became national, to keep methods consistent.
- The NASS metadata page lists years through 2023. **(To confirm)** which later years are released before ingesting.
- Metadata: https://www.nass.usda.gov/Research_and_Science/Cropland/metadata/meta.php
- Download: https://croplandcros.scinet.usda.gov/

### SSURGO
- Survey area `IA169` (Story County, Iowa): 86 map units; last refreshed 2026-09-08 (Soil Data Access query, 2026-11-14).
- Use for available water storage, drainage class and dominant soils, area-weighted to cropland.
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
- These are **plot results from one site**, not Story County observations.
- Paper: https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0047149
- Study page: https://inrc.cals.iastate.edu/project-location/marsden-long-term-rotation-study

### GPM IMERG V07
- 0.1° daily precipitation; V07 extends back to 1998 (TRMM era).
- Use as an independent cross-check of POWER precipitation.
- https://gpm.nasa.gov/taxonomy/term/1417 · https://registry.opendata.aws/nasa-gpm3imergdf/

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
