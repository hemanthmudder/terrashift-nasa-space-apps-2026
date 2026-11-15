"""Tests for TerraShift's environmental summary generator."""

import csv
import json
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

from src.pipeline import build_environment_summary as env


def make_config():
    return {
        "region": {
            "id": "test-region",
            "name": "Test County, Iowa",
            "fips": "99999",
            "ssurgo_area_symbol": "IA999",
            "internal_point": {
                "latitude": 42.0,
                "longitude": -93.0,
            },
            "land_area_km2": 100.0,
        },
        "analysis_period": {
            "climate_start": "2020-01-01",
            "climate_end": "2021-12-31",
            "climate_baseline": "2020-2020",
            "growing_season": {
                "start_mmdd": "04-01",
                "end_mmdd": "04-03",
            },
            "cdl_start_year": 2008,
            "cdl_end_year": 2025,
        },
        "nasa_power": {
            "parameters": ["T2M", "PRECTOTCORR"],
        },
    }


def make_metadata():
    return {
        "schema_version": "1.0",
        "region_id": "test-region",
        "request_url": "https://example.test/nasa-power",
        "community": "AG",
        "parameters": ["T2M", "PRECTOTCORR"],
        "latitude": 42.0,
        "longitude": -93.0,
        "start": "2020-01-01",
        "end": "2021-12-31",
        "retrieved_at_utc": "2026-11-15T00:00:00Z",
        "api_version": "test",
        "sha256": "test",
    }


def make_records(year, precipitation, missing_precip_day=None):
    rows = []

    for offset, precip in enumerate(precipitation):
        day = date(year, 4, 1) + timedelta(days=offset)

        if missing_precip_day == offset:
            precip = None

        rows.append({
            "date": day,
            "tmean_c": 20.0,
            "tmax_c": 32.0,
            "tmin_c": 10.0,
            "precip_mm": precip,
            "rh_pct": 70.0,
            "wind_ms": 2.0,
            "srad_mj_m2": 20.0,
            "soil_wet_top": 0.5,
            "soil_wet_root": 0.5,
            "gdd_c": 10.0,
        })

    return rows


class TestSeasonCalculations(unittest.TestCase):

    def test_builds_both_seasons_and_precipitation_anomaly(self):
        config = make_config()
        records = (
            make_records(2020, [2.0, 0.5, 0.5])
            + make_records(2021, [4.0, 1.0, 1.0])
        )

        result = env.build_environment_summary(
            config, make_metadata(), records
        )

        seasons = result["climate_by_season"]

        self.assertEqual(len(seasons), 2)
        self.assertEqual(seasons[0]["year"], 2020)
        self.assertEqual(seasons[1]["year"], 2021)

        self.assertEqual(seasons[0]["precip_mm"], 3.0)
        self.assertEqual(seasons[0]["precip_anomaly_pct"], 0.0)

        self.assertEqual(seasons[1]["precip_mm"], 6.0)
        self.assertEqual(seasons[1]["precip_anomaly_pct"], 100.0)

    def test_calculates_gdd_heat_dry_spell_and_root_wetness(self):
        config = make_config()
        records = (
            make_records(2020, [2.0, 0.5, 0.5])
            + make_records(2021, [4.0, 1.0, 1.0])
        )

        result = env.build_environment_summary(
            config, make_metadata(), records
        )

        first = result["climate_by_season"][0]

        self.assertEqual(first["gdd_c"], 30.0)
        self.assertEqual(first["days_tmax_ge_32c"], 3)
        self.assertEqual(first["longest_dry_spell_days"], 2)
        self.assertEqual(first["soil_wet_root_mean"], 0.5)
        self.assertEqual(first["missing_days"], 0)

    def test_incomplete_precipitation_is_not_treated_as_zero(self):
        config = make_config()
        records = (
            make_records(2020, [2.0, 0.5, 0.5])
            + make_records(
                2021, [4.0, 1.0, 1.0], missing_precip_day=1
            )
        )

        result = env.build_environment_summary(
            config, make_metadata(), records
        )

        second = result["climate_by_season"][1]

        self.assertIsNone(second["precip_mm"])
        self.assertIsNone(second["precip_anomaly_pct"])
        self.assertIsNone(second["longest_dry_spell_days"])
        self.assertEqual(second["missing_days"], 1)
        self.assertEqual(
            second["missing_days_by_indicator"]["precip_mm"], 1
        )

        # Independent complete indicators remain usable.
        self.assertEqual(second["gdd_c"], 30.0)
        self.assertEqual(second["days_tmax_ge_32c"], 3)

    def test_seasonal_metrics_include_computation_provenance(self):
        config = make_config()
        records = (
            make_records(2020, [2.0, 0.5, 0.5])
            + make_records(2021, [4.0, 1.0, 1.0])
        )

        result = env.build_environment_summary(
            config, make_metadata(), records
        )

        season = result["climate_by_season"][0]
        expected_metrics = (
            "gdd_c",
            "precip_mm",
            "precip_anomaly_pct",
            "days_tmax_ge_32c",
            "longest_dry_spell_days",
            "soil_wet_root_mean",
        )

        for metric in expected_metrics:
            with self.subTest(metric=metric):
                provenance = season["metric_provenance"][metric]
                self.assertEqual(provenance["provenance"], "computed")
                self.assertTrue(provenance["method"])


    def test_soil_and_land_cover_remain_pending(self):
        config = make_config()
        records = (
            make_records(2020, [2.0, 0.5, 0.5])
            + make_records(2021, [4.0, 1.0, 1.0])
        )

        result = env.build_environment_summary(
            config, make_metadata(), records
        )

        self.assertIsNone(
            result["soils"]["aws_0_100cm_mm_weighted"]
        )
        self.assertEqual(
            result["soils"]["aws_method_status"], "pending"
        )
        self.assertIsNone(result["land_cover"]["corn_pct"])
        self.assertIsNone(result["land_cover"]["soy_pct"])
        self.assertIsNone(
            result["land_cover"]["corn_soy_alternation_pct"]
        )


class TestInputValidation(unittest.TestCase):

    def write_csv(self, path, dates, overrides=None):
        overrides = overrides or {}

        with path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=env.CSV_COLUMNS)
            writer.writeheader()

            for day in dates:
                row = {
                    "date": day,
                    "tmean_c": "20",
                    "tmax_c": "25",
                    "tmin_c": "15",
                    "precip_mm": "2",
                    "rh_pct": "70",
                    "wind_ms": "2",
                    "srad_mj_m2": "20",
                    "soil_wet_top": "0.5",
                    "soil_wet_root": "0.5",
                    "gdd_c": "10",
                    "qc_flag": "ok",
                    "qc_fields": "",
                }
                row.update(overrides.get(day, {}))
                writer.writerow(row)

    def test_rejects_missing_calendar_day(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "climate.csv"
            self.write_csv(
                path,
                ["2020-04-01", "2020-04-03"],
            )

            with self.assertRaises(env.EnvironmentSummaryError):
                env.read_climate_csv(
                    path,
                    date(2020, 4, 1),
                    date(2020, 4, 3),
                )

    def test_rejects_non_finite_values(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "climate.csv"
            self.write_csv(
                path,
                ["2020-04-01"],
                {"2020-04-01": {"tmean_c": "nan"}},
            )

            with self.assertRaises(env.EnvironmentSummaryError):
                env.read_climate_csv(
                    path,
                    date(2020, 4, 1),
                    date(2020, 4, 1),
                )

    def test_rejects_negative_precipitation(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "climate.csv"
            self.write_csv(
                path,
                ["2020-04-01"],
                {"2020-04-01": {"precip_mm": "-1"}},
            )

            with self.assertRaises(env.EnvironmentSummaryError):
                env.read_climate_csv(
                    path,
                    date(2020, 4, 1),
                    date(2020, 4, 1),
                )

    def test_rejects_mismatched_request_coordinates(self):
        config = make_config()
        metadata = make_metadata()
        metadata["latitude"] = 50.0

        with self.assertRaises(env.EnvironmentSummaryError):
            env.validate_request_metadata(config, metadata)

    def test_incomplete_baseline_leaves_anomaly_unavailable(self):
        config = make_config()
        config["analysis_period"]["climate_baseline"] = "2019-2020"
        records = (
            make_records(2020, [2.0, 0.5, 0.5])
            + make_records(2021, [4.0, 1.0, 1.0])
        )

        result = env.build_environment_summary(
            config, make_metadata(), records
        )

        for season in result["climate_by_season"]:
            self.assertIsNone(season["precip_anomaly_pct"])



if __name__ == "__main__":
    unittest.main()
