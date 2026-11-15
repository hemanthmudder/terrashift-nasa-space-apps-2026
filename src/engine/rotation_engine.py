"""Build evidence-aware crop rotation comparisons for TerraShift.

Implements docs/METHODOLOGY.md section 4.4.

The engine defines rotation sequences but does not invent performance
scores. Unsupported metrics remain explicitly pending until evidence
is verified and approved.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG = REPO_ROOT / "config" / "pilot_region.json"
DEFAULT_PROCESSED_ROOT = REPO_ROOT / "data" / "processed"


class RotationEngineError(ValueError):
    """Raised when rotation input or output fails validation."""


ROTATIONS = [
    {
        "id": "cs2",
        "name": "Corn-Soybean (2-yr)",
        "sequence": ["corn", "soybean"],
        "baseline": True,
    },
    {
        "id": "cso3",
        "name": "Corn-Soybean-Small grain + Red clover (3-yr)",
        "sequence": ["corn", "soybean", "oat_redclover"],
        "baseline": False,
    },
    {
        "id": "csoa4",
        "name": "Corn-Soybean-Small grain + Alfalfa-Alfalfa (4-yr)",
        "sequence": ["corn", "soybean", "oat_alfalfa", "alfalfa"],
        "baseline": False,
    },
]

# These are research questions, not scores. The evidence document
# must be reviewed before any metric is changed from pending.
PENDING_METRICS = [
    "corn_yield_vs_baseline_pct",
    "soybean_yield_vs_baseline_pct",
    "herbicide_use_vs_baseline_pct",
    "profitability",
    "water_demand",
    "nitrogen_requirement_or_losses",
    "erosion",
]


def load_json(path: Path) -> dict[str, Any]:
    try:
        with path.open(encoding="utf-8") as f:
            result = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        raise RotationEngineError(
            f"Cannot read JSON file {path}: {exc}"
        ) from exc

    if not isinstance(result, dict):
        raise RotationEngineError(
            f"Expected a JSON object in {path}"
        )
    return result


def finite_number(value: Any) -> bool:
    """Return True for finite numeric values, excluding booleans."""
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def validate_environment_summary(
    config: dict[str, Any],
    environment: dict[str, Any],
) -> None:
    expected_region_id = config["region"]["id"]

    actual_region_id = (
        environment.get("region", {}).get("id")
    )

    if actual_region_id != expected_region_id:
        raise RotationEngineError(
            "Environment summary region mismatch: "
            f"expected {expected_region_id!r}, "
            f"found {actual_region_id!r}"
        )

    if environment.get("schema_version") != "1.0":
        raise RotationEngineError(
            "Unsupported environment summary schema_version"
        )

    seasons = environment.get("climate_by_season")

    if not isinstance(seasons, list) or not seasons:
        raise RotationEngineError(
            "Environment summary has no seasonal climate records"
        )

    years = []

    for season in seasons:
        if not isinstance(season, dict):
            raise RotationEngineError(
                "Invalid climate season record"
            )

        year = season.get("year")
        if not isinstance(year, int) or isinstance(year, bool):
            raise RotationEngineError(
                f"Invalid climate season year: {year!r}"
            )

        if year in years:
            raise RotationEngineError(
                f"Duplicate climate season year: {year}"
            )

        years.append(year)

        for field in (
            "precip_mm",
            "precip_anomaly_pct",
            "longest_dry_spell_days",
        ):
            value = season.get(field)
            if value is not None and not finite_number(value):
                raise RotationEngineError(
                    f"Invalid {field} value for {year}"
                )

    if years != sorted(years):
        raise RotationEngineError(
            "Climate seasons must be ordered by year"
        )


def build_pending_metrics() -> list[dict[str, Any]]:
    """Return explicit pending evidence records for each alternative."""
    metrics = []

    for rotation_id in ("cso3", "csoa4"):
        for metric_name in PENDING_METRICS:
            metrics.append({
                "rotation_id": rotation_id,
                "metric": metric_name,
                "value": None,
                "provenance": "pending",
                "citation": None,
                "applicability": None,
                "confidence": None,
                "status": "pending",
            })

    return metrics


def build_climate_stress_context(
    environment: dict[str, Any],
) -> list[dict[str, str]]:
    """Describe the latest season without claiming a climate trend."""
    latest = environment["climate_by_season"][-1]
    year = latest["year"]

    dry_spell = latest.get("longest_dry_spell_days")
    precip_anomaly = latest.get("precip_anomaly_pct")

    if dry_spell is None:
        dry_relevance = (
            f"Longest dry spell for {year} is unavailable because "
            "the required climate data are incomplete."
        )
    else:
        dry_relevance = (
            f"The {year} growing season recorded {dry_spell} "
            "consecutive days with precipitation below 1 mm. "
            "This is climate context, not a crop water-demand estimate."
        )

    if precip_anomaly is None:
        precip_relevance = (
            f"Growing-season precipitation anomaly for {year} "
            "is unavailable because the required baseline or "
            "seasonal data are incomplete."
        )
    else:
        precip_relevance = (
            f"The {year} growing-season precipitation total was "
            f"{precip_anomaly:+.2f}% relative to the 1991-2020 "
            "seasonal baseline. This is not a yield forecast."
        )

    return [
        {
            "indicator": "longest_dry_spell_days",
            "trend": "not_assessed",
            "relevance": dry_relevance,
        },
        {
            "indicator": "precipitation_anomaly_pct",
            "trend": "not_assessed",
            "relevance": precip_relevance,
        },
    ]


def validate_rotation_comparison(
    result: dict[str, Any],
) -> None:
    """Validate rotation definitions and evidence-status rules."""
    if result.get("schema_version") != "1.0":
        raise RotationEngineError(
            "Unsupported rotation comparison schema_version"
        )

    if result.get("disclaimer") != (
        "Decision support only; not a yield forecast."
    ):
        raise RotationEngineError(
            "Required decision-support disclaimer is missing"
        )

    actual_rotations = result.get("rotations")
    if actual_rotations != ROTATIONS:
        raise RotationEngineError(
            "Rotation definitions do not match the approved methodology"
        )

    valid_rotation_ids = {item["id"] for item in ROTATIONS}
    metrics = result.get("metrics")

    if not isinstance(metrics, list):
        raise RotationEngineError("metrics must be a list")

    seen = set()

    required_fields = {
        "rotation_id",
        "metric",
        "value",
        "provenance",
        "citation",
        "applicability",
        "confidence",
        "status",
    }

    for item in metrics:
        if not isinstance(item, dict):
            raise RotationEngineError(
                "Every metric must be a JSON object"
            )

        if not required_fields.issubset(item):
            raise RotationEngineError(
                f"Metric is missing fields: {required_fields - set(item)}"
            )

        rotation_id = item["rotation_id"]
        metric_name = item["metric"]

        if rotation_id not in valid_rotation_ids:
            raise RotationEngineError(
                f"Unknown rotation ID: {rotation_id}"
            )

        key = (rotation_id, metric_name)
        if key in seen:
            raise RotationEngineError(
                f"Duplicate metric: {key}"
            )
        seen.add(key)

        status = item["status"]
        provenance = item["provenance"]
        value = item["value"]

        if status == "pending":
            if value is not None or provenance != "pending":
                raise RotationEngineError(
                    f"Pending metric {key} must have null value "
                    "and provenance 'pending'"
                )
            continue

        if status != "supported":
            raise RotationEngineError(
                f"Unsupported evidence status for {key}: {status!r}"
            )

        if not finite_number(value):
            raise RotationEngineError(
                f"Supported metric {key} must have a finite numeric value"
            )

        if provenance not in {"literature", "computed", "assumption"}:
            raise RotationEngineError(
                f"Invalid provenance for supported metric {key}"
            )

        if provenance == "literature":
            if not isinstance(item["citation"], str) or not item["citation"].strip():
                raise RotationEngineError(
                    f"Literature metric {key} requires a citation"
                )

            if not isinstance(item["applicability"], str) or not item["applicability"].strip():
                raise RotationEngineError(
                    f"Literature metric {key} requires applicability context"
                )


def build_rotation_comparison(
    config: dict[str, Any],
    environment: dict[str, Any],
) -> dict[str, Any]:
    """Build the methodology-compliant crop rotation comparison."""
    validate_environment_summary(config, environment)

    result = {
        "schema_version": "1.0",
        "region_id": config["region"]["id"],
        "disclaimer": "Decision support only; not a yield forecast.",
        "rotations": [dict(item) for item in ROTATIONS],
        "metrics": build_pending_metrics(),
        "climate_stress_context": build_climate_stress_context(
            environment
        ),
    }

    validate_rotation_comparison(result)
    return result


def run(
    config_path: Path = DEFAULT_CONFIG,
    environment_path: Path | None = None,
    out_path: Path | None = None,
) -> Path:
    config = load_json(config_path)
    region_id = config["region"]["id"]

    environment_path = environment_path or (
        DEFAULT_PROCESSED_ROOT
        / region_id
        / "environment_summary.json"
    )

    out_path = out_path or (
        DEFAULT_PROCESSED_ROOT
        / region_id
        / "rotation_comparison.json"
    )

    environment = load_json(environment_path)

    result = build_rotation_comparison(config, environment)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = out_path.with_suffix(out_path.suffix + ".tmp")

    try:
        temporary_path.write_text(
            json.dumps(result, indent=2, allow_nan=False) + "\n",
            encoding="utf-8",
        )
        temporary_path.replace(out_path)
    except OSError as exc:
        temporary_path.unlink(missing_ok=True)
        raise RotationEngineError(
            f"Cannot write rotation comparison {out_path}: {exc}"
        ) from exc

    return out_path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Build TerraShift's evidence-aware rotation comparison."
    )
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--environment", type=Path)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args(argv)

    try:
        output = run(
            config_path=args.config,
            environment_path=args.environment,
            out_path=args.out,
        )
    except (
        RotationEngineError,
        KeyError,
        TypeError,
        ValueError,
    ) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    print(f"Rotation comparison written: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
