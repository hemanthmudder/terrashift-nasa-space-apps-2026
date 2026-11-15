"""Evidence records for TerraShift rotation metrics (METHODOLOGY.md section 4.4).

Two kinds of evidence are kept strictly apart:

* **Rotation metric records** (``rotation_id``) support one metric for one
  rotation. They are the only records that can fill the per-rotation
  ``metrics`` array.
* **Pooled comparison records** (``comparison_group`` + ``comparator``)
  describe a result reported for several rotations *together* against a
  comparator, e.g. "the 3-yr and 4-yr rotations, pooled, versus the 2-yr
  rotation". They are published once, in ``research_comparisons``, and are
  never copied onto the individual rotations in the group: a pooled contrast
  is not a measured effect of any single member.

Every record needs a finite value, a supported provenance, a citation or
computation reference, applicability context and a confidence level.

Approval gate
-------------
Records are applied only when ``review_status == "approved"``. Approval is a
team decision recorded in an evidence file passed to the engine
(``--evidence``); this module never approves anything by itself.

``DAVIS_2012_POOLED_CANDIDATES`` holds the Marsden Farm findings transcribed
from the open-access article and checked against its Results section on
2026-11-15. They are ``pending_team_review`` because docs/ROTATION_EVIDENCE.md,
the project's evidence review, does not exist yet.

Standard library only.
"""

from __future__ import annotations

import copy
import json
import math
from pathlib import Path
from typing import Any

EVIDENCE_SCHEMA_VERSION = "1.0"

SUPPORTED_PROVENANCE = frozenset({"literature", "computed", "assumption"})
ALL_PROVENANCE = SUPPORTED_PROVENANCE | {"pending"}
CONFIDENCE_LEVELS = frozenset({"low", "medium", "high"})
APPROVED = "approved"
REVIEW_STATUSES = frozenset({APPROVED, "pending_team_review", "rejected"})

# Literature must say where it comes from; it can never be relabelled as
# Story County data (METHODOLOGY.md section 2, "Literature" row).
LITERATURE_SCOPES = frozenset({"adjacent_county_research", "other_region_research"})

# Fields every record needs, whatever its kind.
COMMON_FIELDS = (
    "metric",
    "value",
    "unit",
    "provenance",
    "citation",
    "applicability",
    "confidence",
    "review_status",
)
ROTATION_RECORD_FIELDS = ("rotation_id",) + COMMON_FIELDS
POOLED_RECORD_FIELDS = ("comparison_id", "comparison_group", "comparator", "pooled") + COMMON_FIELDS

# Additional fields required for literature records.
REQUIRED_LITERATURE_FIELDS = (
    "evidence_scope",
    "location",
    "study_period",
    "comparison",
    "management_differences",
    "source_url",
)

# Keys that identify a pooled record; a rotation metric record must not carry them.
POOLED_ONLY_KEYS = ("comparison_group", "comparator", "comparison_id", "pooled")


class EvidenceError(ValueError):
    """Raised when an evidence record or evidence file is invalid."""


def is_finite_number(value: Any) -> bool:
    """True for finite int/float values; booleans are rejected."""
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _non_empty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


# --------------------------------------------------------------------------- candidates

DAVIS_2012_CITATION = (
    "Davis AS, Hill JD, Chase CA, Johanns AM, Liebman M (2012). Increasing cropping "
    "system diversity balances productivity, profitability and environmental health. "
    "PLOS ONE 7(10): e47149. doi:10.1371/journal.pone.0047149. "
    "Marsden Farm, Boone County, Iowa."
)
DAVIS_2012_URL = "https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0047149"
DAVIS_2012_LOCATION = (
    "Iowa State University Marsden Farm, Boone County, Iowa (adjacent to Story County); "
    "research plots"
)
DAVIS_2012_PERIOD = "2003-2011"
DAVIS_2012_MANAGEMENT = (
    "The 3-yr and 4-yr systems were not managed like the 2-yr system: they received "
    "periodic cattle manure, lower synthetic N fertilizer and herbicide inputs "
    "(banded herbicide with inter-row cultivation) and required more labor. "
    "Differences reflect the whole management system, not crop rotation alone."
)
DAVIS_2012_GROUP = ["cso3", "csoa4"]
DAVIS_2012_COMPARATOR = "cs2"


def _davis_pooled(comparison_id: str, metric: str, value: float, comparison: str,
                  confidence_basis: str, source_locator: str) -> dict[str, Any]:
    applicability = (
        "Adjacent-county research evidence; not a Story County observation, yield "
        f"forecast or guaranteed outcome. {DAVIS_2012_LOCATION}, {DAVIS_2012_PERIOD}. "
        "Pooled result for the 3-yr and 4-yr rotations together versus the 2-yr "
        "rotation; it is not a separate effect of either rotation. "
        f"Comparison: {comparison} {DAVIS_2012_MANAGEMENT}"
    )
    return {
        "comparison_id": comparison_id,
        "comparison_group": list(DAVIS_2012_GROUP),
        "comparator": DAVIS_2012_COMPARATOR,
        "pooled": True,
        "metric": metric,
        "value": value,
        "unit": "percent_vs_comparator",
        "provenance": "literature",
        "citation": DAVIS_2012_CITATION,
        "applicability": applicability,
        "confidence": "medium",
        "confidence_basis": confidence_basis,
        "evidence_scope": "adjacent_county_research",
        "location": DAVIS_2012_LOCATION,
        "study_period": DAVIS_2012_PERIOD,
        "comparison": comparison,
        "management_differences": DAVIS_2012_MANAGEMENT,
        "source_url": DAVIS_2012_URL,
        "source_locator": source_locator,
        "review_status": "pending_team_review",
        "verified_on": "2026-11-15",
    }


DAVIS_2012_POOLED_CANDIDATES: tuple[dict[str, Any], ...] = (
    _davis_pooled(
        "davis2012_marsden_corn_yield",
        "corn_yield_vs_baseline_pct", 4,
        "Maize (corn) grain yield in the 3-yr and 4-yr rotations, pooled, versus the "
        "conventionally managed 2-yr corn-soybean rotation: on average 4% greater. "
        "The paper reports the 3-yr and 4-yr rotations as similar to each other "
        "(system means 12.3, 12.7 and 12.9 Mg/ha for the 2-, 3- and 4-yr rotations).",
        "Pre-planned contrast P = 0.03; one research site, nine seasons; management "
        "differences confound the rotation effect.",
        "Results: maize grain yield 'on average 4% greater in the 3-yr and 4-yr rotations'.",
    ),
    _davis_pooled(
        "davis2012_marsden_soybean_yield",
        "soybean_yield_vs_baseline_pct", 9,
        "Soybean grain yield in the 3-yr and 4-yr rotations, pooled, versus the "
        "conventionally managed 2-yr corn-soybean rotation: on average 9% greater. "
        "The paper reports the 3-yr and 4-yr rotations as similar to each other "
        "(system means 3.4, 3.8 and 3.8 Mg/ha for the 2-, 3- and 4-yr rotations).",
        "Pre-planned contrast P = 0.01; one research site, nine seasons; management "
        "differences confound the rotation effect.",
        "Results: soybean grain yield 'on average 9% greater in the 3-yr and 4-yr rotations'.",
    ),
    _davis_pooled(
        "davis2012_marsden_herbicide_use",
        "herbicide_use_vs_baseline_pct", -88,
        "Herbicide use in the 3-yr and 4-yr rotations, pooled, versus the 2-yr "
        "rotation: 88% lower (application rates 1.9, 0.26 and 0.20 kg a.i./ha for the "
        "2-, 3- and 4-yr rotations). Lower herbicide use was part of the diversified "
        "management design, not a consequence of rotation alone.",
        "Large, consistent difference (P < 0.0001), but it was set by the management "
        "design; one research site.",
        "Results: 'reducing herbicide use by 88% in the 3-yr and 4-yr rotations'.",
    ),
)


def candidate_pooled_evidence() -> list[dict[str, Any]]:
    """Deep copies of the unreviewed pooled candidate records (safe to modify)."""
    return copy.deepcopy(list(DAVIS_2012_POOLED_CANDIDATES))


def candidate_evidence() -> list[dict[str, Any]]:
    """Unreviewed per-rotation candidates. None exist: the Davis et al. 2012
    findings are pooled and live in ``candidate_pooled_evidence()``."""
    return []


# --------------------------------------------------------------------------- validation


def _validate_common(record: dict[str, Any], label: str) -> None:
    for field in ("metric", "unit"):
        if not _non_empty_string(record[field]):
            raise EvidenceError(f"Evidence record {label}: {field} must be a non-empty string")

    provenance = record["provenance"]
    if provenance == "pending":
        raise EvidenceError(
            f"Evidence record {label}: provenance 'pending' is not evidence; "
            "omit the record and the metric stays pending"
        )
    if provenance not in SUPPORTED_PROVENANCE:
        raise EvidenceError(
            f"Evidence record {label}: invalid provenance {provenance!r} "
            f"(allowed: {sorted(SUPPORTED_PROVENANCE)})"
        )

    if not is_finite_number(record["value"]):
        raise EvidenceError(
            f"Evidence record {label}: value must be a finite number, got {record['value']!r}"
        )
    if not _non_empty_string(record["citation"]):
        raise EvidenceError(
            f"Evidence record {label}: a citation or computation reference is required"
        )
    if not _non_empty_string(record["applicability"]):
        raise EvidenceError(f"Evidence record {label}: applicability context is required")
    if record["confidence"] not in CONFIDENCE_LEVELS:
        raise EvidenceError(
            f"Evidence record {label}: confidence must be one of {sorted(CONFIDENCE_LEVELS)}"
        )
    if record["review_status"] not in REVIEW_STATUSES:
        raise EvidenceError(
            f"Evidence record {label}: review_status must be one of {sorted(REVIEW_STATUSES)}"
        )

    if provenance == "literature":
        missing_lit = [f for f in REQUIRED_LITERATURE_FIELDS if not _non_empty_string(record.get(f))]
        if missing_lit:
            raise EvidenceError(
                f"Literature evidence {label} is missing context fields: {missing_lit}"
            )
        if record["evidence_scope"] not in LITERATURE_SCOPES:
            raise EvidenceError(
                f"Literature evidence {label}: evidence_scope must be one of "
                f"{sorted(LITERATURE_SCOPES)}; literature is never local observed data"
            )


def validate_evidence_record(record: Any) -> None:
    """Validate a per-rotation metric record (one rotation, one metric)."""
    if not isinstance(record, dict):
        raise EvidenceError("Evidence record must be a JSON object")

    pooled_keys = [k for k in POOLED_ONLY_KEYS if k in record]
    if pooled_keys:
        raise EvidenceError(
            f"Rotation metric record carries pooled-comparison fields {pooled_keys}; "
            "pooled results belong in research_comparisons, not on individual rotations"
        )

    missing = [f for f in ROTATION_RECORD_FIELDS if f not in record]
    if missing:
        raise EvidenceError(f"Evidence record is missing fields: {missing}")

    label = f"{record.get('rotation_id')!r}/{record.get('metric')!r}"
    if not _non_empty_string(record["rotation_id"]):
        raise EvidenceError(f"Evidence record {label}: rotation_id must be a non-empty string")
    _validate_common(record, label)


def validate_pooled_record(record: Any) -> None:
    """Validate a pooled comparison record (several rotations vs a comparator).

    Checks structure only; whether the IDs are approved rotations (and the
    comparator is the baseline) is checked by the engine.
    """
    if not isinstance(record, dict):
        raise EvidenceError("Pooled evidence record must be a JSON object")
    if "rotation_id" in record:
        raise EvidenceError(
            "Pooled evidence record must not have a rotation_id; it describes a "
            "comparison group, not one rotation"
        )

    missing = [f for f in POOLED_RECORD_FIELDS if f not in record]
    if missing:
        raise EvidenceError(f"Pooled evidence record is missing fields: {missing}")

    label = f"{record.get('comparison_id')!r}"
    if not _non_empty_string(record["comparison_id"]):
        raise EvidenceError("Pooled evidence record needs a non-empty comparison_id")
    if record["pooled"] is not True:
        raise EvidenceError(f"Pooled evidence {label}: 'pooled' must be true")

    group = record["comparison_group"]
    if (
        not isinstance(group, list)
        or not all(_non_empty_string(g) for g in group)
        or len(group) < 2
        or len(set(group)) != len(group)
    ):
        raise EvidenceError(
            f"Pooled evidence {label}: comparison_group must list at least two distinct "
            "rotation IDs (a single rotation is not a pooled comparison)"
        )
    comparator = record["comparator"]
    if not _non_empty_string(comparator):
        raise EvidenceError(f"Pooled evidence {label}: comparator must be a rotation ID")
    if comparator in group:
        raise EvidenceError(f"Pooled evidence {label}: comparator cannot be in comparison_group")

    _validate_common(record, label)


def _reject_constant(token: str) -> Any:
    raise EvidenceError(f"Evidence file contains non-finite number {token}")


def load_evidence_file(path: Path) -> dict[str, list[dict[str, Any]]]:
    """Read an evidence file.

    Format: {"schema_version": "1.0", "records": [...], "research_comparisons": [...]}
    where ``records`` are per-rotation metric records and ``research_comparisons``
    are pooled records. At least one of the two lists must be present.
    """
    try:
        with path.open(encoding="utf-8") as f:
            data = json.load(f, parse_constant=_reject_constant)
    except (OSError, json.JSONDecodeError) as exc:
        raise EvidenceError(f"Cannot read evidence file {path}: {exc}") from exc

    if not isinstance(data, dict) or data.get("schema_version") != EVIDENCE_SCHEMA_VERSION:
        raise EvidenceError(
            f"Evidence file {path} must be an object with schema_version "
            f"{EVIDENCE_SCHEMA_VERSION!r}"
        )
    if "records" not in data and "research_comparisons" not in data:
        raise EvidenceError(
            f"Evidence file {path} must contain 'records' and/or 'research_comparisons'"
        )

    records = data.get("records", [])
    pooled = data.get("research_comparisons", [])
    if not isinstance(records, list) or not isinstance(pooled, list):
        raise EvidenceError(f"Evidence file {path}: 'records' and 'research_comparisons' must be lists")
    for record in records:
        validate_evidence_record(record)
    for record in pooled:
        validate_pooled_record(record)
    return {"records": records, "research_comparisons": pooled}


def approved_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Validate every rotation metric record; return the approved ones in order."""
    for record in records:
        validate_evidence_record(record)
    return [r for r in records if r["review_status"] == APPROVED]


def approved_pooled_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Validate every pooled record; return the approved ones in order."""
    for record in records:
        validate_pooled_record(record)
    return [r for r in records if r["review_status"] == APPROVED]


def record_to_metric(record: dict[str, Any]) -> dict[str, Any]:
    """Convert a validated, approved rotation record into a section 4.4 metric."""
    return {
        "rotation_id": record["rotation_id"],
        "metric": record["metric"],
        "value": record["value"],
        "provenance": record["provenance"],
        "citation": record["citation"],
        "applicability": record["applicability"],
        "confidence": record["confidence"],
        "status": "supported",
    }


# Fields copied from an approved pooled record into research_comparisons.
RESEARCH_COMPARISON_FIELDS = (
    "comparison_id",
    "metric",
    "value",
    "unit",
    "comparison_group",
    "comparator",
    "pooled",
    "provenance",
    "citation",
    "applicability",
    "confidence",
    "evidence_scope",
    "location",
    "study_period",
    "comparison",
    "management_differences",
    "source_url",
)


def pooled_record_to_comparison(record: dict[str, Any]) -> dict[str, Any]:
    """Convert a validated, approved pooled record into a research comparison."""
    out = {f: copy.deepcopy(record.get(f)) for f in RESEARCH_COMPARISON_FIELDS}
    out["status"] = "supported"
    return out
