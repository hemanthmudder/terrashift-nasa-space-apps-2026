"""Build evidence-aware crop rotation comparisons for TerraShift.

Implements docs/METHODOLOGY.md section 4.4 for the pilot region.

What the engine does
--------------------
1. Validates the three approved rotation definitions (cs2, cso3, csoa4).
2. Validates the environment summary (section 4.3) and turns its seasonal
   climate indicators into descriptive climate context.
3. Builds one metric per (non-baseline rotation, comparison metric). A metric
   is ``supported`` only when an approved evidence record supports it
   (see src/engine/evidence.py); otherwise it is explicitly ``pending``.
4. Reports which inputs (climate, soils, land cover) are available or pending.
5. Validates the complete output before writing it.

What it deliberately does not do
--------------------------------
* No yield prediction, ranking, weighting or overall score. The engine never
  declares a "best" rotation.
* No soil, water-demand, nitrogen or erosion values unless evidence is
  supplied; missing inputs become explicit pending states, never zeros.
* Climate context is descriptive. It does not show that any rotation will
  perform better.

Output keys
-----------
The six keys of section 4.4 (``schema_version``, ``region_id``,
``disclaimer``, ``rotations``, ``metrics``, ``climate_stress_context``) keep
their documented names and shapes. Four keys are added for transparency and
are ignored by consumers that do not know them: ``research_comparisons``,
``rotation_profiles``, ``input_readiness`` and ``evidence_sources``. Climate
context entries keep ``indicator``/``trend``/``relevance`` and add
descriptive fields.

Pooled research
---------------
Some published results compare several rotations *together* against a
comparator (Davis et al. 2012 pools the 3-yr and 4-yr rotations against the
2-yr rotation). Such a result is not a measured effect of any one rotation,
so it is never written into the per-rotation ``metrics`` array. Approved
pooled results appear exactly once in ``research_comparisons`` with their
``comparison_group`` and ``comparator``; unapproved ones do not appear.

The output contains no timestamps, so repeated runs on the same inputs are
byte-identical.

Usage (from the repository root):
    python3 -m src.engine.rotation_engine
    python3 -m src.engine.rotation_engine --evidence path/to/approved_evidence.json
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any, Iterable, Optional

from src.engine import evidence as ev

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG = REPO_ROOT / "config" / "pilot_region.json"
DEFAULT_PROCESSED_ROOT = REPO_ROOT / "data" / "processed"

SCHEMA_VERSION = "1.0"
DISCLAIMER = "Decision support only; not a yield forecast."


class RotationEngineError(ValueError):
    """Raised when rotation input or output fails validation."""


# =========================================================================== definitions

# Approved rotations, exactly as in METHODOLOGY.md section 4.4.
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

# Crop phases used by the approved rotations. Descriptions restate the
# methodology; ``forage_legume`` marks the red clover / alfalfa phases.
CROPS: dict[str, dict[str, Any]] = {
    "corn": {"description": "Corn (maize) for grain", "forage_legume": False},
    "soybean": {"description": "Soybean for grain", "forage_legume": False},
    "oat_redclover": {"description": "Small grain (oat) with red clover", "forage_legume": True},
    "oat_alfalfa": {"description": "Small grain (oat) with alfalfa establishment", "forage_legume": True},
    "alfalfa": {"description": "Alfalfa (perennial forage legume)", "forage_legume": True},
}

MIN_SEQUENCE_YEARS = 2
MAX_SEQUENCE_YEARS = 4

# Comparison metrics (relative to the cs2 baseline) and why each is pending
# when no approved evidence is supplied. Basis: METHODOLOGY.md section 2,
# "Evidence status of rotation metrics".
_POOLED_ONLY = (
    "Davis et al. 2012 reports only a pooled result for the 3-yr and 4-yr rotations "
    "together (see research_comparisons once approved); no rotation-specific "
    "evidence exists."
)
COMPARISON_METRICS: dict[str, str] = {
    "corn_yield_vs_baseline_pct": _POOLED_ONLY,
    "soybean_yield_vs_baseline_pct": _POOLED_ONLY,
    "herbicide_use_vs_baseline_pct": _POOLED_ONLY,
    "profitability": (
        "Literature reports similar long-term profit; no local score without local "
        "prices and costs."
    ),
    "water_demand": "No source identified.",
    "nitrogen_requirement_or_losses": "No source identified.",
    "erosion": "No source identified.",
}

# Backward-compatible name: every comparison metric is pending unless evidence
# is approved. Order is the output order.
PENDING_METRICS = list(COMPARISON_METRICS)

METRIC_FIELDS = (
    "rotation_id",
    "metric",
    "value",
    "provenance",
    "citation",
    "applicability",
    "confidence",
    "status",
)


# =========================================================================== helpers


def load_json(path: Path) -> dict[str, Any]:
    """Load a JSON object; NaN/Infinity tokens are rejected."""
    try:
        with path.open(encoding="utf-8") as f:
            result = json.load(f, parse_constant=_reject_json_constant)
    except (OSError, json.JSONDecodeError) as exc:
        raise RotationEngineError(f"Cannot read JSON file {path}: {exc}") from exc

    if not isinstance(result, dict):
        raise RotationEngineError(f"Expected a JSON object in {path}")
    return result


def _reject_json_constant(token: str) -> Any:
    raise RotationEngineError(f"JSON contains non-finite number {token}")


def finite_number(value: Any) -> bool:
    """Return True for finite numeric values, excluding booleans."""
    return ev.is_finite_number(value)


def _non_empty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def rotation_by_id(rotation_id: str) -> dict[str, Any]:
    for rotation in ROTATIONS:
        if rotation["id"] == rotation_id:
            return rotation
    raise RotationEngineError(
        f"Unknown rotation ID {rotation_id!r}; approved IDs are "
        f"{[r['id'] for r in ROTATIONS]}"
    )


def baseline_rotation(rotations: list[dict[str, Any]] = ROTATIONS) -> dict[str, Any]:
    baselines = [r for r in rotations if r.get("baseline") is True]
    if len(baselines) != 1:
        raise RotationEngineError(
            f"Exactly one baseline rotation is required, found {len(baselines)}"
        )
    return baselines[0]


def comparison_rotation_ids(rotations: list[dict[str, Any]] = ROTATIONS) -> list[str]:
    """Non-baseline rotation IDs in definition order."""
    return [r["id"] for r in rotations if r.get("baseline") is not True]


# =========================================================================== rotations


def validate_rotation_definitions(rotations: Any) -> None:
    """Check structure, crops, lengths, baseline and approval of rotations."""
    if not isinstance(rotations, list) or not rotations:
        raise RotationEngineError("rotations must be a non-empty list")

    seen_ids: set[str] = set()
    seen_sequences: set[tuple[str, ...]] = set()

    for rotation in rotations:
        if not isinstance(rotation, dict):
            raise RotationEngineError("Every rotation must be a JSON object")

        missing = {"id", "name", "sequence", "baseline"} - set(rotation)
        if missing:
            raise RotationEngineError(f"Rotation is missing fields: {sorted(missing)}")

        rotation_id = rotation["id"]
        if not _non_empty_string(rotation_id):
            raise RotationEngineError(f"Invalid rotation ID: {rotation_id!r}")
        if rotation_id in seen_ids:
            raise RotationEngineError(f"Duplicate rotation ID: {rotation_id!r}")
        seen_ids.add(rotation_id)

        if not _non_empty_string(rotation["name"]):
            raise RotationEngineError(f"Rotation {rotation_id!r} needs a name")
        if not isinstance(rotation["baseline"], bool):
            raise RotationEngineError(f"Rotation {rotation_id!r}: baseline must be true or false")

        sequence = rotation["sequence"]
        if not isinstance(sequence, list) or not all(isinstance(c, str) for c in sequence):
            raise RotationEngineError(f"Rotation {rotation_id!r}: sequence must be a list of crop names")
        if not MIN_SEQUENCE_YEARS <= len(sequence) <= MAX_SEQUENCE_YEARS:
            raise RotationEngineError(
                f"Rotation {rotation_id!r}: sequence length {len(sequence)} is outside "
                f"{MIN_SEQUENCE_YEARS}-{MAX_SEQUENCE_YEARS} years"
            )
        unknown = [c for c in sequence if c not in CROPS]
        if unknown:
            raise RotationEngineError(
                f"Rotation {rotation_id!r}: unknown crop names {unknown}; "
                f"allowed: {sorted(CROPS)}"
            )
        if tuple(sequence) in seen_sequences:
            raise RotationEngineError(f"Rotation {rotation_id!r} duplicates another sequence")
        seen_sequences.add(tuple(sequence))

    baseline_rotation(rotations)

    if rotations != ROTATIONS:
        raise RotationEngineError(
            "Rotation definitions do not match the approved methodology "
            "(METHODOLOGY.md section 4.4)"
        )


def build_rotation_profiles(
    metrics: list[dict[str, Any]],
    research_comparisons: Optional[list[dict[str, Any]]] = None,
) -> list[dict[str, Any]]:
    """Describe each rotation's structure and the evidence status of its metrics.

    Everything here is derived from the definitions, the metric list and the
    research comparisons; no performance value is introduced. Pooled
    comparisons are referenced by ID only, so their values are never repeated
    under an individual rotation.
    """
    research_comparisons = research_comparisons or []
    base = baseline_rotation()
    profiles = []
    for rotation in ROTATIONS:
        sequence = rotation["sequence"]
        own = [m for m in metrics if m["rotation_id"] == rotation["id"]]
        supported = sorted(m["metric"] for m in own if m["status"] == "supported")
        pending = sorted(m["metric"] for m in own if m["status"] == "pending")
        in_pooled = sorted(c["comparison_id"] for c in research_comparisons
                           if rotation["id"] in c["comparison_group"])
        comparator_of = sorted(c["comparison_id"] for c in research_comparisons
                               if c["comparator"] == rotation["id"])

        if rotation["baseline"]:
            summary = (
                "Baseline rotation. Comparison metrics for the other rotations are "
                "expressed relative to this system; it has no comparison metrics itself."
            )
        elif supported:
            summary = (
                f"{len(supported)} metric(s) supported by approved rotation-specific "
                f"evidence; {len(pending)} pending. Supported metrics describe published "
                "research results, not expected outcomes in Story County."
            )
        else:
            summary = (
                "No approved rotation-specific evidence; every comparison metric is "
                "pending. This is not evidence that the rotation performs worse or "
                "better than the baseline."
            )
        if in_pooled:
            summary += (
                f" It is part of {len(in_pooled)} pooled research comparison(s) that "
                "report several rotations together; those results are not separate "
                "effects of this rotation."
            )

        profiles.append({
            "rotation_id": rotation["id"],
            "name": rotation["name"],
            "baseline": rotation["baseline"],
            "compared_with": None if rotation["baseline"] else base["id"],
            "duration_years": len(sequence),
            "phases": [
                {"year": i, "crop": crop, "description": CROPS[crop]["description"]}
                for i, crop in enumerate(sequence, start=1)
            ],
            "crops": list(dict.fromkeys(sequence)),
            "includes_forage_legume_phase": any(CROPS[c]["forage_legume"] for c in sequence),
            "supported_metrics": supported,
            "pending_metrics": pending,
            "pooled_research_comparisons": in_pooled,
            "comparator_in_research_comparisons": comparator_of,
            "evidence_summary": summary,
        })
    return profiles


# =========================================================================== environment

# Seasonal fields read from the environment summary and their rules:
# (minimum, maximum, must_be_integer). None = unbounded.
SEASON_FIELD_RULES: dict[str, tuple[Optional[float], Optional[float], bool]] = {
    "gdd_c": (0.0, None, False),
    "precip_mm": (0.0, None, False),
    "precip_anomaly_pct": (None, None, False),
    "days_tmax_ge_32c": (0.0, None, True),
    "longest_dry_spell_days": (0.0, None, True),
    "soil_wet_root_mean": (0.0, 1.0, False),
    "missing_days": (0.0, None, True),
}


def validate_environment_summary(
    config: dict[str, Any],
    environment: dict[str, Any],
) -> None:
    """Check region, schema and every seasonal record used by the engine.

    Absent or null indicators are allowed (they become "unavailable" context);
    present values must be finite and physically plausible.
    """
    expected_region_id = _config_region_id(config)

    region = environment.get("region")
    actual_region_id = region.get("id") if isinstance(region, dict) else None
    if actual_region_id != expected_region_id:
        raise RotationEngineError(
            "Environment summary region mismatch: "
            f"expected {expected_region_id!r}, found {actual_region_id!r}"
        )

    if environment.get("schema_version") != SCHEMA_VERSION:
        raise RotationEngineError("Unsupported environment summary schema_version")

    seasons = environment.get("climate_by_season")
    if not isinstance(seasons, list) or not seasons:
        raise RotationEngineError("Environment summary has no seasonal climate records")

    years: list[int] = []
    for season in seasons:
        if not isinstance(season, dict):
            raise RotationEngineError("Invalid climate season record")

        year = season.get("year")
        if not isinstance(year, int) or isinstance(year, bool):
            raise RotationEngineError(f"Invalid climate season year: {year!r}")
        if year in years:
            raise RotationEngineError(f"Duplicate climate season year: {year}")
        years.append(year)

        for field, (lo, hi, integer) in SEASON_FIELD_RULES.items():
            value = season.get(field)
            if value is None:
                continue
            if not finite_number(value):
                raise RotationEngineError(f"Invalid {field} value for {year}: {value!r}")
            if (lo is not None and value < lo) or (hi is not None and value > hi):
                raise RotationEngineError(f"Out-of-range {field} value for {year}: {value!r}")
            if integer and value != int(value):
                raise RotationEngineError(f"{field} for {year} must be a whole number: {value!r}")

        by_indicator = season.get("missing_days_by_indicator")
        if by_indicator is not None:
            if not isinstance(by_indicator, dict) or not all(
                finite_number(v) and v >= 0 for v in by_indicator.values()
            ):
                raise RotationEngineError(f"Invalid missing_days_by_indicator for {year}")

    if years != sorted(years):
        raise RotationEngineError("Climate seasons must be ordered by year")

    land_cover = environment.get("land_cover")
    if isinstance(land_cover, dict):
        estimate_type = land_cover.get("estimate_type")
        if estimate_type is not None and estimate_type != "remotely_sensed":
            raise RotationEngineError(
                "land_cover.estimate_type must be 'remotely_sensed'; CDL crop labels are "
                f"never verified field records (found {estimate_type!r})"
            )


def _config_region_id(config: dict[str, Any]) -> str:
    region = config.get("region") if isinstance(config, dict) else None
    region_id = region.get("id") if isinstance(region, dict) else None
    if not _non_empty_string(region_id):
        raise RotationEngineError("Config has no region.id")
    return region_id


def build_input_readiness(environment: dict[str, Any]) -> dict[str, Any]:
    """Report which engine inputs are available and which are pending.

    Soil and land-cover values are only reported, never consumed: no approved
    method yet links them to a rotation metric.
    """
    seasons = environment["climate_by_season"]
    incomplete = [s["year"] for s in seasons if (s.get("missing_days") or 0) > 0]
    climate = {
        "status": "available",
        "source": "nasa_power",
        "seasons": len(seasons),
        "first_year": seasons[0]["year"],
        "last_year": seasons[-1]["year"],
        "seasons_with_missing_days": incomplete,
        "used_for": "Descriptive climate context only.",
    }

    soils = environment.get("soils") if isinstance(environment.get("soils"), dict) else {}
    aws = soils.get("aws_0_100cm_mm_weighted")
    soils_ready = finite_number(aws) and soils.get("aws_method_status") not in (None, "pending")
    soil_entry = {
        "status": "available" if soils_ready else "pending",
        "source": "ssurgo",
        "reason": (
            "Verified SSURGO summary present; no approved method yet links soil "
            "properties to a rotation metric, so it is not used."
            if soils_ready else
            "No verified SSURGO summary (available water storage method pending); "
            "no soil values are estimated or substituted."
        ),
        "used_for": None,
    }

    land_cover = environment.get("land_cover") if isinstance(environment.get("land_cover"), dict) else {}
    lc_fields = ("corn_pct", "soy_pct", "corn_soy_alternation_pct")
    lc_ready = all(finite_number(land_cover.get(f)) for f in lc_fields)
    land_entry = {
        "status": "available" if lc_ready else "pending",
        "source": "cdl",
        "estimate_type": "remotely_sensed",
        "reason": (
            "County-level CDL estimates present; they describe remotely sensed crop "
            "labels, not verified field rotations, and are not used by any metric."
            if lc_ready else
            "CDL county estimates not yet produced; no crop history is inferred or invented."
        ),
        "used_for": None,
    }

    return {"climate": climate, "soils": soil_entry, "land_cover": land_entry}


# =========================================================================== climate context

# (output indicator name, environment field, unit). The first two names are
# kept from the original output for compatibility.
CLIMATE_INDICATORS: tuple[tuple[str, str, str], ...] = (
    ("longest_dry_spell_days", "longest_dry_spell_days", "days"),
    ("precipitation_anomaly_pct", "precip_anomaly_pct", "percent"),
    ("gdd_c", "gdd_c", "degC_day"),
    ("precip_mm", "precip_mm", "mm"),
    ("days_tmax_ge_32c", "days_tmax_ge_32c", "days"),
    ("soil_wet_root_mean", "soil_wet_root_mean", "unitless_0_1"),
)

INDICATOR_METHODS = {
    "longest_dry_spell_days": "Longest run of growing-season days with precip_mm below 1 (METHODOLOGY.md section 3).",
    "precip_anomaly_pct": "Season total versus the 1991-2020 mean seasonal total, in percent (METHODOLOGY.md section 3).",
    "gdd_c": "Sum of daily corn growing degree days, 1 Apr-31 Oct (METHODOLOGY.md section 3).",
    "precip_mm": "Sum of daily precipitation, 1 Apr-31 Oct.",
    "days_tmax_ge_32c": "Count of growing-season days with tmax_c of at least 32 (METHODOLOGY.md section 3).",
    "soil_wet_root_mean": "Mean NASA POWER GWETROOT model wetness; unitless, not volumetric soil moisture.",
}


def _baseline_years(environment: dict[str, Any]) -> Optional[tuple[int, int]]:
    period = environment.get("period")
    text = period.get("baseline") if isinstance(period, dict) else None
    try:
        start, end = (int(part) for part in str(text).split("-"))
    except (TypeError, ValueError):
        return None
    return (start, end) if start <= end else None


def baseline_mean(environment: dict[str, Any], field: str) -> Optional[float]:
    """Mean of ``field`` over the baseline seasons, or None if any is missing.

    No completeness threshold is approved, so a single missing baseline season
    leaves the mean unpublished rather than computed from a partial record.
    """
    years = _baseline_years(environment)
    if years is None:
        return None
    by_year = {s["year"]: s.get(field) for s in environment["climate_by_season"]}
    wanted = range(years[0], years[1] + 1)
    values = [by_year.get(y) for y in wanted]
    if any(v is None for v in values):
        return None
    return round(sum(values) / len(values), 2)


def _relevance(field: str, year: int, value: Any, mean: Optional[float]) -> str:
    """Plain-language context for one indicator in one season."""
    if field == "longest_dry_spell_days":
        if value is None:
            return (f"Longest dry spell for {year} is unavailable because "
                    "the required climate data are incomplete.")
        return (f"The {year} growing season recorded {value} "
                "consecutive days with precipitation below 1 mm. "
                "This is climate context, not a crop water-demand estimate.")
    if field == "precip_anomaly_pct":
        if value is None:
            return (f"Growing-season precipitation anomaly for {year} "
                    "is unavailable because the required baseline or "
                    "seasonal data are incomplete.")
        return (f"The {year} growing-season precipitation total was "
                f"{value:+.2f}% relative to the 1991-2020 "
                "seasonal baseline. This is not a yield forecast.")

    labels = {
        "gdd_c": "Corn growing degree days",
        "precip_mm": "Growing-season precipitation",
        "days_tmax_ge_32c": "Heat days (Tmax at least 32 C)",
        "soil_wet_root_mean": "Mean root-zone soil wetness (NASA POWER GWETROOT model index)",
    }
    label = labels[field]
    if value is None:
        return (f"{label} for {year} is unavailable because required daily values "
                "are missing; no value is estimated.")
    shown = f"{value:.4g}" if field == "soil_wet_root_mean" else f"{value:g}"
    baseline = f" (1991-2020 mean {mean:g})" if mean is not None else ""
    return (f"{label} for {year}: {shown}{baseline}. Climate context only; it is not "
            "evidence about the relative yield of any rotation.")


def build_climate_stress_context(
    environment: dict[str, Any],
) -> list[dict[str, Any]]:
    """Describe the latest season's indicators without claiming a trend."""
    latest = environment["climate_by_season"][-1]
    year = latest["year"]
    missing_by = latest.get("missing_days_by_indicator") or {}
    seasons = environment["climate_by_season"]

    context = []
    for indicator, field, unit in CLIMATE_INDICATORS:
        value = latest.get(field)
        mean = None if field == "precip_anomaly_pct" else baseline_mean(environment, field)
        context.append({
            "indicator": indicator,
            "trend": "not_assessed",
            "relevance": _relevance(field, year, value, mean),
            "year": year,
            "value": value,
            "unit": unit,
            "baseline_1991_2020_mean": mean,
            "seasons_with_value": sum(s.get(field) is not None for s in seasons),
            "missing_days_in_year": missing_by.get(field),
            "provenance": "computed",
            "method": INDICATOR_METHODS[field],
        })

    missing_days = latest.get("missing_days")
    if missing_days is None:
        missing_text = f"Missing-day information for {year} is not reported."
    elif missing_days == 0:
        missing_text = (f"All required daily values were present for the {year} "
                        "growing season.")
    else:
        missing_text = (f"{missing_days} days in the {year} growing season lacked one or "
                        "more required daily values; affected indicators are not published.")
    context.append({
        "indicator": "missing_days",
        "trend": "not_assessed",
        "relevance": missing_text,
        "year": year,
        "value": missing_days,
        "unit": "days",
        "baseline_1991_2020_mean": None,
        "seasons_with_value": sum(s.get("missing_days") is not None for s in seasons),
        "missing_days_in_year": None,
        "provenance": "computed",
        "method": "Growing-season days with any required daily value missing.",
    })
    return context


# =========================================================================== metrics


def pending_metric(rotation_id: str, metric: str) -> dict[str, Any]:
    return {
        "rotation_id": rotation_id,
        "metric": metric,
        "value": None,
        "provenance": "pending",
        "citation": None,
        "applicability": None,
        "confidence": None,
        "status": "pending",
    }


def build_pending_metrics() -> list[dict[str, Any]]:
    """Return explicit pending evidence records for each alternative."""
    return build_metrics([])


def build_metrics(
    evidence_records: Iterable[dict[str, Any]],
    pooled_records: Iterable[dict[str, Any]] = (),
) -> list[dict[str, Any]]:
    """One metric per (comparison rotation, metric), in a fixed order.

    Approved rotation-specific records replace the matching pending metric;
    records that are not approved are ignored. Invalid, duplicate or unmatched
    records raise. A rotation record that restates a pooled result (same
    metric and citation as a pooled record covering that rotation) is rejected:
    pooled findings must not be split onto individual rotations.
    """
    records = list(evidence_records)
    pooled = list(pooled_records)
    try:
        approved = ev.approved_records(records)
        for record in pooled:
            ev.validate_pooled_record(record)
    except ev.EvidenceError as exc:
        raise RotationEngineError(str(exc)) from exc

    pooled_keys = {
        (rotation_id, p["metric"], p["citation"].strip())
        for p in pooled for rotation_id in p["comparison_group"]
    }

    comparison_ids = comparison_rotation_ids()
    by_key: dict[tuple[str, str], dict[str, Any]] = {}
    for record in approved:
        key = (record["rotation_id"], record["metric"])
        if (record["rotation_id"], record["metric"], record["citation"].strip()) in pooled_keys:
            raise RotationEngineError(
                f"Evidence {key} restates a pooled research comparison from the same "
                "source; pooled results belong in research_comparisons only"
            )
        if record["rotation_id"] not in comparison_ids:
            rotation_by_id(record["rotation_id"])  # raises for unknown IDs
            raise RotationEngineError(
                f"Evidence {key}: the baseline rotation has no comparison metrics"
            )
        if record["metric"] not in COMPARISON_METRICS:
            raise RotationEngineError(
                f"Evidence {key}: unknown metric; allowed: {PENDING_METRICS}"
            )
        if key in by_key:
            raise RotationEngineError(f"Duplicate evidence for metric {key}")
        by_key[key] = record

    metrics = []
    for rotation_id in comparison_ids:
        for metric in PENDING_METRICS:
            record = by_key.get((rotation_id, metric))
            metrics.append(ev.record_to_metric(record) if record else pending_metric(rotation_id, metric))
    return metrics


def validate_comparison_group(group: list[str], comparator: str, label: str) -> None:
    """Group members must be distinct non-baseline approved rotations; the
    comparator must be the baseline."""
    comparison_ids = set(comparison_rotation_ids())
    unknown = [g for g in group if g not in comparison_ids]
    if unknown:
        raise RotationEngineError(
            f"Research comparison {label}: invalid comparison_group members {unknown}; "
            f"allowed: {sorted(comparison_ids)}"
        )
    if len(group) < 2 or len(set(group)) != len(group):
        raise RotationEngineError(
            f"Research comparison {label}: comparison_group needs at least two distinct rotations"
        )
    baseline_id = baseline_rotation()["id"]
    if comparator != baseline_id:
        raise RotationEngineError(
            f"Research comparison {label}: comparator must be the baseline {baseline_id!r}, "
            f"found {comparator!r}"
        )


def build_research_comparisons(pooled_records: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Approved pooled research results, each published exactly once.

    Unapproved records are validated but omitted. Duplicate comparison IDs or
    duplicate (group, comparator, metric, citation) findings raise.
    """
    try:
        approved = ev.approved_pooled_records(list(pooled_records))
    except ev.EvidenceError as exc:
        raise RotationEngineError(str(exc)) from exc

    comparisons = []
    seen_ids: set[str] = set()
    seen_findings: set[tuple[Any, ...]] = set()
    for record in approved:
        label = repr(record["comparison_id"])
        validate_comparison_group(record["comparison_group"], record["comparator"], label)
        if record["metric"] not in COMPARISON_METRICS:
            raise RotationEngineError(
                f"Research comparison {label}: unknown metric {record['metric']!r}"
            )
        finding = (tuple(sorted(record["comparison_group"])), record["comparator"],
                   record["metric"], record["citation"].strip())
        if record["comparison_id"] in seen_ids or finding in seen_findings:
            raise RotationEngineError(f"Duplicate research comparison {label}")
        seen_ids.add(record["comparison_id"])
        seen_findings.add(finding)
        comparisons.append(ev.pooled_record_to_comparison(record))
    return comparisons


def build_evidence_sources(
    evidence_records: Iterable[dict[str, Any]],
    pooled_records: Iterable[dict[str, Any]] = (),
) -> list[dict[str, Any]]:
    """Summarise the sources behind supported metrics and research comparisons."""
    sources: dict[str, dict[str, Any]] = {}

    def entry_for(record: dict[str, Any]) -> dict[str, Any]:
        return sources.setdefault(record["citation"], {
            "citation": record["citation"],
            "provenance": record["provenance"],
            "evidence_scope": record.get("evidence_scope"),
            "location": record.get("location"),
            "study_period": record.get("study_period"),
            "management_differences": record.get("management_differences"),
            "source_url": record.get("source_url"),
            "metrics": [],
            "research_comparisons": [],
        })

    for record in ev.approved_records(list(evidence_records)):
        entry_for(record)["metrics"].append(f"{record['rotation_id']}:{record['metric']}")
    for record in ev.approved_pooled_records(list(pooled_records)):
        entry_for(record)["research_comparisons"].append(record["comparison_id"])
    return [
        dict(s, metrics=sorted(s["metrics"]), research_comparisons=sorted(s["research_comparisons"]))
        for s in sources.values()
    ]


# =========================================================================== output validation


def _check_no_empty_strings(value: Any, path: str = "$") -> None:
    """Section 4.4 marks unfilled fields with ""; a real output must have none."""
    if isinstance(value, str):
        if not value.strip():
            raise RotationEngineError(f"Empty string at {path}; use null for missing values")
    elif isinstance(value, dict):
        for k, v in value.items():
            _check_no_empty_strings(v, f"{path}.{k}")
    elif isinstance(value, list):
        for i, v in enumerate(value):
            _check_no_empty_strings(v, f"{path}[{i}]")
    elif isinstance(value, float) and not math.isfinite(value):
        raise RotationEngineError(f"Non-finite number at {path}")


def validate_metric(item: Any, valid_rotation_ids: set[str]) -> tuple[str, str]:
    """Validate one metric against section 4.4; return its (rotation, metric) key."""
    if not isinstance(item, dict):
        raise RotationEngineError("Every metric must be a JSON object")

    missing = set(METRIC_FIELDS) - set(item)
    if missing:
        raise RotationEngineError(f"Metric is missing fields: {missing}")

    rotation_id = item["rotation_id"]
    metric_name = item["metric"]
    key = (rotation_id, metric_name)

    if rotation_id not in valid_rotation_ids:
        raise RotationEngineError(f"Unknown rotation ID: {rotation_id}")
    if metric_name not in COMPARISON_METRICS:
        raise RotationEngineError(f"Unknown metric name for {rotation_id}: {metric_name!r}")

    status, provenance, value = item["status"], item["provenance"], item["value"]

    if status == "pending":
        if value is not None or provenance != "pending":
            raise RotationEngineError(
                f"Pending metric {key} must have null value and provenance 'pending'"
            )
        return key

    if status != "supported":
        raise RotationEngineError(f"Unsupported evidence status for {key}: {status!r}")
    if not finite_number(value):
        raise RotationEngineError(f"Supported metric {key} must have a finite numeric value")
    if provenance not in ev.SUPPORTED_PROVENANCE:
        raise RotationEngineError(f"Invalid provenance for supported metric {key}: {provenance!r}")
    if not _non_empty_string(item["citation"]):
        if provenance == "literature":
            raise RotationEngineError(f"Literature metric {key} requires a citation")
        raise RotationEngineError(
            f"Supported metric {key} requires a citation or computation reference"
        )
    if not _non_empty_string(item["applicability"]):
        if provenance == "literature":
            raise RotationEngineError(f"Literature metric {key} requires applicability context")
        raise RotationEngineError(f"Supported metric {key} requires applicability context")
    if item["confidence"] not in ev.CONFIDENCE_LEVELS:
        raise RotationEngineError(
            f"Supported metric {key}: confidence must be one of {sorted(ev.CONFIDENCE_LEVELS)}"
        )
    return key


def validate_research_comparisons(comparisons: Any, metrics: list[dict[str, Any]]) -> None:
    """Validate published pooled comparisons and keep them off individual rotations."""
    if not isinstance(comparisons, list):
        raise RotationEngineError("research_comparisons must be a list")

    seen_ids: set[str] = set()
    pooled_keys: set[tuple[str, str, str]] = set()
    for item in comparisons:
        if not isinstance(item, dict):
            raise RotationEngineError("Every research comparison must be a JSON object")
        missing = set(ev.RESEARCH_COMPARISON_FIELDS) | {"status"}
        missing -= set(item)
        if missing:
            raise RotationEngineError(f"Research comparison is missing fields: {sorted(missing)}")

        cid = item["comparison_id"]
        label = repr(cid)
        if not _non_empty_string(cid):
            raise RotationEngineError("Research comparison needs a comparison_id")
        if cid in seen_ids:
            raise RotationEngineError(f"Duplicate research comparison {label}")
        seen_ids.add(cid)

        if item["status"] != "supported" or item["pooled"] is not True:
            raise RotationEngineError(
                f"Research comparison {label} must be pooled and supported; unapproved "
                "evidence is never published"
            )
        group = item["comparison_group"]
        if not isinstance(group, list):
            raise RotationEngineError(f"Research comparison {label}: comparison_group must be a list")
        validate_comparison_group(group, item["comparator"], label)
        if item["metric"] not in COMPARISON_METRICS:
            raise RotationEngineError(f"Research comparison {label}: unknown metric {item['metric']!r}")
        if not finite_number(item["value"]):
            raise RotationEngineError(f"Research comparison {label} must have a finite numeric value")
        if item["provenance"] not in ev.SUPPORTED_PROVENANCE:
            raise RotationEngineError(f"Research comparison {label}: invalid provenance {item['provenance']!r}")
        for field in ("citation", "applicability", "unit"):
            if not _non_empty_string(item[field]):
                raise RotationEngineError(f"Research comparison {label} requires {field}")
        if item["confidence"] not in ev.CONFIDENCE_LEVELS:
            raise RotationEngineError(f"Research comparison {label}: invalid confidence")
        if item["provenance"] == "literature":
            for field in ev.REQUIRED_LITERATURE_FIELDS:
                if not _non_empty_string(item.get(field)):
                    raise RotationEngineError(f"Literature research comparison {label} requires {field}")

        for rotation_id in group:
            pooled_keys.add((rotation_id, item["metric"], item["citation"].strip()))

    for metric in metrics:
        if metric["status"] != "supported":
            continue
        key = (metric["rotation_id"], metric["metric"], str(metric["citation"]).strip())
        if key in pooled_keys:
            raise RotationEngineError(
                f"Metric {key[:2]} restates a pooled research comparison; pooled results "
                "must not be assigned to individual rotations"
            )


def validate_rotation_comparison(
    result: dict[str, Any],
    expected_region_id: Optional[str] = None,
) -> None:
    """Validate rotation definitions, metrics, context and serialisability."""
    if not isinstance(result, dict):
        raise RotationEngineError("Rotation comparison must be a JSON object")
    if result.get("schema_version") != SCHEMA_VERSION:
        raise RotationEngineError("Unsupported rotation comparison schema_version")
    if result.get("disclaimer") != DISCLAIMER:
        raise RotationEngineError("Required decision-support disclaimer is missing")

    region_id = result.get("region_id")
    if not _non_empty_string(region_id):
        raise RotationEngineError("region_id is missing")
    if expected_region_id is not None and region_id != expected_region_id:
        raise RotationEngineError(
            f"region_id mismatch: expected {expected_region_id!r}, found {region_id!r}"
        )

    validate_rotation_definitions(result.get("rotations"))

    metrics = result.get("metrics")
    if not isinstance(metrics, list):
        raise RotationEngineError("metrics must be a list")

    baseline_id = baseline_rotation(result["rotations"])["id"]
    valid_ids = {r["id"] for r in ROTATIONS}
    seen: set[tuple[str, str]] = set()
    for item in metrics:
        key = validate_metric(item, valid_ids)
        if key in seen:
            raise RotationEngineError(f"Duplicate metric: {key}")
        if key[0] == baseline_id:
            raise RotationEngineError(f"Baseline rotation {baseline_id!r} cannot have comparison metric {key}")
        seen.add(key)

    validate_research_comparisons(result.get("research_comparisons"), metrics)

    context = result.get("climate_stress_context")
    if not isinstance(context, list):
        raise RotationEngineError("climate_stress_context must be a list")
    for entry in context:
        if not isinstance(entry, dict) or not all(
            _non_empty_string(entry.get(f)) for f in ("indicator", "trend", "relevance")
        ):
            raise RotationEngineError(
                "Each climate_stress_context entry needs indicator, trend and relevance"
            )
        value = entry.get("value")
        if value is not None and not finite_number(value):
            raise RotationEngineError(f"Climate context {entry['indicator']} has a non-finite value")

    _check_no_empty_strings(result)
    try:
        json.dumps(result, allow_nan=False)
    except (TypeError, ValueError) as exc:
        raise RotationEngineError(f"Rotation comparison is not valid JSON: {exc}") from exc


# =========================================================================== orchestration


def build_rotation_comparison(
    config: dict[str, Any],
    environment: dict[str, Any],
    evidence_records: Optional[Iterable[dict[str, Any]]] = None,
    pooled_records: Optional[Iterable[dict[str, Any]]] = None,
) -> dict[str, Any]:
    """Build the methodology-compliant crop rotation comparison.

    ``evidence_records`` are rotation-specific records; ``pooled_records`` are
    pooled comparison records. Both default to none, so every comparison
    metric is pending and ``research_comparisons`` is empty. Only records with
    ``review_status == "approved"`` are applied.
    """
    region_id = _config_region_id(config)
    validate_rotation_definitions([dict(r, sequence=list(r["sequence"])) for r in ROTATIONS])
    validate_environment_summary(config, environment)

    records = list(evidence_records or [])
    pooled = list(pooled_records or [])
    metrics = build_metrics(records, pooled)
    research_comparisons = build_research_comparisons(pooled)

    result = {
        "schema_version": SCHEMA_VERSION,
        "region_id": region_id,
        "disclaimer": DISCLAIMER,
        "rotations": [dict(r, sequence=list(r["sequence"])) for r in ROTATIONS],
        "metrics": metrics,
        "climate_stress_context": build_climate_stress_context(environment),
        "research_comparisons": research_comparisons,
        "rotation_profiles": build_rotation_profiles(metrics, research_comparisons),
        "input_readiness": build_input_readiness(environment),
        "evidence_sources": build_evidence_sources(records, pooled),
    }

    validate_rotation_comparison(result, expected_region_id=region_id)
    return result


def serialise(result: dict[str, Any]) -> str:
    """Deterministic JSON text for the output file."""
    return json.dumps(result, indent=2, allow_nan=False, ensure_ascii=False) + "\n"


def run(
    config_path: Path = DEFAULT_CONFIG,
    environment_path: Path | None = None,
    out_path: Path | None = None,
    evidence_path: Path | None = None,
) -> Path:
    config = load_json(config_path)
    region_id = _config_region_id(config)

    environment_path = environment_path or (
        DEFAULT_PROCESSED_ROOT / region_id / "environment_summary.json"
    )
    out_path = out_path or (DEFAULT_PROCESSED_ROOT / region_id / "rotation_comparison.json")

    environment = load_json(environment_path)
    records: list[dict[str, Any]] = []
    pooled: list[dict[str, Any]] = []
    if evidence_path is not None:
        try:
            bundle = ev.load_evidence_file(evidence_path)
        except ev.EvidenceError as exc:
            raise RotationEngineError(str(exc)) from exc
        records, pooled = bundle["records"], bundle["research_comparisons"]

    result = build_rotation_comparison(config, environment, records, pooled)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = out_path.with_suffix(out_path.suffix + ".tmp")
    try:
        temporary_path.write_text(serialise(result), encoding="utf-8")
        temporary_path.replace(out_path)
    except OSError as exc:
        temporary_path.unlink(missing_ok=True)
        raise RotationEngineError(f"Cannot write rotation comparison {out_path}: {exc}") from exc

    return out_path


def write_candidate_evidence(path: Path) -> Path:
    """Write the unreviewed candidate records as an evidence file for team review."""
    payload = {
        "schema_version": ev.EVIDENCE_SCHEMA_VERSION,
        "records": ev.candidate_evidence(),
        "research_comparisons": ev.candidate_pooled_evidence(),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Build TerraShift's evidence-aware rotation comparison."
    )
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--environment", type=Path)
    parser.add_argument("--out", type=Path)
    parser.add_argument(
        "--evidence", type=Path,
        help="Evidence file; only records with review_status 'approved' are applied.",
    )
    parser.add_argument(
        "--write-candidate-evidence", type=Path, metavar="PATH",
        help="Write the unreviewed Davis et al. 2012 candidate records for review, then exit.",
    )
    args = parser.parse_args(argv)

    if args.write_candidate_evidence:
        path = write_candidate_evidence(args.write_candidate_evidence)
        print(f"Candidate evidence (review_status pending_team_review) written: {path}")
        return 0

    try:
        output = run(
            config_path=args.config,
            environment_path=args.environment,
            out_path=args.out,
            evidence_path=args.evidence,
        )
    except (RotationEngineError, KeyError, TypeError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    print(f"Rotation comparison written: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
