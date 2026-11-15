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


if __name__ == "__main__":
    unittest.main()
