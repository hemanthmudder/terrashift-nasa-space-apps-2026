"""Clean a raw NASA POWER daily response into the TerraShift daily climate CSV.

Implements data contract v1.0, section 4.2 (docs/METHODOLOGY.md):

    data/processed/{region_id}/climate_daily.csv

Missing-data and quality rules (v1.0), applied exactly as documented:
 1. Any POWER value equal to the response's fill value is written empty.
 2. A value outside its column's physical rule is written empty.
 3. If tmax_c < tmin_c, both are written empty.
 4. No gap filling: nothing is interpolated, imputed or substituted.
 5. gdd_c is empty if tmax_c or tmin_c is empty.
 6. qc_flag is ok / missing / out_of_range; out_of_range takes precedence.
 7. qc_fields lists the affected columns, separated by ';' (empty when ok).
 8. Every calendar day in the period has exactly one row.

Implementation choices where the contract is silent (documented, not new rules):
 * A day absent from the response is treated like a fill value (rule 1).
 * qc_fields lists columns that failed rules 1-3. gdd_c is derived, so it is
   not listed; it is empty whenever tmax_c or tmin_c is listed.
 * Units are read from the response's ``parameters`` metadata and must match
   the contract. Solar radiation reported in kW-hr/m^2/day is converted to
   MJ/m^2/day (x 3.6); any other unexpected unit stops the run.

Standard library only.

Usage (from the repository root):
    python3 -m src.pipeline.clean_nasa_power data/raw/nasa_power/<file>.json
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import sys
from pathlib import Path
from typing import Optional

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG = REPO_ROOT / "config" / "pilot_region.json"
DEFAULT_PROCESSED_ROOT = REPO_ROOT / "data" / "processed"

OK, MISSING, OUT_OF_RANGE = "ok", "missing", "out_of_range"

# Output column -> NASA POWER parameter (METHODOLOGY.md 4.2, in order).
COLUMN_SOURCES = [
    ("tmean_c", "T2M"),
    ("tmax_c", "T2M_MAX"),
    ("tmin_c", "T2M_MIN"),
    ("precip_mm", "PRECTOTCORR"),
    ("rh_pct", "RH2M"),
    ("wind_ms", "WS2M"),
    ("srad_mj_m2", "ALLSKY_SFC_SW_DWN"),
    ("soil_wet_top", "GWETTOP"),
    ("soil_wet_root", "GWETROOT"),
]
CSV_COLUMNS = ["date"] + [c for c, _ in COLUMN_SOURCES] + ["gdd_c", "qc_flag", "qc_fields"]

# Physical rules from METHODOLOGY.md 4.2 as (min, max); None = unbounded.
# Temperatures have no documented range rule, only the tmax >= tmin check.
RANGES = {
    "precip_mm": (0.0, None),
    "rh_pct": (0.0, 100.0),
    "wind_ms": (0.0, None),
    "srad_mj_m2": (0.0, None),
    "soil_wet_top": (0.0, 1.0),
    "soil_wet_root": (0.0, 1.0),
}

# Units the contract expects, as NASA POWER labels them.
EXPECTED_UNITS = {
    "T2M": "C",
    "T2M_MAX": "C",
    "T2M_MIN": "C",
    "PRECTOTCORR": "mm/day",
    "RH2M": "%",
    "WS2M": "m/s",
    "ALLSKY_SFC_SW_DWN": "MJ/m^2/day",
    "GWETTOP": "1",
    "GWETROOT": "1",
}
# Accepted alternative units and their factor to the expected unit.
UNIT_CONVERSIONS = {
    ("ALLSKY_SFC_SW_DWN", "kW-hr/m^2/day"): 3.6,
}

GDD_BASE_C = 10.0
GDD_CAP_C = 30.0


class CleanError(ValueError):
    """Raised when a raw response cannot be cleaned under the contract."""


# --------------------------------------------------------------------------- helpers


def gdd_corn(tmax_c: float, tmin_c: float) -> float:
    """(clamp(tmax,10,30) + clamp(tmin,10,30)) / 2 - 10  (METHODOLOGY.md section 3)."""

    def clamp(v: float) -> float:
        return min(max(v, GDD_BASE_C), GDD_CAP_C)

    return (clamp(tmax_c) + clamp(tmin_c)) / 2.0 - GDD_BASE_C


def calendar_days(start: dt.date, end: dt.date) -> list[dt.date]:
    if start > end:
        raise CleanError(f"start {start} is after end {end}")
    return [start + dt.timedelta(days=i) for i in range((end - start).days + 1)]


def unit_factors(data: dict) -> dict[str, float]:
    """Check each parameter's unit in the response metadata; return multipliers."""
    meta = data.get("parameters") or {}
    factors = {}
    for param, expected in EXPECTED_UNITS.items():
        units = (meta.get(param) or {}).get("units")
        if units is None:
            raise CleanError(f"No unit metadata for {param} in response")
        if units == expected:
            factors[param] = 1.0
        elif (param, units) in UNIT_CONVERSIONS:
            factors[param] = UNIT_CONVERSIONS[(param, units)]
        else:
            raise CleanError(f"Unexpected unit for {param}: {units!r} (expected {expected!r})")
    return factors


def fmt(value: Optional[float]) -> str:
    """Empty string for missing; otherwise a compact decimal without float noise."""
    if value is None:
        return ""
    return format(round(value, 4) + 0.0, "g")  # + 0.0 turns -0.0 into 0.0


def in_range(column: str, value: float) -> bool:
    lo, hi = RANGES.get(column, (None, None))
    return (lo is None or value >= lo) and (hi is None or value <= hi)


# --------------------------------------------------------------------------- core


def clean_rows(data: dict, start: Optional[dt.date] = None, end: Optional[dt.date] = None) -> list[dict]:
    """Return one dict per calendar day following the contract's QC rules.

    ``start``/``end`` default to the response header's start/end dates.
    """
    try:
        values = data["properties"]["parameter"]
        header = data["header"]
        fill = float(header["fill_value"])
    except (KeyError, TypeError, ValueError) as e:
        raise CleanError(f"Response is missing required structure: {e}") from e

    for _, param in COLUMN_SOURCES:
        if param not in values:
            raise CleanError(f"Response is missing parameter {param}")

    start = start or dt.datetime.strptime(str(header["start"]), "%Y%m%d").date()
    end = end or dt.datetime.strptime(str(header["end"]), "%Y%m%d").date()
    factors = unit_factors(data)

    rows = []
    for day in calendar_days(start, end):
        key = day.strftime("%Y%m%d")
        row: dict = {"date": day.isoformat()}
        missing_cols, bad_cols = [], []

        for column, param in COLUMN_SOURCES:
            raw = values[param].get(key)
            if raw is None or float(raw) == fill:  # rule 1 (absent day treated the same)
                row[column] = None
                missing_cols.append(column)
                continue
            v = float(raw) * factors[param]
            if not in_range(column, v):  # rule 2
                row[column] = None
                bad_cols.append(column)
                continue
            row[column] = v

        tmax, tmin = row["tmax_c"], row["tmin_c"]
        if tmax is not None and tmin is not None and tmax < tmin:  # rule 3
            row["tmax_c"] = row["tmin_c"] = None
            bad_cols += ["tmax_c", "tmin_c"]

        # rule 5
        if row["tmax_c"] is None or row["tmin_c"] is None:
            row["gdd_c"] = None
        else:
            row["gdd_c"] = gdd_corn(row["tmax_c"], row["tmin_c"])

        # rules 6 and 7
        affected = set(missing_cols) | set(bad_cols)
        row["qc_flag"] = OUT_OF_RANGE if bad_cols else (MISSING if missing_cols else OK)
        row["qc_fields"] = ";".join(c for c, _ in COLUMN_SOURCES if c in affected)
        rows.append(row)
    return rows


def write_csv(rows: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f, lineterminator="\n")
        writer.writerow(CSV_COLUMNS)
        for r in rows:
            writer.writerow(
                [r["date"]]
                + [fmt(r[c]) for c, _ in COLUMN_SOURCES]
                + [fmt(r["gdd_c"]), r["qc_flag"], r["qc_fields"]]
            )


def processed_path(config: dict, processed_root: Path = DEFAULT_PROCESSED_ROOT) -> Path:
    return processed_root / config["region"]["id"] / "climate_daily.csv"


def run(raw_path: Path, config_path: Path = DEFAULT_CONFIG, out_path: Optional[Path] = None) -> tuple[Path, list[dict]]:
    with open(config_path, encoding="utf-8") as f:
        config = json.load(f)
    with open(raw_path, "rb") as f:
        data = json.loads(f.read())
    rows = clean_rows(data)
    out_path = out_path or processed_path(config)
    write_csv(rows, out_path)
    return out_path, rows


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("raw", type=Path, help="raw NASA POWER JSON from fetch_nasa_power")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--out", type=Path, help="default: data/processed/<region_id>/climate_daily.csv")
    args = parser.parse_args(argv)
    try:
        out_path, rows = run(args.raw, args.config, args.out)
    except (CleanError, OSError, json.JSONDecodeError) as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    counts = {k: sum(r["qc_flag"] == k for r in rows) for k in (OK, MISSING, OUT_OF_RANGE)}
    print(f"wrote {len(rows)} rows to {out_path}")
    print(f"qc: {counts}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
