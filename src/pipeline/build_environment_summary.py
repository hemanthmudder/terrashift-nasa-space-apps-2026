"""Build TerraShift's seasonal environmental summary from cleaned NASA POWER data.

Implements docs/METHODOLOGY.md sections 3 and 4.3.
Uses only the Python standard library.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG = REPO_ROOT / "config" / "pilot_region.json"
DEFAULT_PROCESSED_ROOT = REPO_ROOT / "data" / "processed"
DEFAULT_RAW_DIR = REPO_ROOT / "data" / "raw" / "nasa_power"

CSV_COLUMNS = [
    "date", "tmean_c", "tmax_c", "tmin_c", "precip_mm",
    "rh_pct", "wind_ms", "srad_mj_m2", "soil_wet_top",
    "soil_wet_root", "gdd_c", "qc_flag", "qc_fields",
]

NUMERIC_COLUMNS = [
    "tmean_c", "tmax_c", "tmin_c", "precip_mm", "rh_pct",
    "wind_ms", "srad_mj_m2", "soil_wet_top", "soil_wet_root",
    "gdd_c",
]

SUMMARY_COLUMNS = {
    "gdd_c": "gdd_c",
    "precip_mm": "precip_mm",
    "days_tmax_ge_32c": "tmax_c",
    "longest_dry_spell_days": "precip_mm",
    "soil_wet_root_mean": "soil_wet_root",
}


class EnvironmentSummaryError(ValueError):
    """Raised when source data cannot safely produce an environment summary."""


def load_json(path: Path) -> dict[str, Any]:
    try:
        with path.open(encoding="utf-8") as f:
            value = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        raise EnvironmentSummaryError(f"Cannot read JSON {path}: {exc}") from exc

    if not isinstance(value, dict):
        raise EnvironmentSummaryError(f"Expected a JSON object in {path}")
    return value


def parse_number(value: str | None, column: str, line: int) -> float | None:
    if value is None or not value.strip():
        return None

    try:
        number = float(value)
    except ValueError as exc:
        raise EnvironmentSummaryError(
            f"Invalid number in CSV line {line}, column {column}: {value!r}"
        ) from exc

    if not math.isfinite(number):
        raise EnvironmentSummaryError(
            f"Non-finite number in CSV line {line}, column {column}"
        )
    return number


def validate_numeric_ranges(row: dict[str, Any], line: int) -> None:
    """Reject values that contradict the cleaned climate data contract."""
    ranges = {
        "precip_mm": (0.0, None),
        "rh_pct": (0.0, 100.0),
        "wind_ms": (0.0, None),
        "srad_mj_m2": (0.0, None),
        "soil_wet_top": (0.0, 1.0),
        "soil_wet_root": (0.0, 1.0),
        "gdd_c": (0.0, None),
    }

    for column, (minimum, maximum) in ranges.items():
        value = row[column]
        if value is None:
            continue
        if minimum is not None and value < minimum:
            raise EnvironmentSummaryError(
                f"Out-of-range {column} in CSV line {line}: {value}"
            )
        if maximum is not None and value > maximum:
            raise EnvironmentSummaryError(
                f"Out-of-range {column} in CSV line {line}: {value}"
            )

    tmax = row["tmax_c"]
    tmin = row["tmin_c"]
    if tmax is not None and tmin is not None and tmax < tmin:
        raise EnvironmentSummaryError(
            f"tmax_c is below tmin_c in CSV line {line}"
        )

    if (tmax is None or tmin is None) and row["gdd_c"] is not None:
        raise EnvironmentSummaryError(
            f"gdd_c must be empty when tmax_c or tmin_c is empty "
            f"(CSV line {line})"
        )


def read_climate_csv(
    path: Path,
    expected_start: date,
    expected_end: date,
) -> list[dict[str, Any]]:
    """Read and validate exact daily date coverage and climate columns."""
    if not path.is_file():
        raise EnvironmentSummaryError(f"Climate CSV not found: {path}")

    records: list[dict[str, Any]] = []

    try:
        with path.open(newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)

            if reader.fieldnames != CSV_COLUMNS:
                raise EnvironmentSummaryError(
                    "Climate CSV header does not match data contract v1.0. "
                    f"Expected {CSV_COLUMNS}; found {reader.fieldnames}"
                )

            for line, source in enumerate(reader, start=2):
                try:
                    day = date.fromisoformat(source["date"])
                except (TypeError, ValueError) as exc:
                    raise EnvironmentSummaryError(
                        f"Invalid date in CSV line {line}: {source.get('date')!r}"
                    ) from exc

                record: dict[str, Any] = {"date": day}
                for column in NUMERIC_COLUMNS:
                    record[column] = parse_number(source.get(column), column, line)

                qc_flag = source.get("qc_flag")
                if qc_flag not in {"ok", "missing", "out_of_range"}:
                    raise EnvironmentSummaryError(
                        f"Invalid qc_flag in CSV line {line}: {qc_flag!r}"
                    )

                if qc_flag == "ok" and any(
                    record[column] is None for column in NUMERIC_COLUMNS
                ):
                    raise EnvironmentSummaryError(
                        f"qc_flag is ok but a numeric value is missing "
                        f"(CSV line {line})"
                    )

                validate_numeric_ranges(record, line)
                records.append(record)

    except OSError as exc:
        raise EnvironmentSummaryError(f"Cannot read climate CSV: {exc}") from exc

    expected_dates: list[date] = []
    current = expected_start
    while current <= expected_end:
        expected_dates.append(current)
        current += timedelta(days=1)

    actual_dates = [record["date"] for record in records]

    if actual_dates != expected_dates:
        raise EnvironmentSummaryError(
            "Climate CSV dates must be unique, continuous, ordered and match "
            f"the configured period {expected_start} through {expected_end}. "
            f"Found {len(actual_dates)} rows; expected {len(expected_dates)}."
        )

    return records


def validate_request_metadata(
    config: dict[str, Any],
    metadata: dict[str, Any],
) -> None:
    region = config["region"]
    period = config["analysis_period"]
    point = region["internal_point"]

    expected = {
        "region_id": region["id"],
        "start": period["climate_start"],
        "end": period["climate_end"],
    }

    for key, value in expected.items():
        if metadata.get(key) != value:
            raise EnvironmentSummaryError(
                f"NASA request metadata mismatch for {key}: "
                f"expected {value!r}, found {metadata.get(key)!r}"
            )

    try:
        latitude = float(metadata["latitude"])
        longitude = float(metadata["longitude"])
    except (KeyError, TypeError, ValueError) as exc:
        raise EnvironmentSummaryError(
            "NASA request metadata has invalid coordinates"
        ) from exc

    if (
        abs(latitude - float(point["latitude"])) > 0.0001
        or abs(longitude - float(point["longitude"])) > 0.0001
    ):
        raise EnvironmentSummaryError(
            "NASA request coordinates do not match the approved pilot point"
        )

    if metadata.get("parameters") != config["nasa_power"]["parameters"]:
        raise EnvironmentSummaryError(
            "NASA request parameters do not match pilot_region.json"
        )

    for key in ("request_url", "api_version", "retrieved_at_utc"):
        if not isinstance(metadata.get(key), str) or not metadata[key].strip():
            raise EnvironmentSummaryError(
                f"NASA request metadata is missing {key}"
            )


def date_range(start: date, end: date) -> list[date]:
    result: list[date] = []
    current = start
    while current <= end:
        result.append(current)
        current += timedelta(days=1)
    return result


def longest_dry_spell(precipitation: list[float]) -> int:
    """Longest consecutive run of days with precipitation below 1 mm."""
    longest = current = 0
    for value in precipitation:
        if value < 1.0:
            current += 1
            longest = max(longest, current)
        else:
            current = 0
    return longest


def build_season(
    year: int,
    season_label: str,
    season_dates: list[date],
    rows_by_date: dict[date, dict[str, Any]],
) -> dict[str, Any]:
    daily = [rows_by_date[day] for day in season_dates]

    missing_by_indicator: dict[str, int] = {}
    values_by_indicator: dict[str, list[float]] = {}

    for indicator, column in SUMMARY_COLUMNS.items():
        values = [row[column] for row in daily]
        missing_by_indicator[indicator] = sum(v is None for v in values)
        values_by_indicator[indicator] = [
            v for v in values if v is not None
        ]

    # Count unique days with at least one missing input used by the indicators.
    required_columns = set(SUMMARY_COLUMNS.values())
    missing_days = sum(
        any(row[column] is None for column in required_columns)
        for row in daily
    )

    def complete_values(indicator: str) -> list[float] | None:
        if missing_by_indicator[indicator] > 0:
            return None
        return values_by_indicator[indicator]

    gdd_values = complete_values("gdd_c")
    precip_values = complete_values("precip_mm")
    heat_values = complete_values("days_tmax_ge_32c")
    dry_values = complete_values("longest_dry_spell_days")
    wet_values = complete_values("soil_wet_root_mean")

    return {
        "year": year,
        "season": season_label,
        "gdd_c": round(sum(gdd_values), 2) if gdd_values is not None else None,
        "precip_mm": round(sum(precip_values), 2) if precip_values is not None else None,
        "precip_anomaly_pct": None,  # populated after the baseline is validated
        "days_tmax_ge_32c": (
            sum(value >= 32.0 for value in heat_values)
            if heat_values is not None else None
        ),
        "longest_dry_spell_days": (
            longest_dry_spell(dry_values) if dry_values is not None else None
        ),
        "soil_wet_root_mean": (
            round(sum(wet_values) / len(wet_values), 4)
            if wet_values else None
        ),
        "missing_days": missing_days,
        "missing_days_by_indicator": missing_by_indicator,
        "metric_provenance": {
            "gdd_c": {
                "provenance": "computed",
                "method": "Sum of daily gdd_c values; METHODOLOGY.md section 3.",
            },
            "precip_mm": {
                "provenance": "computed",
                "method": "Sum of daily precipitation from 1 April through 31 October.",
            },
            "precip_anomaly_pct": {
                "provenance": "computed",
                "method": "Season total compared with the arithmetic mean of 1991-2020 seasonal totals.",
            },
            "days_tmax_ge_32c": {
                "provenance": "computed",
                "method": "Count of growing-season days with tmax_c greater than or equal to 32.",
            },
            "longest_dry_spell_days": {
                "provenance": "computed",
                "method": "Longest consecutive run of growing-season days with precip_mm below 1.",
            },
            "soil_wet_root_mean": {
                "provenance": "computed",
                "method": "Mean NASA POWER GWETROOT model wetness; unitless and not volumetric soil moisture.",
            },
        },
        "source": "nasa_power",
    }


def build_environment_summary(
    config: dict[str, Any],
    request_metadata: dict[str, Any],
    records: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build the environment_summary.json object from validated daily records."""
    validate_request_metadata(config, request_metadata)

    region = config["region"]
    period = config["analysis_period"]
    analysis_start = date.fromisoformat(period["climate_start"])
    analysis_end = date.fromisoformat(period["climate_end"])

    rows_by_date = {row["date"]: row for row in records}
    if len(rows_by_date) != len(records):
        raise EnvironmentSummaryError("Duplicate climate dates are not allowed")

    start_mmdd = period["growing_season"]["start_mmdd"]
    end_mmdd = period["growing_season"]["end_mmdd"]
    start_month, start_day = map(int, start_mmdd.split("-"))
    end_month, end_day = map(int, end_mmdd.split("-"))

    season_label = (
        f"{date(2000, start_month, start_day):%b}-"
        f"{date(2000, end_month, end_day):%b}"
    )

    climate_by_season = []

    for year in range(analysis_start.year, analysis_end.year + 1):
        season_start = date(year, start_month, start_day)
        season_end = date(year, end_month, end_day)

        if season_start < analysis_start or season_end > analysis_end:
            raise EnvironmentSummaryError(
                f"Growing season for {year} is not fully covered by "
                "the configured climate period"
            )

        season_dates = date_range(season_start, season_end)
        missing_dates = [day for day in season_dates if day not in rows_by_date]
        if missing_dates:
            raise EnvironmentSummaryError(
                f"Missing daily records inside {year} growing season: "
                f"{missing_dates[:3]}"
            )

        climate_by_season.append(
            build_season(year, season_label, season_dates, rows_by_date)
        )

    baseline_start, baseline_end = map(
        int, period["climate_baseline"].split("-")
    )
    baseline_rows = [
        item for item in climate_by_season
        if baseline_start <= item["year"] <= baseline_end
    ]
    expected_baseline_years = baseline_end - baseline_start + 1

    # The methodology has not approved a missing-data completeness threshold.
    # Therefore, only use the baseline if every baseline season is complete.
    baseline_complete = (
        len(baseline_rows) == expected_baseline_years
        and all(item["precip_mm"] is not None for item in baseline_rows)
    )

    baseline_mean = None
    if baseline_complete:
        baseline_mean = sum(
            item["precip_mm"] for item in baseline_rows
        ) / expected_baseline_years

    if baseline_mean is not None and baseline_mean > 0:
        for item in climate_by_season:
            if item["precip_mm"] is not None:
                item["precip_anomaly_pct"] = round(
                    (item["precip_mm"] / baseline_mean - 1.0) * 100.0,
                    2,
                )

    internal_point = region["internal_point"]

    return {
        "schema_version": "1.0",
        "region": {
            "id": region["id"],
            "name": region["name"],
            "fips": region["fips"],
            "ssurgo_area": region["ssurgo_area_symbol"],
            "internal_point": [
                float(internal_point["latitude"]),
                float(internal_point["longitude"]),
            ],
            "land_area_km2": region["land_area_km2"],
        },
        "period": {
            "start": period["climate_start"],
            "end": period["climate_end"],
            "baseline": period["climate_baseline"],
        },
        "climate_by_season": climate_by_season,
        "soils": {
            "source": "ssurgo",
            "dominant_map_units": [],
            "aws_0_100cm_mm_weighted": None,
            "aws_method_status": "pending",
            "drainage_class_pct": {},
        },
        "land_cover": {
            "source": "cdl",
            "years": [
                period["cdl_start_year"],
                period["cdl_end_year"],
            ],
            "corn_pct": None,
            "soy_pct": None,
            "corn_soy_alternation_pct": None,
            "estimate_type": "remotely_sensed",
        },
        "resolution_notes": [
            "NASA POWER values are from the source grid cell at the "
            "Census internal point, not a county-wide spatial average.",
            "Solar radiation source changes in 2001 (SRB to CERES SYN1deg).",
            "Soil and land-cover metrics remain pending until their "
            "source datasets and aggregation methods are verified.",
            "Seasonal indicators with missing required daily values are "
            "not published because the completeness threshold is pending.",
        ],
        "sources": [
            {
                "id": "nasa_power",
                "url": request_metadata["request_url"],
                "version": request_metadata["api_version"],
                "retrieved": request_metadata["retrieved_at_utc"],
            }
        ],
    }


def run(
    config_path: Path = DEFAULT_CONFIG,
    climate_path: Path | None = None,
    request_path: Path | None = None,
    out_path: Path | None = None,
) -> Path:
    config = load_json(config_path)
    region_id = config["region"]["id"]
    period = config["analysis_period"]

    climate_path = climate_path or (
        DEFAULT_PROCESSED_ROOT / region_id / "climate_daily.csv"
    )
    request_path = request_path or (
        DEFAULT_RAW_DIR /
        f"{region_id}_daily_"
        f"{period['climate_start'].replace('-', '')}_"
        f"{period['climate_end'].replace('-', '')}.request.json"
    )
    out_path = out_path or (
        DEFAULT_PROCESSED_ROOT / region_id / "environment_summary.json"
    )

    metadata = load_json(request_path)
    records = read_climate_csv(
        climate_path,
        date.fromisoformat(period["climate_start"]),
        date.fromisoformat(period["climate_end"]),
    )
    summary = build_environment_summary(config, metadata, records)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = out_path.with_suffix(out_path.suffix + ".tmp")
    try:
        temporary_path.write_text(
            json.dumps(summary, indent=2, allow_nan=False) + "\n",
            encoding="utf-8",
        )
        temporary_path.replace(out_path)
    except OSError as exc:
        temporary_path.unlink(missing_ok=True)
        raise EnvironmentSummaryError(
            f"Cannot write environment summary {out_path}: {exc}"
        ) from exc

    return out_path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Build TerraShift's seasonal environmental summary."
    )
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--climate", type=Path)
    parser.add_argument("--request", type=Path)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args(argv)

    try:
        output = run(args.config, args.climate, args.request, args.out)
    except (EnvironmentSummaryError, KeyError, TypeError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    print(f"Environment summary written: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
