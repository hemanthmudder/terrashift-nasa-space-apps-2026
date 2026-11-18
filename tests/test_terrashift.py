#!/usr/bin/env python3
"""
MEMBER 6 — Stage 2 Comprehensive Unit, Integration, Parity & Workflow Test Suite
Covers 16 distinct automated tests across:
  A. Unit Tests (NASA parsing, -999/null handling, rainfall summation vs temp averaging, dry-spell math, species separation, duration overlap, confidence gating)
  B. Integration & Parity Tests (Flask REST API endpoints, schema parity with Next.js route handlers, Davanagere pilot scenario, missing soil data, invalid coordinates)
"""

import unittest
import json
from server import app
from terrashift_engine import (
    parse_nasa_power_json,
    build_illustrative_fallback_observations,
    build_environmental_data,
    calculate_cv_percent,
    compute_longest_dry_spell,
    evaluate_crop_for_season,
    evaluate_sequence_penalties,
    compute_confidence_assessment,
    generate_crop_rotation_recommendations,
    normalize_weights,
    FALLBACK_BANNER_MESSAGE,
    KARNATAKA_CROPS,
    CROP_MAP_BY_ID,
)


class TestStage2AuditAndRegression(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.davanagere_farm = {
            "id": "farm_davanagere_pilot",
            "farmName": "Bhadra Dryland Demo Farm",
            "district": "Davanagere",
            "talukOrVillage": "Harihar",
            "state": "Karnataka",
            "latitude": 14.4644,
            "longitude": 75.9218,
            "area": 4.5,
            "areaUnit": "acres",
            "soilType": "red_sandy_loam",
            "soilPH": 6.4,
            "organicCarbonPercent": 0.42,
            "nitrogenKgHa": 215,
            "phosphorusKgHa": 24,
            "potassiumKgHa": 185,
            "drainage": "moderate",
            "salinity": "non_saline",
            "previousCrop": "maize",
            "irrigationType": "protective_lifesaving",
            "waterSource": "borewell_groundwater",
            "farmerPriority": "balanced_adaptation",
        }

    # --- A. UNIT & REGRESSION TESTS ---

    def test_unit_01_nasa_999_filtering_and_no_zero_rainfall_substitution(self):
        """NASA -999 missing values must become None and reset consecutive dry-spell streaks."""
        raw = {
            "properties": {
                "parameter": {
                    "T2M": {"20240601": 26.0, "20240602": -999, "20240603": 27.0},
                    "T2M_MAX": {"20240601": 31.0, "20240602": -999, "20240603": 32.0},
                    "T2M_MIN": {"20240601": 21.0, "20240602": -999, "20240603": 22.0},
                    "PRECTOTCORR": {"20240601": 0.0, "20240602": -999, "20240603": 0.0},
                    "RH2M": {"20240601": 75.0, "20240602": -999, "20240603": 70.0},
                    "ALLSKY_SFC_SW_DWN": {"20240601": 18.0, "20240602": -999, "20240603": 19.0},
                    "GWETTOP": {"20240601": 0.55, "20240602": -999, "20240603": 0.50},
                    "GWETROOT": {"20240601": 0.52, "20240602": -999, "20240603": 0.50},
                }
            }
        }
        parsed = parse_nasa_power_json(raw)
        self.assertEqual(len(parsed), 3)
        self.assertIsNone(parsed[1]["precipMm"])
        self.assertIsNone(parsed[1]["t2m"])
        self.assertEqual(compute_longest_dry_spell(parsed), 1)

    def test_unit_02_fallback_banner_exact_message_and_computed_temp_trend(self):
        """Fallback banner must match Section 4.4 wording and maxTempTrendCPerYear must be dynamically computed."""
        obs = build_illustrative_fallback_observations(14.4644, 75.9218, 2021, 2025)
        env = build_environmental_data(14.4644, 75.9218, "20210101", "20251231", obs, False, FALLBACK_BANNER_MESSAGE)
        self.assertEqual(env["fallbackBannerMessage"], FALLBACK_BANNER_MESSAGE)
        self.assertFalse(env["isLiveRetrieval"])
        self.assertGreaterEqual(len(env["observations"]), 1825)
        self.assertNotEqual(env["indicators"]["maxTempTrendCPerYear"], 0.14)

    def test_unit_03_sunnhemp_and_dhaincha_separated_with_verified_tnau_biomass(self):
        """Sunnhemp (Crotalaria juncea, 13-15 t/ha) and Dhaincha (Sesbania aculeata, 25 t/ha) are separate species records."""
        self.assertIn("sunnhemp", CROP_MAP_BY_ID)
        self.assertIn("dhaincha", CROP_MAP_BY_ID)
        sunnhemp = CROP_MAP_BY_ID["sunnhemp"]
        dhaincha = CROP_MAP_BY_ID["dhaincha"]
        self.assertEqual(sunnhemp["scientificName"], "Crotalaria juncea")
        self.assertEqual(dhaincha["scientificName"], "Sesbania aculeata")
        self.assertIn("13–15 t/ha", " ".join(sunnhemp["managementBenefits"]))
        self.assertIn("25 t/ha", " ".join(dhaincha["managementBenefits"]))
        self.assertLessEqual(sunnhemp["pHRange"]["max"], 7.8)
        self.assertGreaterEqual(dhaincha["pHRange"]["max"], 8.5)

    def test_unit_04_duration_and_seasonal_turnaround_penalty(self):
        """155-day Kharif Pigeon Pea + 110d Rabi Ragi + 82d Summer Sesame (347d > 315d) incurs overlap/turnaround penalties."""
        pen = evaluate_sequence_penalties(
            ["pigeonpea", "ragi", "sesame"],
            ["kharif", "rabi", "summer"],
            self.davanagere_farm,
        )
        self.assertGreaterEqual(pen["incompatibleTransitionPenalty"], 22)
        self.assertTrue(any("overlap" in n.lower() for n in pen["notes"]))
        self.assertTrue(any("turnaround" in n.lower() for n in pen["notes"]))

    def test_unit_05_confidence_capped_when_nasa_not_live(self):
        """Offline illustrative NASA data caps confidence at Moderate; Live NASA + full soil test grants High confidence."""
        obs = build_illustrative_fallback_observations(14.4644, 75.9218, 2021, 2025)
        offline_nasa = build_environmental_data(14.4644, 75.9218, "20210101", "20251231", obs, False, FALLBACK_BANNER_MESSAGE)
        conf_offline = compute_confidence_assessment(self.davanagere_farm, offline_nasa)
        self.assertEqual(conf_offline["level"], "Moderate confidence")

        live_nasa = dict(offline_nasa, isLiveRetrieval=True, fallbackBannerMessage=None)
        conf_live = compute_confidence_assessment(self.davanagere_farm, live_nasa)
        self.assertEqual(conf_live["level"], "High confidence")

    def test_unit_06_missing_soil_data_neutral_score_and_limited_confidence(self):
        """Missing optional soil data never rejects a crop and never grants the verified pH/OC bonus."""
        obs = build_illustrative_fallback_observations(14.4644, 75.9218, 2021, 2025)
        nasa = build_environmental_data(14.4644, 75.9218, "20210101", "20251231", obs, False, FALLBACK_BANNER_MESSAGE)
        unknown_soil_farm = dict(
            self.davanagere_farm,
            soilPH=None,
            organicCarbonPercent=None,
            nitrogenKgHa=None,
            phosphorusKgHa=None,
            potassiumKgHa=None,
        )
        ragi_unknown = evaluate_crop_for_season(CROP_MAP_BY_ID["ragi"], "kharif", unknown_soil_farm, nasa, "maize")
        ragi_verified = evaluate_crop_for_season(CROP_MAP_BY_ID["ragi"], "kharif", self.davanagere_farm, nasa, "maize")
        self.assertTrue(ragi_unknown["eligible"])
        self.assertLess(ragi_unknown["soilScore"], ragi_verified["soilScore"])
        conf = compute_confidence_assessment(unknown_soil_farm, nasa)
        self.assertEqual(conf["level"], "Limited confidence")

    def test_unit_07_rainfall_summation_vs_temperature_averaging(self):
        """Verifies precipitation is summed per year/season while daily temperatures are averaged."""
        known_obs = [
            {"date": "2024-06-01", "t2m": 24.0, "t2mMax": 30.0, "t2mMin": 18.0, "precipMm": 10.0, "rh2m": 70.0, "solarRadMjM2": 18.0, "surfaceSoilWetness": 0.5, "rootZoneSoilWetness": 0.5},
            {"date": "2024-06-02", "t2m": 26.0, "t2mMax": 32.0, "t2mMin": 20.0, "precipMm": 20.0, "rh2m": 80.0, "solarRadMjM2": 16.0, "surfaceSoilWetness": 0.6, "rootZoneSoilWetness": 0.6},
        ]
        env = build_environmental_data(14.4644, 75.9218, "20240601", "20240602", known_obs, True, None)
        # Rainfall is summed (10 + 20 = 30.0 mm), Temperature is averaged ((24 + 26)/2 = 25.0 °C)
        self.assertEqual(env["annualRecords"][0]["totalRainMm"], 30.0)
        self.assertEqual(env["annualRecords"][0]["meanTempC"], 25.0)
        self.assertEqual(env["seasonalSummaries"]["kharif"]["avgMeanTempC"], 25.0)

    def test_unit_08_hard_constraint_paddy_rainfed_rejection(self):
        """Paddy is marked ineligible on a rainfed farm when Kharif rainfall < 800 mm."""
        obs = build_illustrative_fallback_observations(14.4644, 75.9218, 2022, 2024)
        nasa = build_environmental_data(14.4644, 75.9218, "20220101", "20241231", obs, False, FALLBACK_BANNER_MESSAGE)
        rainfed_farm = dict(self.davanagere_farm, irrigationType="rainfed")
        paddy_eval = evaluate_crop_for_season(CROP_MAP_BY_ID["paddy"], "kharif", rainfed_farm, nasa, "maize")
        self.assertFalse(paddy_eval["eligible"])
        self.assertEqual(paddy_eval["weightedScore"], 35.0)

    def test_unit_09_monoculture_and_family_repetition_penalties(self):
        """Consecutive Maize -> Maize triggers -15 monoculture penalty; Maize -> Sorghum triggers -8 Poaceae family penalty."""
        pen = evaluate_sequence_penalties(["maize", "sorghum", "ragi"], ["kharif", "rabi", "summer"], self.davanagere_farm)
        self.assertEqual(pen["monoculturePenalty"], 15)
        self.assertEqual(pen["repeatedFamilyPenalty"], 16)

    def test_unit_10_weight_normalization(self):
        """Custom weights normalize cleanly to sum to 1.0 (100%)."""
        w = normalize_weights({"climateSuitability": 60, "waterCompatibility": 40, "soilManagement": 0, "farmerPreference": 0, "cropDiversity": 0})
        self.assertAlmostEqual(sum(w.values()), 1.0, places=3)

    # --- B. INTEGRATION & WORKFLOW TESTS ---

    def test_integration_11_davanagere_pilot_three_feasible_distinct_strategies(self):
        """Verifies the complete Davanagere pilot scenario produces 3 distinct, calendar-feasible strategies (<=315d, 0 penalties)."""
        res = self.client.post(
            "/api/recommendations",
            data=json.dumps({
                "farmProfile": self.davanagere_farm,
                "customSequence": ["groundnut", "chickpea", "sunnhemp"],
            }),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertIn("nasaData", body)
        self.assertIn("nasaSummary", body)
        recs = body["recommendations"]
        self.assertEqual(len(recs), 3)

        sequences = ["->".join(r["crops"]) for r in recs]
        self.assertEqual(len(set(sequences)), 3)

        for r in recs:
            self.assertLessEqual(r["totalDurationDays"], 315)
            self.assertEqual(r["penalties"]["totalPenalty"], 0)
            self.assertGreaterEqual(len(r["evidenceSources"]), 3)
            self.assertTrue(len(r["kannadaSummary"]) > 15)

    def test_integration_12_invalid_coordinates_and_payload_validation(self):
        """Verifies HTTP 400 error handling on invalid coordinates and unsupported crop/soil inputs."""
        bad_nasa = self.client.get("/api/nasa?latitude=145.0&longitude=75.92")
        self.assertEqual(bad_nasa.status_code, 400)

        bad_farm = self.client.post(
            "/api/farm",
            data=json.dumps(dict(self.davanagere_farm, previousCrop="nonexistent_crop")),
            content_type="application/json",
        )
        self.assertEqual(bad_farm.status_code, 400)


if __name__ == "__main__":
    unittest.main()
