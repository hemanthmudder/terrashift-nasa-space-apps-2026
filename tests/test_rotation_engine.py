"""Tests for TerraShift's evidence-aware crop rotation engine."""

import copy
import unittest

from src.engine import rotation_engine as engine


def make_config():
    return {
        "region": {"id": "ia-story-19169"},
    }


def make_environment():
    return {
        "schema_version": "1.0",
        "region": {"id": "ia-story-19169"},
        "climate_by_season": [
            {
                "year": 2024,
                "precip_mm": 700.0,
                "precip_anomaly_pct": -5.0,
                "longest_dry_spell_days": 12,
            },
            {
                "year": 2025,
                "precip_mm": 770.64,
                "precip_anomaly_pct": 9.76,
                "longest_dry_spell_days": 14,
            },
        ],
    }


class TestRotationDefinitions(unittest.TestCase):

    def test_defines_all_three_approved_rotations(self):
        result = engine.build_rotation_comparison(
            make_config(), make_environment()
        )

        self.assertEqual(
            [r["id"] for r in result["rotations"]],
            ["cs2", "cso3", "csoa4"],
        )

        self.assertEqual(
            result["rotations"][0]["sequence"],
            ["corn", "soybean"],
        )
        self.assertTrue(result["rotations"][0]["baseline"])

        self.assertEqual(
            result["rotations"][1]["sequence"],
            ["corn", "soybean", "oat_redclover"],
        )
        self.assertEqual(
            result["rotations"][2]["sequence"],
            ["corn", "soybean", "oat_alfalfa", "alfalfa"],
        )

    def test_includes_required_disclaimer(self):
        result = engine.build_rotation_comparison(
            make_config(), make_environment()
        )

        self.assertEqual(
            result["disclaimer"],
            "Decision support only; not a yield forecast.",
        )

    def test_unsupported_metrics_are_pending_not_scored(self):
        result = engine.build_rotation_comparison(
            make_config(), make_environment()
        )

        self.assertEqual(
            len(result["metrics"]),
            2 * len(engine.PENDING_METRICS),
        )

        for metric in result["metrics"]:
            self.assertIsNone(metric["value"])
            self.assertEqual(metric["provenance"], "pending")
            self.assertEqual(metric["status"], "pending")
            self.assertIsNone(metric["citation"])

    def test_climate_context_uses_latest_season(self):
        result = engine.build_rotation_comparison(
            make_config(), make_environment()
        )

        context = {
            item["indicator"]: item
            for item in result["climate_stress_context"]
        }

        dry = context["longest_dry_spell_days"]
        self.assertEqual(dry["trend"], "not_assessed")
        self.assertIn("2025", dry["relevance"])
        self.assertIn("14 consecutive days", dry["relevance"])

        precip = context["precipitation_anomaly_pct"]
        self.assertIn("+9.76%", precip["relevance"])
        self.assertIn("not a yield forecast", precip["relevance"])


class TestRotationValidation(unittest.TestCase):

    def test_rejects_wrong_environment_region(self):
        environment = make_environment()
        environment["region"]["id"] = "wrong-region"

        with self.assertRaises(engine.RotationEngineError):
            engine.build_rotation_comparison(
                make_config(), environment
            )

    def test_rejects_duplicate_climate_year(self):
        environment = make_environment()
        environment["climate_by_season"].append(
            copy.deepcopy(environment["climate_by_season"][-1])
        )

        with self.assertRaises(engine.RotationEngineError):
            engine.build_rotation_comparison(
                make_config(), environment
            )

    def test_rejects_nan_climate_value(self):
        environment = make_environment()
        environment["climate_by_season"][0]["precip_mm"] = float("nan")

        with self.assertRaises(engine.RotationEngineError):
            engine.build_rotation_comparison(
                make_config(), environment
            )

    def test_rejects_scored_pending_metric(self):
        result = engine.build_rotation_comparison(
            make_config(), make_environment()
        )
        result["metrics"][0]["value"] = 10

        with self.assertRaises(engine.RotationEngineError):
            engine.validate_rotation_comparison(result)

    def test_rejects_literature_metric_without_citation(self):
        result = engine.build_rotation_comparison(
            make_config(), make_environment()
        )

        metric = result["metrics"][0]
        metric.update({
            "value": 4,
            "provenance": "literature",
            "status": "supported",
            "citation": None,
            "applicability": "Research plots only",
        })

        with self.assertRaises(engine.RotationEngineError):
            engine.validate_rotation_comparison(result)


# =========================================================================== extended tests

import io  # noqa: E402
import json  # noqa: E402
import tempfile  # noqa: E402
from pathlib import Path  # noqa: E402
from unittest import mock  # noqa: E402

from src.engine import evidence as ev  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
REAL_CONFIG = REPO_ROOT / "config" / "pilot_region.json"
REAL_ENVIRONMENT = REPO_ROOT / "data" / "processed" / "ia-story-19169" / "environment_summary.json"


def build(environment=None, records=None, pooled=None):
    return engine.build_rotation_comparison(
        make_config(), environment or make_environment(), records, pooled
    )


SYNTHETIC_CITATION = "SYNTHETIC TEST FIXTURE - not real evidence"


def synthetic_rotation_record(rotation_id="cso3", metric="erosion", value=1.5):
    """A clearly fictional rotation-specific record, used only to exercise the
    validation rules for individual metrics. No real study supports it."""
    return {
        "rotation_id": rotation_id,
        "metric": metric,
        "value": value,
        "unit": "test_unit",
        "provenance": "literature",
        "citation": SYNTHETIC_CITATION,
        "applicability": "Test fixture only.",
        "confidence": "low",
        "evidence_scope": "other_region_research",
        "location": "Test location",
        "study_period": "2000-2001",
        "comparison": "Test comparison",
        "management_differences": "Test management differences",
        "source_url": "https://example.invalid/test",
        "review_status": "approved",
    }


def approved_candidates():
    """Approved synthetic rotation-specific records (two rotations)."""
    return [synthetic_rotation_record("cso3"), synthetic_rotation_record("csoa4", value=2.0)]


def approved_pooled():
    records = ev.candidate_pooled_evidence()
    for record in records:
        record["review_status"] = "approved"
    return records


def full_environment():
    """Two seasons with every indicator the engine reads."""
    env = make_environment()
    for season, extra in zip(env["climate_by_season"], (
        {"gdd_c": 1850.0, "days_tmax_ge_32c": 5, "soil_wet_root_mean": 0.55, "missing_days": 0},
        {"gdd_c": 1991.42, "days_tmax_ge_32c": 8, "soil_wet_root_mean": 0.4929, "missing_days": 0},
    )):
        season.update(extra)
    return env


class TestApprovedRotationDefinitions(unittest.TestCase):

    def test_each_rotation_definition_exactly(self):
        expected = {
            "cs2": (["corn", "soybean"], True, 2),
            "cso3": (["corn", "soybean", "oat_redclover"], False, 3),
            "csoa4": (["corn", "soybean", "oat_alfalfa", "alfalfa"], False, 4),
        }
        result = build()
        profiles = {p["rotation_id"]: p for p in result["rotation_profiles"]}
        for rotation in result["rotations"]:
            with self.subTest(rotation=rotation["id"]):
                sequence, baseline, years = expected[rotation["id"]]
                self.assertEqual(rotation["sequence"], sequence)
                self.assertEqual(rotation["baseline"], baseline)
                profile = profiles[rotation["id"]]
                self.assertEqual(profile["duration_years"], years)
                self.assertEqual([p["crop"] for p in profile["phases"]], sequence)
                self.assertEqual([p["year"] for p in profile["phases"]], list(range(1, years + 1)))

    def test_profiles_compare_against_baseline_without_ranking(self):
        profiles = {p["rotation_id"]: p for p in build()["rotation_profiles"]}
        self.assertIsNone(profiles["cs2"]["compared_with"])
        self.assertEqual(profiles["cso3"]["compared_with"], "cs2")
        self.assertEqual(profiles["csoa4"]["compared_with"], "cs2")
        self.assertFalse(profiles["cs2"]["includes_forage_legume_phase"])
        self.assertTrue(profiles["cso3"]["includes_forage_legume_phase"])
        for profile in profiles.values():
            for forbidden in ("score", "rank", "winner", "recommended", "weight"):
                self.assertFalse(any(forbidden in k for k in profile), (forbidden, profile))

    def test_rejects_invalid_rotation_id(self):
        rotations = copy.deepcopy(engine.ROTATIONS)
        rotations[1]["id"] = "cso9"
        with self.assertRaises(engine.RotationEngineError):
            engine.validate_rotation_definitions(rotations)
        with self.assertRaises(engine.RotationEngineError):
            engine.rotation_by_id("cso9")

    def test_rejects_invalid_crop_name(self):
        rotations = copy.deepcopy(engine.ROTATIONS)
        rotations[1]["sequence"][2] = "wheat"
        with self.assertRaisesRegex(engine.RotationEngineError, "unknown crop"):
            engine.validate_rotation_definitions(rotations)

    def test_rejects_bad_sequence_lengths(self):
        for sequence in (["corn"], ["corn", "soybean", "oat_alfalfa", "alfalfa", "alfalfa"], []):
            with self.subTest(length=len(sequence)):
                rotations = copy.deepcopy(engine.ROTATIONS)
                rotations[0]["sequence"] = sequence
                with self.assertRaises(engine.RotationEngineError):
                    engine.validate_rotation_definitions(rotations)

    def test_rejects_missing_or_multiple_baselines(self):
        none = copy.deepcopy(engine.ROTATIONS)
        none[0]["baseline"] = False
        two = copy.deepcopy(engine.ROTATIONS)
        two[1]["baseline"] = True
        for rotations in (none, two):
            with self.assertRaisesRegex(engine.RotationEngineError, "baseline"):
                engine.validate_rotation_definitions(rotations)

    def test_rejects_duplicate_and_malformed_rotations(self):
        duplicate = copy.deepcopy(engine.ROTATIONS) + [copy.deepcopy(engine.ROTATIONS[1])]
        with self.assertRaisesRegex(engine.RotationEngineError, "Duplicate"):
            engine.validate_rotation_definitions(duplicate)
        missing_name = copy.deepcopy(engine.ROTATIONS)
        del missing_name[2]["name"]
        for bad in (missing_name, [], "cs2", [None]):
            with self.assertRaises(engine.RotationEngineError):
                engine.validate_rotation_definitions(bad)

    def test_rejects_changed_but_well_formed_rotation(self):
        rotations = copy.deepcopy(engine.ROTATIONS)
        rotations[2]["sequence"] = ["corn", "soybean", "oat_alfalfa"]
        with self.assertRaisesRegex(engine.RotationEngineError, "approved methodology"):
            engine.validate_rotation_definitions(rotations)


class TestClimateContext(unittest.TestCase):

    def context(self, environment):
        return {c["indicator"]: c for c in build(environment)["climate_stress_context"]}

    def test_all_indicators_described_for_latest_season(self):
        ctx = self.context(full_environment())
        self.assertEqual(set(ctx), {
            "longest_dry_spell_days", "precipitation_anomaly_pct", "gdd_c", "precip_mm",
            "days_tmax_ge_32c", "soil_wet_root_mean", "missing_days"})
        for entry in ctx.values():
            self.assertEqual(entry["year"], 2025)
            self.assertEqual(entry["trend"], "not_assessed")
            self.assertEqual(entry["provenance"], "computed")
        self.assertEqual(ctx["gdd_c"]["value"], 1991.42)
        self.assertEqual(ctx["days_tmax_ge_32c"]["value"], 8)
        self.assertIn("not volumetric", ctx["soil_wet_root_mean"]["method"])
        self.assertIn("All required daily values were present", ctx["missing_days"]["relevance"])

    def test_context_never_claims_yield_outcome(self):
        for entry in self.context(full_environment()).values():
            text = entry["relevance"].lower()
            self.assertNotRegex(text, r"\b(will|would) (yield|perform|produce)")
            self.assertNotIn("best rotation", text)

    def test_missing_climate_indicators_are_unavailable_not_zero(self):
        env = make_environment()
        env["climate_by_season"][-1].update({
            "longest_dry_spell_days": None, "precip_anomaly_pct": None, "missing_days": 6,
            "missing_days_by_indicator": {"longest_dry_spell_days": 6},
        })
        ctx = self.context(env)
        self.assertIsNone(ctx["longest_dry_spell_days"]["value"])
        self.assertIn("unavailable", ctx["longest_dry_spell_days"]["relevance"])
        self.assertEqual(ctx["longest_dry_spell_days"]["missing_days_in_year"], 6)
        self.assertIn("unavailable", ctx["precipitation_anomaly_pct"]["relevance"])
        for name in ("gdd_c", "days_tmax_ge_32c", "soil_wet_root_mean"):  # absent keys
            self.assertIsNone(ctx[name]["value"])
            self.assertIn("unavailable", ctx[name]["relevance"])
        self.assertIn("6 days", ctx["missing_days"]["relevance"])

    def test_missing_climate_records_rejected(self):
        for mutate in (
            lambda e: e.pop("climate_by_season"),
            lambda e: e.update(climate_by_season=[]),
            lambda e: e.update(climate_by_season=["2025"]),
        ):
            env = make_environment()
            mutate(env)
            with self.assertRaises(engine.RotationEngineError):
                build(env)

    def test_baseline_mean_requires_complete_baseline(self):
        env = {"period": {"baseline": "2024-2025"}, "climate_by_season": [
            {"year": 2024, "gdd_c": 1000.0}, {"year": 2025, "gdd_c": 1100.0}]}
        self.assertEqual(engine.baseline_mean(env, "gdd_c"), 1050.0)
        env["climate_by_season"][0]["gdd_c"] = None
        self.assertIsNone(engine.baseline_mean(env, "gdd_c"))
        self.assertIsNone(engine.baseline_mean({"climate_by_season": []}, "gdd_c"))

    def test_rejects_nan_and_infinity_in_any_climate_indicator(self):
        for field in engine.SEASON_FIELD_RULES:
            for bad in (float("nan"), float("inf"), float("-inf")):
                with self.subTest(field=field, value=bad):
                    env = make_environment()
                    env["climate_by_season"][0][field] = bad
                    with self.assertRaises(engine.RotationEngineError):
                        build(env)

    def test_rejects_physically_impossible_climate_values(self):
        for field, bad in (("precip_mm", -1.0), ("soil_wet_root_mean", 1.5),
                           ("days_tmax_ge_32c", 2.5), ("missing_days", -1), ("gdd_c", True)):
            with self.subTest(field=field):
                env = make_environment()
                env["climate_by_season"][0][field] = bad
                with self.assertRaises(engine.RotationEngineError):
                    build(env)

    def test_rejects_unordered_years(self):
        env = make_environment()
        env["climate_by_season"].reverse()
        with self.assertRaises(engine.RotationEngineError):
            build(env)


class TestRegionAndInputs(unittest.TestCase):

    def test_rejects_wrong_or_missing_config_region(self):
        for config in ({"region": {"id": ""}}, {"region": {}}, {}):
            with self.subTest(config=config):
                with self.assertRaises(engine.RotationEngineError):
                    engine.build_rotation_comparison(config, make_environment())

    def test_rejects_environment_without_region(self):
        env = make_environment()
        del env["region"]
        with self.assertRaises(engine.RotationEngineError):
            build(env)

    def test_output_region_id_validated(self):
        result = build()
        with self.assertRaisesRegex(engine.RotationEngineError, "region_id mismatch"):
            engine.validate_rotation_comparison(result, expected_region_id="ks-finney-20055")
        result["region_id"] = None
        with self.assertRaises(engine.RotationEngineError):
            engine.validate_rotation_comparison(result)

    def test_missing_soil_and_land_cover_are_pending(self):
        readiness = build()["input_readiness"]  # make_environment has no soils / land_cover
        self.assertEqual(readiness["climate"]["status"], "available")
        self.assertEqual(readiness["soils"]["status"], "pending")
        self.assertEqual(readiness["land_cover"]["status"], "pending")
        self.assertIsNone(readiness["soils"]["used_for"])

    def test_placeholder_soil_values_stay_pending(self):
        env = make_environment()
        env["soils"] = {"aws_0_100cm_mm_weighted": None, "aws_method_status": "pending"}
        env["land_cover"] = {"corn_pct": None, "soy_pct": None,
                             "corn_soy_alternation_pct": None, "estimate_type": "remotely_sensed"}
        readiness = build(env)["input_readiness"]
        self.assertEqual(readiness["soils"]["status"], "pending")
        self.assertEqual(readiness["land_cover"]["status"], "pending")
        # Even if a value appeared without an approved method, it must not count.
        env["soils"] = {"aws_0_100cm_mm_weighted": 180.0, "aws_method_status": "pending"}
        self.assertEqual(build(env)["input_readiness"]["soils"]["status"], "pending")

    def test_soil_data_never_creates_metrics(self):
        env = make_environment()
        env["soils"] = {"aws_0_100cm_mm_weighted": 180.0, "aws_method_status": "approved"}
        result = build(env)
        self.assertEqual(result["input_readiness"]["soils"]["status"], "available")
        self.assertTrue(all(m["status"] == "pending" for m in result["metrics"]))

    def test_cdl_cannot_be_labelled_as_field_records(self):
        env = make_environment()
        env["land_cover"] = {"estimate_type": "verified_field_records"}
        with self.assertRaisesRegex(engine.RotationEngineError, "remotely_sensed"):
            build(env)


class TestEvidenceIntegration(unittest.TestCase):

    def test_missing_evidence_keeps_every_metric_pending(self):
        for records in (None, [], ev.candidate_evidence()):  # candidates are unreviewed
            with self.subTest(records=None if records is None else len(records)):
                result = build(records=records)
                self.assertEqual(len(result["metrics"]), 2 * len(engine.PENDING_METRICS))
                self.assertTrue(all(m["status"] == "pending" and m["value"] is None
                                    for m in result["metrics"]))
                self.assertEqual(result["evidence_sources"], [])

    def test_pending_metric_shape(self):
        for metric in build()["metrics"]:
            self.assertEqual(set(metric), set(engine.METRIC_FIELDS))
            self.assertIsNone(metric["value"])
            self.assertEqual((metric["provenance"], metric["status"]), ("pending", "pending"))
            for field in ("citation", "applicability", "confidence"):
                self.assertIsNone(metric[field])

    def test_baseline_has_no_comparison_metrics(self):
        self.assertNotIn("cs2", {m["rotation_id"] for m in build()["metrics"]})

    def test_approved_rotation_specific_evidence_becomes_supported_metric(self):
        result = build(records=approved_candidates())
        supported = [m for m in result["metrics"] if m["status"] == "supported"]
        self.assertEqual({(m["rotation_id"], m["metric"]) for m in supported},
                         {("cso3", "erosion"), ("csoa4", "erosion")})
        self.assertEqual(sum(m["status"] == "pending" for m in result["metrics"]), 12)
        self.assertEqual(result["research_comparisons"], [])
        self.assertEqual(result["evidence_sources"][0]["metrics"], ["cso3:erosion", "csoa4:erosion"])

    def test_davis_candidates_are_pooled_not_per_rotation(self):
        self.assertEqual(ev.candidate_evidence(), [])  # no rotation-specific candidates
        for record in ev.candidate_pooled_evidence():
            self.assertEqual(record["review_status"], "pending_team_review")
            self.assertNotIn("rotation_id", record)
            self.assertEqual(record["comparison_group"], ["cso3", "csoa4"])
            self.assertIn("pooled", record["comparison"])

    def test_rejects_invalid_provenance(self):
        for provenance in ("pending", "expert_guess", None):
            with self.subTest(provenance=provenance):
                records = approved_candidates()[:1]
                records[0]["provenance"] = provenance
                with self.assertRaisesRegex(engine.RotationEngineError, "provenance"):
                    build(records=records)

    def test_rejects_missing_citation(self):
        for citation in (None, "", "   "):
            records = approved_candidates()[:1]
            records[0]["citation"] = citation
            with self.assertRaisesRegex(engine.RotationEngineError, "citation"):
                build(records=records)

    def test_rejects_literature_without_context(self):
        for field in ("management_differences", "study_period", "location", "comparison"):
            with self.subTest(field=field):
                records = approved_candidates()[:1]
                records[0][field] = ""
                with self.assertRaises(engine.RotationEngineError):
                    build(records=records)
        records = approved_candidates()[:1]
        records[0]["evidence_scope"] = "story_county_observed"
        with self.assertRaisesRegex(engine.RotationEngineError, "never local"):
            build(records=records)

    def test_rejects_nan_infinity_and_boolean_evidence_values(self):
        for bad in (float("nan"), float("inf"), float("-inf"), True, None, "4"):
            with self.subTest(value=bad):
                records = approved_candidates()[:1]
                records[0]["value"] = bad
                with self.assertRaisesRegex(engine.RotationEngineError, "finite"):
                    build(records=records)

    def test_rejects_duplicate_evidence(self):
        records = approved_candidates()[:1] * 2
        with self.assertRaisesRegex(engine.RotationEngineError, "Duplicate"):
            build(records=records)

    def test_rejects_evidence_for_unknown_rotation_metric_or_baseline(self):
        for field, value in (("rotation_id", "cso9"), ("rotation_id", "cs2"),
                             ("metric", "overall_score")):
            with self.subTest(field=field, value=value):
                records = approved_candidates()[:1]
                records[0][field] = value
                with self.assertRaises(engine.RotationEngineError):
                    build(records=records)

    def test_rejects_invalid_confidence_and_review_status(self):
        for field, value in (("confidence", "very high"), ("review_status", "looks fine")):
            records = approved_candidates()[:1]
            records[0][field] = value
            with self.assertRaises(engine.RotationEngineError):
                build(records=records)


class TestOutputValidation(unittest.TestCase):

    def test_rejects_duplicate_metrics(self):
        result = build()
        result["metrics"].append(copy.deepcopy(result["metrics"][0]))
        with self.assertRaisesRegex(engine.RotationEngineError, "Duplicate metric"):
            engine.validate_rotation_comparison(result)

    def test_rejects_non_null_pending_and_pending_with_provenance(self):
        for field, value in (("value", 0), ("provenance", "literature")):
            result = build()
            result["metrics"][0][field] = value
            with self.assertRaisesRegex(engine.RotationEngineError, "Pending metric"):
                engine.validate_rotation_comparison(result)

    def test_rejects_nan_and_infinity_in_supported_metric(self):
        for bad in (float("nan"), float("inf"), float("-inf")):
            result = build(records=approved_candidates())
            supported = next(m for m in result["metrics"] if m["status"] == "supported")
            supported["value"] = bad
            with self.assertRaises(engine.RotationEngineError):
                engine.validate_rotation_comparison(result)

    def test_rejects_computed_metric_without_reference(self):
        result = build()
        result["metrics"][0].update({"value": 1.0, "provenance": "computed", "status": "supported",
                                     "citation": None, "applicability": "x", "confidence": "low"})
        with self.assertRaisesRegex(engine.RotationEngineError, "computation reference"):
            engine.validate_rotation_comparison(result)

    def test_rejects_unknown_metric_and_status(self):
        result = build()
        result["metrics"][0]["metric"] = "overall_score"
        with self.assertRaises(engine.RotationEngineError):
            engine.validate_rotation_comparison(result)
        result = build()
        result["metrics"][0]["status"] = "estimated"
        with self.assertRaises(engine.RotationEngineError):
            engine.validate_rotation_comparison(result)

    def test_rejects_empty_strings_and_missing_disclaimer(self):
        result = build()
        result["climate_stress_context"][0]["trend"] = ""
        with self.assertRaises(engine.RotationEngineError):
            engine.validate_rotation_comparison(result)
        result = build()
        result["disclaimer"] = "Recommended rotation"
        with self.assertRaises(engine.RotationEngineError):
            engine.validate_rotation_comparison(result)

    def test_json_structure(self):
        result = build(full_environment())
        self.assertEqual(list(result)[:6], ["schema_version", "region_id", "disclaimer",
                                            "rotations", "metrics", "climate_stress_context"])
        self.assertEqual(result["schema_version"], "1.0")
        self.assertEqual(result["region_id"], "ia-story-19169")
        for rotation in result["rotations"]:
            self.assertEqual(set(rotation), {"id", "name", "sequence", "baseline"})
        text = engine.serialise(result)
        self.assertEqual(json.loads(text), result)
        self.assertNotIn('""', text)
        self.assertNotRegex(text, r"NaN|Infinity")


class TestRunAndReproducibility(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.env_path = self.dir / "environment_summary.json"
        self.env_path.write_text(json.dumps(full_environment()))
        self.config_path = self.dir / "config.json"
        self.config_path.write_text(json.dumps(make_config()))

    def tearDown(self):
        self.tmp.cleanup()

    def run_engine(self, name, evidence=None):
        out = self.dir / name
        engine.run(self.config_path, self.env_path, out, evidence)
        return out.read_bytes()

    def test_repeated_runs_are_byte_identical(self):
        self.assertEqual(self.run_engine("a.json"), self.run_engine("b.json"))
        self.assertFalse(list(self.dir.glob("*.tmp")))

    def test_input_is_not_mutated(self):
        env = full_environment()
        before = copy.deepcopy(env)
        records = approved_candidates()
        records_before = copy.deepcopy(records)
        engine.build_rotation_comparison(make_config(), env, records)
        self.assertEqual(env, before)
        self.assertEqual(records, records_before)

    def test_rejects_nan_token_in_environment_file(self):
        self.env_path.write_text(self.env_path.read_text().replace("770.64", "NaN"))
        with self.assertRaisesRegex(engine.RotationEngineError, "non-finite"):
            self.run_engine("out.json")

    def test_candidate_file_is_not_applied_until_approved(self):
        candidates = self.dir / "candidates.json"
        engine.write_candidate_evidence(candidates)
        unapproved = json.loads(self.run_engine("pending.json", candidates))
        self.assertTrue(all(m["status"] == "pending" for m in unapproved["metrics"]))
        self.assertEqual(unapproved["research_comparisons"], [])

        data = json.loads(candidates.read_text())
        for record in data["records"] + data["research_comparisons"]:
            record["review_status"] = "approved"
        approved = self.dir / "approved.json"
        approved.write_text(json.dumps(data))
        result = json.loads(self.run_engine("supported.json", approved))
        # Pooled findings never become per-rotation metrics.
        self.assertTrue(all(m["status"] == "pending" for m in result["metrics"]))
        self.assertEqual(len(result["research_comparisons"]), 3)

    def test_bad_evidence_file_rejected(self):
        bad = self.dir / "bad.json"
        for content in ('{"records": []}', '{"schema_version": "1.0"}', "[]",
                        '{"schema_version": "1.0", "records": [{"value": NaN}]}'):
            bad.write_text(content)
            with self.assertRaises(engine.RotationEngineError):
                self.run_engine("out.json", bad)

    def test_main_reports_errors_with_exit_code(self):
        self.env_path.write_text(json.dumps(dict(full_environment(), region={"id": "wrong"})))
        with mock.patch("sys.stderr", new_callable=io.StringIO) as err:
            code = engine.main(["--config", str(self.config_path),
                                "--environment", str(self.env_path),
                                "--out", str(self.dir / "o.json")])
        self.assertEqual(code, 2)
        self.assertIn("region mismatch", err.getvalue())


class TestPooledResearchComparisons(unittest.TestCase):
    """Davis et al. 2012 pools the 3-yr and 4-yr rotations against the 2-yr one."""

    EXPECTED = {
        "corn_yield_vs_baseline_pct": 4,
        "soybean_yield_vs_baseline_pct": 9,
        "herbicide_use_vs_baseline_pct": -88,
    }

    def test_pooled_candidates_represent_each_finding_once(self):
        records = ev.candidate_pooled_evidence()
        self.assertEqual(len(records), 3)
        self.assertEqual({r["metric"]: r["value"] for r in records}, self.EXPECTED)
        self.assertEqual(len({r["comparison_id"] for r in records}), 3)
        for record in records:
            ev.validate_pooled_record(record)
            self.assertEqual(record["comparison_group"], ["cso3", "csoa4"])
            self.assertEqual(record["comparator"], "cs2")
            self.assertIs(record["pooled"], True)
            self.assertEqual(record["review_status"], "pending_team_review")
            self.assertEqual(record["study_period"], "2003-2011")
            self.assertIn("Marsden Farm, Boone County, Iowa", record["location"])
            self.assertIn("doi:10.1371/journal.pone.0047149", record["citation"])
            self.assertEqual(record["source_url"], ev.DAVIS_2012_URL)
            self.assertIn("manure", record["management_differences"])
            self.assertIn("pooled", record["comparison"])

    def test_unapproved_pooled_research_is_not_published(self):
        result = build(pooled=ev.candidate_pooled_evidence())
        self.assertEqual(result["research_comparisons"], [])
        self.assertEqual(result["evidence_sources"], [])
        self.assertNotIn("Davis", engine.serialise(result))
        for profile in result["rotation_profiles"]:
            self.assertEqual(profile["pooled_research_comparisons"], [])

    def test_approved_pooled_research_appears_once_with_attribution(self):
        result = build(pooled=approved_pooled())
        comparisons = result["research_comparisons"]
        self.assertEqual(len(comparisons), 3)
        self.assertEqual({c["metric"]: c["value"] for c in comparisons}, self.EXPECTED)
        for c in comparisons:
            self.assertEqual((c["comparison_group"], c["comparator"]), (["cso3", "csoa4"], "cs2"))
            self.assertEqual((c["status"], c["provenance"], c["pooled"]), ("supported", "literature", True))
            self.assertEqual(c["evidence_scope"], "adjacent_county_research")
            for phrase in ("Adjacent-county research evidence", "2003-2011", "Pooled result",
                           "not a separate effect of either rotation", "manure",
                           "not crop rotation alone", "not a Story County observation"):
                self.assertIn(phrase, c["applicability"])
        # Exactly once in the whole output: each value text appears in one comparison only.
        text = engine.serialise(result)
        self.assertEqual(text.count('"comparison_id": "davis2012_marsden_corn_yield"'), 1)
        sources = result["evidence_sources"]
        self.assertEqual(len(sources), 1)
        self.assertEqual(sources[0]["metrics"], [])
        self.assertEqual(len(sources[0]["research_comparisons"]), 3)

    def test_pooled_research_never_assigned_to_individual_rotations(self):
        result = build(pooled=approved_pooled())
        self.assertEqual(len(result["metrics"]), 14)
        self.assertTrue(all(m["status"] == "pending" and m["value"] is None
                            for m in result["metrics"]))
        self.assertFalse(any("Davis" in str(m["citation"]) for m in result["metrics"]))
        profiles = {p["rotation_id"]: p for p in result["rotation_profiles"]}
        for rid in ("cso3", "csoa4"):
            self.assertEqual(profiles[rid]["supported_metrics"], [])
            self.assertEqual(len(profiles[rid]["pooled_research_comparisons"]), 3)
            self.assertIn("not separate effects of this rotation", profiles[rid]["evidence_summary"])
            # No evidence values copied into profiles: the only number is the duration.
            numbers = {k: v for k, v in profiles[rid].items()
                       if isinstance(v, (int, float)) and not isinstance(v, bool)}
            self.assertEqual(list(numbers), ["duration_years"])
        self.assertEqual(len(profiles["cs2"]["comparator_in_research_comparisons"]), 3)

    def test_splitting_pooled_finding_onto_a_rotation_is_rejected(self):
        pooled = approved_pooled()
        corn = pooled[0]
        split = {k: v for k, v in corn.items()
                 if k not in ("comparison_id", "comparison_group", "comparator", "pooled")}
        split["rotation_id"] = "cso3"
        with self.assertRaisesRegex(engine.RotationEngineError, "restates a pooled"):
            build(records=[split], pooled=pooled)
        # Even if the pooled record is still unreviewed, the split is refused.
        with self.assertRaisesRegex(engine.RotationEngineError, "restates a pooled"):
            build(records=[split], pooled=ev.candidate_pooled_evidence())

    def test_output_validator_rejects_pooled_value_on_rotation(self):
        result = build(pooled=approved_pooled())
        metric = next(m for m in result["metrics"]
                      if (m["rotation_id"], m["metric"]) == ("csoa4", "corn_yield_vs_baseline_pct"))
        metric.update({"value": 4, "provenance": "literature", "status": "supported",
                       "citation": ev.DAVIS_2012_CITATION, "applicability": "x",
                       "confidence": "medium"})
        with self.assertRaisesRegex(engine.RotationEngineError, "pooled"):
            engine.validate_rotation_comparison(result)

    def test_rotation_record_with_pooled_fields_rejected(self):
        record = synthetic_rotation_record()
        record["comparison_group"] = ["cso3", "csoa4"]
        with self.assertRaisesRegex(engine.RotationEngineError, "research_comparisons"):
            build(records=[record])

    def test_rejects_missing_citation(self):
        for citation in (None, "", "  "):
            with self.subTest(citation=citation):
                pooled = approved_pooled()[:1]
                pooled[0]["citation"] = citation
                with self.assertRaisesRegex(engine.RotationEngineError, "citation"):
                    build(pooled=pooled)

    def test_rejects_invalid_provenance(self):
        for provenance in ("pending", "anecdote", None):
            with self.subTest(provenance=provenance):
                pooled = approved_pooled()[:1]
                pooled[0]["provenance"] = provenance
                with self.assertRaisesRegex(engine.RotationEngineError, "provenance"):
                    build(pooled=pooled)

    def test_rejects_invalid_comparison_groups(self):
        cases = {
            "single member": ({"comparison_group": ["cso3"]}, "at least two"),
            "duplicate member": ({"comparison_group": ["cso3", "cso3"]}, "at least two"),
            "unknown rotation": ({"comparison_group": ["cso3", "cso9"]}, "invalid comparison_group"),
            "baseline in group": ({"comparison_group": ["cs2", "cso3"], "comparator": "csoa4"},
                                  "invalid comparison_group"),
            "comparator in group": ({"comparison_group": ["cso3", "csoa4"], "comparator": "cso3"},
                                    "comparator"),
            "non-baseline comparator": ({"comparison_group": ["cso3", "csoa4"], "comparator": "x"},
                                        "comparator"),
            "not a list": ({"comparison_group": "cso3,csoa4"}, "at least two"),
            "not pooled": ({"pooled": False}, "pooled"),
            "has rotation_id": ({"rotation_id": "cso3"}, "rotation_id"),
        }
        for name, (changes, message) in cases.items():
            with self.subTest(case=name):
                pooled = approved_pooled()[:1]
                pooled[0].update(changes)
                with self.assertRaisesRegex(engine.RotationEngineError, message):
                    build(pooled=pooled)

    def test_rejects_non_finite_and_duplicate_pooled_records(self):
        for bad in (float("nan"), float("inf"), float("-inf"), True):
            with self.subTest(value=bad):
                pooled = approved_pooled()[:1]
                pooled[0]["value"] = bad
                with self.assertRaisesRegex(engine.RotationEngineError, "finite"):
                    build(pooled=pooled)
        with self.assertRaisesRegex(engine.RotationEngineError, "Duplicate research comparison"):
            build(pooled=approved_pooled()[:1] * 2)
        renamed = approved_pooled()[:2]
        renamed[1] = dict(renamed[0], comparison_id="another_id")
        with self.assertRaisesRegex(engine.RotationEngineError, "Duplicate research comparison"):
            build(pooled=renamed)

    def test_rejects_literature_pooled_record_without_context(self):
        for field in ("management_differences", "study_period", "location", "source_url"):
            with self.subTest(field=field):
                pooled = approved_pooled()[:1]
                pooled[0][field] = ""
                with self.assertRaises(engine.RotationEngineError):
                    build(pooled=pooled)

    def test_output_validator_rejects_unapproved_or_malformed_comparisons(self):
        for mutate in (
            lambda c: c.update(status="pending"),
            lambda c: c.update(comparison_group=["cso3"]),
            lambda c: c.update(value=float("nan")),
            lambda c: c.update(citation=None),
            lambda c: c.pop("comparator"),
        ):
            result = build(pooled=approved_pooled())
            mutate(result["research_comparisons"][0])
            with self.assertRaises(engine.RotationEngineError):
                engine.validate_rotation_comparison(result)
        result = build(pooled=approved_pooled())
        result["research_comparisons"].append(copy.deepcopy(result["research_comparisons"][0]))
        with self.assertRaisesRegex(engine.RotationEngineError, "Duplicate"):
            engine.validate_rotation_comparison(result)

    def test_all_14_metrics_pending_by_default(self):
        result = build()
        self.assertEqual(len(result["metrics"]), 14)
        self.assertTrue(all(m["status"] == "pending" for m in result["metrics"]))
        self.assertEqual(result["research_comparisons"], [])

    def test_approved_pooled_output_is_deterministic_and_valid_json(self):
        a = engine.serialise(build(full_environment(), pooled=approved_pooled()))
        b = engine.serialise(build(full_environment(), pooled=approved_pooled()))
        self.assertEqual(a, b)
        self.assertNotIn('""', a)
        self.assertNotRegex(a, r"NaN|Infinity")


@unittest.skipUnless(REAL_ENVIRONMENT.exists(), "generated environment summary not present")
class TestRealEnvironmentSummary(unittest.TestCase):
    """Uses the generated Story County summary (no fabricated inputs)."""

    def test_real_summary_builds_valid_deterministic_output(self):
        config = json.loads(REAL_CONFIG.read_text())
        environment = json.loads(REAL_ENVIRONMENT.read_text())
        first = engine.serialise(engine.build_rotation_comparison(config, environment))
        second = engine.serialise(engine.build_rotation_comparison(config, environment))
        self.assertEqual(first, second)
        result = json.loads(first)
        self.assertEqual(result["region_id"], "ia-story-19169")
        self.assertEqual(result["input_readiness"]["climate"]["seasons"],
                         len(environment["climate_by_season"]))
        latest = environment["climate_by_season"][-1]
        ctx = {c["indicator"]: c for c in result["climate_stress_context"]}
        self.assertEqual(ctx["gdd_c"]["value"], latest["gdd_c"])
        self.assertTrue(all(m["status"] == "pending" for m in result["metrics"]))


if __name__ == "__main__":
    unittest.main()
